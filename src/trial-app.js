import { createBattleState, renderBattleScene, updateBattleState } from "./battle-system.js";
import { getBuiltinBloodlines, syncBloodlineLibrary } from "./bloodlines.js";
import { normalizeEquipmentBySlot, syncEquipmentLibrary } from "./equipment-data.js";
import { buildEntries, normalizeBaseIdentity } from "./entry-utils.js";
import {
  buildCharacterProfile,
  getEffectiveSheet,
  normalizeProgressRecord,
  rebuildLearnedSkillState,
  syncEventLibrary,
  syncSkillLibrary
} from "./game-data.js";
import { refreshBaseColorProfile } from "./image-tools.js";
import { exportRoleSaveFromState, importRoleSaveIntoStorage, renderRoleSaveStatus } from "./role-save-actions.js";
import { syncStatusLibrary } from "./status-effects.js";
import { createStorage } from "./storage.js";
import { normalizeStoredCharacterData } from "./storage-normalizer.js";
import { escapeHtml, gradeColor } from "./utils.js";

const TEXT = {
  initFail: "试炼场初始化失败，请打开控制台查看详情。",
  exportDone: "角色存档已导出。",
  exportFail: "导出角色存档失败，请确认浏览器支持文件系统访问并允许读写。",
  importDone: "角色存档已导入。",
  importFail: "导入角色存档失败，请确认目录中存在有效的 bottle-cap-save.json。",
  roleMissing: "请先选择两名已生成属性的角色。",
  sameRole: "试炼场需要选择两名不同的角色。",
  pause: "暂停",
  resume: "继续",
  selectRole: "请选择角色。",
  waiting: "等待开始",
  notStarted: "试炼尚未开始。",
  ended: "已结束",
  paused: "已暂停",
  ongoing: "进行中",
  state: "状态",
  time: "时间",
  winner: "胜者",
  dps: "输出",
  currentHp: "当前生命",
  statuses: "状态",
  noStatus: "无",
  kad: "击杀/助攻/死亡",
  leftPrefix: "左侧·",
  rightPrefix: "右侧·",
  evaded: "闪避",
  bonusDamage: "追加"
};

const dom = {
  leftSelect: document.getElementById("trialLeftSelect"),
  rightSelect: document.getElementById("trialRightSelect"),
  exportBtn: document.getElementById("trialExportRoleSaveBtn"),
  importBtn: document.getElementById("trialImportRoleSaveBtn"),
  storageStatus: document.getElementById("trialStorageStatus"),
  startBtn: document.getElementById("trialStartBtn"),
  pauseBtn: document.getElementById("trialPauseBtn"),
  resetBtn: document.getElementById("trialResetBtn"),
  speedSelect: document.getElementById("trialSpeedSelect"),
  canvas: document.getElementById("trialCanvas"),
  leftPanel: document.getElementById("trialLeftPanel"),
  rightPanel: document.getElementById("trialRightPanel"),
  summary: document.getElementById("trialSummary"),
  combatLog: document.getElementById("trialCombatLog")
};

const ctx = dom.canvas.getContext("2d");

const state = {
  storage: null,
  bases: [],
  builds: [],
  progress: [],
  skills: [],
  equipment: [],
  bloodlines: [],
  statuses: [],
  tournamentMeta: { byFaction: {}, byCap: {} },
  rankingMeta: { byFaction: {}, byCap: {} },
  winSummary: { totalWins: 0, byFaction: {} },
  chronicle: null,
  battle: null,
  imageCache: new Map(),
  leftCode: "",
  rightCode: "",
  lastFrameTime: 0
};

init().catch((error) => {
  console.error(error);
  window.alert(TEXT.initFail);
});

async function init() {
  bindEvents();
  state.storage = await createStorage();
  await renderStorageStatus();
  await syncReferenceLibraries();
  await normalizeStoredData();
  await refreshData();
  startRenderLoop();
}

