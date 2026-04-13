// src/world-map.js
// 世界地图：格子数据、地形、城池、控制权

import { WORLD_MAP_RADIUS, WORLD_CITY_TIERS } from "./config.js";

// ── 六边形坐标工具 ─────────────────────────────

/** 返回偏移坐标 (q, r) 的六个邻格 */
export function hexNeighbors(q, r) {
  return [
    { q: q + 1, r: r }, { q: q - 1, r: r },
    { q: q,     r: r + 1 }, { q: q,     r: r - 1 },
    { q: q + 1, r: r - 1 }, { q: q - 1, r: r + 1 },
  ];
}

/** 两格之间的六边形距离（cube 坐标距离公式） */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/** 判断格子是否在地图范围内 */
export function inBounds(q, r) {
  return hexDistance(0, 0, q, r) <= WORLD_MAP_RADIUS;
}

// ── 地形类型 ───────────────────────────────────

export const TERRAIN = Object.freeze({
  PLAIN:    "plain",
  FOREST:   "forest",
  WATER:    "water",
  ROCK:     "rock",
  LAVA:     "lava",
  MOUNTAIN: "mountain",
  STEPPE:   "steppe",
  SEA:      "sea",
});

export const TERRAIN_COLORS = {
  plain:    "#c8e6a0",
  forest:   "#4a8a40",
  water:    "#6bbbe6",
  rock:     "#a09070",
  lava:     "#e07040",
  mountain: "#7a7060",
  steppe:   "#d4c090",
  sea:      "#2060a0",
};

/**
 * 根据格子坐标决定地形
 * 北方（r < -28）→ 草原
 * 南方（r > 28 且 q < 5）→ 大山
 * 西方（q < -28）→ 大山
 * 东方（q > 28 且 r < 5）→ 大海
 * 中原：哈希分配五种地形
 */
export function getTerrainAt(q, r) {
  const dist = hexDistance(0, 0, q, r);
  if (dist > WORLD_MAP_RADIUS) return null;

  if (r < -28) return TERRAIN.STEPPE;
  if (r > 28 && q < 5) return TERRAIN.MOUNTAIN;
  if (q < -28) return TERRAIN.MOUNTAIN;
  if (q > 28 && r < 5) return TERRAIN.SEA;

  const hash = Math.abs((q * 31 + r * 17 + q * r * 7) % 100);
  if (hash < 35) return TERRAIN.PLAIN;
  if (hash < 55) return TERRAIN.FOREST;
  if (hash < 68) return TERRAIN.WATER;
  if (hash < 82) return TERRAIN.ROCK;
  return TERRAIN.LAVA;
}

// ── 城池定义 ────────────────────────────────────

export const INITIAL_CITIES = [
  // 青云门（中北）
  { id: "qingyun-hq",   faction: "qingyun",  tier: WORLD_CITY_TIERS.HQ,    q:  2, r: -18, name: "青云总部" },
  { id: "qingyun-l1",   faction: "qingyun",  tier: WORLD_CITY_TIERS.LARGE, q:  0, r: -14, name: "云顶城" },
  { id: "qingyun-l2",   faction: "qingyun",  tier: WORLD_CITY_TIERS.LARGE, q:  4, r: -16, name: "翠峰城" },
  { id: "qingyun-l3",   faction: "qingyun",  tier: WORLD_CITY_TIERS.LARGE, q:  6, r: -12, name: "碧霄城" },
  // 少林（中南）
  { id: "shaolin-hq",   faction: "shaolin",  tier: WORLD_CITY_TIERS.HQ,    q:  2, r:  18, name: "少林总部" },
  { id: "shaolin-l1",   faction: "shaolin",  tier: WORLD_CITY_TIERS.LARGE, q:  0, r:  14, name: "菩提城" },
  { id: "shaolin-l2",   faction: "shaolin",  tier: WORLD_CITY_TIERS.LARGE, q:  4, r:  16, name: "金刚城" },
  { id: "shaolin-l3",   faction: "shaolin",  tier: WORLD_CITY_TIERS.LARGE, q: -2, r:  12, name: "达摩城" },
  // 魔教（西北）
  { id: "mojiao-hq",    faction: "mojiao",   tier: WORLD_CITY_TIERS.HQ,    q: -18, r:  -8, name: "魔教总部" },
  { id: "mojiao-l1",    faction: "mojiao",   tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  -6, name: "焰窟城" },
  { id: "mojiao-l2",    faction: "mojiao",   tier: WORLD_CITY_TIERS.LARGE, q: -16, r:  -2, name: "血月城" },
  { id: "mojiao-l3",    faction: "mojiao",   tier: WORLD_CITY_TIERS.LARGE, q: -12, r: -10, name: "暗渊城" },
  // 教廷（正西）
  { id: "jiaoting-hq",  faction: "jiaoting", tier: WORLD_CITY_TIERS.HQ,    q: -20, r:   6, name: "教廷总部" },
  { id: "jiaoting-l1",  faction: "jiaoting", tier: WORLD_CITY_TIERS.LARGE, q: -16, r:   6, name: "圣城" },
  { id: "jiaoting-l2",  faction: "jiaoting", tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  10, name: "光辉城" },
  { id: "jiaoting-l3",  faction: "jiaoting", tier: WORLD_CITY_TIERS.LARGE, q: -18, r:   2, name: "裁判城" },
  // 仙岛（东偏北，临海）
  { id: "xiandao-hq",   faction: "xiandao",  tier: WORLD_CITY_TIERS.HQ,    q:  20, r: -10, name: "仙岛总部" },
  { id: "xiandao-l1",   faction: "xiandao",  tier: WORLD_CITY_TIERS.LARGE, q:  16, r:  -8, name: "灵虚城" },
  { id: "xiandao-l2",   faction: "xiandao",  tier: WORLD_CITY_TIERS.LARGE, q:  18, r:  -4, name: "蓬莱城" },
  { id: "xiandao-l3",   faction: "xiandao",  tier: WORLD_CITY_TIERS.LARGE, q:  14, r: -12, name: "云海城" },
  // 魂殿（西偏南）
  { id: "hundian-hq",   faction: "hundian",  tier: WORLD_CITY_TIERS.HQ,    q: -16, r:  18, name: "魂殿总部" },
  { id: "hundian-l1",   faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -12, r:  16, name: "幽冥城" },
  { id: "hundian-l2",   faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  14, name: "冥府城" },
  { id: "hundian-l3",   faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -10, r:  12, name: "鬼域城" },
];

