// src/world-tick.js
// 世界时钟：时节推进、角色状态机、小事件

import { WORLD_CHARACTER_STATES } from "./config.js";
import { createInitialFactionStats, FACTION_IDS, tickGoldProduction, addPrestige } from "./faction-state.js";
import { createInitialCityStates, buildCityTerritories, ALL_CITIES, hexDistance, inBounds } from "./world-map.js";
import { buildCityAdjacency, buildTerritoryOwner } from "./world-connectivity.js";

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
//   recentSiegeLosses: {       // 各门派最近两次攻城失败时输给的防守门派
//     [factionId]: string[]
//   }
// }

/**
 * 创建全新的世界状态（首次启动时调用）
 */
export function createWorldState() {
  const cityTerritories = buildCityTerritories();
  return {
    season: 1,
    factionStats: createInitialFactionStats(),
    cities: createInitialCityStates(),
    cityTerritories,
    cityAdjacency: buildCityAdjacency(cityTerritories),
    territoryOwner: buildTerritoryOwner(cityTerritories),
    characterStates: {},
    recentSiegeLosses: {},
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
 * 检测大地图上相邻的敌对角色，返回可能发生单挑的配对
 * @returns {{ buildA: Object, buildB: Object }[]}
 */
export function detectAdjacentDuels(worldState, builds) {
  const charStates = worldState.characterStates || {};
  const cityMap = Object.fromEntries(
    ALL_CITIES.map((c) => [c.id, { q: c.q, r: c.r }])
  );

  function getCharPos(build) {
    const cs = charStates[build.buildId];
    if (!cs) return null;
    if (cs.state === WORLD_CHARACTER_STATES.GARRISON && cs.cityId) {
      return cityMap[cs.cityId] || null;
    }
    // 漫游位置需非原点且在地图内才参与单挑检测
    if (cs.q != null && cs.r != null && (cs.q !== 0 || cs.r !== 0) && inBounds(cs.q, cs.r)) {
      return { q: cs.q, r: cs.r };
    }
    return null;
  }

  const activePairs = [];
  const paired = new Set();

  for (let i = 0; i < builds.length; i++) {
    for (let j = i + 1; j < builds.length; j++) {
      const a = builds[i];
      const b = builds[j];
      const aKey = a.faction?.key || a.faction;
      const bKey = b.faction?.key || b.faction;
      if (aKey === bKey) continue;
      const csA = charStates[a.buildId];
      const csB = charStates[b.buildId];
      if (csA?.injured || csB?.injured) continue;
      if (paired.has(a.buildId) || paired.has(b.buildId)) continue;

      const posA = getCharPos(a);
      const posB = getCharPos(b);
      if (!posA || !posB) continue;

      const dist = hexDistance(posA.q, posA.r, posB.q, posB.r);
      if (dist <= 3) {
        activePairs.push({ buildA: a, buildB: b });
        paired.add(a.buildId);
        paired.add(b.buildId);
      }
    }
  }

  return activePairs;
}

/**
 * 推进一个时节
 * @param {Object} worldState
 * @param {Object[]} builds
 * @param {Function|null} fastSimFn  (buildA, buildB) => {winnerBuildId, loserBuildId}
 * @returns {{ worldState: Object, duelResults: Object[] }}
 */
export function advanceSeason(worldState, builds, fastSimFn = null) {
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

  // 5. 相邻单挑（仅当 fastSimFn 传入时执行）
  const duelResults = [];
  if (fastSimFn) {
    const duels = detectAdjacentDuels(ws, builds);
    for (const { buildA, buildB } of duels) {
      try {
        const result = fastSimFn(buildA, buildB);
        duelResults.push(result);
        if (result.winnerBuildId) {
          const winnerName = result.winnerBuildId === buildA.buildId
            ? (buildA.name || buildA.buildId)
            : (buildB.name || buildB.buildId);
          ws = addWorldLog(ws, `单挑：${buildA.name || buildA.buildId} vs ${buildB.name || buildB.buildId}，${winnerName} 胜。`);
        }
      } catch (_) { /* 忽略单挑错误 */ }
    }
  }

  // 6. 攻城 AI（inline，避免循环依赖）
  // (no-op for now — siege AI runs via world-events.js from app.js)

  ws = addWorldLog(ws, `${getSeasonLabel(ws.season)}：各派积蓄力量。`);
  return { worldState: ws, duelResults };
}

// ── AI 角色状态切换 ──────────────────────────────

function aiUpdateCharacterStates(worldState, builds) {
  const updated = { ...worldState.characterStates };
  const cityMap = Object.fromEntries(ALL_CITIES.map((c) => [c.id, { q: c.q, r: c.r }]));

  builds.forEach((build) => {
    const cs = updated[build.buildId];
    if (!cs || cs.state === WORLD_CHARACTER_STATES.CAMPAIGN) return;

    const factionKey = build.faction?.key || build.faction;
    const hqId = `${factionKey}-hq`;

    // 重伤角色强制驻守在总部
    if (cs.injured) {
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: hqId,
        q: cityMap[hqId]?.q || 0,
        r: cityMap[hqId]?.r || 0,
      };
      return;
    }

    // 移动力：敏捷 / 20，最少 2 格
    const agility = build.primary?.agility || 20;
    const movementRange = Math.max(2, Math.floor(agility / 20));

    // 当前位置
    let cq, cr;
    let displaced = false; // 驻守城市已被占，需要离开
    if (cs.state === WORLD_CHARACTER_STATES.GARRISON && cs.cityId) {
      const cityPos = cityMap[cs.cityId];
      cq = cityPos?.q || 0;
      cr = cityPos?.r || 0;
      // 检查驻守城市是否仍属于己方
      const cityState = worldState.cities.find((c) => c.id === cs.cityId);
      if (cityState && cityState.faction !== factionKey) displaced = true;
    } else {
      cq = cs.q || 0;
      cr = cs.r || 0;
    }

    const seed = build.buildId + String(worldState.season);
    const roll = seededRand(seed);

    // 60% 概率驻守（除非被强制离开），40% 游历
    if (roll >= 0.4 && !displaced) {
      // 驻守：选一个移动力范围内的己方城市
      const ownCities = worldState.cities.filter((c) => c.faction === factionKey);
      const reachable = ownCities.filter((c) => {
        const tpl = cityMap[c.id];
        return tpl && hexDistance(cq, cr, tpl.q, tpl.r) <= movementRange;
      });

      if (reachable.length > 0) {
        const idx = Math.floor(seededRand(seed + "g") * reachable.length);
        const target = reachable[idx];
        const tpos = cityMap[target.id];
        updated[build.buildId] = {
          ...cs,
          state: WORLD_CHARACTER_STATES.GARRISON,
          cityId: target.id,
          q: tpos?.q || 0,
          r: tpos?.r || 0,
        };
        return;
      }
      // 范围内无己方城市，转为游历
    }

    // 游历：决定有无念头（50%）
    const hasIntention = seededRand(seed + "i") < 0.5;
    let targetQ = cq, targetR = cr;

    if (hasIntention) {
      // 选目标城市（己方或中立）
      const availCities = worldState.cities.filter((c) => !c.faction || c.faction === factionKey);
      if (availCities.length > 0) {
        const idx = Math.floor(seededRand(seed + "tc") * availCities.length);
        const tpl = ALL_CITIES.find((c) => c.id === availCities[idx].id);
        if (tpl) { targetQ = tpl.q; targetR = tpl.r; }
      }
    }

    // 计算新坐标，最多 10 次尝试
    let newQ = cq, newR = cr;
    let found = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      let candQ, candR;
      if (hasIntention) {
        const dist = hexDistance(cq, cr, targetQ, targetR);
        if (dist <= movementRange) {
          candQ = targetQ; candR = targetR;
        } else {
          const ratio = movementRange / dist;
          candQ = Math.round(cq + (targetQ - cq) * ratio);
          candR = Math.round(cr + (targetR - cr) * ratio);
        }
      } else {
        const angle = seededRand(seed + "ang" + attempt) * Math.PI * 2;
        candQ = Math.round(cq + movementRange * Math.cos(angle));
        candR = Math.round(cr + movementRange * Math.sin(angle));
      }

      if (isValidRoamPos(candQ, candR, factionKey, worldState)) {
        newQ = candQ; newR = candR;
        found = true;
        break;
      }
    }
    if (!found) { newQ = cq; newR = cr; }

    // 移动后，若在己方城市附近，50% 概率驻守
    const ownCities = worldState.cities.filter((c) => c.faction === factionKey);
    const nearbyOwn = ownCities.find((c) => {
      const tpl = cityMap[c.id];
      return tpl && hexDistance(newQ, newR, tpl.q, tpl.r) <= movementRange;
    });

    if (nearbyOwn && seededRand(seed + "settle") > 0.5) {
      const tpos = cityMap[nearbyOwn.id];
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: nearbyOwn.id,
        q: tpos?.q || 0,
        r: tpos?.r || 0,
      };
    } else {
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.ROAMING,
        q: newQ,
        r: newR,
        cityId: null,
      };
    }
  });

  return { ...worldState, characterStates: updated };
}

// 坐标验证：在地图内 + 落在己方或中立 Voronoi 格内
function isValidRoamPos(q, r, factionKey, worldState) {
  if (!inBounds(q, r)) return false;
  const { territoryOwner, cities } = worldState;
  if (!territoryOwner) return true; // 旧存档兜底
  const cityId = territoryOwner[`${q},${r}`];
  if (!cityId) return false;
  const cityState = cities.find((c) => c.id === cityId);
  return !cityState?.faction || cityState.faction === factionKey;
}

// 确定性伪随机（0~1），基于字符串种子
export function seededRand(seed) {
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
