// src/world-siege.js
// 攻城战系统：普通攻城战 + 灭门战（占位实现，后续接入真实战场）

import { WORLD_CITY_TIERS, WORLD_CHARACTER_STATES } from "./config.js";
import { ALL_CITIES, INITIAL_CITIES } from "./world-map.js";
import { FACTION_IDS, transferCity } from "./faction-state.js";
import { addWorldLog } from "./world-tick.js";

const SIEGE_ATTACKER_TOP_N = 3;
const SIEGE_DEFENDER_TOP_N = 5;

// ── 弟子选取 ──────────────────────────────────────

/**
 * 选取参战弟子
 * - 前 topN 名（按等级降序）必须参战，含重伤
 * - 剩余弟子中随机取 ceil(remaining × ratio) 人
 *   - 优先非重伤；非重伤不够则补重伤
 * @param {Object[]} factionBuilds 该门派所有弟子
 * @param {Object} characterStates
 * @param {number} topN
 * @param {number} ratio  0~1
 * @returns {Object[]}
 */
export function selectCombatants(factionBuilds, characterStates, topN, ratio) {
  if (factionBuilds.length === 0) return [];
  if (ratio >= 1.0) return [...factionBuilds];

  const sorted = [...factionBuilds].sort((a, b) => {
    const lvA = a.progress?.level || 1;
    const lvB = b.progress?.level || 1;
    return lvB - lvA;
  });

  const actualTopN = Math.min(topN, sorted.length);
  const top = sorted.slice(0, actualTopN);
  const remaining = sorted.slice(actualTopN);

  if (remaining.length === 0) return top;

  const randomCount = Math.ceil(remaining.length * ratio);
  const nonInjured = remaining.filter((b) => !characterStates[b.buildId]?.injured);
  const injured    = remaining.filter((b) =>  characterStates[b.buildId]?.injured);

  let selected;
  if (nonInjured.length >= randomCount) {
    selected = nonInjured.slice(0, randomCount);
  } else {
    selected = [...nonInjured, ...injured.slice(0, randomCount - nonInjured.length)];
  }

  return [...top, ...selected];
}

// ── 战斗占位结算 ──────────────────────────────────

/**
 * 占位实现：按参战人数加权随机决出胜负
 * @returns {"attacker"|"defender"}
 */
function resolveBattle(attackers, defenders, seed) {
  if (attackers.length === 0) return "defender";
  if (defenders.length === 0) return "attacker";
  const prob = attackers.length / (attackers.length + defenders.length);
  return seededRand(seed) < prob ? "attacker" : "defender";
}

// ── 重伤工具 ─────────────────────────────────────

export function injureCombatants(worldState, combatants, factionKey) {
  if (combatants.length === 0) return worldState;
  const hqId = `${factionKey}-hq`;
  const newCs = { ...worldState.characterStates };
  for (const build of combatants) {
    const cs = newCs[build.buildId];
    if (!cs) continue;
    newCs[build.buildId] = {
      ...cs,
      injured: true,
      injuredUntilSeason: worldState.season + 1,
      state: WORLD_CHARACTER_STATES.GARRISON,
      cityId: hqId,
    };
  }
  return { ...worldState, characterStates: newCs };
}

/** 将驻守在某城市的指定门派弟子全部重伤回 HQ */
export function injureGarrisonedAt(worldState, cityId, factionKey) {
  const hqId = `${factionKey}-hq`;
  const newCs = { ...worldState.characterStates };
  for (const [buildId, cs] of Object.entries(worldState.characterStates)) {
    if (cs.state === WORLD_CHARACTER_STATES.GARRISON && cs.cityId === cityId) {
      newCs[buildId] = {
        ...cs,
        injured: true,
        injuredUntilSeason: worldState.season + 1,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: hqId,
      };
    }
  }
  return { ...worldState, characterStates: newCs };
}

// ── 普通攻城战 ────────────────────────────────────

/**
 * 执行一次普通攻城战（声望已在 tryLaunchSiege 中扣除）
 * @param {Object} worldState
 * @param {Object[]} builds  所有弟子
 * @param {string} attackerFaction
 * @param {string} cityId  目标城池
 * @returns {Object} 新 worldState
 */