export const NEUTRAL_SMALL_CITIES = [
  { id: "ns-01", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4, r: -10, name: "北隘关" },
  { id: "ns-02", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   0, r:  -8, name: "中原北镇" },
  { id: "ns-03", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8, r:  -6, name: "东北驿" },
  { id: "ns-04", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  12, r:  -4, name: "滨海关" },
  { id: "ns-05", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  10, r:   2, name: "东海道" },
  { id: "ns-06", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8, r:   6, name: "东南镇" },
  { id: "ns-07", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   4, r:  10, name: "南道中" },
  { id: "ns-08", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -2, r:   8, name: "中原南镇" },
  { id: "ns-09", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -6, r:  10, name: "西南驿" },
  { id: "ns-10", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10, r:   8, name: "西南关" },
  { id: "ns-11", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10, r:   4, name: "西道中" },
  { id: "ns-12", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -12, r:  -2, name: "西北驿" },
  { id: "ns-13", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10, r:  -6, name: "北西关" },
  { id: "ns-14", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -6, r:  -6, name: "北隘道" },
  { id: "ns-15", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   2, r:  -4, name: "中原驿" },
  { id: "ns-16", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   6, r:  -2, name: "东中道" },
  { id: "ns-17", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   4, r:   4, name: "中原东镇" },
  { id: "ns-18", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -2, r:   2, name: "中原心镇" },
  { id: "ns-19", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4, r:   4, name: "中原西镇" },
  { id: "ns-20", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -8, r:  -2, name: "西道驿" },
  { id: "ns-21", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  14, r:  -2, name: "仙道关" },
  { id: "ns-22", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -12, r:  -8, name: "魔西隘" },
  { id: "ns-23", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   6, r:  12, name: "南东镇" },
  { id: "ns-24", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4, r:  14, name: "南西镇" },
];

export const ALL_CITIES = [...INITIAL_CITIES, ...NEUTRAL_SMALL_CITIES];

// ── 城池控制工具 ────────────────────────────────

/** 从 worldState.cities 中查找某门派拥有的城池 */
export function citiesOwnedBy(faction, cities) {
  return cities.filter((c) => c.faction === faction);
}

/**
 * 判断某门派的三座大城是否全部被敌方占据
 * 用于触发全员决战
 */
export function isHQSurrounded(faction, cities) {
  const originalLargeCityIds = INITIAL_CITIES
    .filter((c) => c.faction === faction && c.tier === WORLD_CITY_TIERS.LARGE)
    .map((c) => c.id);

  return originalLargeCityIds.every((id) => {
    const current = cities.find((c) => c.id === id);
    return current && current.faction !== faction;
  });
}

/** 获取城池当前所有权 */
export function getCityOwner(cityId, cities) {
  const city = cities.find((c) => c.id === cityId);
  return city ? city.faction : null;
}

/** 创建初始 worldState.cities 数组 */
export function createInitialCityStates() {
  return ALL_CITIES.map((c) => ({ id: c.id, faction: c.faction }));
}
