// src/faction-state.js
// 门派三维状态：声望 / 金币 / 城池控制逻辑

import { WORLD_GOLD_TICK, WORLD_CITY_TIERS } from "./config.js";
import { ALL_CITIES, citiesOwnedBy, INITIAL_CITIES } from "./world-map.js";

// ── 六大门派 ID ────────────────────────────────
export const FACTION_IDS = ["palace", "demon", "shaolin", "qingyun", "isle", "soul"];

/**
 * 创建初始门派状态
 * @returns {{ [factionId]: { prestige: number, gold: number } }}
 */
export function createInitialFactionStats() {
  return Object.fromEntries(
    FACTION_IDS.map((id) => [id, { prestige: 0, gold: 500 }])
  );
}

// ── 声望操作 ────────────────────────────────────

/**
 * 给某门派增加声望
 */
export function addPrestige(factionStats, factionId, amount) {
  const updated = { ...factionStats };
  updated[factionId] = {
    ...updated[factionId],
    prestige: (updated[factionId]?.prestige || 0) + amount,
  };
  return updated;
}

/**
 * 扣减声望（用于攻城）
 * @returns {{ ok: boolean, factionStats: Object }}
 */
export function spendPrestige(factionStats, factionId, amount) {
  const current = factionStats[factionId]?.prestige || 0;
  if (current < amount) return { ok: false, factionStats };
  const updated = { ...factionStats };
  updated[factionId] = { ...updated[factionId], prestige: current - amount };
  return { ok: true, factionStats: updated };
}

// ── 金币操作 ─────────────────────────────────────

/**
 * 结算一个时节的金币产出
 * 规则：小城 20/大城 60/总部 100；边境城池产出 ×1.5
 */
export function tickGoldProduction(factionStats, cityStates) {
  const updated = { ...factionStats };

  cityStates.forEach(({ id, faction }) => {
    if (!faction) return;

    const template = ALL_CITIES.find((c) => c.id === id);
    if (!template) return;

    let base = 0;
    if (template.tier === WORLD_CITY_TIERS.SMALL)  base = WORLD_GOLD_TICK.smallCity;
    if (template.tier === WORLD_CITY_TIERS.LARGE)  base = WORLD_GOLD_TICK.largeCity;
    if (template.tier === WORLD_CITY_TIERS.HQ)     base = WORLD_GOLD_TICK.hq;

    const border = isBorderCity(id, faction, cityStates);
    const output = Math.round(base * (border ? 1 + WORLD_GOLD_TICK.borderBonus : 1));

    if (!updated[faction]) updated[faction] = { prestige: 0, gold: 0 };
    updated[faction] = { ...updated[faction], gold: (updated[faction].gold || 0) + output };
  });

  return updated;
}

/**
 * 判断城池是否为边境城池（周边约 3 格内存在敌方城池）
 */
function isBorderCity(cityId, ownerFaction, cityStates) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  if (!template) return false;

  return ALL_CITIES.some((neighbor) => {
    if (neighbor.id === cityId) return false;
    const dq = template.q - neighbor.q;
    const dr = template.r - neighbor.r;
    const dist = (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
    if (dist > 3) return false;
    const state = cityStates.find((s) => s.id === neighbor.id);
    return state && state.faction && state.faction !== ownerFaction;
  });
}

// ── 攻城结果应用 ────────────────────────────────

/**
 * 将城池所有权转移给新门派
 */
export function transferCity(cityStates, cityId, newFaction) {
  return cityStates.map((c) =>
    c.id === cityId ? { ...c, faction: newFaction } : c
  );
}

// ── 门派实力评分 ────────────────────────────────

/**
 * 计算门派实力评分（用于 UI 展示）
 * = 100(基础) + 大城数×30 + 小城数×10 + 声望×0.1
 */
export function computePowerScore(factionId, factionStats, cityStates) {
  const owned = citiesOwnedBy(factionId, cityStates);
  const largeCities = owned.filter((c) => {
    const t = ALL_CITIES.find((a) => a.id === c.id);
    return t && t.tier === WORLD_CITY_TIERS.LARGE;
  }).length;
  const smallCities = owned.filter((c) => {
    const t = ALL_CITIES.find((a) => a.id === c.id);
    return t && t.tier === WORLD_CITY_TIERS.SMALL;
  }).length;
  const prestige = factionStats[factionId]?.prestige || 0;
  return 100 + largeCities * 30 + smallCities * 10 + Math.round(prestige * 0.1);
}
