
import { BATTLE_LOG_LIMIT, FACTIONS, GAME_VERSION, GRADE_SCALE, META_KEYS, ROLE_LABELS, TERRAIN_TYPES } from "./config.js";
import { createBattleState as createBattleRuntime, renderBattleScene, updateBattleState } from "./battle-system.js";
import { getFactionSections, renderBuildGrid as renderBuildGridView, renderCapDetail as renderCapDetailView, renderHeroStats as renderHeroStatsView } from "./character-ui.js";
import { renderBloodlineDatabase as renderBloodlineDatabaseView, renderCharacterDatabase as renderCharacterDatabaseView, renderEquipmentDatabase as renderEquipmentDatabaseView, renderEventDatabase as renderEventDatabaseView, renderSkillDatabase as renderSkillDatabaseView, renderStatusDatabase as renderStatusDatabaseView } from "./database-ui.js";
import { appendChronicleEntry as appendChronicleStateEntry, buildBloodlineBiographyEntry, buildBloodlineChronicleEntry, buildExplorationBiographyEntry, buildExplorationChronicleEntry, buildFactionVictoryMilestoneEntry, buildFateChangeChronicleEntry, buildLegendaryEquipmentRecord, buildLegendarySkillRecord, buildRankingBiographyEntry, buildRankingChronicleEntry, buildTournamentBiographyEntry, buildTournamentChronicleEntry, buildTournamentPlacementMap, createChronicleState, normalizeChronicleState, recordKillMilestones, recordLevelMilestones, renderChroniclePanel as renderChronicleHtml } from "./chronicle.js";
import { getSelectedRankingHistorySnapshot, renderChronicleStageHtml } from "./chronicle-ui.js";
import { persistBaseImageAssets } from "./cap-asset-store.js";
import { getBloodlineById, getBuiltinBloodlines, syncBloodlineLibrary } from "./bloodlines.js";
import {
  BLOODLINE_TASKS,
  BLOODLINE_TASK_TARGET,
  createDefaultBloodlineTaskState,
  getBloodlineTaskCount,
  getTopBloodlineTaskCandidates,
  incrementBloodlineTaskCount,
  normalizeBloodlineTaskState,
  pickReviveMilestoneCandidate,
  pickTopEntity
} from "./bloodline-tasks.js";
import { EQUIPMENT_SLOT_LABELS, applyEquipmentDrop, canRoleEquip, getEquippedItems, grantEquipmentForBuildByGrade, grantRandomEquipmentForBuild, normalizeEquipmentBySlot, syncEquipmentLibrary } from "./equipment-data.js";
import { buildEntries, buildHonorBonusContext, getBaseBrand, getBaseName, getDisplayName, getPersistentStatuses, normalizeBaseIdentity } from "./entry-utils.js";
import { renderExplorationPanelsHtml, renderExplorationTierDivider as renderExplorationTierDividerHtml, renderExplorationTierSection as renderExplorationTierSectionHtml } from "./exploration-ui.js";
import { buildExplorationState, EXPLORATION_GRADE_FLOW, EXPLORATION_QUESTION_BANK, getExplorationCodesByTier, getExplorationNextTier, getVisibleExplorationGrades, shuffleValues } from "./exploration-utils.js";
import { advanceEndlessFastSimMeta, advanceFastSimBracketMeta, buildEndlessTournamentRewardSpec, buildFastSimRewardSpec, getEligibleFastSimExplorationStage, getEligibleFastSimTournamentStage, getEndlessFastSimAction, getNextFastSimBracketMode, normalizeFastSimMeta } from "./fast-sim.js";
import { addPendingStatus, addPrimaryBonus, appendBiographyEntry, buildCharacterProfile, buildSkillSeedForGrade, clearPendingBattleEffects, createDefaultProgress, expToNextLevel, getBaseSkillFamilies, getEffectiveSheet, grantExp, grantSkillToBuild, hasPendingBattleEffects, learnSkillForBuild, normalizeProgressRecord, rebuildLearnedSkillState, renderSkillChip, rollEvent, setNextBattleRandomSpawn, syncEventLibrary, syncSkillLibrary } from "./game-data.js";
import { buildCapBaseRecords, isLikelySameCap, refreshBaseColorProfile } from "./image-tools.js";
import { applyPreBattleEvents as runPreBattleEvents, renderBattlePrelude as renderBattlePreludeView } from "./prebattle.js";
import { buildRankingState, canEnterRankingKnockout, canGenerateNextRankingRound, enterRankingKnockout, finalizeRanking, generateNextRankingRound, getNextRankingMatch, getRankingFinalPlacementMap, getRankingKnockoutPreview, getRankingRoundRows, getRankingStandings, isRankingFinished, recordRankingBattleWinner } from "./ranking-utils.js";
import { getDefaultRankingBoardTab, renderRankingBoardContent, renderRankingLastResult, renderRankingMatchPreview, renderRankingModeInfo } from "./ranking-ui.js";
import { createRankingHistorySnapshot, getRankingHistoryEntryByCode, getRankingHistoryKnockoutPreview, getRankingHistoryRoundRows, getRankingHistoryStandings, normalizeRankingHistory } from "./ranking-history.js";
import { exportRoleSaveFromState, importRoleSaveIntoStorage, renderRoleSaveStatus } from "./role-save-actions.js";
import { buildManualMetrics, getColorBandLabel } from "./rule-tables.js";
import { getBuiltinStatuses, mergeStatusLibrary, syncStatusLibrary } from "./status-effects.js";
import { createStorage } from "./storage.js";
import { normalizeStoredCharacterData } from "./storage-normalizer.js";
import { getTournamentMatchState, renderTournamentBracket, renderTournamentFullTree, renderTournamentPanelsHtml, renderTournamentPreludeHtml } from "./tournament-ui.js";
import { advanceTournamentWinner, buildTournamentState, getNextTournamentMatch } from "./tournament-utils.js";
import { clamp, escapeHtml, gradeColor, gradeIndex, signedPct } from "./utils.js";
import { createWorldState, syncCharacterStates, advanceSeason } from "./world-tick.js";
import { renderWorldMap, renderArbiterPanel } from "./world-ui.js";
import { applyJianghuPrestige, applyRankedEventPrestige } from "./world-events.js";

const dom = {
  photoInput: document.getElementById("photoInput"),
  capNameInput: document.getElementById("capNameInput"),
  capNoteInput: document.getElementById("capNoteInput"),
  colorCountInput: document.getElementById("colorCountInput"),
  complexityInput: document.getElementById("complexityInput"),
  symmetryInput: document.getElementById("symmetryInput"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  previewCanvas: document.getElementById("previewCanvas"),
  analysisCard: document.getElementById("analysisCard"),
  capGrid: document.getElementById("capGrid"),
  capDetail: document.getElementById("capDetail"),
  heroStats: document.getElementById("heroStats"),
  resetAllLevelsBtn: document.getElementById("resetAllLevelsBtn"),
  seedCapsBtn: document.getElementById("seedCapsBtn"),
  toggleUploadPanelBtn: document.getElementById("toggleUploadPanelBtn"),
  uploadPanelBody: document.getElementById("uploadPanelBody"),
  exportRoleSaveBtn: document.getElementById("exportRoleSaveBtn"),
  importRoleSaveBtn: document.getElementById("importRoleSaveBtn"),
  storageStatus: document.getElementById("storageStatus"),
  openDatabaseBtn: document.getElementById("openDatabaseBtn"),
  closeDatabaseBtn: document.getElementById("closeDatabaseBtn"),
  databaseDrawer: document.getElementById("databaseDrawer"),
  characterDatabase: document.getElementById("characterDatabase"),
  skillDatabase: document.getElementById("skillDatabase"),
  equipmentDatabase: document.getElementById("equipmentDatabase"),
  eventDatabase: document.getElementById("eventDatabase"),
  bloodlineDatabase: document.getElementById("bloodlineDatabase"),
  statusDatabase: document.getElementById("statusDatabase"),
  battlePrelude: document.getElementById("battlePrelude"),
  battleCanvas: document.getElementById("battleCanvas"),
  battleSummary: document.getElementById("battleSummary"),
  battleLog: document.getElementById("battleLog"),
  battleModeInfoTitle: document.getElementById("battleModeInfoTitle"),
  battleModeInfo: document.getElementById("battleModeInfo"),
  battleModeSelect: document.getElementById("battleModeSelect"),
  startSelectedBattleBtn: document.getElementById("startSelectedBattleBtn"),
  simModeSelect: document.getElementById("simModeSelect"),
  toggleSelectedSimBtn: document.getElementById("toggleSelectedSimBtn"),
  startChaosBtn: document.getElementById("startChaosBtn"),
  startTournamentBtn: document.getElementById("startTournamentBtn"),
  startRankingBtn: document.getElementById("startRankingBtn"),
  startExplorationBtn: document.getElementById("startExplorationBtn"),
  toggleFastSimBtn: document.getElementById("toggleFastSimBtn"),
  toggleEndlessSimBtn: document.getElementById("toggleEndlessSimBtn"),
  toggleChronicleBtn: document.getElementById("toggleChronicleBtn"),
  pauseBattleBtn: document.getElementById("pauseBattleBtn"),
  resetBattleBtn: document.getElementById("resetBattleBtn"),
  speedSelect: document.getElementById("speedSelect"),
  cameraSelect: document.getElementById("cameraSelect"),
  tournamentTreeOverlay: document.getElementById("tournamentTreeOverlay"),
  tournamentTreeContent: document.getElementById("tournamentTreeContent"),
  closeTournamentTreeBtn: document.getElementById("closeTournamentTreeBtn"),
  rankingBoardOverlay: document.getElementById("rankingBoardOverlay"),
  rankingBoardContent: document.getElementById("rankingBoardContent"),
  closeRankingBoardBtn: document.getElementById("closeRankingBoardBtn"),
  worldMapCanvas: document.getElementById("world-map-canvas"),
  worldArbiterPanel: document.getElementById("world-arbiter-panel"),
  advanceSeasonBtn: document.getElementById("advanceSeasonBtn"),
  triggerJianghuBtn: document.getElementById("triggerJianghuBtn"),
  triggerTournamentBtn: document.getElementById("triggerTournamentBtn"),
};

const previewCtx = dom.previewCanvas.getContext("2d");
const battleCtx = dom.battleCanvas.getContext("2d");
const state = {
  storage: null,
  bases: [],
  builds: [],
  progress: [],
  skills: [],
  equipment: [],
  events: [],
  bloodlines: [],
  statuses: [],
  tournamentMeta: { byFaction: {}, byCap: {} },
  rankingMeta: { byFaction: {}, byCap: {} },
  winSummary: { totalWins: 0, byFaction: {} },
  chronicle: createChronicleState(),
  chronicleTab: "entries",
  selectedRankingHistoryIndex: 0,
  selectedRankingHistoryBoardTab: "swiss-1",
  lastChronicleRenderKey: "",
  rankingHistory: [],
  bloodlineTaskState: createDefaultBloodlineTaskState(),
  expandedFactions: new Set(),
  detailPanelOpen: true,
  selectedCode: null,
  upload: null,
  battle: null,
  tournament: null,
  tournamentBattle: null,
  ranking: null,
  rankingBattle: null,
  rankingAutoCompleteRound: null,
  exploration: null,
  activeBattleMode: "chaos",
  lastFrameTime: 0,
  imageCache: new Map(),
  pendingBattle: null,
  pendingBattleRendered: false,
  tournamentSetupOpen: false,
  tournamentTreeOpen: false,
  rankingBoardOpen: false,
  chronicleOpen: false,
  tournamentViewDirty: true,
  rankingViewDirty: true,
  explorationViewDirty: true,
  tournamentPrizeSummaryHtml: "",
  tournamentRewardSelection: {
    champion: { grade: "SSS", slot: "weapon" },
    runnerUp: { grade: "SS", slot: "accessory" }
  },
  fastSim: {
    enabled: false,
    processing: false,
    stageLevel: null,
    mode: "fast"
  },
  fastSimMeta: {
    completedStages: [],
    finalWinnerCode: ""
  },
  rewardProcessing: false,
  worldState: null,
  worldViewState: { offsetX: 0, offsetY: 0, zoom: 1 },
};

const EMPTY_BATTLE_SUMMARY_HTML = `<div class="summary-row"><span>状态</span><strong>等待开始</strong></div>`;
const EMPTY_BATTLE_LOG_HTML = `<div class="battle-log-entry">战斗尚未开始。</div>`;

init().catch((error) => {
  console.error(error);
  window.alert("初始化失败，请打开控制台查看详情。");
});

async function init() {
  bindEvents();
  renderTerrainLegend();
  state.storage = await createStorage();
  await renderStorageStatus();
  await syncReferenceLibraries();
  await normalizeStoredData();
  state.fastSimMeta = normalizeFastSimMeta(await state.storage.getMeta(META_KEYS.FAST_SIM_META));
  syncFastSimButton();
  syncCombinedActionControls();
  await refreshAll();

  // ── 世界地图初始化 ──
  state.worldState = await state.storage.getWorldState();
  if (!state.worldState) {
    state.worldState = createWorldState();
  }
  const allBuildsForWorld = await state.storage.getAllBuilds();
  state.worldState = syncCharacterStates(state.worldState, allBuildsForWorld);
  await state.storage.putWorldState(state.worldState);
  renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
  renderArbiterPanel(dom.worldArbiterPanel, state.worldState);

  startRenderLoop();
}

function bindEvents() {
  dom.photoInput.addEventListener("change", handlePhotoInput);
  dom.analyzeBtn.addEventListener("click", () => {
    saveCurrentUpload().catch((error) => {
      console.error(error);
      window.alert(`保存并生成属性失败：${error?.message || "请打开控制台查看详情。"}`);
    });
  });
  dom.resetAllLevelsBtn.addEventListener("click", resetAllLevels);
  dom.seedCapsBtn.addEventListener("click", seedDemoCaps);
  dom.toggleUploadPanelBtn?.addEventListener("click", toggleUploadPanel);
  dom.exportRoleSaveBtn?.addEventListener("click", exportRoleSave);
  dom.importRoleSaveBtn?.addEventListener("click", importRoleSave);
  dom.openDatabaseBtn.addEventListener("click", () => {
    openDatabaseDrawer();
  });
  dom.closeDatabaseBtn.addEventListener("click", () => {
    dom.databaseDrawer.hidden = true;
  });
  dom.databaseDrawer.addEventListener("click", handleDatabaseDrawerClick);
  dom.capGrid.addEventListener("click", handleBuildGridClick);
  dom.capDetail.addEventListener("click", handleDetailAction);
  dom.characterDatabase.addEventListener("click", handleBaseDatabaseClick);
  dom.skillDatabase.addEventListener("click", handleSkillDatabaseClick);
  dom.statusDatabase.addEventListener("click", handleStatusDatabaseClick);
  dom.startSelectedBattleBtn?.addEventListener("click", () => {
    getSelectedBattleProxyButton()?.click();
  });
  dom.toggleSelectedSimBtn?.addEventListener("click", () => {
    getSelectedSimProxyButton()?.click();
  });
  dom.battleModeSelect?.addEventListener("change", syncCombinedActionControls);
  dom.simModeSelect?.addEventListener("change", syncCombinedActionControls);
  dom.startChaosBtn.addEventListener("click", () => {
    startChaosBattle().catch((error) => {
      console.error(error);
      window.alert(`开始江湖争霸失败：${error?.message || "请打开控制台查看详情。"}`);
    });
  });
  dom.toggleFastSimBtn?.addEventListener("click", () => toggleFastSimulation("fast"));
  dom.toggleEndlessSimBtn?.addEventListener("click", () => toggleFastSimulation("endless"));
  dom.pauseBattleBtn.addEventListener("click", togglePauseBattle);
  dom.resetBattleBtn.addEventListener("click", resetBattle);
  dom.toggleChronicleBtn?.addEventListener("click", toggleChronicle);
  dom.speedSelect.addEventListener("change", () => {
    if (state.battle) state.battle.speed = Number(dom.speedSelect.value);
    if (state.tournamentBattle) state.tournamentBattle.speed = Number(dom.speedSelect.value);
    if (state.rankingBattle) state.rankingBattle.speed = Number(dom.speedSelect.value);
  });
  dom.cameraSelect.addEventListener("change", () => {
    if (state.battle) state.battle.cameraMode = dom.cameraSelect.value;
    if (state.tournamentBattle) state.tournamentBattle.cameraMode = dom.cameraSelect.value;
    if (state.rankingBattle) state.rankingBattle.cameraMode = dom.cameraSelect.value;
  });
  dom.startTournamentBtn.addEventListener("click", () => {
    startTournamentFlow().catch((error) => {
      console.error(error);
      window.alert(`开始武道会失败：${error?.message || "请打开控制台查看详情。"}`);
    });
  });
  dom.startRankingBtn.addEventListener("click", () => {
    startRankingFlow().catch((error) => {
      console.error(error);
      window.alert(`开始江湖排位失败：${error?.message || "请打开控制台查看详情。"}`);
    });
  });
  dom.startExplorationBtn.addEventListener("click", () => {
    startExplorationFlow().catch((error) => {
      console.error(error);
      window.alert(`开始秘境探索失败：${error?.message || "请打开控制台查看详情。"}`);
    });
  });
  dom.battlePrelude.addEventListener("change", handleBattlePreludeChange);
  dom.battlePrelude.addEventListener("click", handleBattlePreludeClick);
  dom.battleModeInfo.addEventListener("click", handleBattleModeInfoClick);
  dom.rankingBoardContent?.addEventListener("click", handleBattlePreludeClick);
  dom.closeTournamentTreeBtn?.addEventListener("click", () => {
    state.tournamentTreeOpen = false;
    renderTournamentTreeOverlay();
  });
  dom.tournamentTreeOverlay?.addEventListener("click", (event) => {
    if (event.target === dom.tournamentTreeOverlay) {
      state.tournamentTreeOpen = false;
      renderTournamentTreeOverlay();
    }
  });
  dom.closeRankingBoardBtn?.addEventListener("click", () => {
    state.rankingBoardOpen = false;
    renderRankingBoardOverlay();
  });
  dom.rankingBoardOverlay?.addEventListener("click", (event) => {
    if (event.target === dom.rankingBoardOverlay) {
      state.rankingBoardOpen = false;
      renderRankingBoardOverlay();
    }
  });

  // 世界地图仲裁者操作
  dom.advanceSeasonBtn?.addEventListener("click", async () => {
    const builds = await state.storage.getAllBuilds();
    state.worldState = advanceSeason(state.worldState, builds);
    await state.storage.putWorldState(state.worldState);
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
  });

  dom.triggerJianghuBtn?.addEventListener("click", async () => {
    const factionIds = ["qingyun", "shaolin", "mojiao", "jiaoting", "xiandao", "hundian"];
    const winner = factionIds[Math.floor(Math.random() * factionIds.length)];
    state.worldState = applyJianghuPrestige(state.worldState, winner);
    await state.storage.putWorldState(state.worldState);
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
  });

  dom.triggerTournamentBtn?.addEventListener("click", async () => {
    const { computePowerScore, FACTION_IDS } = await import("./faction-state.js");
    const factionRanks = [...FACTION_IDS].sort((a, b) =>
      computePowerScore(b, state.worldState.factionStats, state.worldState.cities) -
      computePowerScore(a, state.worldState.factionStats, state.worldState.cities)
    );
    state.worldState = applyRankedEventPrestige(state.worldState, "tournament", factionRanks);
    await state.storage.putWorldState(state.worldState);
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
  });

  // 世界地图平移/缩放
  dom.worldMapCanvas?.addEventListener("mousedown", (e) => {
    state._worldDragging = true;
    state._worldDragStart = {
      x: e.clientX - state.worldViewState.offsetX,
      y: e.clientY - state.worldViewState.offsetY,
    };
  });
  dom.worldMapCanvas?.addEventListener("mousemove", (e) => {
    if (!state._worldDragging) return;
    state.worldViewState = {
      ...state.worldViewState,
      offsetX: e.clientX - state._worldDragStart.x,
      offsetY: e.clientY - state._worldDragStart.y,
    };
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
  });
  dom.worldMapCanvas?.addEventListener("mouseup", () => { state._worldDragging = false; });
  dom.worldMapCanvas?.addEventListener("mouseleave", () => { state._worldDragging = false; });
  dom.worldMapCanvas?.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    state.worldViewState = {
      ...state.worldViewState,
      zoom: Math.max(0.3, Math.min(5, state.worldViewState.zoom * factor)),
    };
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState);
  }, { passive: false });
}