export function runOrdinarySiege(worldState, builds, attackerFaction, cityId) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  if (!template) return worldState;

  const defenderFaction = worldState.cities.find((c) => c.id === cityId)?.faction || null;

  const atkBuilds = builds.filter((b) => (b.faction?.key || b.faction) === attackerFaction);
  const defBuilds = defenderFaction
    ? builds.filter((b) => (b.faction?.key || b.faction) === defenderFaction)
    : [];

  const attackers = selectCombatants(atkBuilds, worldState.characterStates, SIEGE_ATTACKER_TOP_N, 1 / 3);
  const defenders = selectCombatants(defBuilds, worldState.characterStates, SIEGE_DEFENDER_TOP_N, 1 / 3);

  const seed = `siege-${attackerFaction}-${cityId}-${worldState.season}`;
  const result = resolveBattle(attackers, defenders, seed);

  let ws = worldState;

  if (result === "attacker") {
    // 进攻方胜：守方驻守弟子重伤，城市易主
    if (defenderFaction) {
      ws = injureGarrisonedAt(ws, cityId, defenderFaction);
      ws = injureCombatants(ws, defenders, defenderFaction);
    }
    const newCities = transferCity(ws.cities, cityId, attackerFaction);
    ws = { ...ws, cities: newCities };
    ws = addWorldLog(ws, `攻城战：${attackerFaction} 占领 ${template.name}！`);
  } else {
    // 守方胜：进攻方参战弟子重伤
    ws = injureCombatants(ws, attackers, attackerFaction);
    ws = addWorldLog(ws, `攻城战：${attackerFaction} 攻打 ${template.name} 失败，${defenderFaction ?? "中立"} 守住！`);
  }

  return ws;
}

// ── 灭门战检测 ───────────────────────────────────

/**
 * 检测是否有门派满足灭门战触发条件：其3座关联大城全被他方占领
 * @param {Object} worldState
 * @returns {{ targetFaction: string, attackers: {factionId:string, citiesHeld:string[]}[] }|null}
 */
export function checkExtinctionWar(worldState) {
  for (const factionId of FACTION_IDS) {
    const largeCityIds = INITIAL_CITIES
      .filter((c) => c.faction === factionId && c.tier === WORLD_CITY_TIERS.LARGE)
      .map((c) => c.id);

    const allOccupiedByEnemy = largeCityIds.every((id) => {
      const state = worldState.cities.find((c) => c.id === id);
      return state && state.faction && state.faction !== factionId;
    });

    if (!allOccupiedByEnemy) continue;

    // 统计各占领方占了几座大城
    const attackerMap = {};
    for (const cityId of largeCityIds) {
      const state = worldState.cities.find((c) => c.id === cityId);
      if (!state?.faction) continue;
      if (!attackerMap[state.faction]) attackerMap[state.faction] = [];
      attackerMap[state.faction].push(cityId);
    }

    const attackers = Object.entries(attackerMap).map(([f, cities]) => ({
      factionId: f,
      citiesHeld: cities,
    }));

    return { targetFaction: factionId, attackers };
  }
  return null;
}

// ── 灭门战 ────────────────────────────────────────

/**
 * 执行灭门战（占位实现）
 * @param {Object} worldState
 * @param {Object[]} builds  所有弟子
 * @param {string} targetFaction  被围攻的门派
 * @param {{ factionId: string, citiesHeld: string[] }[]} attackers
 * @returns {{ worldState: Object, factionChanges: {buildId:string, newFaction:string}[] }}
 *   factionChanges: 需要持久化到 DB 的门派变更
 */
