// src/world-events.js
// 大事件：声望分配、攻城战、全员决战

import {
  WORLD_PRESTIGE_REWARDS, WORLD_PRESTIGE_COSTS, WORLD_CITY_TIERS
} from "./config.js";
import {
  addPrestige, spendPrestige, transferCity, FACTION_IDS
} from "./faction-state.js";
import { isHQSurrounded, ALL_CITIES, hexDistance } from "./world-map.js";
import { addWorldLog } from "./world-tick.js";
import { ensurePrecomputed } from "./world-connectivity.js";

// ── 声望分配 ─────────────────────────────────────

/**
 * 江湖争霸结束后调用：胜方获得 100 声望
 * @param {Object} worldState
 * @param {string} winnerFaction  胜方门派 ID
 * @returns {Object} 新的 worldState
 */
export function applyJianghuPrestige(worldState, winnerFaction) {
  const amount = WORLD_PRESTIGE_REWARDS.jianghuWin;
  const ws = {
    ...worldState,
    factionStats: addPrestige(worldState.factionStats, winnerFaction, amount),
  };
  return addWorldLog(ws, `江湖争霸：${winnerFaction} 获胜，斩获 ${amount} 声望。`);
}

/**
 * 武道会或排位赛结束后调用：按名次分发声望
 * @param {Object} worldState
 * @param {"tournament"|"ranking"} eventType
 * @param {string[]} rankedFactions  门派 ID 数组，按名次排序（index 0 = 冠军）
 * @returns {Object} 新的 worldState
 */
export function applyRankedEventPrestige(worldState, eventType, rankedFactions) {
  const rewards = WORLD_PRESTIGE_REWARDS[eventType];
  let factionStats = { ...worldState.factionStats };
  const logParts = [];

  rankedFactions.forEach((factionId, index) => {
    const reward = rewards[index] || 0;
    if (reward > 0) {
      factionStats = addPrestige(factionStats, factionId, reward);
      logParts.push(`${factionId}(第${index + 1}名 +${reward})`);
    }
  });

  const eventName = eventType === "tournament" ? "武道会" : "排位赛";
  return addWorldLog(
    { ...worldState, factionStats },
    `${eventName}声望结算：${logParts.join("、")}。`
  );
}

// ── 攻城战 ───────────────────────────────────────

/**
 * 门派 AI 决策：尝试发起攻城，并扣减声望
 * @param {Object} worldState
 * @param {string} attackerFaction
 * @param {string} cityId  目标城池 ID
 * @returns {{ worldState: Object, launched: boolean }}
 */
export function tryLaunchSiege(worldState, attackerFaction, cityId) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  if (!template) return { worldState, launched: false };

  const currentOwner = worldState.cities.find((c) => c.id === cityId)?.faction;
  let cost;
  if (!currentOwner) {
    cost = WORLD_PRESTIGE_COSTS.captureNeutral;
  } else if (template.tier === WORLD_CITY_TIERS.LARGE || template.tier === WORLD_CITY_TIERS.HQ) {
    cost = WORLD_PRESTIGE_COSTS.attackLargeCity;
  } else {
    cost = WORLD_PRESTIGE_COSTS.attackSmallCity;
  }

  const { ok, factionStats } = spendPrestige(worldState.factionStats, attackerFaction, cost);
  if (!ok) return { worldState, launched: false };

  const ws = addWorldLog(
    { ...worldState, factionStats },
    `${attackerFaction} 发起攻城战，目标：${template.name}（消耗 ${cost} 声望）。`
  );
  return { worldState: ws, launched: true };
}

/**
 * 攻城战结束后调用
 * @param {Object} worldState
 * @param {string} cityId
 * @param {string} winnerFaction  攻方胜利传 attackerFaction；守方胜利传守方门派 ID
 * @param {string} attackerFaction
 */
export function applySiegeResult(worldState, cityId, winnerFaction, attackerFaction) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  const cityName = template ? template.name : cityId;
  const wasOwnedBy = worldState.cities.find((c) => c.id === cityId)?.faction;

  if (winnerFaction !== attackerFaction) {
    // 守方获胜
    return addWorldLog(
      worldState,
      `攻城战：${attackerFaction} 攻打 ${cityName} 失败，${wasOwnedBy ?? "中立"} 守住。`
    );
  }

  // 攻方获胜
  const cities = transferCity(worldState.cities, cityId, attackerFaction);
  let ws = addWorldLog({ ...worldState, cities }, `攻城战：${attackerFaction} 占领 ${cityName}！`);

  // 检查是否触发全员决战
  if (wasOwnedBy && wasOwnedBy !== attackerFaction) {
    ws = checkAndTriggerLastStand(ws, wasOwnedBy);
  }
  return ws;
}

// ── 全员决战 ─────────────────────────────────────

/**
 * 检查某门派三座大城是否全部易手，若是则标记待触发全员决战
 */