function getSelectedBattleProxyButton() {
  switch (dom.battleModeSelect?.value) {
    case "tournament":
      return dom.startTournamentBtn;
    case "ranking":
      return dom.startRankingBtn;
    case "exploration":
      return dom.startExplorationBtn;
    case "chaos":
    default:
      return dom.startChaosBtn;
  }
}

function getSelectedSimProxyButton() {
  return dom.simModeSelect?.value === "endless" ? dom.toggleEndlessSimBtn : dom.toggleFastSimBtn;
}

function syncCombinedActionControls() {
  if (dom.startSelectedBattleBtn) {
    const battleButton = getSelectedBattleProxyButton();
    dom.startSelectedBattleBtn.textContent = "开始";
    dom.startSelectedBattleBtn.disabled = battleButton?.disabled ?? false;
  }
  if (dom.toggleSelectedSimBtn) {
    const simButton = getSelectedSimProxyButton();
    dom.toggleSelectedSimBtn.textContent = state.fastSim.enabled && state.fastSim.mode === dom.simModeSelect?.value
      ? "停止"
      : "开启";
    dom.toggleSelectedSimBtn.disabled = simButton?.disabled ?? false;
  }
}

function openDatabaseDrawer() {
  dom.databaseDrawer.hidden = false;
  ensureDatabaseSectionOpen("characterDatabaseWrap");
}

function syncFastSimButton() {
  if (dom.toggleFastSimBtn) {
    dom.toggleFastSimBtn.textContent = state.fastSim.enabled && state.fastSim.mode === "fast" ? "停止快速推演" : "开启快速推演";
    dom.toggleFastSimBtn.classList.toggle("active", state.fastSim.enabled && state.fastSim.mode === "fast");
  }
  if (dom.toggleEndlessSimBtn) {
    const enableLabel = state.fastSimMeta.finalWinnerCode ? "开启无尽推演" : "开启无尽推演（含前期）";
    dom.toggleEndlessSimBtn.textContent = state.fastSim.enabled && state.fastSim.mode === "endless" ? "停止无尽推演" : enableLabel;
    dom.toggleEndlessSimBtn.classList.toggle("active", state.fastSim.enabled && state.fastSim.mode === "endless");
  }
  syncCombinedActionControls();
}

async function toggleFastSimulation(mode = "fast") {
  if (state.fastSim.enabled && state.fastSim.mode === mode) {
    state.fastSim.enabled = false;
    syncFastSimButton();
    return;
  }
  state.fastSim.mode = mode;
  state.fastSim.enabled = true;
  syncFastSimButton();
  await runFastSimulationStep();
}

async function saveFastSimMeta(nextMeta) {
  state.fastSimMeta = normalizeFastSimMeta(nextMeta);
  await state.storage.saveMeta(META_KEYS.FAST_SIM_META, state.fastSimMeta);
}

async function runFastSimulationStep() {
  if (!state.fastSim.enabled || state.fastSim.processing || state.rewardProcessing) return;
  const endlessUnlocked = Boolean(state.fastSimMeta.finalWinnerCode);

  state.fastSim.processing = true;
  try {
    if (state.activeBattleMode === "ranking") {
      await runFastSimulationRankingStep();
      return;
    }

    if (state.activeBattleMode === "exploration") {
      if (state.exploration) {
        await runFastSimulationExplorationStep();
      }
      return;
    }

    if (state.activeBattleMode === "tournament") {
      if (state.tournamentBattle || state.rewardProcessing) return;
      if (state.tournament) {
        if (!state.tournament.championCode) {
          await startNextTournamentMatch();
          return;
        }
        resetTournament();
        return;
      }
    }

    if (state.pendingBattle) {
      await startChaosBattle();
      return;
    }

    if (state.battle) {
      if (state.battle.winner && state.battle.rewardsApplied && !state.rewardProcessing) {
        resetBattle();
      }
      return;
    }

    if (state.tournamentBattle) return;

    const entries = getReadyEntries();

    if (endlessUnlocked) {
      const action = getEndlessFastSimAction(state.fastSimMeta);
      if (action?.type === "exploration") {
        await startFastSimulationExploration(0);
        return;
      }
      if (action?.type === "tournament") {
        if (getNextFastSimBracketMode(state.fastSimMeta) === "ranking") {
          await startEndlessSimulationRanking();
        } else {
          await startEndlessSimulationTournament();
        }
        return;
      }
      await startChaosBattle();
      return;
    }

    const nextExplorationStage = getEligibleFastSimExplorationStage(entries, state.fastSimMeta);
    if (nextExplorationStage) {
      await startFastSimulationExploration(nextExplorationStage);
      return;
    }
    const nextTournamentStage = getEligibleFastSimTournamentStage(entries, state.fastSimMeta);
    if (nextTournamentStage) {
      if (getNextFastSimBracketMode(state.fastSimMeta) === "ranking") {
        await startFastSimulationRanking(nextTournamentStage);
      } else {
        await startFastSimulationTournament(nextTournamentStage);
      }
      return;
    }

    await startChaosBattle();
  } finally {
    state.fastSim.processing = false;
  }
}

async function runFastSimulationRankingStep() {
  if (state.rankingBattle || state.rewardProcessing) return;

  if (!state.ranking) {
    await createRanking();
    return;
  }

  if (state.ranking.championCode) {
    resetRanking();
    return;
  }

  const nextMatch = getNextRankingMatch(state.ranking);
  if (nextMatch) {
    await startNextRankingMatch();
    return;
  }

  const advanceResult = await advanceRankingStageOrFinish({ openBoard: false, autoAdvancePhase: true });
  if (advanceResult !== "idle") return;

  state.fastSim.enabled = false;
  syncFastSimButton();
}