export function runExtinctionWar(worldState, builds, targetFaction, attackers) {
  let ws = worldState;
  const factionChanges = [];

  // 所有进攻门派声望清零
  const newFactionStats = { ...ws.factionStats };
  for (const { factionId } of attackers) {
    newFactionStats[factionId] = { ...newFactionStats[factionId], prestige: 0 };
  }
  ws = { ...ws, factionStats: newFactionStats };

  const atkNames = attackers.map((a) => a.factionId).join("、");
  ws = addWorldLog(ws, `灭门战爆发！${atkNames} 围攻 ${targetFaction} 总部！`);

  // 选取参战弟子
  const defBuilds = builds.filter((b) => (b.faction?.key || b.faction) === targetFaction);
  const defenders = [...defBuilds]; // 防守方全员

  const attackerCombatants = {};
  for (const { factionId, citiesHeld } of attackers) {
    const fBuilds = builds.filter((b) => (b.faction?.key || b.faction) === factionId);
    const ratio = citiesHeld.length >= 3 ? 1.0 : citiesHeld.length === 2 ? 2 / 3 : 1 / 3;
    attackerCombatants[factionId] = selectCombatants(
      fBuilds, ws.characterStates, SIEGE_ATTACKER_TOP_N, ratio
    );
  }

  const allAttackers = Object.values(attackerCombatants).flat();

  // 阶段一：进攻方 vs 防守方
  const p1Seed = `ext-${targetFaction}-${ws.season}-p1`;
  const p1Result = resolveBattle(allAttackers, defenders, p1Seed);

  if (p1Result === "defender") {
    // 防守方胜：三大城归防守方
    const largeCityIds = INITIAL_CITIES
      .filter((c) => c.faction === targetFaction && c.tier === WORLD_CITY_TIERS.LARGE)
      .map((c) => c.id);
    let cities = [...ws.cities];
    for (const cid of largeCityIds) cities = transferCity(cities, cid, targetFaction);
    ws = { ...ws, cities };

    for (const { factionId } of attackers) {
      ws = injureCombatants(ws, attackerCombatants[factionId], factionId);
    }
    ws = addWorldLog(ws, `灭门战：${targetFaction} 以寡敌众，守住门派！三座大城尽归 ${targetFaction}！`);
    return { worldState: ws, factionChanges };
  }

  // 阶段一：进攻方胜，防守方全员重伤
  ws = injureCombatants(ws, defenders, targetFaction);
  ws = addWorldLog(ws, `灭门战：${targetFaction} 全军覆没！进攻方展开内战……`);

  // 阶段二：内战，直到只剩一家
  let survivingFactions = attackers.map((a) => a.factionId);
  while (survivingFactions.length > 1) {
    const fA = survivingFactions[0];
    const fB = survivingFactions[1];
    const cA = attackerCombatants[fA] || [];
    const cB = attackerCombatants[fB] || [];
    const iSeed = `ext-internal-${fA}-${fB}-${ws.season}`;
    const iResult = resolveBattle(cA, cB, iSeed);

    if (iResult === "attacker") {
      ws = injureCombatants(ws, cB, fB);
      ws = addWorldLog(ws, `内战：${fA} 击败 ${fB}！`);
      survivingFactions = survivingFactions.filter((f) => f !== fB);
    } else {
      ws = injureCombatants(ws, cA, fA);
      ws = addWorldLog(ws, `内战：${fB} 击败 ${fA}！`);
      survivingFactions = survivingFactions.filter((f) => f !== fA);
    }
  }

  const winner = survivingFactions[0];

  // 胜利方占据防守方 HQ
  const hqId = `${targetFaction}-hq`;
  ws = { ...ws, cities: transferCity(ws.cities, hqId, winner) };

  // 分配防守方弟子
  const shuffled = shuffleSeeded(defBuilds, `dist-${targetFaction}-${ws.season}`);
  const half = Math.floor(shuffled.length / 2);
  const joinWinner = shuffled.slice(0, half);
  const joinOthers = shuffled.slice(half);

  const otherFactions = FACTION_IDS.filter((f) => f !== targetFaction && f !== winner);

  const newCharStates = { ...ws.characterStates };

  for (const build of joinWinner) {
    factionChanges.push({ buildId: build.buildId, newFaction: winner });
    newCharStates[build.buildId] = {
      ...(newCharStates[build.buildId] || {}),
      state: WORLD_CHARACTER_STATES.GARRISON,
      cityId: `${winner}-hq`,
      injured: false,
    };
  }

  for (let i = 0; i < joinOthers.length; i++) {
    const build = joinOthers[i];
    const targetOther = otherFactions.length > 0
      ? otherFactions[i % otherFactions.length]
      : winner;
    factionChanges.push({ buildId: build.buildId, newFaction: targetOther });
    newCharStates[build.buildId] = {
      ...(newCharStates[build.buildId] || {}),
      state: WORLD_CHARACTER_STATES.GARRISON,
      cityId: `${targetOther}-hq`,
      injured: false,
    };
  }

  ws = { ...ws, characterStates: newCharStates };
  ws = addWorldLog(
    ws,
    `灭门战结束：${winner} 笑到最后，占据 ${targetFaction} 总部！` +
    `${targetFaction} 弟子半数归入 ${winner}，半数流散他门。`
  );

  return { worldState: ws, factionChanges };
}

// ── 工具 ─────────────────────────────────────────

function shuffleSeeded(arr, seed) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRand(seed + i) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function seededRand(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}