export function checkAndTriggerLastStand(worldState, faction) {
  if (!isHQSurrounded(faction, worldState.cities)) return worldState;

  return addWorldLog(
    { ...worldState, pendingLastStand: { faction, triggeredSeason: worldState.season } },
    `危急！${faction} 三座大城尽失，全员决战即将爆发！`
  );
}

/**
 * 为单个门派选择最优攻城目标（基于 Voronoi 邻接图）
 * 规则：
 *   A. 有接壤空白城市：优先大城→小城，声望不够等待
 *   B. 只有接壤有主城市：按距离从近到远，声望够就攻
 * @returns {string|null} cityId or null
 */
function chooseSiegeTarget(factionId, worldState) {
  const { cityAdjacency, cities, factionStats } = worldState;
  if (!cityAdjacency) return null;

  const ownCityIds = new Set(
    cities.filter((c) => c.faction === factionId).map((c) => c.id)
  );
  if (ownCityIds.size === 0) return null;

  const prestige = factionStats[factionId]?.prestige || 0;

  // 收集所有接壤的非己方城市
  const neutral = [];
  const enemy = [];

  for (const ownId of ownCityIds) {
    for (const neighborId of (cityAdjacency[ownId] || [])) {
      if (ownCityIds.has(neighborId)) continue;
      const state = cities.find((c) => c.id === neighborId);
      if (!state) continue;
      if (!state.faction) {
        if (!neutral.includes(neighborId)) neutral.push(neighborId);
      } else {
        if (!enemy.includes(neighborId)) enemy.push(neighborId);
      }
    }
  }

  // 计算候选城市到己方最近城市的距离
  function minDistToOwn(cityId) {
    const tpl = ALL_CITIES.find((c) => c.id === cityId);
    if (!tpl) return Infinity;
    let minD = Infinity;
    for (const ownId of ownCityIds) {
      const ownTpl = ALL_CITIES.find((c) => c.id === ownId);
      if (!ownTpl) continue;
      const d = hexDistance(tpl.q, tpl.r, ownTpl.q, ownTpl.r);
      if (d < minD) minD = d;
    }
    return minD;
  }

  // 情况 A：有接壤空白城市
  if (neutral.length > 0) {
    if (prestige < WORLD_PRESTIGE_COSTS.captureNeutral) return null; // 积蓄声望

    // 优先大城
    const largeNeutral = neutral.filter((id) => {
      const tpl = ALL_CITIES.find((c) => c.id === id);
      return tpl?.tier === WORLD_CITY_TIERS.LARGE;
    });
    const candidates = largeNeutral.length > 0 ? largeNeutral : neutral;

    // 按距离排序，选最近
    candidates.sort((a, b) => minDistToOwn(a) - minDistToOwn(b));
    return candidates[0] || null;
  }

  // 情况 B：只剩有主城市，按距离从近到远，声望够就攻
  if (enemy.length > 0) {
    enemy.sort((a, b) => minDistToOwn(a) - minDistToOwn(b));
    for (const cityId of enemy) {
      const tpl = ALL_CITIES.find((c) => c.id === cityId);
      const cost = (tpl?.tier === WORLD_CITY_TIERS.LARGE || tpl?.tier === WORLD_CITY_TIERS.HQ)
        ? WORLD_PRESTIGE_COSTS.attackLargeCity
        : WORLD_PRESTIGE_COSTS.attackSmallCity;
      if (prestige >= cost) return cityId;
    }
  }

  return null;
}

/**
 * 运行所有门派的攻城 AI
 * 返回 { worldState, siegeEvents }
 * siegeEvents: [ { factionId, cityId, cityName } ]
 *
 * builds 可选传入，用于战斗结算（传 null 时用随机占位结算）
 */
export function runSiegeAI(worldState, builds) {
  let ws = ensurePrecomputed(worldState);
  const siegeEvents = [];

  for (const factionId of FACTION_IDS) {
    const targetCityId = chooseSiegeTarget(factionId, ws);
    if (!targetCityId) continue;

    const { worldState: newWs, launched } = tryLaunchSiege(ws, factionId, targetCityId);
    if (launched) {
      ws = newWs;
      const template = ALL_CITIES.find((c) => c.id === targetCityId);
      siegeEvents.push({ factionId, cityId: targetCityId, cityName: template?.name || targetCityId });
    }
  }

  return { worldState: ws, siegeEvents };
}

/**
 * 全员决战结束后调用
 * @param {Object} worldState
 * @param {string} loserFaction   被灭门派
 * @param {string} winnerFaction  获胜门派
 */
export function applyLastStandResult(worldState, loserFaction, winnerFaction) {
  let ws = { ...worldState, pendingLastStand: null };

  // 失败方所有城池归获胜方
  const loserCityIds = ws.cities
    .filter((c) => c.faction === loserFaction)
    .map((c) => c.id);

  let cities = [...ws.cities];
  loserCityIds.forEach((id) => {
    cities = transferCity(cities, id, winnerFaction);
  });

  ws = { ...ws, cities };
  return addWorldLog(ws, `全员决战：${loserFaction} 覆灭，并入 ${winnerFaction}！`);
}