async function startEndlessSimulationTournament() {
  state.activeBattleMode = "tournament";
  if (dom.cameraSelect && dom.cameraSelect.value !== "angled") {
    dom.cameraSelect.value = "angled";
  }
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournamentViewDirty = true;
  state.tournamentSetupOpen = false;

  const entries = await applyTournamentCatchUp(getReadyEntries());
  if (entries.length < 2) return;

  const rewards = buildEndlessTournamentRewardSpec();
  state.tournamentRewardSelection.champion = { ...rewards.champion };
  state.tournamentRewardSelection.runnerUp = { ...rewards.runnerUp };
  state.tournament = buildTournamentState(entries, rewards.champion, rewards.runnerUp, {
    shuffleValues,
    formatMatchName
  });
  state.tournament.fastSimStageLevel = 0;
  state.fastSim.stageLevel = 0;
  state.tournament.logs.push(`[无尽推演] 已触发本轮天下第一武道会，冠军奖池 ${rewards.champion.grade} ${EQUIPMENT_SLOT_LABELS[rewards.champion.slot]}，亚军奖池 ${rewards.runnerUp.grade} ${EQUIPMENT_SLOT_LABELS[rewards.runnerUp.slot]}。`);
  setBattleControlState({
    chaosDisabled: true,
    explorationDisabled: true,
    tournamentLabel: "开始下一场",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderTournamentPrizeSummary();
  state.tournamentViewDirty = true;
  renderTournamentShell();
}

async function startEndlessSimulationRanking() {
  state.activeBattleMode = "ranking";
  if (dom.cameraSelect && dom.cameraSelect.value !== "angled") {
    dom.cameraSelect.value = "angled";
  }
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournament = null;
  state.tournamentBattle = null;
  const rewards = buildEndlessTournamentRewardSpec();
  state.tournamentRewardSelection.champion = { ...rewards.champion };
  state.tournamentRewardSelection.runnerUp = { ...rewards.runnerUp };
  await createRanking({
    championSpec: rewards.champion,
    runnerUpSpec: rewards.runnerUp,
    fastSimStageLevel: 0
  });
}

async function startFastSimulationTournament(stage) {
  state.activeBattleMode = "tournament";
  if (dom.cameraSelect && dom.cameraSelect.value !== "angled") {
    dom.cameraSelect.value = "angled";
  }
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournamentViewDirty = true;
  state.tournamentSetupOpen = false;

  const entries = await applyTournamentCatchUp(getReadyEntries());
  if (entries.length < 2) return;

  const rewards = buildFastSimRewardSpec(stage);
  state.tournamentRewardSelection.champion = { ...rewards.champion };
  state.tournamentRewardSelection.runnerUp = { ...rewards.runnerUp };
    state.tournament = buildTournamentState(entries, rewards.champion, rewards.runnerUp, {
      shuffleValues,
      formatMatchName
    });
  state.tournament.fastSimStageLevel = stage.level;
  state.fastSim.stageLevel = stage.level;
  state.tournament.logs.push(`[快速推演] 已触发 Lv.${stage.level} 武道会，冠军奖池 ${rewards.champion.grade} ${EQUIPMENT_SLOT_LABELS[rewards.champion.slot]}，亚军奖池 ${rewards.runnerUp.grade} ${EQUIPMENT_SLOT_LABELS[rewards.runnerUp.slot]}。`);
  setBattleControlState({
    chaosDisabled: true,
    explorationDisabled: true,
    tournamentLabel: "开始下一场",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderTournamentPrizeSummary();
  state.tournamentViewDirty = true;
  renderTournamentShell();
}

async function startFastSimulationRanking(stage) {
  state.activeBattleMode = "ranking";
  if (dom.cameraSelect && dom.cameraSelect.value !== "angled") {
    dom.cameraSelect.value = "angled";
  }
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournament = null;
  state.tournamentBattle = null;

  const rewards = buildFastSimRewardSpec(stage);
  state.tournamentRewardSelection.champion = { ...rewards.champion };
  state.tournamentRewardSelection.runnerUp = { ...rewards.runnerUp };
  await createRanking({
    championSpec: rewards.champion,
    runnerUpSpec: rewards.runnerUp,
    fastSimStageLevel: stage.level
  });
}

async function applyTournamentCatchUp(entries) {
  const ranked = [...entries]
    .filter((entry) => entry?.build && entry?.progress)
    .sort((left, right) => {
      const levelDiff = (right.progress?.level || 1) - (left.progress?.level || 1);
      if (levelDiff !== 0) return levelDiff;
      const expDiff = (right.progress?.experience || 0) - (left.progress?.experience || 0);
      if (expDiff !== 0) return expDiff;
      return left.base.code.localeCompare(right.base.code);
    });

  if (ranked.length === 0) return entries;
  const benchmarkEntry = ranked[Math.min(3, ranked.length - 1)];
  const targetLevel = Math.max(1, (benchmarkEntry?.progress?.level || 1) - 3);
  if (targetLevel <= 1) return entries;

  let changed = false;
  const progressByBuildId = new Map(state.progress.map((progress) => [progress.buildId, progress]));
  for (const entry of ranked) {
    if (!entry.progress || entry.progress.level >= targetLevel) continue;
    const nextProgress = normalizeProgressRecord({
      ...entry.progress,
      level: targetLevel,
      experience: 0
    }, entry.progress.buildId);
    await state.storage.putProgress(nextProgress);
    progressByBuildId.set(nextProgress.buildId, nextProgress);
    entry.progress = nextProgress;
    changed = true;
  }

  if (!changed) return entries;
  state.progress = state.progress.map((progress) => progressByBuildId.get(progress.buildId) || progress);
  return entries.map((entry) => {
    const progress = progressByBuildId.get(entry.progress?.buildId) || entry.progress;
    const { persistentStatuses } = getPersistentStatuses(progress, state.bloodlines, state.statuses);
    return {
      ...entry,
      progress,
      displayName: getDisplayName(entry.base, progress, state.bloodlines),
      honorContext: entry.build ? buildHonorBonusContext(entry.build, progress, {
        winSummary: state.winSummary,
        tournamentMeta: state.tournamentMeta,
        rankingMeta: state.rankingMeta,
        persistentStatuses
      }) : null
    };
  });
}

async function startFastSimulationExploration(level) {
  state.fastSim.stageLevel = level;
  await startExplorationFlow({ preserveFastSim: true });
  if (!state.exploration) return;
  state.exploration.fastSimStageLevel = level;
  state.exploration.logs.push(`[快速推演] 已触发 Lv.${level} 秘境探索，本轮所有问题与数字选择均为随机。`);
  state.explorationViewDirty = true;
  renderExplorationShell();
}

async function runFastSimulationExplorationStep() {
  if (!state.exploration) {
    resetExploration();
    return;
  }
  if (state.exploration.rewardsGranted) {
    resetExploration();
    return;
  }
  if (state.exploration.finished) {
    await finishExplorationRewards();
    return;
  }
  if (!state.exploration.currentQuestion) {
    await advanceExplorationRound();
    if (state.exploration?.currentQuestion?.type === "digit") {
      state.exploration.selectedDigit = Math.floor(Math.random() * 10);
    } else if (state.exploration?.currentQuestion) {
      state.exploration.selectedAnswer = Math.random() < 0.5;
    }
    state.explorationViewDirty = true;
    renderExplorationShell();
    return;
  }
  if (state.exploration.currentQuestion.type === "digit") {
    state.exploration.selectedDigit = Math.floor(Math.random() * 10);
  } else {
    state.exploration.selectedAnswer = Math.random() < 0.5;
  }
  await confirmExplorationAnswer();
}

function toggleChronicle() {
  state.chronicleOpen = !state.chronicleOpen;
  if (dom.toggleChronicleBtn) {
    dom.toggleChronicleBtn.textContent = state.chronicleOpen ? "关闭大事记" : "江湖大事记";
  }
  if (state.activeBattleMode === "tournament") {
    state.tournamentViewDirty = true;
    renderTournamentShell();
  } else {
    if (state.chronicleOpen) {
      renderChronicleStage();
      renderBattleModeInfoPanel();
      return;
    }
    if (state.pendingBattle) {
      renderBattlePrelude();
      state.pendingBattleRendered = true;
    } else if (state.battle) {
      setBattleSurfaceState({ showPrelude: false, showCanvas: true });
    } else {
      setBattleSurfaceState({ showPrelude: false, showCanvas: true });
      clearBattleCanvas();
    }
    renderBattleModeInfoPanel();
  }
}

function toggleUploadPanel() {
  if (!dom.uploadPanelBody || !dom.toggleUploadPanelBtn) return;
  const nextHidden = !dom.uploadPanelBody.hidden;
  dom.uploadPanelBody.hidden = nextHidden;
  dom.toggleUploadPanelBtn.classList.toggle("expanded", !nextHidden);
  dom.toggleUploadPanelBtn.textContent = nextHidden ? "展开识别与建档" : "收起识别与建档";
}

function ensureDatabaseSectionOpen(sectionId) {
  const body = document.getElementById(sectionId);
  if (!body) return;
  body.hidden = false;
  const toggle = dom.databaseDrawer.querySelector(`[data-section-toggle="${sectionId}"]`);
  toggle?.classList.add("expanded");
}

function getReadyEntries() {
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

function getHonorBonusContext(build, progress, persistentStatuses = []) {
  return buildHonorBonusContext(build, progress, {
    winSummary: state.winSummary,
    tournamentMeta: state.tournamentMeta,
    rankingMeta: state.rankingMeta,
    persistentStatuses
  });
}

function setBattleControlState({
  chaosDisabled = false,
  tournamentDisabled = false,
  rankingDisabled = false,
  explorationDisabled = false,
  tournamentLabel = "开始武道会",
  rankingLabel = "开始江湖排位",
  explorationLabel = "开始秘境探索",
  pauseDisabled = true,
  pauseLabel = "暂停",
  resetDisabled = true
} = {}) {
  dom.startChaosBtn.disabled = chaosDisabled;
  dom.startTournamentBtn.disabled = tournamentDisabled;
  dom.startTournamentBtn.textContent = tournamentLabel;
  dom.startRankingBtn.disabled = rankingDisabled;
  dom.startRankingBtn.textContent = rankingLabel;
  dom.startExplorationBtn.disabled = explorationDisabled;
  dom.startExplorationBtn.textContent = explorationLabel;
  dom.pauseBattleBtn.disabled = pauseDisabled;
  dom.pauseBattleBtn.textContent = pauseLabel;
  dom.resetBattleBtn.disabled = resetDisabled;
  syncCombinedActionControls();
}

function resetBattlePanels() {
  dom.battleSummary.innerHTML = EMPTY_BATTLE_SUMMARY_HTML;
  dom.battleLog.innerHTML = EMPTY_BATTLE_LOG_HTML;
}

function setBattleSurfaceState({ showPrelude, showCanvas, preludeHtml = "" }) {
  dom.battlePrelude.hidden = !showPrelude;
  dom.battleCanvas.hidden = !showCanvas;
  dom.battlePrelude.innerHTML = preludeHtml;
  dom.battlePrelude.classList.remove("chronicle-prelude");
  dom.battlePrelude.classList.remove("tournament-prelude");
}

async function renderStorageStatus() {
  await renderRoleSaveStatus(state.storage, dom.storageStatus);
}

async function exportRoleSave() {
  try {
    await refreshAll();
    await exportRoleSaveFromState(state.storage, {
      bases: state.bases,
      builds: state.builds,
      progress: state.progress,
      equipment: state.equipment,
      winSummary: state.winSummary,
      tournamentMeta: state.tournamentMeta,
      rankingMeta: state.rankingMeta,
      chronicle: state.chronicle,
      rankingHistory: state.rankingHistory,
      fastSimMeta: state.fastSimMeta,
      bloodlineTaskState: state.bloodlineTaskState
    });
    await renderStorageStatus();
    window.alert("角色存档已导出。请选择项目根目录下的 saves 文件夹即可跨电脑带走。");
  } catch (error) {
    console.error(error);
    window.alert("导出角色存档失败，请确认浏览器支持文件系统访问并允许读写。");
  }
}

async function importRoleSave() {
  try {
    await importRoleSaveIntoStorage(state.storage);
    await syncReferenceLibraries();
    await normalizeStoredData();
    state.fastSimMeta = normalizeFastSimMeta(await state.storage.getMeta(META_KEYS.FAST_SIM_META));
    syncFastSimButton();
    await renderStorageStatus();
    await refreshAll();
    window.alert("角色存档已导入。");
  } catch (error) {
    console.error(error);
    window.alert("导入角色存档失败，请确认目录中存在有效的 bottle-cap-save.json。");
  }
}

async function refreshAll() {
  state.bases = await state.storage.getAllCapBases();
  state.builds = await state.storage.getAllBuilds();
  state.progress = await Promise.all(state.builds.map(async (build) => {
    const progress = normalizeProgressRecord(await state.storage.ensureProgress(build.buildId), build.buildId);
    await state.storage.putProgress(progress);
    return progress;
  }));
  await loadReferenceData();
  // Only auto-select if there was a previously valid code that no longer exists (e.g. deleted).
  // If selectedCode is null (user cleared it by collapsing), leave it null.
  if (state.selectedCode && !state.bases.some((base) => base.code === state.selectedCode)) {
    state.selectedCode = null;
  }
  renderHeroStats();
  renderBuildGrid();
  renderCapDetail();
  renderCharacterDatabase();
  renderSkillDatabase();
  renderEquipmentDatabase();
  renderEventDatabase();
  renderBloodlineDatabase();
  renderStatusDatabase();
  renderTournamentRewardOptions();
  if (state.activeBattleMode === "tournament") {
    renderTournamentShell();
  } else if (state.activeBattleMode === "exploration") {
    renderExplorationShell();
  } else {
    renderBattleModeInfoPanel();
  }
}

async function syncReferenceLibraries() {
  state.skills = await syncSkillLibrary(state.storage);
  state.equipment = await syncEquipmentLibrary(state.storage);
  state.events = await syncEventLibrary(state.storage);
  state.bloodlines = await syncBloodlineLibrary(state.storage);
  state.statuses = await syncStatusLibrary(state.storage);
}

async function loadReferenceData() {
  state.skills = await state.storage.getAllSkills();
  state.equipment = await state.storage.getAllEquipment();
  state.events = await state.storage.getAllEvents();
  state.bloodlines = await state.storage.getAllBloodlines();
  state.statuses = mergeStatusLibrary(await state.storage.getStatusesRaw());
  state.winSummary = await state.storage.getMeta(META_KEYS.BATTLE_WIN_SUMMARY) || { totalWins: 0, byFaction: {} };
  state.tournamentMeta = await state.storage.getMeta(META_KEYS.TOURNAMENT_HALL) || { byFaction: {}, byCap: {} };
  state.rankingMeta = await state.storage.getMeta(META_KEYS.RANKING_HALL) || { byFaction: {}, byCap: {} };
  state.chronicle = normalizeChronicleState(await state.storage.getMeta(META_KEYS.JIANGHU_CHRONICLE) || createChronicleState());
  state.rankingHistory = normalizeRankingHistory(await state.storage.getMeta(META_KEYS.RANKING_HISTORY) || []);
  if (state.selectedRankingHistoryIndex >= state.rankingHistory.length) {
    state.selectedRankingHistoryIndex = Math.max(0, state.rankingHistory.length - 1);
  }
  state.fastSimMeta = normalizeFastSimMeta(await state.storage.getMeta(META_KEYS.FAST_SIM_META));
  state.bloodlineTaskState = normalizeBloodlineTaskState(await state.storage.getMeta(META_KEYS.BLOODLINE_TASK_STATE));
  syncFastSimButton();
  if (state.statuses.length === 0) {
    state.statuses = getBuiltinStatuses();
  }
  if (state.bloodlines.length === 0) {
    state.bloodlines = getBuiltinBloodlines();
  }
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
    rankingMeta: state.rankingMeta
  });
}

async function handlePhotoInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const bases = await buildCapBaseRecords(file, dom.capNameInput.value.trim(), dom.capNoteInput.value.trim());
  const manualMetrics = buildManualMetricsFromInputs();
  const seenNewBases = [];
  const items = bases.map((base) => {
    const duplicate = [...state.bases, ...seenNewBases].find((candidate) => isLikelySameCap(candidate, base)) || null;
    if (!duplicate) seenNewBases.push(base);
    const manualBase = duplicate ? base : {
      ...base,
      metrics: {
        ...(base.metrics || {}),
        ...manualMetrics
      }
    };
    return {
      base: manualBase,
      duplicate,
      previewBuild: duplicate ? null : buildCharacterProfile(manualBase, state.skills, state.equipment)
    };
  });
  state.upload = {
    items,
    uniqueItems: items.filter((item) => !item.duplicate),
    duplicateItems: items.filter((item) => item.duplicate)
  };
  drawPreview(items[0]?.base.avatarDataUrl || "");
  renderAnalysisCard(state.upload);
  dom.analyzeBtn.disabled = false;
}

async function saveCurrentUpload() {
  if (!state.upload || state.upload.items.length === 0) return;
  if (state.upload.uniqueItems.length === 0) {
    window.alert(`这次识别出的瓶盖都已存在。\n${summarizeDuplicates(state.upload.duplicateItems)}`);
    state.selectedCode = state.upload.duplicateItems[0]?.duplicate?.code || state.selectedCode;
    renderBuildGrid();
    renderCapDetail();
    return;
  }

  const prefix = dom.capNameInput.value.trim();
  for (const [index, item] of state.upload.uniqueItems.entries()) {
    const suffix = state.upload.uniqueItems.length > 1 ? `-${index + 1}` : "";
    const brand = prefix ? `${prefix}${suffix}` : item.base.brand || item.base.sourceName || `瓶盖-${item.base.code.slice(-4)}`;
    const base = {
      ...normalizeBaseIdentity(item.base),
      brand,
      name: item.base.name || "",
      sourceName: brand,
      note: dom.capNoteInput.value.trim(),
      metrics: {
        ...(item.base.metrics || {}),
        ...buildManualMetricsFromInputs()
      }
    };
    const persistedBase = await persistBaseImageAssets(state.storage, base, { interactive: true });
    await state.storage.putCapBase(persistedBase);
    const build = rebuildBuildFromBase(persistedBase);
    await state.storage.putBuild(build);
    await state.storage.putProgress(createDefaultProgress(build.buildId));
  }

  if (state.upload.duplicateItems.length > 0) {
    window.alert(`已保存 ${state.upload.uniqueItems.length} 个新瓶盖。\n${summarizeDuplicates(state.upload.duplicateItems)}`);
  }

  clearUploadState();
  await refreshAll();
}

function clearUploadState() {
  state.upload = null;
  dom.capNameInput.value = "";
  dom.capNoteInput.value = "";
  dom.colorCountInput.value = "2";
  dom.complexityInput.value = "1";
  dom.symmetryInput.value = "1";
  dom.photoInput.value = "";
  dom.analyzeBtn.disabled = true;
  previewCtx.clearRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
  dom.analysisCard.innerHTML = `<h3>识别结果</h3><p class="muted">上传瓶盖照片后会展示基础编码、头像、派系、潜力和可生成属性。</p>`;
}

function buildManualMetricsFromInputs() {
  return buildManualMetrics({
    colorCountScore: Number(dom.colorCountInput.value || 2),
    complexityTier: Number(dom.complexityInput.value || 1),
    symmetryTier: Number(dom.symmetryInput.value || 1)
  });
}

function drawPreview(src) {
  previewCtx.clearRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
  if (!src) return;
  const image = new Image();
  image.onload = () => {
    previewCtx.clearRect(0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
    previewCtx.drawImage(image, 0, 0, dom.previewCanvas.width, dom.previewCanvas.height);
  };
  image.src = src;
}

function renderAnalysisCard(upload) {
  const firstUnique = upload.uniqueItems[0] || null;
  const firstBuild = firstUnique?.previewBuild || null;
  const sheet = firstBuild ? getEffectiveSheet(firstBuild, 1, state.skills, state.equipment, getHonorBonusContext(firstBuild, null)) : null;
  const duplicateSummary = upload.duplicateItems.length > 0 ? `<p class="warning-text">${summarizeDuplicates(upload.duplicateItems)}</p>` : "";
  dom.analysisCard.innerHTML = `
    <h3>识别结果</h3>
    <div class="token-row"><span>识别到瓶盖</span><strong>${upload.items.length}</strong></div>
    <div class="token-row"><span>可保存</span><strong>${upload.uniqueItems.length}</strong></div>
    <div class="token-row"><span>重复</span><strong>${upload.duplicateItems.length}</strong></div>
    ${duplicateSummary}
    ${firstUnique ? `
      <div class="token-row"><span>首个基础编码</span><strong>${firstUnique.base.code}</strong></div>
      <div class="token-row"><span>主色</span><strong><span class="faction-chip"><span class="cap-swatch" style="background:${firstUnique.base.dominantColor}"></span>${firstUnique.base.dominantColor}</span></strong></div>
      <div class="token-row"><span>派系</span><strong>${firstBuild.faction.name}</strong></div>
      <div class="token-row"><span>攻击类型</span><strong>${ROLE_LABELS[firstBuild.role]}</strong></div>
      <div class="token-row"><span>颜色数</span><strong>${getColorBandLabel(firstBuild.potentialReason.colors)}</strong></div>
      <div class="token-row"><span>复杂度</span><strong>${firstBuild.potentialReason.complexityLabel}</strong></div>
      <div class="token-row"><span>对称度</span><strong>${firstBuild.potentialReason.symmetryLabel}</strong></div>
      <div class="token-row"><span>潜力</span><strong style="color:${gradeColor(firstBuild.potential)}">${firstBuild.potential}</strong></div>
      <div class="token-row"><span>技能数</span><strong>${firstBuild.skillIds.length}</strong></div>
      <div class="token-row"><span>1级属性</span><strong>力 ${sheet.primary.strength} / 体 ${sheet.primary.vitality} / 敏 ${sheet.primary.agility} / 智 ${sheet.primary.intelligence} / 神 ${sheet.primary.spirit}</strong></div>
      <p>技能池：${firstBuild.skillIds.map((skillId) => {
        const skill = state.skills.find((item) => item.id === skillId);
        return skill ? renderSkillChip(skill) : "";
      }).join("")}</p>
    ` : `<p class="muted">这张图片中的瓶盖都已存在于数据库中。</p>`}
    <div class="upload-result-list">
      ${upload.items.map((item, index) => `
        <div class="result-item">
          <span>${index + 1}. ${item.base.code}</span>
          <strong>${item.duplicate ? `重复于 ${escapeHtml(getDisplayName(item.duplicate))}` : "新瓶盖"}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function summarizeDuplicates(duplicateItems) {
  if (duplicateItems.length === 0) return "";
  const grouped = duplicateItems.reduce((map, item) => {
    const key = item.duplicate?.code || "unknown";
    map.set(key, {
      target: item.duplicate ? getDisplayName(item.duplicate) : "未知角色",
      count: (map.get(key)?.count || 0) + 1
    });
    return map;
  }, new Map());
  return `检测到重复瓶盖 ${duplicateItems.length} 个：${[...grouped.values()].map((entry) => `${entry.target} x${entry.count}`).join("，")}`;
}

function renderHeroStats() {
  const entries = getEntries();
  renderHeroStatsView({
    container: dom.heroStats,
    entries,
    gameVersion: GAME_VERSION,
    winSummary: state.winSummary,
    factionSections: getFactionSections(entries, FACTIONS, gradeIndex, state.winSummary)
  });
}

function renderBuildGrid() {
  const entries = getEntries();
  renderBuildGridView({
    container: dom.capGrid,
    entries,
    selectedCode: state.selectedCode,
    factionSections: getFactionSections(entries, FACTIONS, gradeIndex, state.winSummary),
    tournamentMeta: state.tournamentMeta,
    rankingMeta: state.rankingMeta,
    roleLabels: ROLE_LABELS,
    gradeColor,
    expToNextLevel,
    skills: state.skills,
    equipment: state.equipment,
    getEquippedItems,
    equippedSlotLabels: EQUIPMENT_SLOT_LABELS,
    escapeHtml,
    expandedFactions: state.expandedFactions
  });
}

function renderCapDetail() {
  const entry = getEntries().find((item) => item.base.code === state.selectedCode);
  renderCapDetailView({
    container: dom.capDetail,
    entry,
    panelOpen: state.detailPanelOpen,
    roleLabels: ROLE_LABELS,
    gradeColor,
    expToNextLevel,
    skills: state.skills,
    equipment: state.equipment,
    getEffectiveSheet,
    getHonorBonusContext,
    getEquippedItems,
    equippedSlotLabels: EQUIPMENT_SLOT_LABELS,
    escapeHtml
  });
}

function renderCharacterDatabase() {
  const sortedEntries = [...getEntries()].sort((left, right) => {
    const factionCompare = String(left.build?.faction?.name || "").localeCompare(String(right.build?.faction?.name || ""), "zh-CN");
    if (factionCompare !== 0) return factionCompare;
    const brandCompare = getBaseBrand(left.base).localeCompare(getBaseBrand(right.base), "zh-CN");
    if (brandCompare !== 0) return brandCompare;
    return getBaseName(left.base).localeCompare(getBaseName(right.base), "zh-CN");
  });
  renderCharacterDatabaseView({
    container: dom.characterDatabase,
    entries: sortedEntries,
    escapeHtml,
    getBaseBrand,
    getBaseName,
    bloodlines: state.bloodlines,
    factions: FACTIONS,
    gradeColor
  });
}

function renderSkillDatabase() {
  renderSkillDatabaseView({
    container: dom.skillDatabase,
    skills: state.skills,
    escapeHtml,
    roleLabels: ROLE_LABELS,
    gradeColor
  });
}

function renderEquipmentDatabase() {
  renderEquipmentDatabaseView({
    container: dom.equipmentDatabase,
    equipment: state.equipment,
    escapeHtml,
    roleLabels: ROLE_LABELS,
    gradeColor,
    slotLabels: EQUIPMENT_SLOT_LABELS
  });
}

function renderEventDatabase() {
  renderEventDatabaseView({
    container: dom.eventDatabase,
    events: state.events,
    escapeHtml
  });
}

function renderBloodlineDatabase() {
  const holderMap = new Map();
  const entries = getEntries();
  entries.forEach((entry) => {
    if (!entry.progress?.bloodlineId) return;
    holderMap.set(entry.progress.bloodlineId, entry.displayName);
  });
  const candidateMap = new Map(
    state.bloodlines
      .filter((bloodline) => bloodline.grade === "SSS")
      .map((bloodline) => [
        bloodline.id,
        getTopBloodlineTaskCandidates(entries, state.bloodlines, bloodline.id, 3)
      ])
  );
  renderBloodlineDatabaseView({
    container: dom.bloodlineDatabase,
    bloodlines: state.bloodlines,
    holders: holderMap,
    candidateMap,
    escapeHtml,
    gradeColor
  });
}

function renderStatusDatabase() {
  renderStatusDatabaseView({
    container: dom.statusDatabase,
    statuses: state.statuses,
    escapeHtml
  });
}

async function handleBuildGridClick(event) {
  const factionToggle = event.target.closest("[data-faction-toggle]");
  if (factionToggle) {
    const key = factionToggle.dataset.factionToggle;
    if (state.expandedFactions.has(key)) {
      state.expandedFactions.delete(key);
      // If the selected character belongs to this now-collapsed faction, clear the detail panel
      const selectedEntry = getEntries().find((e) => e.base.code === state.selectedCode);
      if (selectedEntry?.build?.faction?.key === key) {
        state.selectedCode = null;
        renderCapDetail();
      }
    } else {
      state.expandedFactions.add(key);
    }
    renderBuildGrid();
    return;
  }

  const card = event.target.closest("[data-open-id]");
  if (card) {
    state.selectedCode = card.dataset.openId;
    renderBuildGrid();
    renderCapDetail();
  }
}

function handleDatabaseDrawerClick(event) {
  const toggle = event.target.closest("[data-section-toggle]");
  if (!toggle) return;
  const body = document.getElementById(toggle.dataset.sectionToggle);
  if (!body) return;
  body.hidden = !body.hidden;
  toggle.classList.toggle("expanded", !body.hidden);
}

async function handleBaseDatabaseClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "save-base-meta") {
    try {
    const row = button.closest("[data-base-row]");
    if (!row) return;
    const code = button.dataset.id;
    const original = state.bases.find((item) => item.code === code);
    if (!original) return;
    const brand = row.querySelector("input[data-field='brand']")?.value.trim() || "";
    const name = row.querySelector("input[data-field='name']")?.value.trim() || "";
    const colorCountScore = Number(row.querySelector("[data-field='colorCountScore']")?.value ?? original.metrics?.colorCountScore ?? original.metrics?.mainColorCount ?? 1);
    const patternComplexityTier = Number(row.querySelector("[data-field='patternComplexityTier']")?.value ?? original.metrics?.patternComplexityTier ?? 1);
    const patternSymmetryTier = Number(row.querySelector("[data-field='patternSymmetryTier']")?.value ?? original.metrics?.patternSymmetryTier ?? 0);
    const factionKey = row.querySelector("[data-field='factionKey']")?.value || "";
    const bloodlineId = row.querySelector("[data-field='bloodlineId']")?.value || "";
    const base = {
      ...normalizeBaseIdentity(original),
      brand,
      name,
      sourceName: `${brand}${name}` || original.sourceName || code,
      metrics: {
        ...(original.metrics || {}),
        ...buildManualMetrics({
          colorCountScore,
          complexityTier: patternComplexityTier,
          symmetryTier: patternSymmetryTier
        })
      }
    };
    await state.storage.putCapBase(base);
    state.bases = state.bases.map((item) => (item.code === code ? base : item));
    const existingBuild = state.builds.find((item) => item.capCode === code) || null;
    if (existingBuild) {
      const selectedFaction = FACTIONS.find((item) => item.key === factionKey) || null;
      const rebuiltBuild = {
        ...rebuildBuildFromBase(base, existingBuild),
        faction: selectedFaction || existingBuild.faction
      };
      await state.storage.putBuild(rebuiltBuild);
      state.builds = state.builds.map((item) => (item.buildId === rebuiltBuild.buildId ? rebuiltBuild : item));
      const currentProgress = normalizeProgressRecord(
        await state.storage.ensureProgress(rebuiltBuild.buildId),
        rebuiltBuild.buildId
      );
      await state.storage.putProgress(currentProgress);
      state.progress = state.progress.map((item) => (item.buildId === currentProgress.buildId ? currentProgress : item));
      await applyBloodlineAssignment(code, bloodlineId, {
        build: rebuiltBuild,
        progress: currentProgress
      });
    }
    await refreshAll();
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "保存角色基础项失败。");
    }
    return;
  }
  if (button.dataset.action !== "delete-base") return;
  if (!window.confirm("确认删除该角色的基础属性吗？这会同时删除当前版本生成属性。")) return;
  await state.storage.deleteCapBase(button.dataset.id);
  if (state.selectedCode === button.dataset.id) state.selectedCode = null;
  await refreshAll();
}

async function handleDetailAction(event) {
  const button = event.target.closest("button[data-detail-action]");
  if (!button) return;
  if (button.dataset.detailAction === "toggle-panel") {
    state.detailPanelOpen = !state.detailPanelOpen;
    renderCapDetail();
    return;
  }
  const code = button.dataset.id;
  if (button.dataset.detailAction === "regen") {
    await regenerateBuild(code);
    return;
  }
  if (button.dataset.detailAction === "reset") {
    await resetBuildProgress(code);
    return;
  }
  if (button.dataset.detailAction === "delete-build") {
    const build = state.builds.find((item) => item.capCode === code);
    if (build) {
      await state.storage.deleteBuild(build.buildId);
      await refreshAll();
    }
  }
}

async function handleSkillDatabaseClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const familyId = button.dataset.familyId;
  if (!familyId) return;
  const family = getBaseSkillFamilies().find((item) => item.familyId === familyId);
  if (!family) return;
  const currentTemplate = state.skills.find((item) => item.familyId === familyId && item.grade === "E") || family;

  if (button.dataset.action === "delete-skill-family") {
    if (!window.confirm(`确认删除技能系列 ${family.name} 吗？`)) return;
    const familySkills = state.skills.filter((item) => item.familyId === familyId);
    for (const skill of familySkills) {
      await state.storage.deleteSkill(skill.id);
    }
    state.skills = await syncSkillLibrary(state.storage);
    await refreshAll();
    return;
  }

  const multiplier = family.category === "passive"
    ? null
    : window.prompt("新的 E 级倍率", String(currentTemplate.multiplier));
  const bonusRatio = family.category === "passive"
    ? window.prompt("新的 E 级被动加成（例如 0.1）", String(currentTemplate.bonusRatio || family.bonusRatio || 0.1))
    : null;
  const cooldown = window.prompt("新的 CD", String(currentTemplate.cooldown));
  const range = family.role === "all" ? currentTemplate.range : window.prompt("新的射程", String(currentTemplate.range));

  const overrides = {
    ...family,
    multiplier: family.category === "passive" ? 0 : Number(multiplier),
    flatDamage: 0,
    cooldown: Number(cooldown),
    mpCost: 0,
    range: Number(range),
    bonusRatio: family.category === "passive" ? Number(bonusRatio) : (family.bonusRatio || 0)
  };

  for (const grade of ["E", "D", "C", "B", "A", "S", "SS", "SSS"]) {
    const previous = state.skills.find((item) => item.familyId === familyId && item.grade === grade);
    await state.storage.putSkill({
      ...previous,
      ...buildSkillSeedForGrade(overrides, grade),
      userEdited: true,
      deleted: previous?.deleted ?? false
    });
  }
  await refreshAll();
}

async function handleStatusDatabaseClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = state.statuses.find((entry) => entry.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.action === "delete-status") {
    if (item.source === "system") {
      window.alert("系统基础状态不能删除。");
      return;
    }
    if (!window.confirm(`确认删除状态 ${item.name} 吗？`)) return;
    await state.storage.deleteStatus(item.id);
    await refreshAll();
    return;
  }
  const duration = window.prompt("新的持续时间（秒，触发型填 0）", String(item.duration || 0));
  const desc = window.prompt("新的描述", item.desc || "");
  await state.storage.putStatus({
    ...item,
    duration: Number(duration),
    desc: String(desc ?? item.desc),
    userEdited: true
  });
  await refreshAll();
}

async function regenerateBuild(code) {
  const originalBase = state.bases.find((item) => item.code === code);
  const existingBuild = state.builds.find((item) => item.capCode === code) || null;
  const base = originalBase ? normalizeBaseIdentity(await refreshBaseColorProfile(originalBase)) : null;
  if (!base) return;
  await state.storage.putCapBase(base);
  const build = rebuildBuildFromBase(base, existingBuild);
  await state.storage.putBuild(build);
  await state.storage.ensureProgress(build.buildId);
  state.selectedCode = code;
  await refreshAll();
}

async function resetBuildProgress(code) {
  const build = state.builds.find((item) => item.capCode === code);
  if (!build) return;
  await state.storage.putProgress(createDefaultProgress(build.buildId));
  await refreshAll();
}