function bindEvents() {
  dom.leftSelect.addEventListener("change", () => {
    state.leftCode = dom.leftSelect.value;
    renderSelectors();
    renderPanels();
  });
  dom.rightSelect.addEventListener("change", () => {
    state.rightCode = dom.rightSelect.value;
    renderSelectors();
    renderPanels();
  });
  dom.startBtn.addEventListener("click", startTrial);
  dom.exportBtn?.addEventListener("click", exportRoleSave);
  dom.importBtn?.addEventListener("click", importRoleSave);
  dom.pauseBtn.addEventListener("click", togglePause);
  dom.resetBtn.addEventListener("click", resetTrial);
  dom.speedSelect.addEventListener("change", () => {
    if (state.battle) state.battle.speed = Number(dom.speedSelect.value);
  });
}

async function renderStorageStatus() {
  await renderRoleSaveStatus(state.storage, dom.storageStatus);
}

async function exportRoleSave() {
  try {
    await refreshData();
    await exportRoleSaveFromState(state.storage, {
      bases: state.bases,
      builds: state.builds,
      progress: state.progress,
      equipment: state.equipment,
      winSummary: state.winSummary,
      tournamentMeta: state.tournamentMeta,
      rankingMeta: state.rankingMeta,
      chronicle: state.chronicle
    });
    await renderStorageStatus();
    window.alert(TEXT.exportDone);
  } catch (error) {
    console.error(error);
    window.alert(TEXT.exportFail);
  }
}

async function importRoleSave() {
  try {
    await importRoleSaveIntoStorage(state.storage);
    await syncReferenceLibraries();
    await normalizeStoredData();
    await renderStorageStatus();
    await refreshData();
    window.alert(TEXT.importDone);
  } catch (error) {
    console.error(error);
    window.alert(TEXT.importFail);
  }
}

async function refreshData() {
  state.bases = await state.storage.getAllCapBases();
  state.builds = await state.storage.getAllBuilds();
  state.progress = await Promise.all(
    state.builds.map(async (build) => normalizeProgressRecord(await state.storage.ensureProgress(build.buildId), build.buildId))
  );
  state.equipment = await state.storage.getAllEquipment();
  state.bloodlines = await state.storage.getAllBloodlines();
  if (state.bloodlines.length === 0) {
    state.bloodlines = getBuiltinBloodlines();
  }
  state.tournamentMeta = await state.storage.getMeta("tournamentHall") || { byFaction: {}, byCap: {} };
  state.rankingMeta = await state.storage.getMeta("rankingHall") || { byFaction: {}, byCap: {} };
  state.winSummary = await state.storage.getMeta("battleWinSummary") || { totalWins: 0, byFaction: {} };
  state.chronicle = await state.storage.getMeta("jianghuChronicle") || null;
  if (!state.leftCode) state.leftCode = state.bases[0]?.code || "";
  if (!state.rightCode) state.rightCode = state.bases[1]?.code || state.bases[0]?.code || "";
  renderSelectors();
  renderPanels();
}

async function syncReferenceLibraries() {
  state.skills = await syncSkillLibrary(state.storage);
  state.equipment = await syncEquipmentLibrary(state.storage);
  await syncEventLibrary(state.storage);
  state.bloodlines = await syncBloodlineLibrary(state.storage);
  state.statuses = await syncStatusLibrary(state.storage);
}

async function normalizeStoredData() {
  await normalizeStoredCharacterData({
    storage: state.storage,
    skills: state.skills,
    equipment: state.equipment,
    loadBases: () => state.storage.getAllCapBases(),
    loadBuilds: () => state.storage.getAllBuilds(),
    refreshBase: refreshBaseColorProfile,
    normalizeBase: normalizeBaseIdentity,
    buildCharacterProfile,
    rebuildLearnedSkillState,
    normalizeEquipmentBySlot,
    normalizeProgressRecord
  });
}

function renderSelectors() {
  const entries = getEntries();
  const options = entries
    .map((entry) => `<option value="${entry.base.code}">${escapeHtml(entry.displayName)} | ${entry.build?.potential || "未生成"} | ${entry.build?.faction.name || "待生成"}</option>`)
    .join("");
  dom.leftSelect.innerHTML = options;
  dom.rightSelect.innerHTML = options;
  dom.leftSelect.value = state.leftCode;
  dom.rightSelect.value = state.rightCode;
}

