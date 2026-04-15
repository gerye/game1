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
  // 青云门（正北，q=0,r=-30）
  { id: "qingyun-hq", faction: "qingyun", tier: WORLD_CITY_TIERS.HQ,    q:  0, r: -30, name: "青云总部" },
  { id: "qingyun-l1", faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q:  0, r: -20, name: "云顶城" },
  { id: "qingyun-l2", faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q: -8, r: -18, name: "翠峰城" },
  { id: "qingyun-l3", faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q:  8, r: -18, name: "碧霄城" },

  // 仙岛（东北，q=30,r=-30）
  { id: "isle-hq",    faction: "isle",    tier: WORLD_CITY_TIERS.HQ,    q: 30, r: -30, name: "仙岛总部" },
  { id: "isle-l1",    faction: "isle",    tier: WORLD_CITY_TIERS.LARGE, q: 20, r: -20, name: "灵虚城" },
  { id: "isle-l2",    faction: "isle",    tier: WORLD_CITY_TIERS.LARGE, q: 22, r: -12, name: "蓬莱城" },
  { id: "isle-l3",    faction: "isle",    tier: WORLD_CITY_TIERS.LARGE, q: 12, r: -22, name: "云海城" },

  // 少林（正东，q=30,r=0）
  { id: "shaolin-hq", faction: "shaolin", tier: WORLD_CITY_TIERS.HQ,    q: 30, r:   0, name: "少林总部" },
  { id: "shaolin-l1", faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q: 20, r:   0, name: "菩提城" },
  { id: "shaolin-l2", faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q: 18, r:  -8, name: "金刚城" },
  { id: "shaolin-l3", faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q: 18, r:   8, name: "达摩城" },

  // 教廷（正南，q=0,r=30）
  { id: "palace-hq",  faction: "palace",  tier: WORLD_CITY_TIERS.HQ,    q:  0, r:  30, name: "教廷总部" },
  { id: "palace-l1",  faction: "palace",  tier: WORLD_CITY_TIERS.LARGE, q:  0, r:  20, name: "圣城" },
  { id: "palace-l2",  faction: "palace",  tier: WORLD_CITY_TIERS.LARGE, q:  8, r:  18, name: "光辉城" },
  { id: "palace-l3",  faction: "palace",  tier: WORLD_CITY_TIERS.LARGE, q: -8, r:  18, name: "裁判城" },

  // 魔教（西南，q=-30,r=30）
  { id: "demon-hq",   faction: "demon",   tier: WORLD_CITY_TIERS.HQ,    q: -30, r:  30, name: "魔教总部" },
  { id: "demon-l1",   faction: "demon",   tier: WORLD_CITY_TIERS.LARGE, q: -20, r:  20, name: "焰窟城" },
  { id: "demon-l2",   faction: "demon",   tier: WORLD_CITY_TIERS.LARGE, q: -12, r:  22, name: "血月城" },
  { id: "demon-l3",   faction: "demon",   tier: WORLD_CITY_TIERS.LARGE, q: -22, r:  12, name: "暗渊城" },

  // 魂殿（正西，q=-30,r=0）
  { id: "soul-hq",    faction: "soul",    tier: WORLD_CITY_TIERS.HQ,    q: -30, r:   0, name: "魂殿总部" },
  { id: "soul-l1",    faction: "soul",    tier: WORLD_CITY_TIERS.LARGE, q: -20, r:   0, name: "幽冥城" },
  { id: "soul-l2",    faction: "soul",    tier: WORLD_CITY_TIERS.LARGE, q: -18, r:  -8, name: "冥府城" },
  { id: "soul-l3",    faction: "soul",    tier: WORLD_CITY_TIERS.LARGE, q: -18, r:   8, name: "鬼域城" },
];

export const NEUTRAL_SMALL_CITIES = [
  // 青云↔仙岛 间隙
  { id: "sc-01", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  10, r: -22, name: "北峡关" },
  { id: "sc-02", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  14, r: -16, name: "东北驿" },
  // 仙岛↔少林 间隙
  { id: "sc-03", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  22, r: -10, name: "海峡镇" },
  { id: "sc-04", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  18, r:  -4, name: "东海道" },
  // 少林↔教廷 间隙
  { id: "sc-05", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  18, r:  10, name: "东南关" },
  { id: "sc-06", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  12, r:  16, name: "南港镇" },
  // 教廷↔魔教 间隙
  { id: "sc-07", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4, r:  22, name: "南隘关" },
  { id: "sc-08", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10, r:  20, name: "西南驿" },
  // 魔教↔魂殿 间隙
  { id: "sc-09", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -22, r:  14, name: "西峡镇" },
  { id: "sc-10", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -20, r:  10, name: "西道关" },
  // 魂殿↔青云 间隙
  { id: "sc-11", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10, r: -16, name: "北西驿" },
  { id: "sc-12", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -16, r:  -8, name: "西北关" },
  // 中央区域（6 座，各派必争之地）
  { id: "sc-13", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   0, r:  -8, name: "北中原" },
  { id: "sc-14", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8, r:  -4, name: "东中原" },
  { id: "sc-15", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8, r:   4, name: "东南中原" },
  { id: "sc-16", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   0, r:   8, name: "南中原" },
  { id: "sc-17", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -8, r:   4, name: "西中原" },
  { id: "sc-18", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -8, r:  -4, name: "西北中原" },
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

/**
 * 预计算城市领地（Voronoi）：每个地图格子归属于距离最近的城池
 * 返回 { [cityId]: string[] } 其中 string[] 是 "q,r" 格式的 hex key 列表
 * 一次性在 createWorldState() 时调用，结果存入 worldState.cityTerritories
 */
export function buildCityTerritories() {
  const cityPositions = ALL_CITIES.map((c) => ({ id: c.id, q: c.q, r: c.r }));
  const territories = Object.fromEntries(ALL_CITIES.map((c) => [c.id, []]));

  for (let q = -WORLD_MAP_RADIUS; q <= WORLD_MAP_RADIUS; q++) {
    for (let r = -WORLD_MAP_RADIUS; r <= WORLD_MAP_RADIUS; r++) {
      if (!inBounds(q, r)) continue;
      let nearestId = null;
      let nearestDist = Infinity;
      for (const city of cityPositions) {
        const d = hexDistance(q, r, city.q, city.r);
        if (d < nearestDist) { nearestDist = d; nearestId = city.id; }
      }
      if (nearestId) territories[nearestId].push(`${q},${r}`);
    }
  }
  return territories;
}