async function resetAllLevels() {
  if (!window.confirm("确认初始化整个游戏状态吗？这会重新生成属性，并把等级、经验、战绩、武道会记录和江湖大事记全部清零。")) return;
  for (const currentBase of state.bases) {
    const base = normalizeBaseIdentity(await refreshBaseColorProfile(currentBase));
    await state.storage.putCapBase(base);
    const build = rebuildBuildFromBase(base);
    await state.storage.putBuild(build);
    await state.storage.putProgress(createDefaultProgress(build.buildId));
  }
  state.winSummary = { totalWins: 0, byFaction: {} };
  state.tournamentMeta = { byFaction: {}, byCap: {} };
  state.rankingMeta = { byFaction: {}, byCap: {} };
  state.chronicle = createChronicleState();
  state.rankingHistory = [];
  state.chronicleTab = "entries";
  state.selectedRankingHistoryIndex = 0;
  state.selectedRankingHistoryBoardTab = "swiss-1";
  state.fastSim.enabled = false;
  state.fastSim.processing = false;
  state.fastSim.stageLevel = null;
  state.fastSimMeta = normalizeFastSimMeta();
  state.bloodlineTaskState = createDefaultBloodlineTaskState();
  syncFastSimButton();
  resetChronicleViewState();
  await state.storage.saveMeta(META_KEYS.BATTLE_WIN_SUMMARY, state.winSummary);
  await state.storage.saveMeta(META_KEYS.TOURNAMENT_HALL, state.tournamentMeta);
  await state.storage.saveMeta(META_KEYS.RANKING_HALL, state.rankingMeta);
  await state.storage.saveMeta(META_KEYS.JIANGHU_CHRONICLE, state.chronicle);
  await state.storage.saveMeta(META_KEYS.RANKING_HISTORY, state.rankingHistory);
  await state.storage.saveMeta(META_KEYS.FAST_SIM_META, state.fastSimMeta);
  await state.storage.saveMeta(META_KEYS.BLOODLINE_TASK_STATE, state.bloodlineTaskState);
  resetBattle();
  await refreshAll();
}

async function seedDemoCaps() {
  const samples = [
    { name: "赤焰试作", color: "#d85a34" },
    { name: "潮鸣试作", color: "#2b83c9" },
    { name: "青云试作", color: "#3d8d56" },
    { name: "少林试作", color: "#d6a21f" }
  ];
  for (let index = 0; index < samples.length; index += 1) {
    const base = makeSeedBase(samples[index], index);
    await state.storage.putCapBase(base);
    const build = rebuildBuildFromBase(base);
    await state.storage.putBuild(build);
    await state.storage.ensureProgress(build.buildId);
  }
  await refreshAll();
}