function getEntries() {
  return buildEntries({
    bases: state.bases,
    builds: state.builds,
    progressList: state.progress,
    bloodlines: state.bloodlines,
    statuses: state.statuses,
    winSummary: state.winSummary,
    tournamentMeta: state.tournamentMeta,
    rankingMeta: state.rankingMeta,
    onlyReady: true
  });
}

function startTrial() {
  const entries = getEntries();
  const left = entries.find((entry) => entry.base.code === state.leftCode);
  const right = entries.find((entry) => entry.base.code === state.rightCode);
  if (!left || !right) {
    window.alert(TEXT.roleMissing);
    return;
  }
  if (left.base.code === right.base.code) {
    window.alert(TEXT.sameRole);
    return;
  }

  const duelEntries = [left, right].map((entry, index) => ({
    ...entry,
    build: {
      ...entry.build,
      faction: {
        ...entry.build.faction,
        key: index === 0 ? "trial-left" : "trial-right",
        name: index === 0 ? `${TEXT.leftPrefix}${entry.build.faction.name}` : `${TEXT.rightPrefix}${entry.build.faction.name}`
      }
    }
  }));

  state.battle = createBattleState({
    entries: duelEntries,
    skills: state.skills,
    equipment: state.equipment,
    statuses: state.statuses,
    speed: Number(dom.speedSelect.value),
    cameraMode: "angled",
    competitionType: "trial"
  });
  dom.startBtn.disabled = true;
  dom.pauseBtn.disabled = false;
  dom.resetBtn.disabled = false;
  dom.pauseBtn.textContent = TEXT.pause;
  renderPanels();
}

function togglePause() {
  if (!state.battle) return;
  state.battle.paused = !state.battle.paused;
  dom.pauseBtn.textContent = state.battle.paused ? TEXT.resume : TEXT.pause;
}

function resetTrial() {
  state.battle = null;
  dom.startBtn.disabled = false;
  dom.pauseBtn.disabled = true;
  dom.resetBtn.disabled = true;
  dom.pauseBtn.textContent = TEXT.pause;
  ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
  renderPanels();
}

