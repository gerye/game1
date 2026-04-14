// src/world-tick.js
// 世界时钟：时节推进、角色状态机、小事件

import { WORLD_CHARACTER_STATES } from "./config.js";
import { createInitialFactionStats, FACTION_IDS, tickGoldProduction, addPrestige } from "./faction-state.js";
import { createInitialCityStates } from "./world-map.js";

// ── 24节气 ────────────────────────────────────

// 从小雪开始（游戏开篇为隆冬），每年24节气循环
const SOLAR_TERMS = [
  "小雪", "大雪", "冬至", "小寒", "大寒",
  "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑",
  "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬",
];

const YEAR_LABELS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

/**
 * 将数字时节（从1开始）转换为节气标签
 * season 1  → "第一年·小雪"
 * season 24 → "第一年·立冬"
 * season 25 → "第二年·小雪"
 */
export function getSeasonLabel(season) {
  const s = Math.max(1, season);
  const yearIndex = Math.ceil(s / 24) - 1;
  const termIndex = (s - 1) % 24;
  const yearLabel = yearIndex < YEAR_LABELS.length ? YEAR_LABELS[yearIndex] : `${yearIndex + 1}`;
  return `第${yearLabel}年·${SOLAR_TERMS[termIndex]}`;
}

// ── 世界状态结构说明 ────────────────────────────
//
// worldState = {
//   season: number,            // 当前时节编号（从 1 递增）
//   factionStats: {            // 门派三维状态
//     [factionId]: { prestige, gold }
//   },
//   cities: [                  // 城池当前所有权
//     { id: string, faction: string|null }
//   ],
//   characterStates: {         // 角色当前状态
//     [buildId]: {
//       state: "garrison"|"roaming"|"campaign",
//       cityId: string|null,
//       q: number,
//       r: number,
//       injured: boolean,
//       injuredUntilSeason: number,
//     }
//   },
//   log: string[],             // 最近 50 条世界事件日志
// }

/**
 * 创建全新的世界状态（首次启动时调用）
 */
export function createWorldState() {
  return {
    season: 1,
    factionStats: createInitialFactionStats(),
    cities: createInitialCityStates(),
    characterStates: {},
    log: [`${getSeasonLabel(1)}，江湖初开，六派鼎立。`],
  };
}

/**
 * 确保所有角色都有初始状态
 * @param {Object} worldState
 * @param {Object[]} builds  所有角色（需有 buildId, faction 字段）
 */
export function syncCharacterStates(worldState, builds) {
  const updated = { ...worldState, characterStates: { ...worldState.characterStates } };
  builds.forEach((build) => {
    if (!updated.characterStates[build.buildId]) {
      updated.characterStates[build.buildId] = {
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: `${build.faction?.key || build.faction}-hq`,
        q: 0,
        r: 0,
        injured: false,
        injuredUntilSeason: 0,
      };
    }
  });
  return updated;
}

// ── 日志工具 ────────────────────────────────────

const WORLD_LOG_LIMIT = 50;

export function addWorldLog(worldState, message) {
  const log = [...(worldState.log || []), message].slice(-WORLD_LOG_LIMIT);
  return { ...worldState, log };
}

// ── 时节推进 ────────────────────────────────────

/**
 * 推进一个时节：
 * 1. season + 1
 * 2. 结算金币产出
 * 3. 解除到期重伤状态
 * 4. AI 调整角色状态（驻守/漫游）
 * 5. 触发漫游小事件
 * 6. 记录日志
 */
export function advanceSeason(worldState, builds) {
  let ws = { ...worldState, season: worldState.season + 1 };

  // 1. 金币产出
  ws = { ...ws, factionStats: tickGoldProduction(ws.factionStats, ws.cities) };

  // 2. 解除到期重伤
  const newCharStates = { ...ws.characterStates };
  builds.forEach((build) => {
    const cs = newCharStates[build.buildId];
    if (!cs) return;
    if (cs.injured && cs.injuredUntilSeason <= ws.season) {
      newCharStates[build.buildId] = { ...cs, injured: false };
    }
  });
  ws = { ...ws, characterStates: newCharStates };

  // 3. AI 角色状态切换
  ws = aiUpdateCharacterStates(ws, builds);

  // 4. 漫游小事件
  ws = triggerRoamingEvents(ws, builds);

  ws = addWorldLog(ws, `${getSeasonLabel(ws.season)}：各派积蓄力量。`);
  return ws;
}

// ── AI 角色状态切换 ──────────────────────────────

function aiUpdateCharacterStates(worldState, builds) {
  const updated = { ...worldState.characterStates };

  builds.forEach((build) => {
    const cs = updated[build.buildId];
    if (!cs || cs.state === WORLD_CHARACTER_STATES.CAMPAIGN) return;

    // 重伤角色强制驻守在总部
    if (cs.injured) {
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: `${build.faction?.key || build.faction}-hq`,
      };
      return;
    }

    // 40% 概率漫游，60% 驻守
    const roll = seededRand(build.buildId + worldState.season);
    if (roll < 0.4) {
      updated[build.buildId] = { ...cs, state: WORLD_CHARACTER_STATES.ROAMING };
    } else {
      const factionKey = build.faction?.key || build.faction;
      const ownedCities = worldState.cities.filter((c) => c.faction === factionKey);
      const target = ownedCities.length
        ? ownedCities[Math.floor(roll * ownedCities.length)]
        : { id: `${build.faction?.key || build.faction}-hq` };
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: target.id,
      };
    }
  });

  return { ...worldState, characterStates: updated };
}

// 确定性伪随机（0~1），基于字符串种子
function seededRand(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

// ── 漫游小事件 ──────────────────────────────────

const ROAMING_EVENTS = [
  { type: "xp",       weight: 40, desc: "奇遇修炼" },
  { type: "gold",     weight: 30, desc: "发现宝藏", goldGain: 30 },
  { type: "prestige", weight: 20, desc: "行侠仗义", prestigeGain: 5 },
  { type: "duel",     weight: 10, desc: "邂逅对手" },
];

const ROAMING_TOTAL_WEIGHT = ROAMING_EVENTS.reduce((s, e) => s + e.weight, 0);

function triggerRoamingEvents(worldState, builds) {
  let ws = worldState;

  const roamers = builds.filter((b) => {
    const cs = ws.characterStates[b.buildId];
    return cs && cs.state === WORLD_CHARACTER_STATES.ROAMING;
  });

  roamers.forEach((build) => {
    const roll = seededRand(build.buildId + "event" + ws.season);
    let cumWeight = 0;
    let chosen = ROAMING_EVENTS[0];
    for (const ev of ROAMING_EVENTS) {
      cumWeight += ev.weight / ROAMING_TOTAL_WEIGHT;
      if (roll < cumWeight) { chosen = ev; break; }
    }

    if (chosen.type === "prestige" && chosen.prestigeGain) {
      ws = {
        ...ws,
        factionStats: addPrestige(ws.factionStats, build.faction, chosen.prestigeGain),
      };
    }
    if (chosen.type === "gold" && chosen.goldGain) {
      const updated = { ...ws.factionStats };
      if (!updated[build.faction]) updated[build.faction] = { prestige: 0, gold: 0 };
      updated[build.faction] = {
        ...updated[build.faction],
        gold: (updated[build.faction].gold || 0) + chosen.goldGain,
      };
      ws = { ...ws, factionStats: updated };
    }

    ws = addWorldLog(ws, `${build.name || build.buildId} ${chosen.desc}。`);
  });

  return ws;
}