function makeSeedBase(sample, index) {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8f4ea";
  ctx.fillRect(0, 0, 192, 192);
  ctx.beginPath();
  ctx.arc(96, 96, 88, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sample.color;
  ctx.fillRect(8, 8, 176, 176);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(96, 96, 40 + index * 10, 0, Math.PI * 2);
  ctx.fill();
  return {
    code: `CAP-SEED-${index + 1}`,
    brand: sample.name,
    name: "",
    sourceName: sample.name,
    note: "测试数据",
    avatarDataUrl: canvas.toDataURL("image/png"),
    photoDataUrl: canvas.toDataURL("image/png"),
    dominantColor: sample.color,
    hsl: { h: 30 * index, s: 0.6, l: 0.5 },
    metrics: { variance: 32 + index * 6, edgeDensity: 12 + index * 3, radialContrast: 15 + index * 2, asymmetry: 8 + index * 2, flourish: 18 + index * 4, stripeScore: 14 + index * 2 },
    perceptualHash: `seed-${index}`,
    featureSignature: `seed-${index}`,
    rotation: 0,
    createdAt: Date.now() + index
  };
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

function getBloodlineHolderEntry(bloodlineId, excludedBuildId = "") {
  if (!bloodlineId) return null;
  return getEntries().find((entry) => entry.progress?.bloodlineId === bloodlineId && entry.progress?.buildId !== excludedBuildId) || null;
}

function canApplyFateChangeByGrade(sourceGrade, potentialGrade) {
  return gradeIndex(sourceGrade || "E") > gradeIndex(potentialGrade || "E");
}

function getMaxFateChangeCount(potentialGrade) {
  return Math.max(0, GRADE_SCALE.length - 1 - gradeIndex(potentialGrade || "E"));
}

function clampNonBloodlineFateChangeCount(count, potentialGrade) {
  return clamp(Math.floor(Number(count || 0)), 0, getMaxFateChangeCount(potentialGrade));
}

function canUpgradeBloodline(currentBloodline, nextBloodline) {
  if (!nextBloodline) return true;
  if (!currentBloodline || currentBloodline.id === nextBloodline.id) return true;
  return nextBloodline.grade === "SSS" && currentBloodline.grade !== "SSS";
}

function shouldPreserveReplacedBloodlineFate(currentBloodline, nextBloodline) {
  if (!currentBloodline || !nextBloodline) return false;
  if (currentBloodline.id === nextBloodline.id) return false;
  return nextBloodline.grade === "SSS" && currentBloodline.grade !== "SSS";
}

async function applyBloodlineAssignment(code, bloodlineId, overrides = {}) {
  const build = overrides.build || state.builds.find((item) => item.capCode === code);
  const progress = overrides.progress || (build ? state.progress.find((item) => item.buildId === build.buildId) : null);
  if (!build || !progress) return null;

  const normalizedProgress = normalizeProgressRecord(progress, build.buildId);
  const nextBloodlineId = bloodlineId || "";
  const currentBloodline = getBloodlineById(state.bloodlines, normalizedProgress.bloodlineId || "");
  const nextBloodline = getBloodlineById(state.bloodlines, nextBloodlineId);

  if (nextBloodlineId) {
    const holder = getBloodlineHolderEntry(nextBloodlineId, build.buildId);
    if (holder) {
      throw new Error(`${nextBloodline.name} 已被 ${holder.displayName} 获得，无法重复传承。`);
    }
  }
  if (!canUpgradeBloodline(currentBloodline, nextBloodline)) {
    throw new Error(`${getDisplayName(build.base || state.bases.find((item) => item.code === code) || { brand: "", name: "", sourceName: code, code }, normalizedProgress)} 已拥有更高或同级血脉，无法替换。`);
  }

  const expectedFateBonus = nextBloodline && canApplyFateChangeByGrade(nextBloodline.grade, build.potential)
    ? (nextBloodline.fateBonus || 0)
    : 0;
  const alreadyHasGrantedSkill = !nextBloodline?.skillId || (build.skillIds || []).includes(nextBloodline.skillId);
  if (
    (normalizedProgress.bloodlineId || "") === nextBloodlineId &&
    (normalizedProgress.bloodlineGrantedSkillId || "") === (nextBloodline?.skillId || "") &&
    (normalizedProgress.bloodlineFateBonusApplied || 0) === expectedFateBonus &&
    alreadyHasGrantedSkill
  ) {
    return {
      build,
      progress: normalizedProgress,
      bloodline: nextBloodline
    };
  }

  let nextBuild = { ...build };
  if (normalizedProgress.bloodlineGrantedSkillId) {
    nextBuild = rebuildLearnedSkillState({
      ...nextBuild,
      skillIds: (nextBuild.skillIds || []).filter((skillId) => skillId !== normalizedProgress.bloodlineGrantedSkillId)
    }, state.skills);
  }

  const preservePreviousFateBonus = shouldPreserveReplacedBloodlineFate(currentBloodline, nextBloodline);
  const currentNonBloodlineFate = clampNonBloodlineFateChangeCount(
    normalizedProgress.nonBloodlineFateChangeCount,
    build.potential
  );
  const preservedBloodlineFate = preservePreviousFateBonus ? (normalizedProgress.bloodlineFateBonusApplied || 0) : 0;
  let nextProgress = {
    ...normalizedProgress,
    bloodlineId: nextBloodlineId,
    bloodlineGrantedSkillId: "",
    nonBloodlineFateChangeCount: currentNonBloodlineFate,
    fateChangeCount: currentNonBloodlineFate + preservedBloodlineFate,
    bloodlineFateBonusApplied: 0
  };

  if (nextBloodline) {
    const appliedFateBonus = canApplyFateChangeByGrade(nextBloodline.grade, nextBuild.potential)
      ? (nextBloodline.fateBonus || 0)
      : 0;
    nextBuild = grantSkillToBuild(nextBuild, nextBloodline.skillId, state.skills);
    nextProgress = {
      ...nextProgress,
      bloodlineGrantedSkillId: nextBloodline.skillId,
      bloodlineFateBonusApplied: appliedFateBonus,
      fateChangeCount: nextProgress.nonBloodlineFateChangeCount + preservedBloodlineFate + appliedFateBonus
    };
  }

  await state.storage.putBuild(nextBuild);
  await state.storage.putProgress(nextProgress);
  state.builds = state.builds.map((item) => (item.buildId === nextBuild.buildId ? nextBuild : item));
  state.progress = state.progress.map((item) => (item.buildId === nextProgress.buildId ? nextProgress : item));

  if (nextBloodline && nextBloodline.id !== currentBloodline?.id) {
    const base = state.bases.find((item) => item.code === code);
    const subject = {
      name: getDisplayName(base || { brand: "", name: "", sourceName: code, code }, nextProgress),
      faction: nextBuild.faction,
      grade: nextBuild.potential
    };
    await appendChronicleEntry(buildBloodlineChronicleEntry(subject, nextBloodline));
    await appendBiographyForBuildId(nextBuild.buildId, buildBloodlineBiographyEntry(nextBloodline));
  }

  return {
    build: nextBuild,
    progress: nextProgress,
    bloodline: nextBloodline
  };
}

async function awardBloodlineIfEligible(code, bloodlineId, build, progress) {
  const bloodline = getBloodlineById(state.bloodlines, bloodlineId);
  const currentBloodline = getBloodlineById(state.bloodlines, progress?.bloodlineId || "");
  if (!bloodline || !build || !progress) return null;
  if (!canUpgradeBloodline(currentBloodline, bloodline)) return null;
  try {
    return await applyBloodlineAssignment(code, bloodlineId, { build, progress });
  } catch (error) {
    console.warn(`血脉任务奖励 ${bloodlineId} 发放失败：`, error);
    return null;
  }
}

function rebuildBuildFromBase(base, previousBuild = null) {
  const nextProfile = buildCharacterProfile(base, state.skills, state.equipment);
  const inheritedSkillIds = Array.isArray(previousBuild?.skillIds) && previousBuild.skillIds.length > 0
    ? previousBuild.skillIds
    : nextProfile.skillIds;
  return rebuildLearnedSkillState({
    ...nextProfile,
    skillIds: inheritedSkillIds,
    equipmentBySlot: previousBuild
      ? normalizeEquipmentBySlot(previousBuild.equipmentBySlot, nextProfile.role, state.equipment)
      : nextProfile.equipmentBySlot
  }, state.skills);
}

function resetChronicleViewState() {
  state.chronicleOpen = false;
  state.chronicleTab = "entries";
  state.lastChronicleRenderKey = "";
  if (dom.toggleChronicleBtn) {
    dom.toggleChronicleBtn.textContent = "江湖大事记";
  }
}

async function startChaosBattle() {
  state.activeBattleMode = "chaos";
  state.rankingBoardOpen = false;
  renderRankingBoardOverlay();
  if (dom.cameraSelect && dom.cameraSelect.value !== "top") {
    dom.cameraSelect.value = "top";
  }
  state.tournamentBattle = null;
  state.rankingBattle = null;
  state.tournamentTreeOpen = false;
  renderTournamentTreeOverlay();
  if (state.pendingBattle) {
    const entries = state.pendingBattle.entries;
    const eventLogs = state.pendingBattle.logs;
    state.battle = createBattleRuntime({
      entries,
      skills: state.skills,
      equipment: state.equipment,
      statuses: state.statuses,
      factionWins: state.winSummary?.byFaction || {},
      speed: Number(dom.speedSelect.value),
      cameraMode: dom.cameraSelect.value,
      competitionType: "chaos"
    });
    if (eventLogs.length > 0) {
      state.battle.logs.unshift(...eventLogs);
    }
    for (const entry of entries) {
      if (!entry.progress) continue;
      if (hasPendingBattleEffects(entry.progress)) {
        await state.storage.putProgress(clearPendingBattleEffects(entry.progress));
      }
    }
    state.pendingBattle = null;
    state.pendingBattleRendered = false;
    setBattleSurfaceState({ showPrelude: false, showCanvas: true });
    setBattleControlState({
      chaosDisabled: true,
      tournamentDisabled: true,
      explorationDisabled: true,
      pauseDisabled: false,
      resetDisabled: false
    });
    await refreshAll();
    return;
  }

  let entries = getReadyEntries();
  if (entries.length < 2) {
    window.alert("至少需要 2 个有生成属性的角色才能开始战斗。");
    return;
  }
  const prelude = await applyPreBattleEvents(entries);
  await refreshAll();
  entries = getReadyEntries();
  const previewItems = entries.map((entry) => ({
    ...entry,
    preludeText: prelude.details.find((item) => item.code === entry.base.code)?.detail || (entry.progress?.lastEventText || "无事发生")
  }));
  state.pendingBattle = {
    entries,
    logs: prelude.logs,
    previewItems
  };
  state.pendingBattleRendered = false;
  state.battle = null;
  setBattleSurfaceState({ showPrelude: true, showCanvas: false });
  renderBattlePrelude();
  state.pendingBattleRendered = true;
  setBattleControlState({
    tournamentDisabled: true,
    explorationDisabled: true,
    pauseDisabled: true,
    resetDisabled: false
  });
}

function togglePauseBattle() {
  if (state.activeBattleMode === "tournament") {
    togglePauseTournament();
    return;
  }
  if (state.activeBattleMode === "ranking") {
    toggleRankingBattle();
    return;
  }
  if (state.activeBattleMode === "exploration") return;
  if (!state.battle) return;
  state.battle.paused = !state.battle.paused;
  dom.pauseBattleBtn.textContent = state.battle.paused ? "继续" : "暂停";
}

function resetBattle() {
  if (state.activeBattleMode === "tournament") {
    resetTournament();
    return;
  }
  if (state.activeBattleMode === "ranking") {
    resetRanking();
    return;
  }
  if (state.activeBattleMode === "exploration") {
    resetExploration();
    return;
  }
  state.battle = null;
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.tournamentSetupOpen = false;
  resetChronicleViewState();
  setBattleControlState();
  setBattleSurfaceState({ showPrelude: false, showCanvas: true });
  resetBattlePanels();
  renderBattleModeInfoPanel();
  clearBattleCanvas();
}

function updateBattle(dt) {
  const battle = state.battle;
  if (!battle) return;
  updateBattleState(battle, dt);
  if (battle.winner && !battle.rewardsApplied) {
    battle.rewardsApplied = true;
    applyBattleRewards().catch(console.error);
  }
}

async function applyBattleRewards() {
  state.rewardProcessing = true;
  try {
    const winSummary = structuredClone(state.winSummary || { totalWins: 0, byFaction: {} });
    const latestBuildByBuildId = new Map();
    const latestProgressByBuildId = new Map();
    for (const entity of state.battle.entities) {
      latestBuildByBuildId.set(entity.build.buildId, entity.build);
      const progress = normalizeProgressRecord(entity.progress, entity.progress.buildId);
      const previousLevel = progress.level;
      const previousKills = progress.kills;
      progress.totalBattles += 1;
      if (state.battle.winner && entity.faction.key === state.battle.winner.key) progress.wins += 1;
      progress.kills += entity.kills || 0;
      progress.assists += entity.assists || 0;
      progress.deaths += entity.deaths || 0;
      grantExp(progress, Math.max(0, Math.round(entity.pendingExp)));
      await state.storage.putProgress(progress);
      latestProgressByBuildId.set(progress.buildId, progress);
      await recordProgressMilestones(progress.buildId, previousLevel, progress.level, createChronicleSubject(entity));
      const killResult = recordKillMilestones(state.chronicle, previousKills, progress.kills, createChronicleSubject(entity));
      if (killResult.entries.length > 0) {
        let nextChronicle = killResult.chronicle;
        for (const entry of killResult.entries) {
          nextChronicle = appendChronicleStateEntry(nextChronicle, entry);
        }
        await saveChronicleState(nextChronicle);
        for (const biography of killResult.biographies || []) {
          await appendBiographyForBuildId(progress.buildId, biography);
        }
      }
    }
    if (state.battle.winner) {
      winSummary.totalWins += 1;
      const factionWins = (winSummary.byFaction[state.battle.winner.key] || 0) + 1;
      winSummary.byFaction[state.battle.winner.key] = factionWins;
      state.winSummary = winSummary;
      await state.storage.saveMeta(META_KEYS.BATTLE_WIN_SUMMARY, winSummary);
      if (factionWins % 10 === 0) {
        await appendChronicleEntry(buildFactionVictoryMilestoneEntry(state.battle.winner, factionWins));
      }
    }
    // 世界地图声望：江湖争霸
    if (state.battle.winner && state.worldState) {
      state.worldState = applyJianghuPrestige(state.worldState, state.battle.winner.key);
      await state.storage.putWorldState(state.worldState);
      renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
    }
    await resolveChaosBloodlineTasks(state.battle.entities, latestBuildByBuildId, latestProgressByBuildId);
    if (state.fastSim.enabled && state.fastSimMeta.finalWinnerCode) {
      await saveFastSimMeta(advanceEndlessFastSimMeta(state.fastSimMeta));
    }
    await refreshAll();
    dom.pauseBattleBtn.disabled = true;
  } finally {
    state.rewardProcessing = false;
  }
}

async function resolveChaosBloodlineTasks(entities, buildMap, progressMap) {
  const eligibleEntities = (entities || []).filter((entity) => {
    const progress = progressMap.get(entity?.build?.buildId) || state.progress.find((item) => item.buildId === entity?.build?.buildId);
    const bloodline = getBloodlineById(state.bloodlines, progress?.bloodlineId || "");
    return bloodline?.grade !== "SSS";
  });
  const survivingEntities = eligibleEntities.filter((entity) => entity?.alive);

  await resolveAzureDragonTask(eligibleEntities, buildMap, progressMap);
  await resolveBlackTortoiseTask(survivingEntities, buildMap, progressMap);
  await resolveVermilionBirdTask(eligibleEntities, buildMap, progressMap);
  await resolveWhiteTigerTask(eligibleEntities, buildMap, progressMap, state.battle?.winner?.key || "");
}

async function resolveAzureDragonTask(entities, buildMap, progressMap) {
  const winner = pickTopEntity(entities, "hp", { minValue: 1 });
  if (!winner) return;
  await incrementBloodlineTaskForEntity(winner, BLOODLINE_TASKS.azureDragon, 1, buildMap, progressMap);
}

async function resolveBlackTortoiseTask(survivingEntities, buildMap, progressMap) {
  const winner = pickTopEntity(survivingEntities, "damageTaken", { minValue: 1 });
  if (!winner) return;
  await incrementBloodlineTaskForEntity(winner, BLOODLINE_TASKS.blackTortoise, 1, buildMap, progressMap);
}

async function resolveVermilionBirdTask(entities, buildMap, progressMap) {
  const taskTarget = BLOODLINE_TASKS.vermilionBird?.target || BLOODLINE_TASK_TARGET;
  const candidates = [];
  for (const entity of entities || []) {
    const gain = Math.max(0, Math.floor(Number(entity?.reviveTriggers || 0)));
    if (gain <= 0) continue;
    const build = buildMap.get(entity.build.buildId);
    const progress = progressMap.get(entity.build.buildId) || state.progress.find((item) => item.buildId === entity.build.buildId);
    if (!build || !progress) continue;
    candidates.push({
      entity,
      build,
      progress,
      gain,
      nextCount: getBloodlineTaskCount(progress, BLOODLINE_TASKS.vermilionBird.counterKey) + gain
    });
  }
  if (candidates.length === 0) return;
  for (const candidate of candidates) {
    const nextProgress = incrementBloodlineTaskCount(candidate.progress, BLOODLINE_TASKS.vermilionBird.counterKey, candidate.gain);
    await state.storage.putProgress(nextProgress);
    progressMap.set(nextProgress.buildId, nextProgress);
    candidate.progress = nextProgress;
  }
  const milestoneCandidate = pickReviveMilestoneCandidate(
    candidates.filter((candidate) => candidate.nextCount >= taskTarget)
  );
  if (!milestoneCandidate) return;
  const awarded = await awardBloodlineIfEligible(
    milestoneCandidate.entity.id,
    BLOODLINE_TASKS.vermilionBird.bloodlineId,
    milestoneCandidate.build,
    milestoneCandidate.progress
  );
  if (awarded) {
    buildMap.set(awarded.build.buildId, awarded.build);
    progressMap.set(awarded.progress.buildId, awarded.progress);
  }
}

async function resolveWhiteTigerTask(entities, buildMap, progressMap, winnerFactionKey = "") {
  const winner = pickTopEntity(entities, "damageDone", { minValue: 1 });
  if (!winner || winner?.faction?.key !== winnerFactionKey) return;
  await incrementBloodlineTaskForEntity(winner, BLOODLINE_TASKS.whiteTiger, 1, buildMap, progressMap);
}

async function incrementBloodlineTaskForEntity(entity, task, amount, buildMap, progressMap) {
  const taskTarget = task?.target || BLOODLINE_TASK_TARGET;
  const buildId = entity?.build?.buildId;
  if (!buildId || !task) return null;
  const build = buildMap.get(buildId) || state.builds.find((item) => item.buildId === buildId);
  const progress = progressMap.get(buildId) || state.progress.find((item) => item.buildId === buildId);
  if (!build || !progress) return null;
  const nextProgress = incrementBloodlineTaskCount(progress, task.counterKey, amount);
  await state.storage.putProgress(nextProgress);
  progressMap.set(buildId, nextProgress);
  if (getBloodlineTaskCount(progress, task.counterKey) < taskTarget
    && getBloodlineTaskCount(nextProgress, task.counterKey) >= taskTarget) {
    const awarded = await awardBloodlineIfEligible(entity.id, task.bloodlineId, build, nextProgress);
    if (awarded) {
      buildMap.set(awarded.build.buildId, awarded.build);
      progressMap.set(awarded.progress.buildId, awarded.progress);
      return awarded;
    }
  }
  return { build, progress: nextProgress };
}

async function applyPreBattleEvents(entries) {
  return runPreBattleEvents({
    entries,
    events: state.events,
    allSkills: state.skills,
    allEquipment: state.equipment,
    storage: state.storage,
    rollEvent,
    expToNextLevel,
    grantExp,
    learnSkillForBuild,
    grantRandomEquipmentForBuild,
    grantEquipmentForBuildByGrade,
    normalizeProgressRecord,
    addPendingStatus,
    addPrimaryBonus,
    setNextBattleRandomSpawn,
      onProgressChanged: async ({ progress, previousLevel, entry }) => {
        await recordProgressMilestones(progress.buildId, previousLevel, progress.level, createChronicleSubject(entry));
      },
      onSkillLearned: async ({ entry, progress, skill }) => {
        if (skill?.grade === "SSS") {
          await recordLegendarySkill(progress.buildId, createChronicleSubject(entry), skill);
        }
      },
      onEquipmentGained: async ({ entry, progress, equipment }) => {
        if (equipment?.grade === "SSS") {
          await recordLegendaryEquipment(progress.buildId, createChronicleSubject(entry), equipment);
        }
      }
  });
}

function startRenderLoop() {
  resetBattle();
  const step = (timestamp) => {
    if (!state.lastFrameTime) state.lastFrameTime = timestamp;
    const dt = Math.min(0.05, (timestamp - state.lastFrameTime) / 1000);
    state.lastFrameTime = timestamp;
    if (state.battle && !state.battle.paused && !state.battle.winner) {
      updateBattle(dt * state.battle.speed);
    }
    if (state.tournamentBattle && !state.tournamentBattle.paused && !state.tournamentBattle.winner) {
      updateTournamentBattle(dt * state.tournamentBattle.speed);
    }
    if (state.rankingBattle && !state.rankingBattle.paused && !state.rankingBattle.winner) {
      updateRankingBattle(dt * state.rankingBattle.speed);
    }
    renderBattle();
    if (state.fastSim.enabled) {
      runFastSimulationStep().catch(console.error);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderBattle() {
  if (state.activeBattleMode === "tournament") {
    if (state.tournamentViewDirty) {
      renderTournamentShell();
      state.tournamentViewDirty = false;
    }
    if (state.chronicleOpen) {
      renderChronicleStage();
      return;
    }
    if (state.tournamentBattle) {
      renderBattleScene({
        battle: state.tournamentBattle,
        ctx: battleCtx,
        canvas: dom.battleCanvas,
        getAvatarImage,
        gradeColor
      });
      renderTournamentPanels();
    }
    return;
  }
  if (state.activeBattleMode === "ranking") {
    if (state.rankingViewDirty) {
      renderRankingShell();
      state.rankingViewDirty = false;
    }
    if (state.chronicleOpen) {
      renderChronicleStage();
      return;
    }
    if (state.rankingBattle) {
      renderBattleScene({
        battle: state.rankingBattle,
        ctx: battleCtx,
        canvas: dom.battleCanvas,
        getAvatarImage,
        gradeColor
      });
      renderRankingPanels();
    }
    return;
  }
  if (state.activeBattleMode === "exploration") {
    if (state.explorationViewDirty) {
      renderExplorationShell();
      state.explorationViewDirty = false;
    }
    if (state.chronicleOpen) {
      renderChronicleStage();
      return;
    }
    return;
  }
  renderBattleModeInfoPanel();
  if (state.chronicleOpen) {
    renderChronicleStage();
    return;
  }
  if (state.pendingBattle) {
    if (!state.pendingBattleRendered) {
      renderBattlePrelude();
      state.pendingBattleRendered = true;
    }
    return;
  }
  renderBattleScene({
    battle: state.battle,
    ctx: battleCtx,
    canvas: dom.battleCanvas,
    getAvatarImage,
    gradeColor
  });
  if (state.battle) {
    renderBattlePanels();
  }
}

function renderBattlePrelude() {
  if (!state.pendingBattle) return;
  renderBattlePreludeView({
    container: dom.battlePrelude,
    summaryContainer: dom.battleSummary,
    logContainer: dom.battleLog,
    pendingBattle: state.pendingBattle,
    gradeColor,
    escapeHtml,
    onStart: () => {
      startChaosBattle().catch((error) => {
        console.error(error);
        window.alert("进入战斗失败，请打开控制台查看详情。");
      });
    }
  });
}

function clearCanvas({ bgColor, textColor, message }) {
  battleCtx.clearRect(0, 0, dom.battleCanvas.width, dom.battleCanvas.height);
  battleCtx.fillStyle = bgColor;
  battleCtx.fillRect(0, 0, dom.battleCanvas.width, dom.battleCanvas.height);
  battleCtx.fillStyle = textColor;
  battleCtx.font = "22px sans-serif";
  battleCtx.fillText(message, 32, 42);
}

function clearBattleCanvas() {
  clearCanvas({ bgColor: "#efe3c1", textColor: "rgba(31, 43, 36, 0.48)", message: "等待战斗开始" });
}

function clearTournamentCanvas() {
  clearCanvas({ bgColor: "#ead5b2", textColor: "rgba(64, 43, 22, 0.55)", message: "等待武道会对决开始" });
}

function renderBattlePanels() {
  if (!state.battle) return;
  const living = state.battle.entities.filter((entity) => entity.alive);
  const factionStats = {};
  living.forEach((entity) => {
    factionStats[entity.faction.name] = (factionStats[entity.faction.name] || 0) + 1;
  });
  const topDamage = [...state.battle.entities].sort((a, b) => b.damageDone - a.damageDone)[0];
  const progress = state.battle.entities.length === 0 ? 0 : Math.round(((state.battle.entities.length - living.length) / state.battle.entities.length) * 100);
  const rows = [
    ["状态", state.battle.winner ? `已结束 · ${state.battle.winner.name}` : state.battle.paused ? "已暂停" : "进行中"],
    ["时间", `${state.battle.elapsed.toFixed(1)} 秒`],
    ["进度", `${progress}%`],
    ["存活单位", `${living.length}`],
    ["剩余派系", `${Object.keys(factionStats).length}`],
    ["最高输出", topDamage ? `${topDamage.name} (${Math.round(topDamage.damageDone)})` : "-"]
  ];
  Object.entries(factionStats).forEach(([name, count]) => rows.push([name, `${count}`]));
  dom.battleSummary.innerHTML = rows.map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
  dom.battleLog.innerHTML = state.battle.logs.slice(-BATTLE_LOG_LIMIT).reverse().map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`).join("");
}

function renderBattleModeInfoPanel() {
  dom.battleModeInfoTitle.textContent = "地形规则";
  renderTerrainLegend();
}

function renderChroniclePanel() {
  return renderChronicleHtml(state.chronicle?.entries || [], escapeHtml);
}

function createChronicleSubject(entryOrEntity) {
    if (!entryOrEntity) return null;
    const build = entryOrEntity.build || null;
    return {
      name: entryOrEntity.displayName || entryOrEntity.name || entryOrEntity.base?.code || "无名侠客",
      faction: build?.faction || entryOrEntity.faction || null,
      grade: build?.potential || entryOrEntity.grade || ""
    };
  }

function renderChronicleStage() {
  const chronicleKey = JSON.stringify({
    tab: state.chronicleTab,
    selectedRankingHistoryIndex: state.selectedRankingHistoryIndex,
    selectedRankingHistoryBoardTab: state.selectedRankingHistoryBoardTab,
    chronicleEntryCount: state.chronicle?.entries?.length || 0,
    chronicleTopEntry: state.chronicle?.entries?.[0]?.index || 0,
    rankingHistoryCount: state.rankingHistory.length,
    lastRankingTitle: state.rankingHistory[state.rankingHistory.length - 1]?.title || ""
  });
  if (
    state.lastChronicleRenderKey === chronicleKey &&
    dom.battlePrelude &&
    !dom.battlePrelude.hidden &&
    dom.battlePrelude.classList.contains("chronicle-prelude")
  ) {
    return;
  }
  state.lastChronicleRenderKey = chronicleKey;
  setBattleSurfaceState({
    showPrelude: true,
    showCanvas: false,
    preludeHtml: renderChronicleStageHtml({
      chronicleTab: state.chronicleTab,
      chroniclePanelHtml: renderChroniclePanel(),
      rankingHistory: state.rankingHistory,
      selectedRankingHistoryIndex: state.selectedRankingHistoryIndex,
      selectedRankingHistoryBoardTab: state.selectedRankingHistoryBoardTab,
      renderRankingBoardContent,
      getRankingRoundRows: getRankingHistoryRoundRows,
      getRankingStandings: getRankingHistoryStandings,
      getRankingKnockoutPreview: getRankingHistoryKnockoutPreview,
      getEntryByCode: getRankingHistoryEntryByCode,
      gradeColor,
      escapeHtml
    })
  });
  dom.battlePrelude.classList.add("chronicle-prelude");
}

async function saveChronicleState(nextChronicle) {
  state.chronicle = normalizeChronicleState(nextChronicle);
  await state.storage.saveMeta(META_KEYS.JIANGHU_CHRONICLE, state.chronicle);
}

async function appendChronicleEntry(entry) {
  await saveChronicleState(appendChronicleStateEntry(state.chronicle, entry));
}

async function appendBiographyForBuildId(buildId, text) {
  const progress = normalizeProgressRecord(await state.storage.ensureProgress(buildId), buildId);
  await state.storage.putProgress(appendBiographyEntry(progress, text));
}

async function recordProgressMilestones(buildId, previousLevel, nextLevel, subject) {
    const result = recordLevelMilestones(state.chronicle, previousLevel, nextLevel, subject);
  let nextChronicle = result.chronicle;
  for (const entry of result.entries) {
    nextChronicle = appendChronicleStateEntry(nextChronicle, entry);
  }
  if (result.entries.length > 0) {
    await saveChronicleState(nextChronicle);
  }
  for (const text of result.biographies) {
    await appendBiographyForBuildId(buildId, text);
  }
}

async function recordLegendarySkill(buildId, subject, skill) {
    const record = buildLegendarySkillRecord(subject, skill);
    await appendChronicleEntry(record.chronicleEntry);
    await appendBiographyForBuildId(buildId, record.biographyText);
  }
  
async function recordLegendaryEquipment(buildId, subject, equipment) {
    const record = buildLegendaryEquipmentRecord(subject, equipment);
    await appendChronicleEntry(record.chronicleEntry);
    await appendBiographyForBuildId(buildId, record.biographyText);
  }

function renderTerrainLegend() {
  dom.battleModeInfo.innerHTML = Object.values(TERRAIN_TYPES).map((terrain) => `
    <div class="terrain-item">
      <span class="terrain-color" style="background:${terrain.color}"></span>
      <span>${terrain.name} | 移动 ${terrain.moveCost} | 物攻 ${signedPct(terrain.physMod)} | 法攻 ${signedPct(terrain.magicMod)}</span>
    </div>
  `).join("");
}

function renderTournamentRewardOptions() {
  renderTournamentPrizeSummary();
}

function renderTournamentPrizeSummary() {
  const championSpec = state.tournamentRewardSelection.champion;
  const runnerUpSpec = state.tournamentRewardSelection.runnerUp;
  const lockedRewards = state.tournament?.rewards || state.ranking?.rewards || null;
  if (lockedRewards) {
    const champion = lockedRewards.championSpec;
    const runnerUp = lockedRewards.runnerUpSpec;
    state.tournamentPrizeSummaryHtml = `
      <strong>本届奖池已锁定：</strong>
      冠军 <span style="color:${gradeColor(champion.grade)}">${champion.grade}</span> ${escapeHtml(EQUIPMENT_SLOT_LABELS[champion.slot] || champion.slot)}；
      亚军 <span style="color:${gradeColor(runnerUp.grade)}">${runnerUp.grade}</span> ${escapeHtml(EQUIPMENT_SLOT_LABELS[runnerUp.slot] || runnerUp.slot)}
    `;
    return;
  }
  state.tournamentPrizeSummaryHtml = `待锁定奖池：冠军 <span style="color:${gradeColor(championSpec.grade)}">${championSpec.grade}</span> ${escapeHtml(EQUIPMENT_SLOT_LABELS[championSpec.slot] || championSpec.slot)}；亚军 <span style="color:${gradeColor(runnerUpSpec.grade)}">${runnerUpSpec.grade}</span> ${escapeHtml(EQUIPMENT_SLOT_LABELS[runnerUpSpec.slot] || runnerUpSpec.slot)}`;
}

function renderTournamentConfigPanel() {
  const grades = ["D", "C", "B", "A", "S", "SS", "SSS"];
  const slots = ["weapon", "armor", "accessory"];
  const disabled = (state.tournament || state.ranking) ? "disabled" : "";
  const gradeOptions = (selected) => grades.map((grade) => `<option value="${grade}" ${grade === selected ? "selected" : ""}>${grade}</option>`).join("");
  const slotOptions = (selected) => slots.map((slot) => `<option value="${slot}" ${slot === selected ? "selected" : ""}>${escapeHtml(EQUIPMENT_SLOT_LABELS[slot] || slot)}</option>`).join("");
  return `
    <div class="tournament-config">
      <label>冠军潜力<select data-tournament-role="champion" data-tournament-field="grade" ${disabled}>${gradeOptions(state.tournamentRewardSelection.champion.grade)}</select></label>
      <label>冠军部位<select data-tournament-role="champion" data-tournament-field="slot" ${disabled}>${slotOptions(state.tournamentRewardSelection.champion.slot)}</select></label>
      <label>亚军潜力<select data-tournament-role="runnerUp" data-tournament-field="grade" ${disabled}>${gradeOptions(state.tournamentRewardSelection.runnerUp.grade)}</select></label>
      <label>亚军部位<select data-tournament-role="runnerUp" data-tournament-field="slot" ${disabled}>${slotOptions(state.tournamentRewardSelection.runnerUp.slot)}</select></label>
      <div class="tournament-prize-summary">${state.tournamentPrizeSummaryHtml || ""}</div>
    </div>
  `;
}

function renderTournamentLastResult(result) {
  return `
    <div class="prelude-card">
      <div class="prelude-event">
        上一场结果：<span style="color:${gradeColor(result.winnerGrade || "E")}">${escapeHtml(result.winnerName)}</span> 胜 <span style="color:${gradeColor(result.loserGrade || "E")}">${escapeHtml(result.loserName)}</span>。
        伤害统计：<span style="color:${gradeColor(result.winnerGrade || "E")}">${escapeHtml(result.winnerName)}</span> ${Math.round(result.winnerDamage)} / <span style="color:${gradeColor(result.loserGrade || "E")}">${escapeHtml(result.loserName)}</span> ${Math.round(result.loserDamage)}。
      </div>
    </div>
  `;
}

  function renderTournamentModeInfo() {
    const compact = state.tournament
      ? renderTournamentBracket({
          tournament: state.tournament,
          getEntryByCode,
          gradeColor,
          escapeHtml
        })
      : `<p class="muted">武道会赛程尚未生成。</p>`;
  return `
    <div class="tournament-bracket">${compact}</div>
    <div class="card-actions">
      <button class="primary-btn" type="button" data-tournament-info-action="open-tree">全屏查看完整对阵树</button>
    </div>
  `;
}

  function renderTournamentShell() {
    dom.battleModeInfoTitle.textContent = "武道会情报";
    dom.battleModeInfo.innerHTML = renderTournamentModeInfo();
  if (state.chronicleOpen) {
    renderChronicleStage();
    renderTournamentPanels();
    renderTournamentTreeOverlay();
    return;
  }
  if (state.tournamentBattle) {
    dom.battlePrelude.hidden = true;
    dom.battleCanvas.hidden = false;
    renderTournamentPanels();
    renderTournamentTreeOverlay();
    return;
    }
  
    dom.battleCanvas.hidden = true;
    dom.battlePrelude.hidden = false;
    dom.battlePrelude.classList.add("tournament-prelude");
  
    if (!state.tournament) {
      dom.battlePrelude.innerHTML = renderTournamentPreludeHtml({
        tournament: null,
        nextMatch: null,
        champion: null,
        runnerUp: null,
        finalWinner: false,
        renderTournamentConfigPanelHtml: renderTournamentConfigPanel(),
        renderTournamentLastResultHtml: "",
        getEntryByCode,
        gradeColor,
        escapeHtml
      });
      dom.battleSummary.innerHTML = `<div class="summary-row"><span>状态</span><strong>等待生成赛程</strong></div>`;
      dom.battleLog.innerHTML = `<div class="battle-log-entry">武道会尚未开始。</div>`;
      clearTournamentCanvas();
      renderTournamentTreeOverlay();
      return;
    }

    renderTournamentPreludeCard();
    renderTournamentPanels();
    clearTournamentCanvas();
    renderTournamentTreeOverlay();
  }

function renderTournamentPreludeCard() {
  const nextMatch = getNextTournamentMatch(state.tournament.rounds);
  const champion = state.tournament.championCode ? getEntryByCode(state.tournament.championCode) : null;
  const runnerUp = state.tournament.runnerUpCode ? getEntryByCode(state.tournament.runnerUpCode) : null;
  const finalWinner = state.fastSimMeta.finalWinnerCode && champion?.base?.code === state.fastSimMeta.finalWinnerCode;
  dom.battlePrelude.innerHTML = renderTournamentPreludeHtml({
    tournament: state.tournament,
    nextMatch,
    champion,
    runnerUp,
    finalWinner,
    renderTournamentConfigPanelHtml: renderTournamentConfigPanel(),
    renderTournamentLastResultHtml: state.tournament?.lastMatchResult ? renderTournamentLastResult(state.tournament.lastMatchResult) : "",
    getEntryByCode,
    gradeColor,
    escapeHtml
  });
}

function handleBattlePreludeChange(event) {
  const explorationField = event.target.dataset?.explorationField;
  if (explorationField === "answer") {
    if (state.exploration) {
      state.exploration.selectedAnswer = event.target.value === "yes";
      state.explorationViewDirty = true;
    }
    return;
  }
  if (explorationField === "digit") {
    if (state.exploration) {
      state.exploration.selectedDigit = Number(event.target.value || 0);
      state.explorationViewDirty = true;
    }
    return;
  }
  const role = event.target.dataset?.tournamentRole;
  const field = event.target.dataset?.tournamentField;
  if (!role || !field) return;
  state.tournamentRewardSelection[role][field] = event.target.value;
  renderTournamentPrizeSummary();
  if (state.activeBattleMode === "tournament" && !state.tournamentBattle) {
    state.tournamentViewDirty = true;
  }
}

function handleBattlePreludeClick(event) {
  const chronicleButton = event.target instanceof Element ? event.target.closest("button[data-chronicle-action]") : null;
  const chronicleAction = chronicleButton?.dataset?.chronicleAction;
  if (chronicleAction) {
    if (chronicleAction === "switch-tab") {
      state.chronicleTab = chronicleButton?.dataset?.chronicleTab || "entries";
      renderChronicleStage();
    } else if (chronicleAction === "select-ranking-history") {
      state.selectedRankingHistoryIndex = Math.max(0, Number(chronicleButton?.dataset?.rankingHistoryIndex || 0));
      state.selectedRankingHistoryBoardTab = "swiss-1";
      renderChronicleStage();
    }
    return;
  }
  const explorationAction = event.target.closest("[data-exploration-action]")?.dataset?.explorationAction;
  if (explorationAction) {
    if (explorationAction === "start-round") {
      advanceExplorationRound().catch(console.error);
    } else if (explorationAction === "confirm-answer") {
      confirmExplorationAnswer().catch(console.error);
    } else if (explorationAction === "claim-rewards") {
      finishExplorationRewards().catch(console.error);
    }
    return;
  }
  const rankingButton = event.target instanceof Element ? event.target.closest("[data-ranking-action]") : null;
  const rankingAction = rankingButton?.dataset?.rankingAction;
  if (rankingAction) {
    if (state.chronicleOpen && state.chronicleTab === "ranking-history" && rankingAction === "switch-board-tab") {
      state.selectedRankingHistoryBoardTab = rankingButton?.dataset?.rankingTab || "swiss-1";
      renderChronicleStage();
      return;
    }
    if (rankingAction === "create") {
      createRanking().catch(console.error);
    } else if (rankingAction === "start-next") {
      startNextRankingMatch().catch(console.error);
    } else if (rankingAction === "complete-round") {
      completeCurrentRankingRound().catch(console.error);
    } else if (rankingAction === "next-round") {
      state.rankingAutoCompleteRound = null;
      state.ranking = generateNextRankingRound(state.ranking);
      openRankingBoard(`swiss-${state.ranking.rounds.length}`);
      markRankingViewDirty();
    } else if (rankingAction === "enter-knockout") {
      state.rankingAutoCompleteRound = null;
      state.ranking = enterRankingKnockout(state.ranking);
      openRankingBoard("knockout");
      markRankingViewDirty();
    } else if (rankingAction === "switch-board-tab") {
      state.ranking.boardTab = event.target.closest("[data-ranking-tab]")?.dataset?.rankingTab || getDefaultRankingBoardTab(state.ranking);
      renderRankingBoardOverlay();
      markRankingViewDirty();
    }
    return;
  }
  const action = event.target.closest("[data-tournament-action]")?.dataset?.tournamentAction;
  if (!action) return;
  if (action === "create") {
    createTournament().catch(console.error);
  } else if (action === "start-next") {
    startNextTournamentMatch().catch(console.error);
  }
}

function handleBattleModeInfoClick(event) {
  const action = event.target.closest("[data-tournament-info-action]")?.dataset?.tournamentInfoAction;
  if (action === "open-tree") {
    state.tournamentTreeOpen = true;
    renderTournamentTreeOverlay();
    return;
  }
  const rankingAction = event.target.closest("[data-ranking-info-action]")?.dataset?.rankingInfoAction;
  if (rankingAction === "open-board") {
    openRankingBoard();
  }
}

function renderTournamentTreeOverlay() {
  if (!dom.tournamentTreeOverlay) return;
  dom.tournamentTreeOverlay.hidden = !state.tournamentTreeOpen;
  if (!state.tournamentTreeOpen) return;
  dom.tournamentTreeContent.innerHTML = state.tournament
    ? renderTournamentFullTree({ tournament: state.tournament, getEntryByCode, gradeColor, escapeHtml })
    : `<p class="muted">当前还没有可展示的武道会对阵树。</p>`;
}
function renderTournamentPanels() {
  if (!state.tournament) return;
  const activeMatch = getNextTournamentMatch(state.tournament.rounds);
  const { summaryHtml, logHtml } = renderTournamentPanelsHtml({
    tournament: state.tournament,
    tournamentBattle: state.tournamentBattle,
    activeMatch,
    formatMatchName,
    formatRewardSpec,
    escapeHtml,
    logLimit: BATTLE_LOG_LIMIT
  });
  dom.battleSummary.innerHTML = summaryHtml;
  dom.battleLog.innerHTML = logHtml;
}

function renderRankingBoardOverlay() {
  if (!dom.rankingBoardOverlay) return;
  dom.rankingBoardOverlay.hidden = !state.rankingBoardOpen;
  if (!state.rankingBoardOpen) return;
  dom.rankingBoardContent.innerHTML = renderRankingBoardContent({
    ranking: state.ranking,
    activeTab: state.ranking.boardTab || getDefaultRankingBoardTab(state.ranking),
    getRankingRoundRows,
    getRankingStandings,
    getRankingKnockoutPreview,
    getEntryByCode,
    gradeColor,
    escapeHtml
  });
}

function openRankingBoard(tab = "") {
  if (!state.ranking) return;
  state.ranking.boardTab = tab || state.ranking.boardTab || getDefaultRankingBoardTab(state.ranking);
  state.rankingBoardOpen = true;
  renderRankingBoardOverlay();
}

function markRankingViewDirty() {
  state.rankingViewDirty = true;
  renderRankingShell();
}

function renderRankingPreludeCard() {
  if (!state.ranking) {
    dom.battlePrelude.innerHTML = `
      <div class="prelude-head">
        <div>
          <h3>江湖排位说明</h3>
          <p class="muted">先进行瑞士轮，每轮按积分、小分排序配对，之后由前12强进入淘汰赛。奖池暂沿用武道会的冠军/亚军配置。</p>
        </div>
      </div>
      ${renderTournamentConfigPanel()}
      <div class="prelude-card"><div class="prelude-event">点击下方按钮，锁定奖池并生成第一轮瑞士轮对阵。</div></div>
      <div class="card-actions">
        <button class="primary-btn" type="button" data-ranking-action="create">锁定奖池并生成第1轮</button>
      </div>
    `;
    return;
  }

  const nextMatch = getNextRankingMatch(state.ranking);
  const champion = state.ranking.championCode ? getEntryByCode(state.ranking.championCode) : null;
  const phaseTitle = state.ranking.currentPhase === "knockout" ? "淘汰赛阶段" : `瑞士轮进行中（共 ${state.ranking.swissRoundCount} 轮）`;
  let actionHtml = "";
  if (!champion && nextMatch) {
    actionHtml = `
      <button class="primary-btn" type="button" data-ranking-action="start-next">开始这一场对决</button>
      ${state.ranking.currentPhase === "swiss" ? '<button class="ghost-btn" type="button" data-ranking-action="complete-round">完成本轮对决</button>' : ""}
    `;
  } else if (canGenerateNextRankingRound(state.ranking)) {
    actionHtml = `<button class="primary-btn" type="button" data-ranking-action="next-round">生成下一轮对阵表</button>`;
  } else if (canEnterRankingKnockout(state.ranking)) {
    actionHtml = `<button class="primary-btn" type="button" data-ranking-action="enter-knockout">进入淘汰赛阶段</button>`;
  }
  dom.battlePrelude.innerHTML = `
    <div class="prelude-head">
      <div>
        <h3>${champion ? "江湖排位结束" : phaseTitle}</h3>
        <p class="muted">${champion ? `冠军是 <span style="color:${gradeColor(champion.build.potential)}">${escapeHtml(champion.displayName)}</span>。` : "每完成一场会实时更新本轮战绩和大小分；整轮结束后手动生成下一轮。"} </p>
      </div>
    </div>
      ${renderTournamentConfigPanel()}
      ${state.ranking.lastMatchResult ? renderRankingLastResult({ result: state.ranking.lastMatchResult, gradeColor, escapeHtml }) : ""}
      <div class="prelude-card"><div class="prelude-event">完整轮次对阵表与淘汰赛签表请从右侧“排位情报”中点击“查看完整对阵页”。</div></div>
      ${champion ? `<div class="prelude-card"><div class="prelude-event">冠军：<span style="color:${gradeColor(champion.build.potential)}">${escapeHtml(champion.displayName)}</span>${state.ranking.runnerUpCode ? (() => {
        const runnerUp = getEntryByCode(state.ranking.runnerUpCode);
        return `；亚军：<span style="color:${gradeColor(runnerUp?.build?.potential || "E")}">${escapeHtml(runnerUp?.displayName || state.ranking.runnerUpCode)}</span>`;
      })() : ""}</div></div>` : renderRankingMatchPreview({ match: nextMatch, getEntryByCode, gradeColor, escapeHtml, roleLabels: ROLE_LABELS })}
    ${actionHtml ? `<div class="card-actions">${actionHtml}</div>` : ""}
  `;
}

function renderRankingShell() {
  dom.battleModeInfoTitle.textContent = "排位情报";
  dom.battleModeInfo.innerHTML = renderRankingModeInfo({
    ranking: state.ranking,
    getRankingStandings,
    formatMatchName,
    escapeHtml
  });
  if (state.chronicleOpen) {
    renderChronicleStage();
    renderRankingPanels();
    renderRankingBoardOverlay();
    return;
  }
  if (state.rankingBattle) {
    dom.battlePrelude.hidden = true;
    dom.battleCanvas.hidden = false;
    renderRankingPanels();
    renderRankingBoardOverlay();
    return;
  }
  dom.battleCanvas.hidden = true;
  dom.battlePrelude.hidden = false;
  dom.battlePrelude.classList.add("tournament-prelude");
  renderRankingPreludeCard();
  renderRankingPanels();
  renderRankingBoardOverlay();
  clearTournamentCanvas();
}

function renderRankingPanels() {
  if (!state.ranking) {
    dom.battleSummary.innerHTML = `<div class="summary-row"><span>状态</span><strong>等待生成赛程</strong></div>`;
    dom.battleLog.innerHTML = `<div class="battle-log-entry">江湖排位尚未开始。</div>`;
    return;
  }
  const nextMatch = getNextRankingMatch(state.ranking);
  const rows = [
    ["状态", state.rankingBattle ? (state.rankingBattle.winner ? `本场结束 · ${state.rankingBattle.winner.name}` : state.rankingBattle.paused ? "对决暂停" : "对决中") : state.ranking.championCode ? "赛事结束" : state.ranking.currentPhase === "knockout" ? "淘汰赛阶段" : "瑞士轮阶段"],
    ["参赛人数", `${state.ranking.participantCodes.length}`],
    ["当前阶段", state.ranking.currentPhase === "knockout" ? "淘汰赛" : `瑞士轮 ${state.ranking.rounds.length}/${state.ranking.swissRoundCount}`],
    ["下一场", nextMatch ? `${formatMatchName(nextMatch.leftCode)} vs ${formatMatchName(nextMatch.rightCode)}` : "等待生成"],
    ["冠军奖励", `${formatRewardSpec(state.ranking.rewards?.championSpec)}`],
    ["亚军奖励", `${formatRewardSpec(state.ranking.rewards?.runnerUpSpec)}`]
  ];
  dom.battleSummary.innerHTML = rows.map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  dom.battleLog.innerHTML = (state.ranking.logs || []).slice(-BATTLE_LOG_LIMIT).reverse().map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`).join("") || `<div class="battle-log-entry">江湖排位尚未开始。</div>`;
}

async function startTournamentFlow() {
  state.activeBattleMode = "tournament";
  state.rankingBoardOpen = false;
  renderRankingBoardOverlay();
  if (dom.cameraSelect && dom.cameraSelect.value !== "angled") {
    dom.cameraSelect.value = "angled";
  }
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.ranking = null;
  state.rankingBattle = null;
  state.tournamentViewDirty = true;
  if (!state.tournament) {
    if (state.tournamentSetupOpen) {
      await createTournament();
      return;
    }
    state.tournamentSetupOpen = true;
    setBattleControlState({
      chaosDisabled: true,
      explorationDisabled: true,
      tournamentLabel: "锁定奖池并生成赛程",
      resetDisabled: false
    });
    renderTournamentPrizeSummary();
    renderTournamentShell();
    return;
  }
  if (state.tournamentBattle) return;
  if (state.tournament.championCode) {
    window.alert("本届武道会已经结束。点击“重置”后可以重新生成赛程。");
    return;
  }
  await startNextTournamentMatch();
}

async function startRankingFlow() {
  state.activeBattleMode = "ranking";
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournament = null;
  state.tournamentBattle = null;
  state.rankingViewDirty = true;
  if (!state.ranking) {
    setBattleControlState({
      chaosDisabled: true,
      tournamentDisabled: true,
      explorationDisabled: true,
      rankingLabel: "锁定奖池并生成第1轮",
      resetDisabled: false
    });
    renderTournamentPrizeSummary();
    renderRankingShell();
    return;
  }
  if (state.rankingBattle) return;
  if (state.ranking.championCode) {
    window.alert("本届江湖排位已经结束。点击“重置”后可以重新生成赛程。");
    return;
  }
  const nextMatch = getNextRankingMatch(state.ranking);
  if (nextMatch) {
    await startNextRankingMatch();
  } else {
    await advanceRankingStageOrFinish({ autoAdvancePhase: true });
  }
}

async function createRanking(options = {}) {
  const entries = await applyTournamentCatchUp(getReadyEntries());
  if (entries.length < 2) {
    window.alert("至少需要 2 个角色才能开启江湖排位。");
    return;
  }
  const championSpec = { ...(options.championSpec || state.tournamentRewardSelection.champion) };
  const runnerUpSpec = { ...(options.runnerUpSpec || state.tournamentRewardSelection.runnerUp) };
  state.ranking = buildRankingState(entries, championSpec, runnerUpSpec, {
    shuffleValues,
    formatMatchName
  });
  state.rankingAutoCompleteRound = null;
  state.ranking.fastSimStageLevel = Math.max(0, Number(options.fastSimStageLevel || 0));
  state.ranking.boardTab = "swiss-1";
  state.ranking.logs.push(`[排位] 本届冠军奖池为 ${championSpec.grade} ${EQUIPMENT_SLOT_LABELS[championSpec.slot]}，亚军奖池为 ${runnerUpSpec.grade} ${EQUIPMENT_SLOT_LABELS[runnerUpSpec.slot]}。`);
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    rankingDisabled: true,
    rankingLabel: "开始这一场对决",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderTournamentPrizeSummary();
  state.rankingViewDirty = true;
  renderRankingShell();
}

function createRankingBattleFromMatch(nextMatch) {
  if (!nextMatch) return false;
  const left = getEntryByCode(nextMatch.leftCode);
  const right = getEntryByCode(nextMatch.rightCode);
  if (!left || !right) {
    window.alert("有参赛角色数据缺失，请刷新后重试。");
    return false;
  }
  state.ranking.currentMatch = nextMatch;
  const duelEntries = [left, right].map((entry, index) => ({
    ...entry,
    build: {
      ...entry.build,
      faction: {
        ...entry.build.faction,
        key: `ranking-${nextMatch.phase}-${nextMatch.roundIndex}-${nextMatch.matchIndex}-${index}`,
        name: index === 0 ? `红角·${entry.build.faction.name}` : `蓝角·${entry.build.faction.name}`
      }
    }
  }));
  state.rankingBattle = createBattleRuntime({
    entries: duelEntries,
    skills: state.skills,
    equipment: state.equipment,
    statuses: state.statuses,
    factionWins: state.winSummary?.byFaction || {},
    speed: Number(dom.speedSelect.value),
    cameraMode: dom.cameraSelect.value,
    arenaMode: "tournament",
    arenaRadius: 4,
    competitionType: "ranking"
  });
  state.ranking.logs.push(`[对决] ${left.displayName} vs ${right.displayName} 即将开始。`);
  setBattleSurfaceState({ showPrelude: false, showCanvas: true });
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    rankingDisabled: true,
    explorationDisabled: true,
    pauseDisabled: false,
    resetDisabled: false
  });
  state.rankingViewDirty = true;
  return true;
}

async function advanceRankingStageOrFinish(options = {}) {
  if (!state.ranking) return "none";
  const { openBoard = true, autoAdvancePhase = false } = options;
  if (canGenerateNextRankingRound(state.ranking)) {
    if (autoAdvancePhase) {
      state.ranking = generateNextRankingRound(state.ranking);
      if (openBoard) {
        openRankingBoard(`swiss-${state.ranking.rounds.length}`);
      } else {
        markRankingViewDirty();
      }
      return "next-round";
    }
    state.rankingViewDirty = true;
    renderRankingShell();
    return "pending-next-round";
  }
  if (canEnterRankingKnockout(state.ranking)) {
    if (autoAdvancePhase) {
      state.ranking = enterRankingKnockout(state.ranking);
      if (openBoard) {
        openRankingBoard("knockout");
      } else {
        markRankingViewDirty();
      }
      return "knockout";
    }
    state.rankingViewDirty = true;
    renderRankingShell();
    return "pending-knockout";
  }
  if (isRankingFinished(state.ranking)) {
    await finishRanking();
    return "finished";
  }
  state.rankingViewDirty = true;
  renderRankingShell();
  return "idle";
}

async function startNextRankingMatch() {
  if (!state.ranking) return;
  const nextMatch = getNextRankingMatch(state.ranking);
  if (!nextMatch) {
    await advanceRankingStageOrFinish();
    return;
  }
  createRankingBattleFromMatch(nextMatch);
}

async function completeCurrentRankingRound() {
  if (!state.ranking || state.rankingBattle) return;
  const nextMatch = getNextRankingMatch(state.ranking);
  if (!nextMatch || nextMatch.phase !== "swiss") return;
  state.rankingAutoCompleteRound = {
    phase: nextMatch.phase,
    roundNumber: nextMatch.roundNumber
  };
  createRankingBattleFromMatch(nextMatch);
}

function toggleRankingBattle() {
  if (!state.rankingBattle) return;
  state.rankingBattle.paused = !state.rankingBattle.paused;
  dom.pauseBattleBtn.textContent = state.rankingBattle.paused ? "继续" : "暂停";
}

function resetRanking() {
  state.ranking = null;
  state.rankingBattle = null;
  state.rankingAutoCompleteRound = null;
  state.rankingBoardOpen = false;
  state.activeBattleMode = "chaos";
  resetChronicleViewState();
  setBattleControlState();
  setBattleSurfaceState({ showPrelude: true, showCanvas: false });
  resetBattlePanels();
  renderBattleModeInfoPanel();
  renderRankingBoardOverlay();
  clearBattleCanvas();
  state.rankingViewDirty = true;
}

function updateRankingBattle(dt) {
  if (!state.rankingBattle) return;
  updateBattleState(state.rankingBattle, dt);
  if (state.rankingBattle.winner && !state.rankingBattle.rewardsApplied) {
    state.rankingBattle.rewardsApplied = true;
    applyRankingBattleRewards().catch(console.error);
  }
}

function getResolvedBattleWinnerEntity(battle) {
  if (!battle?.entities?.length) return null;
  const winnerId = battle.winner?.entityId || battle.winner?.key || "";
  if (winnerId) {
    const matched = battle.entities.find((entity) => entity.id === winnerId || entity.base?.code === winnerId);
    if (matched) return matched;
  }
  return battle.entities.find((entity) => entity.alive) || battle.entities[0] || null;
}

async function applyRankingBattleRewards() {
  state.rewardProcessing = true;
  try {
    if (!state.rankingBattle || !state.ranking) return;
    const winnerEntity = getResolvedBattleWinnerEntity(state.rankingBattle);
    const loserEntity = state.rankingBattle.entities.find((entity) => entity.id !== winnerEntity.id) || null;
    for (const entity of state.rankingBattle.entities) {
      const progress = normalizeProgressRecord(entity.progress, entity.progress.buildId);
      const previousLevel = progress.level;
      progress.totalBattles += 1;
      if (winnerEntity && entity.id === winnerEntity.id) progress.wins += 1;
      progress.kills += entity.kills || 0;
      progress.assists += entity.assists || 0;
      progress.deaths += entity.deaths || 0;
      grantExp(progress, Math.max(0, Math.round(entity.pendingExp)));
      await state.storage.putProgress(progress);
      await recordProgressMilestones(progress.buildId, previousLevel, progress.level, createChronicleSubject(entity));
    }
    const winnerCode = winnerEntity?.base?.code;
    if (winnerCode) {
      recordRankingBattleWinner(state.ranking, state.ranking.currentMatch, winnerCode);
      state.ranking.lastMatchResult = {
        winnerName: winnerEntity.name,
        loserName: loserEntity?.name || "对手",
        winnerGrade: winnerEntity?.build?.potential || "E",
        loserGrade: loserEntity?.build?.potential || "E",
        winnerDamage: winnerEntity.damageDone || 0,
        loserDamage: loserEntity?.damageDone || 0
      };
      state.ranking.logs.push(`[排位] ${winnerEntity.name} 击败 ${loserEntity?.name || "对手"}。`);
    }
    await refreshAll();
    state.rankingBattle = null;
    const autoRound = state.rankingAutoCompleteRound;
    const nextPendingMatch = state.ranking ? getNextRankingMatch(state.ranking) : null;
    const shouldContinueAutoRound =
      !!autoRound &&
      !!nextPendingMatch &&
      nextPendingMatch.phase === autoRound.phase &&
      nextPendingMatch.roundNumber === autoRound.roundNumber;
    if (!shouldContinueAutoRound) {
      state.rankingAutoCompleteRound = null;
    }
    setBattleControlState({
      chaosDisabled: true,
      tournamentDisabled: true,
      explorationDisabled: true,
      rankingDisabled: true,
      rankingLabel: "开始下一场",
      pauseDisabled: true,
      resetDisabled: false
    });
    if (isRankingFinished(state.ranking)) {
      await finishRanking();
    } else if (shouldContinueAutoRound) {
      createRankingBattleFromMatch(nextPendingMatch);
    } else {
      await advanceRankingStageOrFinish();
    }
  } finally {
    state.rewardProcessing = false;
  }
}

async function finishRanking() {
  if (!state.ranking) return;
  state.rankingAutoCompleteRound = null;
  finalizeRanking(state.ranking);
  const rankingIndex = (state.chronicle?.rankingCount || 0) + 1;
  const finishedFastSimStage = Math.max(0, Number(state.ranking.fastSimStageLevel || 0));
  const championCode = state.ranking.championCode;
  const runnerUpCode = state.ranking.runnerUpCode;
  const championReward = championCode
    ? await awardTournamentPrize(championCode, state.ranking.rewards?.championSpec, "排位冠军")
    : null;
  const runnerUpReward = runnerUpCode
    ? await awardTournamentPrize(runnerUpCode, state.ranking.rewards?.runnerUpSpec, "排位亚军")
    : null;
  const placementMap = getRankingFinalPlacementMap(state.ranking);
  // 世界地图声望：排位赛
  if (state.worldState) {
    const rankingFactionRanks = buildFactionRankFromCodes(
      state.ranking.participantCodes || [],
      placementMap
    );
    state.worldState = applyRankedEventPrestige(state.worldState, "ranking", rankingFactionRanks);
    await state.storage.putWorldState(state.worldState);
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
  }
  const topFourCodes = Object.entries(placementMap)
    .filter(([, placement]) => placement === 3 || placement === 4)
    .map(([code]) => code);
  await applyRankingPlacementHonors(championCode, runnerUpCode, topFourCodes);
  await refreshAll();
  const rankingSnapshot = createRankingHistorySnapshot({
    ranking: state.ranking,
    index: rankingIndex,
    getEntryByCode,
    getRankingRoundRows,
    getRankingStandings,
    getRankingKnockoutPreview
  });
  state.rankingHistory = [...state.rankingHistory, rankingSnapshot];
  state.selectedRankingHistoryIndex = Math.max(0, state.rankingHistory.length - 1);
  state.selectedRankingHistoryBoardTab = "swiss-final";
  await state.storage.saveMeta(META_KEYS.RANKING_HISTORY, state.rankingHistory);
  for (const code of state.ranking.participantCodes || []) {
    const entry = getEntryByCode(code);
    if (!entry) continue;
    const placementValue = placementMap[code];
    const placement = typeof placementValue === "number" ? `第${placementValue}名` : "未入榜";
    const rewardName = code === championCode
      ? championReward || { name: "无奖励", grade: "" }
      : code === runnerUpCode
        ? runnerUpReward || { name: "无奖励", grade: "" }
        : { name: "无奖励", grade: "" };
    await appendBiographyForBuildId(entry.progress.buildId, buildRankingBiographyEntry(rankingIndex, placement, rewardName));
  }
  const topEightEntries = Object.entries(placementMap)
    .filter(([, placement]) => Number.isFinite(Number(placement)) && Number(placement) <= 8)
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .map(([code]) => {
      const entry = getEntryByCode(code);
      if (!entry) return null;
      return {
        name: entry.displayName,
        grade: entry.build?.potential,
        faction: entry.build?.faction
      };
    })
    .filter(Boolean);
  await appendChronicleEntry(buildRankingChronicleEntry(rankingIndex, topEightEntries));
  await saveChronicleState({
    ...state.chronicle,
    rankingCount: rankingIndex
  });
  state.ranking.logs.push(`[完赛] ${formatMatchName(championCode)} 获得江湖排位冠军。`);
  if (finishedFastSimStage > 0) {
    const completedStages = [...new Set([...(state.fastSimMeta.completedStages || []), `tournament:${finishedFastSimStage}`])];
    let nextMeta = {
      ...state.fastSimMeta,
      completedStages
    };
    nextMeta = advanceFastSimBracketMeta(nextMeta);
    if (finishedFastSimStage >= 50 && championCode) {
      nextMeta.finalWinnerCode = championCode;
      if (state.fastSim.mode !== "endless") {
        state.fastSim.enabled = false;
        syncFastSimButton();
      }
    }
    await saveFastSimMeta(nextMeta);
  } else if (state.fastSim.enabled && state.fastSimMeta.finalWinnerCode) {
    await saveFastSimMeta(advanceEndlessFastSimMeta(advanceFastSimBracketMeta(state.fastSimMeta)));
  }
  await refreshAll();
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    rankingDisabled: true,
    rankingLabel: "江湖排位已结束",
    pauseDisabled: true,
    resetDisabled: false
  });
  state.rankingViewDirty = true;
  renderRankingShell();
}