function startRenderLoop() {
  const step = (timestamp) => {
    if (!state.lastFrameTime) state.lastFrameTime = timestamp;
    const dt = Math.min(0.05, (timestamp - state.lastFrameTime) / 1000);
    state.lastFrameTime = timestamp;
    if (state.battle && !state.battle.paused && !state.battle.winner) {
      updateBattleState(state.battle, dt * state.battle.speed);
    }
    renderScene();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderScene() {
  renderBattleScene({
    battle: state.battle,
    ctx,
    canvas: dom.canvas,
    getAvatarImage,
    gradeColor
  });
  renderPanels();
}

function renderPanels() {
  if (!state.battle) {
    const left = getEntries().find((entry) => entry.base.code === state.leftCode) || null;
    const right = getEntries().find((entry) => entry.base.code === state.rightCode) || null;
    dom.leftPanel.innerHTML = left ? renderEntryPreview(left) : `<p class="muted">${TEXT.selectRole}</p>`;
    dom.rightPanel.innerHTML = right ? renderEntryPreview(right) : `<p class="muted">${TEXT.selectRole}</p>`;
    dom.summary.innerHTML = `<div class="summary-row"><span>${TEXT.state}</span><strong>${TEXT.waiting}</strong></div>`;
    dom.combatLog.innerHTML = `<div class="battle-log-entry">${TEXT.notStarted}</div>`;
    return;
  }

  const left = state.battle.entities[0];
  const right = state.battle.entities[1];
  dom.leftPanel.innerHTML = renderEntityRuntime(left);
  dom.rightPanel.innerHTML = renderEntityRuntime(right);
  dom.summary.innerHTML = `
    <div class="summary-row"><span>${TEXT.state}</span><strong>${state.battle.winner ? `${TEXT.ended} | ${state.battle.winner.name}` : state.battle.paused ? TEXT.paused : TEXT.ongoing}</strong></div>
    <div class="summary-row"><span>${TEXT.time}</span><strong>${state.battle.elapsed.toFixed(1)} 秒</strong></div>
    <div class="summary-row"><span>${TEXT.winner}</span><strong>${state.battle.winner?.name || "-"}</strong></div>
  `;
  dom.combatLog.innerHTML = state.battle.combatEvents
    .slice(-36)
    .reverse()
    .map((event) => `<div class="battle-log-entry">${formatCombatEvent(event)}</div>`)
    .join("");
}

function renderEntryPreview(entry) {
  const sheet = getEffectiveSheet(entry.build, entry.progress.level, state.skills, state.equipment, entry.honorContext || {});
  return `
    <div class="trial-entity-head">
      <img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
      <div class="cell-stack">
        <strong style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</strong>
        <span class="mini-text">${entry.build.faction.name} | ${entry.build.roleLabel}</span>
      </div>
    </div>
    ${renderLayeredPanel(sheet)}
  `;
}

function renderEntityRuntime(entity) {
  const elapsed = Math.max(0.1, state.battle?.elapsed || 0.1);
  const dps = Math.round((entity.damageDone || 0) / elapsed);
  return `
    <div class="trial-entity-head">
      <img class="avatar" src="${entity.base.avatarDataUrl}" alt="${escapeHtml(entity.name)}">
      <div class="cell-stack">
        <strong style="color:${gradeColor(entity.potential)}">${escapeHtml(entity.name)}</strong>
        <span class="mini-text">${entity.faction.name} | ${entity.role}</span>
      </div>
    </div>
    <div class="stat-pair"><span>${TEXT.dps}</span><strong>${dps}/s</strong></div>
    <div class="stat-pair"><span>${TEXT.currentHp}</span><strong>${Math.round(entity.hp)} / ${Math.round(entity.maxHp)}</strong></div>
    <div class="stat-pair"><span>${TEXT.statuses}</span><strong>${entity.statuses.length > 0 ? entity.statuses.map((status) => status.name).join(" / ") : TEXT.noStatus}</strong></div>
    <div class="stat-pair"><span>${TEXT.kad}</span><strong>${entity.kills}/${entity.assists}/${entity.deaths}</strong></div>
    ${renderLayeredPanel({
      whitePrimary: entity.whitePrimary,
      greenPrimary: entity.greenPrimary,
      primary: entity.primary,
      whiteDerived: entity.whiteDerived,
      greenDerived: entity.greenDerived,
      derived: entity.derived
    })}
  `;
}

function renderLayeredPanel(sheet) {
  return `
    <div class="trial-layer-grid">
      ${renderLayerRow("力量", sheet.whitePrimary.strength, sheet.greenPrimary.strength, sheet.primary.strength)}
      ${renderLayerRow("体质", sheet.whitePrimary.vitality, sheet.greenPrimary.vitality, sheet.primary.vitality)}
      ${renderLayerRow("敏捷", sheet.whitePrimary.agility, sheet.greenPrimary.agility, sheet.primary.agility)}
      ${renderLayerRow("智力", sheet.whitePrimary.intelligence, sheet.greenPrimary.intelligence, sheet.primary.intelligence)}
      ${renderLayerRow("精神", sheet.whitePrimary.spirit, sheet.greenPrimary.spirit, sheet.primary.spirit)}
      ${renderLayerRow("HP", sheet.whiteDerived.hpMax, sheet.greenDerived.hpMax, sheet.derived.hpMax)}
      ${renderLayerRow("物攻", sheet.whiteDerived.physicalAttack, sheet.greenDerived.physicalAttack, sheet.derived.physicalAttack)}
      ${renderLayerRow("法攻", sheet.whiteDerived.magicAttack, sheet.greenDerived.magicAttack, sheet.derived.magicAttack)}
      ${renderLayerRow("物防", sheet.whiteDerived.physicalDefense, sheet.greenDerived.physicalDefense, sheet.derived.physicalDefense)}
      ${renderLayerRow("法防", sheet.whiteDerived.magicDefense, sheet.greenDerived.magicDefense, sheet.derived.magicDefense)}
      ${renderRatioRow("CD倍率", sheet.whiteDerived.cooldownDurationMultiplierPct, sheet.greenDerived.cooldownDurationMultiplierPct, sheet.derived.cooldownDurationMultiplierPct)}
      ${renderRatioRow("状态倍率", sheet.whiteDerived.statusDurationMultiplierPct, 100, sheet.derived.statusDurationMultiplierPct)}
      ${renderLayerRow("攻击间隔", sheet.whiteDerived.attackInterval, sheet.greenDerived.attackInterval, sheet.derived.attackInterval, true)}
    </div>
  `;
}

function renderLayerRow(label, white, green, total, keepOneDecimal = false, suffix = "") {
  const format = (value) => keepOneDecimal ? Number(value || 0).toFixed(1) : Math.round(value || 0);
  return `<div class="stat-pair"><span>${label}</span><strong><span class="layered-stat"><span class="layered-stat__value">${format(white)}</span><span class="plus-text layered-stat__op">+</span><span class="green-text layered-stat__value">${format(green)}</span><span class="plus-text layered-stat__op">=</span><span class="layered-stat__value">${format(total)}${suffix}</span></span></strong></div>`;
}

function renderRatioRow(label, white, green, total) {
  const whiteText = `${Number(white || 100).toFixed(1)}%`;
  const greenText = `${Number(green || 100).toFixed(1)}%`;
  const totalText = `${Number(total || 100).toFixed(1)}%`;
  return `<div class="stat-pair"><span>${label}</span><strong><span class="layered-stat"><span class="layered-stat__value">${whiteText}</span><span class="plus-text layered-stat__op">×</span><span class="green-text layered-stat__value">${greenText}</span><span class="plus-text layered-stat__op">=</span><span class="layered-stat__value">${totalText}</span></span></strong></div>`;
}

function formatCombatEvent(event) {
  if (event.type === "evade") {
    return `[${event.at.toFixed(1)}] ${escapeHtml(event.actorName)} -> ${escapeHtml(event.targetName)} | ${escapeHtml(event.sourceName)} | <span class="combat-tag combat-tag--evade">${TEXT.evaded}</span>（${escapeHtml(event.detail || "")}）`;
  }
  if (event.type === "status-damage") {
    return `[${event.at.toFixed(1)}] ${escapeHtml(event.targetName)} | ${escapeHtml(event.sourceName)} | ${event.finalDamage} 伤害 | ${escapeHtml(event.detail || "")}`;
  }
  if (event.type === "bonus-damage") {
    return `[${event.at.toFixed(1)}] ${escapeHtml(event.actorName)} -> ${escapeHtml(event.targetName)} | ${escapeHtml(event.sourceName)} | ${TEXT.bonusDamage} ${event.finalDamage} | ${escapeHtml(event.detail || "")}`;
  }
  const critTag = Number(event.crit || 1) > 1 ? `<span class="combat-tag combat-tag--crit">暴击</span> ` : "";
  return `[${event.at.toFixed(1)}] ${escapeHtml(event.actorName)} -> ${escapeHtml(event.targetName)} | ${escapeHtml(event.sourceName)} | ${critTag}${event.finalDamage} 伤害 | 攻 ${event.baseAttack} / 防 ${event.baseDefense} / 倍率 ${event.powerScalar} / 暴击 ${event.crit} / 地形攻 ${event.attackMod} / 地形防 ${event.defenseMod}${event.sleepAmp && event.sleepAmp !== 1 ? ` / 睡眠 ${event.sleepAmp}` : ""}`;
}

function getAvatarImage(src) {
  if (!src) return null;
  if (!state.imageCache.has(src)) {
    const image = new Image();
    image.src = src;
    state.imageCache.set(src, image);
  }
  return state.imageCache.get(src);
}