async function createTournament() {
  state.tournamentSetupOpen = true;
  const entries = await applyTournamentCatchUp(getReadyEntries());
  if (entries.length < 2) {
    window.alert("至少需要 2 个角色才能开启武道会。");
    return;
  }

  const championSpec = { ...state.tournamentRewardSelection.champion };
  const runnerUpSpec = { ...state.tournamentRewardSelection.runnerUp };
  state.tournament = buildTournamentState(entries, championSpec, runnerUpSpec, {
    shuffleValues,
    formatMatchName
  });
  state.tournament.logs.push(`[赛程] 本届冠军奖池为 ${championSpec.grade} ${EQUIPMENT_SLOT_LABELS[championSpec.slot]}，亚军奖池为 ${runnerUpSpec.grade} ${EQUIPMENT_SLOT_LABELS[runnerUpSpec.slot]}。`);
  setBattleControlState({
    chaosDisabled: true,
    explorationDisabled: true,
    tournamentLabel: "开始这一场对决",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderTournamentPrizeSummary();
  state.tournamentViewDirty = true;
  renderTournamentShell();
}

async function startNextTournamentMatch() {
  if (!state.tournament) return;
  const nextMatch = getNextTournamentMatch(state.tournament.rounds);
  if (!nextMatch) {
    await finishTournament();
    return;
  }
  const left = getEntryByCode(nextMatch.leftCode);
  const right = getEntryByCode(nextMatch.rightCode);
  if (!left || !right) {
    window.alert("有参赛角色数据缺失，请刷新后重试。");
    return;
  }

  state.tournament.currentRoundIndex = nextMatch.roundIndex;
  state.tournament.currentMatchIndex = nextMatch.matchIndex;
  state.tournament.currentMatch = nextMatch;
  const duelEntries = [left, right].map((entry, index) => ({
    ...entry,
    build: {
      ...entry.build,
      faction: {
        ...entry.build.faction,
        key: `tournament-${nextMatch.roundIndex}-${nextMatch.matchIndex}-${index}`,
        name: index === 0 ? `红角·${entry.build.faction.name}` : `蓝角·${entry.build.faction.name}`
      }
    }
  }));

  state.tournamentBattle = createBattleRuntime({
    entries: duelEntries,
    skills: state.skills,
    equipment: state.equipment,
    statuses: state.statuses,
    factionWins: state.winSummary?.byFaction || {},
    speed: Number(dom.speedSelect.value),
    cameraMode: "angled",
    arenaMode: "tournament",
    arenaRadius: 4,
    competitionType: "tournament"
  });
  state.tournament.logs.push(`[对决] ${left.displayName} vs ${right.displayName} 即将开始。`);
  setBattleSurfaceState({ showPrelude: false, showCanvas: true });
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    pauseDisabled: false,
    resetDisabled: false
  });
  state.tournamentViewDirty = true;
}

function togglePauseTournament() {
  if (!state.tournamentBattle) return;
  state.tournamentBattle.paused = !state.tournamentBattle.paused;
  dom.pauseBattleBtn.textContent = state.tournamentBattle.paused ? "继续" : "暂停";
}

function resetTournament() {
  state.tournament = null;
  state.tournamentBattle = null;
  state.tournamentSetupOpen = false;
  state.tournamentTreeOpen = false;
  state.activeBattleMode = "chaos";
  resetChronicleViewState();
  setBattleControlState();
  setBattleSurfaceState({ showPrelude: true, showCanvas: false });
  resetBattlePanels();
  renderBattleModeInfoPanel();
  renderTournamentPrizeSummary();
  clearBattleCanvas();
  state.tournamentViewDirty = true;
  renderTournamentTreeOverlay();
}

function updateTournamentBattle(dt) {
  if (!state.tournamentBattle) return;
  updateBattleState(state.tournamentBattle, dt);
  if (state.tournamentBattle.winner && !state.tournamentBattle.rewardsApplied) {
    state.tournamentBattle.rewardsApplied = true;
    applyTournamentBattleRewards().catch(console.error);
  }
}

async function applyTournamentBattleRewards() {
  state.rewardProcessing = true;
  try {
  if (!state.tournamentBattle || !state.tournament) return;
  const winnerEntity = getResolvedBattleWinnerEntity(state.tournamentBattle);
  const loserEntity = state.tournamentBattle.entities.find((entity) => entity.id !== winnerEntity.id) || null;

  for (const entity of state.tournamentBattle.entities) {
    const progress = normalizeProgressRecord(entity.progress, entity.progress.buildId);
    const previousLevel = progress.level;
    progress.totalBattles += 1;
    if (winnerEntity && entity.id === winnerEntity.id) progress.wins += 1;
    progress.kills += entity.kills || 0;
    progress.assists += entity.assists || 0;
    progress.deaths += entity.deaths || 0;
    grantExp(progress, Math.max(0, Math.round(entity.pendingExp)));
    await state.storage.putProgress(progress);
    await recordProgressMilestones(progress.buildId, previousLevel, progress.level, createChronicleSubject(entity));
  }

  const winnerCode = winnerEntity?.base?.code;
  if (winnerCode) {
    advanceTournamentWinner(state.tournament.rounds, state.tournament.currentRoundIndex, state.tournament.currentMatchIndex, winnerCode);
    state.tournament.lastMatchResult = {
      winnerName: winnerEntity.name,
      loserName: loserEntity?.name || "对手",
      winnerGrade: winnerEntity?.build?.potential || "E",
      loserGrade: loserEntity?.build?.potential || "E",
      winnerDamage: winnerEntity.damageDone || 0,
      loserDamage: loserEntity?.damageDone || 0
    };
    state.tournament.logs.push(`[晋级] ${winnerEntity.name} 击败 ${loserEntity?.name || "对手"}，晋级下一轮。`);
  }

  await refreshAll();
  syncTournamentParticipants();

  state.tournamentBattle = null;
  setBattleControlState({
    chaosDisabled: true,
    explorationDisabled: true,
    tournamentLabel: "开始下一场",
    pauseDisabled: true,
    resetDisabled: false
  });

  if (!getNextTournamentMatch(state.tournament.rounds)) {
    await finishTournament();
  }
  state.tournamentViewDirty = true;
  renderTournamentShell();
  } finally {
    state.rewardProcessing = false;
  }
}

async function finishTournament() {
  if (!state.tournament) return;
  const finishedFastSimStage = Number(state.tournament.fastSimStageLevel || 0);
  const tournamentIndex = (state.chronicle?.tournamentCount || 0) + 1;
  const final = state.tournament.rounds[state.tournament.rounds.length - 1]?.matches[0] || null;
  const championCode = final?.winnerCode || null;
  const runnerUpCode = championCode
    ? [final.leftCode, final.rightCode].find((code) => code && code !== championCode) || null
    : null;

  state.tournament.championCode = championCode;
  state.tournament.runnerUpCode = runnerUpCode;
  const championReward = championCode
    ? await awardTournamentPrize(championCode, state.tournament.rewards?.championSpec, "冠军")
    : null;
  const runnerUpReward = runnerUpCode
    ? await awardTournamentPrize(runnerUpCode, state.tournament.rewards?.runnerUpSpec, "亚军")
    : null;
  const topFourCodes = getTournamentTopFourCodes(state.tournament, championCode, runnerUpCode);
  await applyTournamentPlacementHonors(championCode, runnerUpCode, topFourCodes);
  await refreshAll();
  syncTournamentParticipants();
  const placementMap = buildTournamentPlacementMap(state.tournament);
  // 世界地图声望：武道会
  if (state.worldState) {
    const tourneyFactionRanks = buildFactionRankFromCodes(
      state.tournament.participantCodes || [],
      placementMap
    );
    state.worldState = applyRankedEventPrestige(state.worldState, "tournament", tourneyFactionRanks);
    await state.storage.putWorldState(state.worldState);
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState);
  }
  for (const code of state.tournament.participantCodes || []) {
    const entry = getEntryByCode(code);
    if (!entry) continue;
    const placement = placementMap[code] || "未入榜";
    const rewardName = code === championCode
        ? championReward || { name: "无奖励", grade: "" }
        : code === runnerUpCode
          ? runnerUpReward || { name: "无奖励", grade: "" }
          : { name: "无奖励", grade: "" };
      await appendBiographyForBuildId(entry.progress.buildId, buildTournamentBiographyEntry(tournamentIndex, placement, rewardName));
  }
  const championEntry = championCode ? getEntryByCode(championCode) : null;
  const runnerUpEntry = runnerUpCode ? getEntryByCode(runnerUpCode) : null;
  await appendChronicleEntry(buildTournamentChronicleEntry(
      tournamentIndex,
      championEntry,
      championReward,
      runnerUpEntry,
      runnerUpReward,
      championCode,
      runnerUpCode
    ));
  await saveChronicleState({
    ...state.chronicle,
    tournamentCount: tournamentIndex
  });
  state.tournament.logs.push(`[完赛] ${formatMatchName(championCode)} 获得天下第一武道会冠军。`);
  if (finishedFastSimStage > 0) {
    const completedStages = [...new Set([...(state.fastSimMeta.completedStages || []), `tournament:${finishedFastSimStage}`])];
    let nextMeta = {
      ...state.fastSimMeta,
      completedStages
    };
    nextMeta = advanceFastSimBracketMeta(nextMeta);
    if (finishedFastSimStage >= 50 && championCode) {
      nextMeta.finalWinnerCode = championCode;
      if (state.fastSim.mode !== "endless") {
        state.fastSim.enabled = false;
        syncFastSimButton();
      }
    }
    await saveFastSimMeta(nextMeta);
  } else if (state.fastSim.enabled && state.fastSimMeta.finalWinnerCode) {
    await saveFastSimMeta(advanceEndlessFastSimMeta(advanceFastSimBracketMeta(state.fastSimMeta)));
  }
  await refreshAll();
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    tournamentLabel: "武道会已结束",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderTournamentPrizeSummary();
  state.tournamentViewDirty = true;
  renderTournamentShell();
}

async function awardTournamentPrize(code, rewardSpec, title) {
  const activeLogs = state.tournament?.logs || state.ranking?.logs || [];
  const entry = getEntryByCode(code);
  const item = entry && rewardSpec ? rollTournamentReward(entry.build.role, rewardSpec.grade, rewardSpec.slot) : null;
  if (!entry || !item) {
    activeLogs.push(`[奖励] ${title} ${entry?.displayName || code} 对应奖池暂无可用装备。`);
    return null;
  }
  const nextBuild = applyEquipmentDrop(entry.build, item.id, state.equipment);
  await state.storage.putBuild(nextBuild);
  if (item.grade === "SSS") {
    await recordLegendaryEquipment(entry.progress.buildId, createChronicleSubject(entry), item);
  }
  activeLogs.push(`[奖励] ${title} ${entry.displayName} 从 ${rewardSpec.grade} ${EQUIPMENT_SLOT_LABELS[rewardSpec.slot]} 奖池中抽到 ${item.name}。`);
  return item;
}

function getTournamentTopFourCodes(tournament, championCode, runnerUpCode) {
  const rounds = tournament?.rounds || [];
  if (rounds.length < 2) return [];
  const semifinalRound = rounds[rounds.length - 2];
  const codes = new Set();
  for (const match of semifinalRound?.matches || []) {
    if (!match.winnerCode || !match.leftCode || !match.rightCode) continue;
    const loserCode = match.leftCode === match.winnerCode ? match.rightCode : match.leftCode;
    if (loserCode && loserCode !== championCode && loserCode !== runnerUpCode) {
      codes.add(loserCode);
    }
  }
  return [...codes];
}

async function applyTournamentPlacementHonors(championCode, runnerUpCode, topFourCodes = []) {
  const activeLogs = state.tournament?.logs || state.ranking?.logs || [];
  const hall = structuredClone(state.tournamentMeta || { byFaction: {}, byCap: {} });
  if (championCode) {
    const championEntry = getEntryByCode(championCode);
    if (championEntry) {
      const progress = normalizeProgressRecord(championEntry.progress, championEntry.progress.buildId);
      progress.tournamentChampionCount += 1;
      await state.storage.putProgress(progress);
      hall.byFaction[championEntry.build.faction.key] = (hall.byFaction[championEntry.build.faction.key] || 0) + 1;
      hall.byCap[championCode] = (hall.byCap[championCode] || 0) + 1;
      hall.totalCount = (hall.totalCount || 0) + 1;
      activeLogs.push(`[荣耀] ${championEntry.displayName} 再添 1 次武道会冠军，${championEntry.build.faction.name} 全派获得 1 层“江湖大派”。`);
    }
  }

  if (runnerUpCode) {
    const runnerUpEntry = getEntryByCode(runnerUpCode);
    if (runnerUpEntry) {
      const progress = normalizeProgressRecord(runnerUpEntry.progress, runnerUpEntry.progress.buildId);
      progress.tournamentRunnerUpCount += 1;
      await state.storage.putProgress(progress);
      activeLogs.push(`[荣耀] ${runnerUpEntry.displayName} 获得 1 层“稍逊风骚”。`);
    }
  }

  for (const code of topFourCodes) {
    const entry = getEntryByCode(code);
    if (!entry) continue;
    const progress = normalizeProgressRecord(entry.progress, entry.progress.buildId);
    progress.tournamentTopFourCount += 1;
    await state.storage.putProgress(progress);
    activeLogs.push(`[荣耀] ${entry.displayName} 获得 1 层“后起之秀”。`);
  }

  state.tournamentMeta = hall;
  await state.storage.saveMeta(META_KEYS.TOURNAMENT_HALL, hall);
}

async function applyRankingPlacementHonors(championCode, runnerUpCode, topFourCodes = []) {
  const activeLogs = state.ranking?.logs || [];
  const hall = structuredClone(state.rankingMeta || { byFaction: {}, byCap: {} });
  if (championCode) {
    const championEntry = getEntryByCode(championCode);
    if (championEntry) {
      const progress = normalizeProgressRecord(championEntry.progress, championEntry.progress.buildId);
      progress.tournamentChampionCount += 1;
      await state.storage.putProgress(progress);
      hall.byFaction[championEntry.build.faction.key] = (hall.byFaction[championEntry.build.faction.key] || 0) + 1;
      hall.byCap[championCode] = (hall.byCap[championCode] || 0) + 1;
      hall.totalCount = (hall.totalCount || 0) + 1;
      activeLogs.push(`[荣耀] ${championEntry.displayName} 再添 1 次排位赛冠军，${championEntry.build.faction.name} 全派获得 1 层“江湖大派”。`);
    }
  }

  if (runnerUpCode) {
    const runnerUpEntry = getEntryByCode(runnerUpCode);
    if (runnerUpEntry) {
      const progress = normalizeProgressRecord(runnerUpEntry.progress, runnerUpEntry.progress.buildId);
      progress.tournamentRunnerUpCount += 1;
      await state.storage.putProgress(progress);
      activeLogs.push(`[荣耀] ${runnerUpEntry.displayName} 获得 1 层“稍逊风骚”。`);
    }
  }

  for (const code of topFourCodes) {
    const entry = getEntryByCode(code);
    if (!entry) continue;
    const progress = normalizeProgressRecord(entry.progress, entry.progress.buildId);
    progress.tournamentTopFourCount += 1;
    await state.storage.putProgress(progress);
    activeLogs.push(`[荣耀] ${entry.displayName} 获得 1 层“后起之秀”。`);
  }

  state.rankingMeta = hall;
  await state.storage.saveMeta(META_KEYS.RANKING_HALL, hall);
}

function syncTournamentParticipants() {
  if (!state.tournament) return;
  const liveCodes = new Set(getEntries().map((entry) => entry.base.code));
  state.tournament.participantCodes = state.tournament.participantCodes.filter((code) => liveCodes.has(code));
}

async function startExplorationFlow(options = {}) {
  const { preserveFastSim = false } = options;
  if (!preserveFastSim) {
    state.fastSim.enabled = false;
    syncFastSimButton();
  }
  state.activeBattleMode = "exploration";
  state.rankingBoardOpen = false;
  renderRankingBoardOverlay();
  state.pendingBattle = null;
  state.pendingBattleRendered = false;
  state.battle = null;
  state.tournament = null;
  state.tournamentBattle = null;
  state.ranking = null;
  state.rankingBattle = null;
  state.tournamentSetupOpen = false;
  state.tournamentTreeOpen = false;
  resetChronicleViewState();
  const entries = getReadyEntries();
  if (entries.length < 1) {
    window.alert("至少需要 1 个有生成属性的角色才能进入秘境探索。");
    return;
  }
  state.exploration = buildExplorationState(entries);
  state.explorationViewDirty = true;
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    explorationLabel: "秘境探索进行中",
    pauseDisabled: true,
    resetDisabled: false
  });
  renderExplorationShell();
}

function resetExploration() {
  state.exploration = null;
  state.activeBattleMode = "chaos";
  setBattleControlState();
  setBattleSurfaceState({ showPrelude: false, showCanvas: true });
  resetBattlePanels();
  renderBattleModeInfoPanel();
  clearBattleCanvas();
}

function renderExplorationShell() {
  dom.battleModeInfoTitle.textContent = "秘境规则";
  dom.battleModeInfo.innerHTML = `
    <div class="terrain-item">所有角色初始位于 E 级奖励区。</div>
    <div class="terrain-item">每轮根据题库随机抽问，回答正确者晋升一档，失败者留在原档。</div>
    <div class="terrain-item">SS 晋升 SSS 的最后一轮改为猜数字，命中者直升 SSS。</div>
    <div class="terrain-item">秘境结束后，每人都会按最终区域领取一份奖励。</div>
  `;
  setBattleSurfaceState({ showPrelude: true, showCanvas: false, preludeHtml: renderExplorationPrelude() });
  renderExplorationPanels();
}

function renderExplorationPrelude() {
  if (!state.exploration) return `<div class="prelude-card"><div class="prelude-event">点击“开始秘境探索”后，这里会展示奖励分层和当前考验。</div></div>`;
  const visibleGrades = getVisibleExplorationGrades(state.exploration);
  const tierEntries = visibleGrades.reduce((map, grade) => {
    map[grade] = getExplorationCodesByTier(state.exploration, grade)
      .map((code) => getEntryByCode(code))
      .filter(Boolean);
    return map;
  }, {});
  return `
      <div class="chronicle-stage">
        <div class="prelude-head">
          <div>
            <h3>秘境探索</h3>
          <p class="muted">所有角色从 E 级奖励区出发，逐轮闯关，最终按停留层级领取奖励。</p>
        </div>
      </div>
      ${renderExplorationPromptCard()}
      <div class="exploration-tier-scroll">
          <div class="exploration-tier-stack">
            ${visibleGrades.map((grade, index) => `
            ${renderExplorationTierSectionHtml(
              grade,
              tierEntries[grade] || [],
              state.exploration.rewardMap || {},
              gradeColor,
              escapeHtml
            )}
            ${index < visibleGrades.length - 1 ? renderExplorationTierDividerHtml(grade, escapeHtml) : ""}
            `).join("")}
          </div>
      </div>
    </div>
  `;
}

function renderExplorationPromptCard() {
  const exploration = state.exploration;
  if (!exploration) return "";
  if (exploration.finished) {
    return `
      <div class="prelude-card">
        <div class="prelude-event">本次秘境探索已经结束。点击下方按钮发放所有角色的最终奖励。</div>
        <div class="card-actions">
          <button class="primary-btn" type="button" data-exploration-action="claim-rewards" ${exploration.rewardsGranted ? "disabled" : ""}>${exploration.rewardsGranted ? "奖励已发放" : "领取秘境奖励"}</button>
        </div>
      </div>
    `;
  }
  if (!exploration.currentQuestion) {
    return `
      <div class="prelude-card">
        <div class="prelude-event">当前正在挑战 ${exploration.currentTier} 级奖励区。点击下方按钮，进入${getExplorationNextTier(exploration.currentTier)}级考验。</div>
        <div class="card-actions">
          <button class="primary-btn" type="button" data-exploration-action="start-round">进入下一轮考验</button>
        </div>
      </div>
    `;
  }
  if (exploration.currentQuestion.type === "digit") {
    return `
      <div class="prelude-card">
        <div class="prelude-event">SS 升 SSS 的终极考验：选择一个 0-9 的数字，命中者晋升 SSS，未命中者留在 SS。</div>
        <div class="card-actions">
          <label>数字
            <select data-exploration-field="digit">
              ${Array.from({ length: 10 }, (_, value) => `<option value="${value}" ${Number(exploration.selectedDigit) === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
          </label>
          <button class="primary-btn" type="button" data-exploration-action="confirm-answer">确认数字</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="prelude-card">
      <div class="prelude-event">${escapeHtml(exploration.currentQuestion.text)}</div>
      <div class="card-actions">
        <label>你的回答
          <select data-exploration-field="answer">
            <option value="yes" ${exploration.selectedAnswer ? "selected" : ""}>是</option>
            <option value="no" ${!exploration.selectedAnswer ? "selected" : ""}>否</option>
          </select>
        </label>
        <button class="primary-btn" type="button" data-exploration-action="confirm-answer">确认答案</button>
      </div>
    </div>
  `;
}

function renderExplorationPanels() {
  if (!state.exploration) return;
  const visibleGrades = EXPLORATION_GRADE_FLOW;
  const tierEntries = visibleGrades.reduce((map, grade) => {
    map[grade] = getExplorationCodesByTier(state.exploration, grade).map((code) => getEntryByCode(code)).filter(Boolean);
    return map;
  }, {});
    const { summaryHtml, logHtml } = renderExplorationPanelsHtml({
      exploration: state.exploration,
      visibleGrades,
      tierEntries,
      gradeColor,
      escapeHtml,
      logLimit: BATTLE_LOG_LIMIT
    });
  dom.battleSummary.innerHTML = summaryHtml;
  dom.battleLog.innerHTML = logHtml;
}

async function advanceExplorationRound() {
  if (!state.exploration || state.exploration.finished) return;
  if (state.exploration.currentTier === "SS") {
    state.exploration.currentQuestion = { type: "digit", text: "终极数字考验" };
    state.exploration.selectedDigit = 0;
  } else {
    const availableQuestions = EXPLORATION_QUESTION_BANK.filter(
      (question) => !state.exploration.usedQuestionIds.includes(question.id)
    );
    if (availableQuestions.length === 0) {
      state.exploration.finished = true;
      state.exploration.logs.push("[秘境] 题库已全部用尽，本次探索结束。");
      state.explorationViewDirty = true;
      renderExplorationShell();
      return;
    }
    state.exploration.currentQuestion = shuffleValues(availableQuestions)[0];
    state.exploration.usedQuestionIds.push(state.exploration.currentQuestion.id);
    state.exploration.selectedAnswer = true;
  }
  state.exploration.logs.push(`[考验] ${state.exploration.currentTier} 级考验开启：${state.exploration.currentQuestion.text || "终极数字考验"}`);
  state.explorationViewDirty = true;
  renderExplorationShell();
}

async function confirmExplorationAnswer() {
  if (!state.exploration?.currentQuestion) return;
  if (state.exploration.currentQuestion.type === "digit") {
    resolveExplorationDigitRound();
  } else {
    resolveExplorationQuestionRound();
  }
  state.explorationViewDirty = true;
  renderExplorationShell();
}

function resolveExplorationQuestionRound() {
  const exploration = state.exploration;
  const candidates = getExplorationActiveEntries();
  const nextTier = getExplorationNextTier(exploration.currentTier);
  let promoted = 0;
  for (const entry of candidates) {
    const sheet = getEffectiveSheet(entry.build, entry.progress.level, state.skills, state.equipment, entry.honorContext || getHonorBonusContext(entry.build, entry.progress));
    const matched = Boolean(exploration.currentQuestion.check({ entry, progress: entry.progress, sheet })) === Boolean(exploration.selectedAnswer);
    if (matched && nextTier) {
      exploration.tierByCode[entry.base.code] = nextTier;
      promoted += 1;
    }
  }
  if (nextTier && promoted > 0) {
    exploration.questionLabels[nextTier] = `${exploration.currentQuestion.text}（答案：${exploration.selectedAnswer ? "是" : "否"}）`;
  }
  exploration.logs.push(`[结果] 回答${exploration.selectedAnswer ? "是" : "否"}后，共有 ${promoted} 人晋升到 ${nextTier || exploration.currentTier} 级。`);
  exploration.currentQuestion = null;
  if (!nextTier || promoted === 0) {
    exploration.finished = true;
    return;
  }
  exploration.currentTier = nextTier;
  if (nextTier === "SSS") {
    exploration.finished = true;
  }
}

function resolveExplorationDigitRound() {
  const exploration = state.exploration;
  const candidates = getExplorationActiveEntries();
  let promoted = 0;
  candidates.forEach((entry) => {
    const rolled = Math.floor(Math.random() * 10);
    if (rolled === Number(exploration.selectedDigit || 0)) {
      exploration.tierByCode[entry.base.code] = "SSS";
      promoted += 1;
      exploration.logs.push(`[终局] ${entry.displayName} 抽中数字 ${rolled}，晋升 SSS。`);
    } else {
      exploration.logs.push(`[终局] ${entry.displayName} 抽中数字 ${rolled}，停留在 SS。`);
    }
  });
  if (promoted > 0) {
    exploration.questionLabels.SSS = `终极数字考验（答案：${exploration.selectedDigit}）`;
  }
  exploration.currentQuestion = null;
  exploration.finished = true;
  exploration.logs.push(`[终局] 本轮共有 ${promoted} 人成功晋升 SSS。`);
}

async function finishExplorationRewards() {
  if (!state.exploration || state.exploration.rewardsGranted || state.rewardProcessing) return;
  const exploration = state.exploration;
  state.rewardProcessing = true;
  exploration.rewardsGranted = true;
  try {
    const finishedFastSimStage = Number(exploration.fastSimStageLevel || 0);
    const explorationIndex = (state.chronicle?.explorationCount || 0) + 1;
    const tierNames = { S: [], SS: [], SSS: [] };
    const entriesByTier = new Map();
    for (const code of exploration.participantCodes) {
      const entry = getEntryByCode(code);
      if (!entry) continue;
      const tier = exploration.tierByCode[code] || "E";
      if (tierNames[tier]) tierNames[tier].push(createChronicleSubject(entry));
      if (!entriesByTier.has(tier)) entriesByTier.set(tier, []);
      entriesByTier.get(tier).push(entry);
    }

    const rewardResults = new Map();
    for (const tier of [...EXPLORATION_GRADE_FLOW].reverse()) {
      const tierEntries = entriesByTier.get(tier) || [];
      if (tierEntries.length === 0) continue;
      const tierRewards = await awardExplorationRewardsForTier(tierEntries, tier);
      tierRewards.forEach((reward, code) => {
        rewardResults.set(code, reward);
      });
    }

    for (const code of exploration.participantCodes) {
      const entry = getEntryByCode(code);
      if (!entry) continue;
      const tier = exploration.tierByCode[code] || "E";
      const rewardName = rewardResults.get(code) || "无奖励";
      exploration.rewardMap[code] = rewardName?.name || rewardName;
      await appendBiographyForBuildId(entry.progress.buildId, buildExplorationBiographyEntry(explorationIndex, tier, rewardName));
    }
    await appendChronicleEntry(buildExplorationChronicleEntry(explorationIndex, tierNames));
    await saveChronicleState({
      ...state.chronicle,
      explorationCount: explorationIndex
    });
    exploration.logs.push(`[完赛] 第${explorationIndex}次秘境探索奖励已全部发放。`);
    if (finishedFastSimStage > 0) {
      await saveFastSimMeta({
        ...state.fastSimMeta,
        completedStages: [...new Set([...(state.fastSimMeta.completedStages || []), `exploration:${finishedFastSimStage}`])]
      });
    } else if (state.fastSim.enabled && state.fastSimMeta.finalWinnerCode) {
      await saveFastSimMeta(advanceEndlessFastSimMeta(state.fastSimMeta));
    }
    await refreshAll();
    state.activeBattleMode = "exploration";
    state.explorationViewDirty = true;
    renderExplorationShell();
  } catch (error) {
    exploration.rewardsGranted = false;
    throw error;
  } finally {
    state.rewardProcessing = false;
  }
}

async function awardExplorationRewardsForTier(entries, tier) {
  const rewardMap = new Map();
  if (["S", "SS", "SSS"].includes(tier)) {
    const availableBloodlines = shuffleValues(getAvailableBloodlinesByGrade(tier));
    if (availableBloodlines.length > 0) {
      const shuffledEntries = shuffleValues(entries);
      const eligibleEntries = shuffledEntries.filter((entry) => {
        const progress = normalizeProgressRecord(entry.progress, entry.build.buildId);
        const currentBloodline = getBloodlineById(state.bloodlines, progress.bloodlineId || "");
        return availableBloodlines.some((bloodline) => canUpgradeBloodline(currentBloodline, bloodline));
      });
      const awardedCount = Math.min(eligibleEntries.length, availableBloodlines.length);
      for (let index = 0; index < awardedCount; index += 1) {
        const entry = eligibleEntries[index];
        const bloodline = availableBloodlines[index];
        try {
          const result = await applyBloodlineAssignment(entry.base.code, bloodline.id);
          if (result) {
            rewardMap.set(entry.base.code, {
              name: bloodline.name,
              grade: bloodline.grade || ""
            });
            state.exploration.logs.push(`[血脉] ${entry.displayName} 在 ${tier} 级奖励区获得了 ${bloodline.name}。`);
          } else {
            const reward = await grantExplorationFateReward(entry, tier);
            rewardMap.set(entry.base.code, reward);
          }
        } catch (error) {
          console.warn(`秘境血脉奖励发放失败：${entry.displayName} -> ${bloodline.name}`, error);
          const reward = await grantExplorationFateReward(entry, tier);
          rewardMap.set(entry.base.code, reward);
        }
      }
      const remainingEntries = shuffledEntries.filter((entry) => !rewardMap.has(entry.base.code));
      if (remainingEntries.length > 0) {
        for (const entry of remainingEntries) {
          const reward = await grantExplorationFateReward(entry, tier);
          rewardMap.set(entry.base.code, reward);
        }
        return rewardMap;
      }
      return rewardMap;
    }
  }

  for (const entry of entries) {
    rewardMap.set(entry.base.code, await awardExplorationReward(entry, tier));
  }
  return rewardMap;
}

function getAvailableBloodlinesByGrade(grade) {
  const heldIds = new Set(
    state.progress
      .map((progress) => progress?.bloodlineId || "")
      .filter(Boolean)
  );
  return state.bloodlines.filter((bloodline) =>
    !bloodline.deleted &&
    bloodline.grade === grade &&
    !heldIds.has(bloodline.id)
  );
}

async function grantExplorationFateReward(entry, tier) {
  const progress = normalizeProgressRecord(await state.storage.ensureProgress(entry.progress.buildId), entry.progress.buildId);
  if (canApplyFateChangeByGrade(tier, entry.build.potential)) {
    progress.nonBloodlineFateChangeCount = clampNonBloodlineFateChangeCount(
      progress.nonBloodlineFateChangeCount + 1,
      entry.build.potential
    );
    progress.fateChangeCount = progress.nonBloodlineFateChangeCount + (progress.bloodlineFateBonusApplied || 0);
    await state.storage.putProgress(progress);
    state.progress = state.progress.map((item) => (item.buildId === progress.buildId ? progress : item));
    await appendChronicleEntry(buildFateChangeChronicleEntry(createChronicleSubject(entry), progress.fateChangeCount));
    return { name: "逆天改命", grade: tier };
  }
  return "逆天改命未能生效";
}

async function awardExplorationReward(entry, tier) {
  if (tier === "E") {
    return await grantExplorationSkillReward(entry, tier);
  }
  const roll = Math.random();
  const highTier = ["S", "SS", "SSS"].includes(tier);
  if (roll < (highTier ? 0.45 : 0.4)) {
    const result = grantEquipmentForBuildByGrade(entry.build, state.equipment, tier, `${entry.build.buildId}:expedition-equip:${Date.now()}`);
    if (result.equipment) {
      await state.storage.putBuild(result.build);
      state.builds = state.builds.map((item) => (item.buildId === result.build.buildId ? result.build : item));
      if (result.equipment.grade === "SSS") {
        await recordLegendaryEquipment(entry.progress.buildId, createChronicleSubject(entry), result.equipment);
      }
      return { name: result.equipment.name, grade: result.equipment.grade || "" };
    }
    if (!highTier) {
      return "机缘已经自我损坏";
    }
  }
  if (roll < (highTier ? 0.9 : 0.8)) {
    const reward = await grantExplorationSkillReward(entry, tier);
    if (highTier && reward === "机缘已经自我损坏") {
      return await grantExplorationFateReward(entry, tier);
    }
    return reward;
  }
  if (!highTier && roll < 0.9) {
    return "机缘已经自我损坏";
  }
  return await grantExplorationFateReward(entry, tier);
}

async function grantExplorationSkillReward(entry, grade) {
  const pool = state.skills.filter((skill) =>
    !skill.deleted &&
    skill.grade === grade &&
    (skill.role === entry.build.role || skill.role === "all")
  );
  if (pool.length === 0) return "机缘已经自我损坏";
  const picked = shuffleValues(pool)[0];
  const currentIds = [...(entry.build.skillIds || [])];
  if (!currentIds.includes(picked.id)) {
    if (currentIds.length < (entry.build.skillSlots || 1)) {
      currentIds.push(picked.id);
    } else {
      const replaceIndex = findLowestSkillIndex(currentIds);
      currentIds[replaceIndex] = picked.id;
    }
  }
  const nextBuild = rebuildLearnedSkillState({ ...entry.build, skillIds: currentIds }, state.skills);
  await state.storage.putBuild(nextBuild);
  if (picked.grade === "SSS") {
    await recordLegendarySkill(entry.progress.buildId, createChronicleSubject(entry), picked);
  }
  return { name: picked.name, grade: picked.grade || "" };
}

function findLowestSkillIndex(skillIds = []) {
  let bestIndex = 0;
  let bestGrade = Infinity;
  skillIds.forEach((skillId, index) => {
    const skill = state.skills.find((item) => item.id === skillId);
    const score = gradeIndex(skill?.grade || "E");
    if (score < bestGrade) {
      bestGrade = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getExplorationActiveEntries() {
  if (!state.exploration) return [];
  return getExplorationCodesByTier(state.exploration, state.exploration.currentTier)
    .map((code) => getEntryByCode(code))
    .filter(Boolean);
}

/**
 * 将参赛者 code 列表按名次排序，去重后返回对应门派 ID 数组
 * @param {string[]} participantCodes
 * @param {Object} placementMap  { code: placementNumber } — 数字越小名次越高
 * @returns {string[]}  门派 ID 数组，按名次排序（冠军在前）
 */
function buildFactionRankFromCodes(participantCodes, placementMap) {
  const sorted = [...participantCodes]
    .filter((code) => placementMap[code] != null)
    .sort((a, b) => (placementMap[a] || 999) - (placementMap[b] || 999));
  const seen = new Set();
  const factionOrder = [];
  sorted.forEach((code) => {
    const entry = getEntryByCode(code);
    const fkey = entry?.build?.faction?.key;
    if (fkey && !seen.has(fkey)) {
      seen.add(fkey);
      factionOrder.push(fkey);
    }
  });
  return factionOrder;
}

function getEntryByCode(code) {
  return getEntries().find((entry) => entry.base.code === code) || null;
}

function formatMatchName(code) {
  return getEntryByCode(code)?.displayName || code || "待定";
}

function formatRewardSpec(spec) {
  if (!spec) return "-";
  return `${spec.grade} ${EQUIPMENT_SLOT_LABELS[spec.slot] || spec.slot}`;
}

function rollTournamentReward(role, grade, slot) {
  const pool = state.equipment.filter((item) =>
    !item.deleted &&
    item.grade === grade &&
    item.slot === slot &&
    canRoleEquip(item, role)
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
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








