# 江湖世界地图系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent hexagonal world map where the six factions hold cities, accrue prestige from large events, and expand/lose territory over time—while the player acts as an arbiter who can watch the situation unfold and occasionally intervene.

**Architecture:** Five new modules (`world-map`, `faction-state`, `world-tick`, `world-events`, `world-ui`) plus targeted changes to `config.js`, `storage.js`, `storage-normalizer.js`, and `app.js`. World state is persisted as a single JSON blob in the `meta` IndexedDB store under the key `worldState`. The Canvas rendering reuses the hex math from `battle-system.js` at a much larger scale. All character AI management is inside `world-tick.js`; large event prestige hooks live in `world-events.js`.

**Tech Stack:** JavaScript ES6 modules, Canvas 2D API (hex rendering), IndexedDB via existing `storage.js` API.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/config.js` | Modify | Add world map constants, META_KEYS.WORLD_STATE, STORES.worldState |
| `src/storage.js` | Modify | Add `getWorldState` / `putWorldState` to storage API |
| `src/storage-normalizer.js` | Modify | Bump DB_VERSION to 11, add worldState store migration |
| `src/world-map.js` | Create | Hex grid data structure, terrain map, city placement, control calculations |
| `src/faction-state.js` | Create | Faction 声望/金币 state, city ownership, prestige award, gold tick |
| `src/world-tick.js` | Create | World clock, 时节 advancement, character state machine, small events |
| `src/world-events.js` | Create | Large event hooks: prestige distribution, 攻城战 initiation, 全员决战 trigger |
| `src/world-ui.js` | Create | Canvas world map rendering, faction color fill, arbiter panel DOM |
| `src/app.js` | Modify | Add "世界地图" tab, wire world state init + arbiter panel actions |
| `index.html` | Modify | Add world map tab button and canvas container |

---

## Task 1: Config constants + storage schema

**Files:**
- Modify: `src/config.js`
- Modify: `src/storage.js`
- Modify: `src/storage-normalizer.js`

- [ ] **Step 1: Add world map constants to `src/config.js`**

Add at the end of the file:

```javascript
// ──────────────────────────────────────────────
// 世界地图常量
// ──────────────────────────────────────────────

export const WORLD_MAP_RADIUS = 40;  // 地图格子半径（约 40×40）

export const WORLD_PRESTIGE_COSTS = {
  captureNeutral:   500,   // 占领空白小城
  attackSmallCity:  1000,  // 攻打敌方小城
  attackLargeCity:  2500,  // 攻打敌方大城
};

export const WORLD_PRESTIGE_REWARDS = {
  jianghuWin:      100,   // 江湖争霸胜方
  tournament: [800, 480, 250, 250, 100, 100, 100, 100],  // index 0=1st ... 7=8th
  ranking:   [1000, 600, 300, 300, 150, 150, 150, 150, 50, 50, 50, 50], // index 0..11
};

export const WORLD_GOLD_TICK = {
  smallCity:  20,   // 每时节小城产出金币
  largeCity:  60,   // 每时节大城产出金币
  hq:         100,  // 每时节总部产出金币
  borderBonus: 0.5, // 边境城池金币倍率加成（×1.5）
};

export const WORLD_CHARACTER_STATES = Object.freeze({
  GARRISON:  "garrison",   // 驻守
  ROAMING:   "roaming",    // 漫游
  CAMPAIGN:  "campaign",   // 出征
});

export const WORLD_CITY_TIERS = Object.freeze({
  HQ:    "hq",
  LARGE: "large",
  SMALL: "small",
});
```

Then extend `META_KEYS`:

```javascript
// In META_KEYS block, add:
WORLD_STATE: "worldState"
```

- [ ] **Step 2: Add `getWorldState` / `putWorldState` to `src/storage.js`**

In the `openDb` function (around line 263), inside `onupgradeneeded`, add after the existing `ensureStore` calls:

```javascript
ensureStore(db, "worldState", "key");
```

In the `createStorage()` return object, add two new methods after `getMeta`:

```javascript
getWorldState: () => storeApi.getMeta("worldState"),
putWorldState: (state) => storeApi.saveMeta("worldState", state),
```

- [ ] **Step 3: Bump DB_VERSION and add migration in `src/storage-normalizer.js`**

In `src/config.js`, change:
```javascript
export const DB_VERSION = 10;
```
to:
```javascript
export const DB_VERSION = 11;
```

In `src/storage-normalizer.js`, add the migration awareness comment (the store is auto-created by `ensureStore` during `onupgradeneeded` whenever the DB version bumps):

```javascript
// DB v11: added worldState store for 江湖世界地图 persistent state
// Store is created automatically by openDb() ensureStore call.
```

- [ ] **Step 4: Verify in browser console**

Open the game in Chrome. Open DevTools → Application → IndexedDB → BottleCapBattleDB. Confirm a `meta` store exists (already exists; `worldState` key will appear after first `putWorldState` call). No errors on page load.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/storage.js src/storage-normalizer.js
git commit -m "feat: add world map config constants and storage schema (DB v11)"
```

---

## Task 2: World map data structure (`src/world-map.js`)

**Files:**
- Create: `src/world-map.js`

This module owns the **static** map: hex grid coordinates, terrain types, city definitions, and city control state.

- [ ] **Step 1: Create `src/world-map.js` with hex utilities**

```javascript
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

/** 两格之间的六边形距离 */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

/** 判断格子是否在地图范围内 */
export function inBounds(q, r) {
  return hexDistance(0, 0, q, r) <= WORLD_MAP_RADIUS;
}
```

- [ ] **Step 2: Add terrain type definitions and terrain generation**

Append to `src/world-map.js`:

```javascript
// ── 地形类型 ───────────────────────────────────

export const TERRAIN = Object.freeze({
  PLAIN:   "plain",    // 平原
  FOREST:  "forest",  // 森林
  WATER:   "water",   // 水域
  ROCK:    "rock",    // 岩石
  LAVA:    "lava",    // 熔岩
  MOUNTAIN:"mountain",// 大山（不可通行）
  STEPPE:  "steppe",  // 草原（北方边疆）
  SEA:     "sea",     // 大海（东方边界）
});

// 地形颜色（Canvas 填色）
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
 * 根据格子坐标决定地形（简单的确定性规则，后续可手调）
 * 北方（r < -28）→ 草原
 * 南方（r > 28 且 q < 5）→ 大山
 * 西方（q < -28）→ 大山
 * 东方（q > 28 且 r < 5）→ 大海
 * 中原：用哈希种子随机分配五种地形
 */
export function getTerrainAt(q, r) {
  const dist = hexDistance(0, 0, q, r);
  if (dist > WORLD_MAP_RADIUS) return null;

  // 边界地形
  if (r < -28) return TERRAIN.STEPPE;
  if (r > 28 && q < 5) return TERRAIN.MOUNTAIN;
  if (q < -28) return TERRAIN.MOUNTAIN;
  if (q > 28 && r < 5) return TERRAIN.SEA;

  // 中原五地形（简单哈希分配，固定种子）
  const hash = Math.abs((q * 31 + r * 17 + q * r * 7) % 100);
  if (hash < 35) return TERRAIN.PLAIN;
  if (hash < 55) return TERRAIN.FOREST;
  if (hash < 68) return TERRAIN.WATER;
  if (hash < 82) return TERRAIN.ROCK;
  return TERRAIN.LAVA;
}
```

- [ ] **Step 3: Add city definitions (fixed positions per design spec)**

Append to `src/world-map.js`:

```javascript
// ── 城池定义 ────────────────────────────────────

/**
 * 六大门派初始城池布局
 * 每派：1 总部 + 3 大城 + 若干小城（共计约 36 小城均匀分布边界带）
 *
 * 坐标系：偏移六边形 (q, r)，原点地图中心
 * 正方向：q 向右，r 向下
 */
export const INITIAL_CITIES = [
  // ── 青云门（中北） ──
  { id: "qingyun-hq",    faction: "qingyun", tier: WORLD_CITY_TIERS.HQ,    q:  2,  r: -18, name: "青云总部" },
  { id: "qingyun-l1",    faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q:  0,  r: -14, name: "云顶城" },
  { id: "qingyun-l2",    faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q:  4,  r: -16, name: "翠峰城" },
  { id: "qingyun-l3",    faction: "qingyun", tier: WORLD_CITY_TIERS.LARGE, q:  6,  r: -12, name: "碧霄城" },

  // ── 少林（中南） ──
  { id: "shaolin-hq",    faction: "shaolin", tier: WORLD_CITY_TIERS.HQ,    q:  2,  r:  18, name: "少林总部" },
  { id: "shaolin-l1",    faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q:  0,  r:  14, name: "菩提城" },
  { id: "shaolin-l2",    faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q:  4,  r:  16, name: "金刚城" },
  { id: "shaolin-l3",    faction: "shaolin", tier: WORLD_CITY_TIERS.LARGE, q: -2,  r:  12, name: "达摩城" },

  // ── 魔教（西北） ──
  { id: "mojiao-hq",     faction: "mojiao",  tier: WORLD_CITY_TIERS.HQ,    q: -18, r:  -8, name: "魔教总部" },
  { id: "mojiao-l1",     faction: "mojiao",  tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  -6, name: "焰窟城" },
  { id: "mojiao-l2",     faction: "mojiao",  tier: WORLD_CITY_TIERS.LARGE, q: -16, r:  -2, name: "血月城" },
  { id: "mojiao-l3",     faction: "mojiao",  tier: WORLD_CITY_TIERS.LARGE, q: -12, r: -10, name: "暗渊城" },

  // ── 教廷（正西） ──
  { id: "jiaoting-hq",   faction: "jiaoting",tier: WORLD_CITY_TIERS.HQ,    q: -20, r:   6, name: "教廷总部" },
  { id: "jiaoting-l1",   faction: "jiaoting",tier: WORLD_CITY_TIERS.LARGE, q: -16, r:   6, name: "圣城" },
  { id: "jiaoting-l2",   faction: "jiaoting",tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  10, name: "光辉城" },
  { id: "jiaoting-l3",   faction: "jiaoting",tier: WORLD_CITY_TIERS.LARGE, q: -18, r:   2, name: "裁判城" },

  // ── 仙岛（东偏北，临海） ──
  { id: "xiandao-hq",    faction: "xiandao", tier: WORLD_CITY_TIERS.HQ,    q:  20, r: -10, name: "仙岛总部" },
  { id: "xiandao-l1",    faction: "xiandao", tier: WORLD_CITY_TIERS.LARGE, q:  16, r:  -8, name: "灵虚城" },
  { id: "xiandao-l2",    faction: "xiandao", tier: WORLD_CITY_TIERS.LARGE, q:  18, r:  -4, name: "蓬莱城" },
  { id: "xiandao-l3",    faction: "xiandao", tier: WORLD_CITY_TIERS.LARGE, q:  14, r: -12, name: "云海城" },

  // ── 魂殿（西偏南） ──
  { id: "hundian-hq",    faction: "hundian",  tier: WORLD_CITY_TIERS.HQ,    q: -16, r:  18, name: "魂殿总部" },
  { id: "hundian-l1",    faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -12, r:  16, name: "幽冥城" },
  { id: "hundian-l2",    faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -14, r:  14, name: "冥府城" },
  { id: "hundian-l3",    faction: "hundian",  tier: WORLD_CITY_TIERS.LARGE, q: -10, r:  12, name: "鬼域城" },
];

// 边界带小城（中立，可争夺）——24 座，均匀分布在六派交界处
export const NEUTRAL_SMALL_CITIES = [
  { id: "ns-01", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4,  r: -10, name: "北隘关" },
  { id: "ns-02", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   0,  r:  -8, name: "中原北镇" },
  { id: "ns-03", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8,  r:  -6, name: "东北驿" },
  { id: "ns-04", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  12,  r:  -4, name: "滨海关" },
  { id: "ns-05", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  10,  r:   2, name: "东海道" },
  { id: "ns-06", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   8,  r:   6, name: "东南镇" },
  { id: "ns-07", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   4,  r:  10, name: "南道中" },
  { id: "ns-08", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -2,  r:   8, name: "中原南镇" },
  { id: "ns-09", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -6,  r:  10, name: "西南驿" },
  { id: "ns-10", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10,  r:   8, name: "西南关" },
  { id: "ns-11", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10,  r:   4, name: "西道中" },
  { id: "ns-12", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -12,  r:  -2, name: "西北驿" },
  { id: "ns-13", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -10,  r:  -6, name: "北西关" },
  { id: "ns-14", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -6,  r:  -6, name: "北隘道" },
  { id: "ns-15", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   2,  r:  -4, name: "中原驿" },
  { id: "ns-16", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   6,  r:  -2, name: "东中道" },
  { id: "ns-17", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   4,  r:   4, name: "中原东镇" },
  { id: "ns-18", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -2,  r:   2, name: "中原心镇" },
  { id: "ns-19", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4,  r:   4, name: "中原西镇" },
  { id: "ns-20", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -8,  r:  -2, name: "西道驿" },
  { id: "ns-21", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  14,  r:  -2, name: "仙道关" },
  { id: "ns-22", faction: null, tier: WORLD_CITY_TIERS.SMALL, q: -12,  r:  -8, name: "魔西隘" },
  { id: "ns-23", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:   6,  r:  12, name: "南东镇" },
  { id: "ns-24", faction: null, tier: WORLD_CITY_TIERS.SMALL, q:  -4,  r:  14, name: "南西镇" },
];

export const ALL_CITIES = [...INITIAL_CITIES, ...NEUTRAL_SMALL_CITIES];
```

- [ ] **Step 4: Add city control helpers**

Append to `src/world-map.js`:

```javascript
// ── 城池控制工具 ────────────────────────────────

/**
 * 从 worldState.cities 中计算某门派拥有的城池列表
 * @param {Object[]} cities  worldState.cities 数组
 * @param {string}   faction 门派 ID
 * @returns {Object[]}
 */
export function citiesOwnedBy(faction, cities) {
  return cities.filter((c) => c.faction === faction);
}

/**
 * 某门派的三座大城是否全部被敌方占据
 * @returns {boolean}
 */
export function isHQSurrounded(faction, cities) {
  const largeCitiesOwned = INITIAL_CITIES
    .filter((c) => c.faction === faction && c.tier === WORLD_CITY_TIERS.LARGE)
    .map((c) => c.id);

  return largeCitiesOwned.every((id) => {
    const current = cities.find((c) => c.id === id);
    return current && current.faction !== faction;
  });
}

/**
 * 获取城池的当前所有权（从 worldState.cities 中查找）
 * @returns {string|null} faction ID 或 null（中立）
 */
export function getCityOwner(cityId, cities) {
  const city = cities.find((c) => c.id === cityId);
  return city ? city.faction : null;
}

/**
 * 创建初始 worldState.cities 数组（从 ALL_CITIES 克隆）
 */
export function createInitialCityStates() {
  return ALL_CITIES.map((c) => ({ id: c.id, faction: c.faction }));
}
```

- [ ] **Step 5: Commit**

```bash
git add src/world-map.js
git commit -m "feat: world-map hex grid, terrain, city definitions and control helpers"
```

---

## Task 3: Faction state module (`src/faction-state.js`)

**Files:**
- Create: `src/faction-state.js`

This module owns the **mutable** faction-level state: 声望, 金币, and convenience queries over city ownership.

- [ ] **Step 1: Create `src/faction-state.js`**

```javascript
// src/faction-state.js
// 门派三维状态：声望 / 金币 / 城池控制逻辑

import { WORLD_GOLD_TICK, WORLD_CITY_TIERS } from "./config.js";
import { ALL_CITIES, citiesOwnedBy, INITIAL_CITIES } from "./world-map.js";

// ── 六大门派 ID ────────────────────────────────
export const FACTION_IDS = ["qingyun", "shaolin", "mojiao", "jiaoting", "xiandao", "hundian"];

/**
 * 创建初始门派状态（首次启动时用）
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
 * @param {Object} factionStats  worldState.factionStats
 * @param {string} factionId
 * @param {number} amount
 * @returns {Object} 新的 factionStats（不修改原对象）
 */
export function addPrestige(factionStats, factionId, amount) {
  const updated = { ...factionStats };
  updated[factionId] = { ...updated[factionId], prestige: (updated[factionId]?.prestige || 0) + amount };
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
 * 规则：小城 20/大城 60/总部 100；边境城池（被敌方城池包围的城）产出 ×1.5
 * @param {Object} factionStats
 * @param {Object[]} cityStates  worldState.cities
 * @returns {Object} 新的 factionStats
 */
export function tickGoldProduction(factionStats, cityStates) {
  const updated = { ...factionStats };

  cityStates.forEach(({ id, faction }) => {
    if (!faction) return;  // 中立城池不产出

    const template = ALL_CITIES.find((c) => c.id === id);
    if (!template) return;

    let base = 0;
    if (template.tier === WORLD_CITY_TIERS.SMALL)  base = WORLD_GOLD_TICK.smallCity;
    if (template.tier === WORLD_CITY_TIERS.LARGE)  base = WORLD_GOLD_TICK.largeCity;
    if (template.tier === WORLD_CITY_TIERS.HQ)     base = WORLD_GOLD_TICK.hq;

    // 边境加成：周边任意一座城池属于不同门派
    const isBorder = isBorderCity(id, faction, cityStates);
    const output = Math.round(base * (isBorder ? 1 + WORLD_GOLD_TICK.borderBonus : 1));

    updated[faction] = {
      ...updated[faction],
      gold: (updated[faction]?.gold || 0) + output,
    };
  });

  return updated;
}

/**
 * 判断城池是否为边境城池（周边存在敌方城池）
 */
function isBorderCity(cityId, ownerFaction, cityStates) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  if (!template) return false;

  return ALL_CITIES.some((neighbor) => {
    if (neighbor.id === cityId) return false;
    const dist = Math.abs(template.q - neighbor.q) + Math.abs(template.r - neighbor.r);
    if (dist > 3) return false;  // 粗略相邻判断（非精确六边形）
    const state = cityStates.find((s) => s.id === neighbor.id);
    return state && state.faction && state.faction !== ownerFaction;
  });
}

// ── 攻城结果应用 ────────────────────────────────

/**
 * 将城池所有权转移给新门派
 * @param {Object[]} cityStates
 * @param {string} cityId
 * @param {string|null} newFaction  null = 中立
 * @returns {Object[]} 新的 cityStates
 */
export function transferCity(cityStates, cityId, newFaction) {
  return cityStates.map((c) =>
    c.id === cityId ? { ...c, faction: newFaction } : c
  );
}

// ── 门派实力评分 ────────────────────────────────

/**
 * 计算各门派"实力"数值（仅用于 UI 展示）
 * = 总部控制(100) + 大城数量(×30) + 小城数量(×10) + 声望(×0.1)
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
```

- [ ] **Step 2: Commit**

```bash
git add src/faction-state.js
git commit -m "feat: faction-state prestige/gold accounting and city transfer helpers"
```

---

## Task 4: World state initialization and storage wiring (`src/world-tick.js` — part 1)

**Files:**
- Create: `src/world-tick.js`

The world state is a single JS object stored via `storage.putWorldState`. This task creates the shape of that object and the init/load logic.

- [ ] **Step 1: Create `src/world-tick.js` with world state schema and init**

```javascript
// src/world-tick.js
// 世界时钟：时节推进、角色状态机、小事件

import { WORLD_CHARACTER_STATES, META_KEYS } from "./config.js";
import { createInitialFactionStats, FACTION_IDS, tickGoldProduction } from "./faction-state.js";
import { createInitialCityStates } from "./world-map.js";

// ── 世界状态结构 ────────────────────────────────
//
// worldState = {
//   season: number,            // 当前时节编号（从 1 递增）
//   factionStats: {            // 门派三维状态
//     [factionId]: { prestige, gold }
//   },
//   cities: [                  // 城池当前所有权
//     { id: string, faction: string|null }
//   ],
//   characterStates: {         // 角色当前状态（由 AI 管理）
//     [buildId]: {
//       state: "garrison"|"roaming"|"campaign",
//       cityId: string|null,     // 驻守的城池（garrison时）
//       q: number,               // 漫游位置
//       r: number,
//       injured: boolean,        // 重伤状态
//       injuredUntilSeason: number, // 几时节后解除重伤
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
    log: ["江湖初开，六派鼎立。"],
  };
}

/**
 * 确保所有角色都有初始状态（新角色加入时调用）
 * @param {Object} worldState
 * @param {Object[]} builds  所有角色 build 对象（需有 buildId, faction 字段）
 * @returns {Object} 更新后的 worldState
 */
export function syncCharacterStates(worldState, builds) {
  const updated = { ...worldState, characterStates: { ...worldState.characterStates } };
  builds.forEach((build) => {
    if (!updated.characterStates[build.buildId]) {
      // 新角色默认驻守本门派总部
      const hqCity = worldState.cities.find((c) => {
        const template = import("./world-map.js"); // lazy, see note below
        return false; // placeholder — resolved in full impl (see Step 2)
      });
      updated.characterStates[build.buildId] = {
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: `${build.faction}-hq`,
        q: 0,
        r: 0,
        injured: false,
        injuredUntilSeason: 0,
      };
    }
  });
  return updated;
}
```

- [ ] **Step 2: Fix the `syncCharacterStates` implementation (remove lazy import placeholder)**

Replace the `syncCharacterStates` function body with the correct implementation:

```javascript
export function syncCharacterStates(worldState, builds) {
  const updated = { ...worldState, characterStates: { ...worldState.characterStates } };
  builds.forEach((build) => {
    if (!updated.characterStates[build.buildId]) {
      updated.characterStates[build.buildId] = {
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: `${build.faction}-hq`,
        q: 0,
        r: 0,
        injured: false,
        injuredUntilSeason: 0,
      };
    }
  });
  return updated;
}
```

- [ ] **Step 3: Add world log helper**

Append to `src/world-tick.js`:

```javascript
// ── 日志工具 ────────────────────────────────────

const WORLD_LOG_LIMIT = 50;

export function addWorldLog(worldState, message) {
  const log = [...(worldState.log || []), message].slice(-WORLD_LOG_LIMIT);
  return { ...worldState, log };
}
```

- [ ] **Step 4: Add the time-step function (时节推进)**

Append to `src/world-tick.js`:

```javascript
// ── 时节推进 ────────────────────────────────────

/**
 * 推进一个时节
 * - 结算金币产出
 * - AI 调整角色状态（驻守 / 漫游随机切换）
 * - 触发漫游小事件
 * - 解除到期重伤状态
 * @param {Object} worldState
 * @param {Object[]} builds  所有角色 builds（含 buildId, faction）
 * @returns {Object} 新的 worldState
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

  // 3. AI 角色状态切换（非出征角色，随机漫游/驻守）
  ws = aiUpdateCharacterStates(ws, builds);

  // 4. 漫游小事件
  ws = triggerRoamingEvents(ws, builds);

  ws = addWorldLog(ws, `第 ${ws.season} 时节：各派积蓄力量。`);
  return ws;
}

// ── AI 角色状态切换 ──────────────────────────────

function aiUpdateCharacterStates(worldState, builds) {
  const updated = { ...worldState.characterStates };

  builds.forEach((build) => {
    const cs = updated[build.buildId];
    if (!cs || cs.state === WORLD_CHARACTER_STATES.CAMPAIGN) return;

    // 重伤角色强制驻守
    if (cs.injured) {
      updated[build.buildId] = { ...cs, state: WORLD_CHARACTER_STATES.GARRISON, cityId: `${build.faction}-hq` };
      return;
    }

    // 40% 概率切换到漫游，60% 驻守
    const roll = seededRand(build.buildId + worldState.season);
    if (roll < 0.4) {
      updated[build.buildId] = { ...cs, state: WORLD_CHARACTER_STATES.ROAMING };
    } else {
      // 驻守在己方随机城池
      const ownedCities = worldState.cities.filter((c) => c.faction === build.faction);
      const target = ownedCities.length
        ? ownedCities[Math.floor(roll * ownedCities.length)]
        : { id: `${build.faction}-hq` };
      updated[build.buildId] = {
        ...cs,
        state: WORLD_CHARACTER_STATES.GARRISON,
        cityId: target.id,
      };
    }
  });

  return { ...worldState, characterStates: updated };
}

// 简单确定性随机（0~1）
function seededRand(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

// ── 漫游小事件 ──────────────────────────────────

const ROAMING_EVENT_TYPES = [
  { type: "xp",       weight: 40, desc: "奇遇修炼", xpGain: 50 },
  { type: "gold",     weight: 30, desc: "发现宝藏", goldGain: 30 },
  { type: "prestige", weight: 20, desc: "行侠仗义", prestigeGain: 5 },
  { type: "duel",     weight: 10, desc: "邂逅对手" },
];

function triggerRoamingEvents(worldState, builds) {
  let ws = worldState;
  const roamers = builds.filter((b) => {
    const cs = ws.characterStates[b.buildId];
    return cs && cs.state === WORLD_CHARACTER_STATES.ROAMING;
  });

  roamers.forEach((build) => {
    const roll = seededRand(build.buildId + "event" + ws.season);
    let cumWeight = 0;
    const total = ROAMING_EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
    let chosen = ROAMING_EVENT_TYPES[0];
    for (const ev of ROAMING_EVENT_TYPES) {
      cumWeight += ev.weight / total;
      if (roll < cumWeight) { chosen = ev; break; }
    }

    if (chosen.type === "prestige") {
      const { addPrestige } = await import("./faction-state.js"); // static import at top required
      // Note: prestige added inline below since this is sync
    }
    // Prestige and gold small amounts just get logged; actual award
    // happens via addWorldLog — the persistent delta is applied in
    // world-events.js large events which carry the real weight.
    // Small roaming events are narrative only for v1.
    ws = addWorldLog(ws, `${build.name || build.buildId} ${chosen.desc}。`);
  });

  return ws;
}
```

- [ ] **Step 5: Fix the async import issue in `triggerRoamingEvents` — use static imports**

The file already uses top-level static imports. Remove the dynamic import from `triggerRoamingEvents` and add `addPrestige` to the top-level import:

In the import section at the top of `src/world-tick.js`, the import from `faction-state.js` already includes `tickGoldProduction`. Add `addPrestige` and `FACTION_IDS`:

```javascript
import { createInitialFactionStats, FACTION_IDS, tickGoldProduction, addPrestige } from "./faction-state.js";
```

Then in `triggerRoamingEvents`, replace the problematic block with:

```javascript
if (chosen.type === "prestige" && chosen.prestigeGain) {
  ws = {
    ...ws,
    factionStats: addPrestige(ws.factionStats, build.faction, chosen.prestigeGain),
  };
}
if (chosen.type === "gold" && chosen.goldGain) {
  const updated = { ...ws.factionStats };
  updated[build.faction] = {
    ...updated[build.faction],
    gold: (updated[build.faction]?.gold || 0) + chosen.goldGain,
  };
  ws = { ...ws, factionStats: updated };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/world-tick.js
git commit -m "feat: world-tick season advancement, character state machine, roaming events"
```

---

## Task 5: Large event prestige hooks (`src/world-events.js`)

**Files:**
- Create: `src/world-events.js`

This module handles prestige distribution after large events, 攻城战 initiation by faction AI, and 全员决战 trigger.

- [ ] **Step 1: Create `src/world-events.js`**

```javascript
// src/world-events.js
// 大事件：声望分配、攻城战、全员决战

import {
  WORLD_PRESTIGE_REWARDS, WORLD_PRESTIGE_COSTS, WORLD_CITY_TIERS
} from "./config.js";
import {
  addPrestige, spendPrestige, transferCity, FACTION_IDS
} from "./faction-state.js";
import { isHQSurrounded, ALL_CITIES } from "./world-map.js";
import { addWorldLog } from "./world-tick.js";

// ── 声望分配 ─────────────────────────────────────

/**
 * 江湖争霸结束后调用：胜方获得 100 声望
 * @param {Object} worldState
 * @param {string} winnerFaction  胜方门派 ID
 * @returns {Object} 新的 worldState
 */
export function applyJianghuPrestige(worldState, winnerFaction) {
  const amount = WORLD_PRESTIGE_REWARDS.jianghuWin;
  return {
    ...worldState,
    factionStats: addPrestige(worldState.factionStats, winnerFaction, amount),
    ...addWorldLog(worldState, `江湖争霸：${winnerFaction} 获胜，斩获 ${amount} 声望。`),
  };
}

/**
 * 武道会/排位赛结束后调用：按名次分发声望
 * @param {Object} worldState
 * @param {"tournament"|"ranking"} eventType
 * @param {string[]} rankedFactions  门派 ID 数组，按名次排序（第 0 位 = 冠军）
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
  return {
    ...worldState,
    factionStats,
    log: [...(worldState.log || []), `${eventName}声望结算：${logParts.join("、")}。`].slice(-50),
  };
}

// ── 攻城战 ───────────────────────────────────────

/**
 * 门派 AI 决策：是否发起攻城，并扣减声望
 * 规则：声望 >= 攻城费用且目标城池是边界城池时，以 30% 概率发起攻城
 *
 * @param {Object} worldState
 * @param {string} attackerFaction
 * @param {string} cityId  目标城池 ID
 * @returns {{ worldState: Object, launched: boolean }}
 */
export function tryLaunchSiege(worldState, attackerFaction, cityId) {
  const template = ALL_CITIES.find((c) => c.id === cityId);
  if (!template) return { worldState, launched: false };

  const cost =
    template.tier === WORLD_CITY_TIERS.SMALL &&
    worldState.cities.find((c) => c.id === cityId)?.faction === null
      ? WORLD_PRESTIGE_COSTS.captureNeutral
      : template.tier === WORLD_CITY_TIERS.LARGE
      ? WORLD_PRESTIGE_COSTS.attackLargeCity
      : WORLD_PRESTIGE_COSTS.attackSmallCity;

  const { ok, factionStats } = spendPrestige(worldState.factionStats, attackerFaction, cost);
  if (!ok) return { worldState, launched: false };

  return {
    worldState: {
      ...worldState,
      factionStats,
      log: [...(worldState.log || []), `${attackerFaction} 发起攻城战，目标：${template.name}（消耗 ${cost} 声望）。`].slice(-50),
    },
    launched: true,
  };
}

/**
 * 攻城战结束后调用（战斗结果已由 battle-system 决出）
 * @param {Object} worldState
 * @param {string} cityId
 * @param {string} winnerFaction  攻方胜利传 attackerFaction；守方胜利传守方门派 ID
 * @param {string} attackerFaction
 */
export function applySiegeResult(worldState, cityId, winnerFaction, attackerFaction) {
  const wasOwnedBy = worldState.cities.find((c) => c.id === cityId)?.faction;
  if (winnerFaction !== attackerFaction) {
    // 守方获胜，城池不变
    return addWorldLog(worldState, `攻城战：${attackerFaction} 攻打 ${cityId} 失败，${wasOwnedBy ?? "中立"} 守住。`);
  }
  // 攻方获胜
  const cities = transferCity(worldState.cities, cityId, attackerFaction);
  let ws = { ...worldState, cities };
  ws = addWorldLog(ws, `攻城战：${attackerFaction} 占领 ${cityId}！`);

  // 检查全员决战触发条件
  if (wasOwnedBy && wasOwnedBy !== attackerFaction) {
    ws = checkAndTriggerLastStand(ws, wasOwnedBy);
  }
  return ws;
}

// ── 全员决战 ─────────────────────────────────────

/**
 * 当某门派三座大城全部易手时，检查是否触发全员决战
 */
export function checkAndTriggerLastStand(worldState, faction) {
  if (!isHQSurrounded(faction, worldState.cities)) return worldState;

  return addWorldLog(
    { ...worldState, pendingLastStand: { faction, triggeredSeason: worldState.season } },
    `危急！${faction} 三座大城尽失，全员决战即将爆发！`
  );
}

/**
 * 全员决战结束后调用
 * @param {Object} worldState
 * @param {string} loserFaction  被灭门派
 * @param {string} winnerFaction 获胜门派
 */
export function applyLastStandResult(worldState, loserFaction, winnerFaction) {
  let ws = { ...worldState, pendingLastStand: null };

  // 失败：输方所有城池（含总部）归获胜方
  const allCityIds = ws.cities
    .filter((c) => c.faction === loserFaction)
    .map((c) => c.id);

  let cities = [...ws.cities];
  allCityIds.forEach((id) => {
    cities = transferCity(cities, id, winnerFaction);
  });

  ws = { ...ws, cities };
  ws = addWorldLog(ws, `全员决战：${loserFaction} 覆灭，并入 ${winnerFaction}！`);
  return ws;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/world-events.js
git commit -m "feat: world-events prestige distribution, siege logic, faction extinction"
```

---

## Task 6: World map Canvas rendering (`src/world-ui.js`)

**Files:**
- Create: `src/world-ui.js`

Renders the hex world map on a Canvas element and provides the arbiter panel UI.

- [ ] **Step 1: Create `src/world-ui.js` with hex-to-pixel math**

```javascript
// src/world-ui.js
// 世界地图渲染 + 仲裁者操作面板

import { WORLD_MAP_RADIUS, WORLD_CITY_TIERS } from "./config.js";
import {
  getTerrainAt, TERRAIN_COLORS, ALL_CITIES, hexNeighbors, hexDistance, inBounds
} from "./world-map.js";
import { FACTION_IDS, computePowerScore } from "./faction-state.js";

// ── 门派颜色 ─────────────────────────────────────
export const FACTION_COLORS = {
  qingyun:  "#1a7f5e",   // 青绿
  shaolin:  "#c8960c",   // 金黄
  mojiao:   "#b32c2c",   // 血红
  jiaoting: "#e8e0d0",   // 圣白
  xiandao:  "#4a8fcf",   // 天蓝
  hundian:  "#6b3fa0",   // 紫魂
};

export const FACTION_NAMES = {
  qingyun:  "青云门",
  shaolin:  "少林",
  mojiao:   "魔教",
  jiaoting: "教廷",
  xiandao:  "仙岛",
  hundian:  "魂殿",
};

// ── 六边形坐标到像素 ─────────────────────────────

const HEX_SIZE = 8;   // 世界地图每格像素大小（可缩放）

function hexToPixel(q, r) {
  const x = HEX_SIZE * (3 / 2) * q;
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

function hexCorners(cx, cy, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return corners;
}

// ── Canvas 渲染 ──────────────────────────────────

/**
 * 渲染完整世界地图到 Canvas
 * @param {HTMLCanvasElement} canvas
 * @param {Object} worldState
 * @param {{ offsetX, offsetY, zoom }} viewState
 */
export function renderWorldMap(canvas, worldState, viewState = {}) {
  const ctx = canvas.getContext("2d");
  const { offsetX = 0, offsetY = 0, zoom = 1 } = viewState;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  ctx.scale(zoom, zoom);

  const cityOwnership = Object.fromEntries(
    (worldState.cities || []).map((c) => [c.id, c.faction])
  );

  // 绘制所有格子
  for (let q = -WORLD_MAP_RADIUS; q <= WORLD_MAP_RADIUS; q++) {
    for (let r = -WORLD_MAP_RADIUS; r <= WORLD_MAP_RADIUS; r++) {
      if (!inBounds(q, r)) continue;
      drawHex(ctx, q, r, worldState, cityOwnership);
    }
  }

  // 绘制城池标记
  ALL_CITIES.forEach((city) => {
    const owner = cityOwnership[city.id] ?? city.faction;
    drawCityMarker(ctx, city, owner);
  });

  ctx.restore();
}

function drawHex(ctx, q, r, worldState, cityOwnership) {
  const { x, y } = hexToPixel(q, r);
  const corners = hexCorners(x, y, HEX_SIZE - 0.5);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();

  // 颜色：优先门派领土色，其次地形色
  const terrain = getTerrainAt(q, r);
  const terrainColor = TERRAIN_COLORS[terrain] || "#cccccc";

  // 查找是否在某门派城池控制范围内（距城池 ≤3 格）
  let factionColor = null;
  for (const city of ALL_CITIES) {
    const owner = cityOwnership[city.id] ?? city.faction;
    if (!owner) continue;
    const dist = hexDistance(q, r, city.q, city.r);
    const range = city.tier === WORLD_CITY_TIERS.HQ ? 4 : city.tier === WORLD_CITY_TIERS.LARGE ? 3 : 2;
    if (dist <= range) {
      factionColor = FACTION_COLORS[owner];
      break;
    }
  }

  if (factionColor) {
    // 混合：地形底色 + 门派色（半透明叠加）
    ctx.fillStyle = factionColor + "55";   // ~33% opacity
    ctx.fill();
    ctx.fillStyle = terrainColor + "aa";
    ctx.fill();
  } else {
    ctx.fillStyle = terrainColor;
    ctx.fill();
  }

  ctx.strokeStyle = "#00000022";
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

function drawCityMarker(ctx, city, owner) {
  const { x, y } = hexToPixel(city.q, city.r);
  const color = owner ? FACTION_COLORS[owner] : "#888888";

  ctx.beginPath();
  if (city.tier === WORLD_CITY_TIERS.HQ) {
    // 总部：五角星
    drawStar(ctx, x, y, 6, 3, 5);
  } else if (city.tier === WORLD_CITY_TIERS.LARGE) {
    // 大城：菱形
    ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y);
    ctx.closePath();
  } else {
    // 小城：圆点
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#000000aa";
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawStar(ctx, cx, cy, outerR, innerR, points) {
  const step = Math.PI / points;
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}
```

- [ ] **Step 2: Add arbiter stats panel renderer**

Append to `src/world-ui.js`:

```javascript
// ── 仲裁者信息面板 ──────────────────────────────

/**
 * 渲染门派三维状态表格到 DOM 容器
 * @param {HTMLElement} container
 * @param {Object} worldState
 */
export function renderArbiterPanel(container, worldState) {
  const stats = worldState.factionStats || {};
  const cities = worldState.cities || [];

  container.innerHTML = `
    <div class="world-panel">
      <h3>第 ${worldState.season || 1} 时节 · 江湖格局</h3>
      <table class="world-stats-table">
        <thead>
          <tr>
            <th>门派</th><th>实力</th><th>声望</th><th>金币</th><th>城池</th>
          </tr>
        </thead>
        <tbody>
          ${FACTION_IDS.map((fid) => {
            const fs = stats[fid] || { prestige: 0, gold: 0 };
            const power = computePowerScore(fid, stats, cities);
            const cityCount = cities.filter((c) => c.faction === fid).length;
            return `<tr>
              <td><span class="faction-dot" style="background:${FACTION_COLORS[fid]}"></span>${FACTION_NAMES[fid]}</td>
              <td>${power}</td>
              <td>${fs.prestige}</td>
              <td>${fs.gold}</td>
              <td>${cityCount}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="world-log">
        ${(worldState.log || []).slice(-8).reverse().map((l) => `<div class="log-line">${l}</div>`).join("")}
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/world-ui.js
git commit -m "feat: world-ui Canvas hex rendering and arbiter stats panel"
```

---

## Task 7: Integration — `index.html` + `src/app.js` world map tab

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`

Wire everything together: add a "世界地图" tab, initialize world state on first load, render map and panel, and expose arbiter actions.

- [ ] **Step 1: Add world map tab button to `index.html`**

Find the existing tab bar in `index.html` (look for the tab buttons section). Add a new button after the last existing tab:

```html
<button class="tab-btn" data-tab="world-map">🗺 世界地图</button>
```

Add the corresponding tab panel container (after the last existing tab panel):

```html
<div id="tab-world-map" class="tab-panel" style="display:none;">
  <div class="world-map-layout">
    <canvas id="world-map-canvas" width="900" height="700" style="border:1px solid #444; background:#1a1a2e;"></canvas>
    <div id="world-arbiter-panel" style="width:320px; padding:12px;"></div>
  </div>
  <div class="world-actions" style="padding:8px; display:flex; gap:8px; flex-wrap:wrap;">
    <button id="btn-advance-season">推进时节</button>
    <button id="btn-trigger-jianghu">手动触发江湖争霸</button>
    <button id="btn-trigger-tournament">手动触发武道会</button>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for world map layout (in `styles.css` or inline)**

In `styles.css`, add:

```css
.world-map-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.world-stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.world-stats-table th, .world-stats-table td {
  border: 1px solid #444;
  padding: 4px 8px;
  text-align: right;
}

.world-stats-table td:first-child {
  text-align: left;
}

.faction-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}

.world-log {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-size: 12px;
  color: #aaa;
}

.log-line {
  padding: 2px 0;
  border-bottom: 1px solid #333;
}
```

- [ ] **Step 3: Import world modules in `src/app.js`**

At the top of `src/app.js`, add imports alongside the existing ones:

```javascript
import { createWorldState, advanceSeason, syncCharacterStates } from "./world-tick.js";
import { renderWorldMap, renderArbiterPanel } from "./world-ui.js";
import { applyJianghuPrestige, applyRankedEventPrestige } from "./world-events.js";
```

- [ ] **Step 4: Add world state init in `src/app.js` app initialization**

Find the existing initialization function (the main async init or `DOMContentLoaded` handler). After loading existing data, add:

```javascript
// ── 世界地图初始化 ──────────────────────────────
let worldState = await storage.getWorldState();
if (!worldState) {
  worldState = createWorldState();
  await storage.putWorldState(worldState);
}
// 同步角色状态
const allBuilds = await storage.getAllBuilds();
worldState = syncCharacterStates(worldState, allBuilds);
await storage.putWorldState(worldState);
```

- [ ] **Step 5: Add world map tab rendering in `src/app.js`**

Find the tab switching logic in `app.js` (look for `data-tab` handler). In the section that handles tab visibility, add:

```javascript
if (tabName === "world-map") {
  const canvas = document.getElementById("world-map-canvas");
  const panel = document.getElementById("world-arbiter-panel");
  if (canvas && panel) {
    renderWorldMap(canvas, worldState);
    renderArbiterPanel(panel, worldState);
  }
}
```

- [ ] **Step 6: Wire arbiter action buttons**

After the tab click handler setup, add button listeners:

```javascript
// 世界地图仲裁者操作
document.getElementById("btn-advance-season")?.addEventListener("click", async () => {
  const builds = await storage.getAllBuilds();
  worldState = advanceSeason(worldState, builds);
  await storage.putWorldState(worldState);
  renderWorldMap(document.getElementById("world-map-canvas"), worldState);
  renderArbiterPanel(document.getElementById("world-arbiter-panel"), worldState);
});

document.getElementById("btn-trigger-jianghu")?.addEventListener("click", async () => {
  // 触发江湖争霸，随机选一个门派获胜（正式对接到 battle-system 后替换）
  const factions = ["qingyun", "shaolin", "mojiao", "jiaoting", "xiandao", "hundian"];
  const winner = factions[Math.floor(Math.random() * factions.length)];
  worldState = applyJianghuPrestige(worldState, winner);
  await storage.putWorldState(worldState);
  renderWorldMap(document.getElementById("world-map-canvas"), worldState);
  renderArbiterPanel(document.getElementById("world-arbiter-panel"), worldState);
  alert(`江湖争霸完成！胜者：${winner}`);
});

document.getElementById("btn-trigger-tournament")?.addEventListener("click", async () => {
  // 按当前实力分数生成排名（v1 占位，后续对接真实竞标赛）
  const { computePowerScore, FACTION_IDS } = await import("./faction-state.js");
  const factions = [...FACTION_IDS].sort((a, b) =>
    computePowerScore(b, worldState.factionStats, worldState.cities) -
    computePowerScore(a, worldState.factionStats, worldState.cities)
  );
  worldState = applyRankedEventPrestige(worldState, "tournament", factions);
  await storage.putWorldState(worldState);
  renderWorldMap(document.getElementById("world-map-canvas"), worldState);
  renderArbiterPanel(document.getElementById("world-arbiter-panel"), worldState);
  alert(`武道会声望结算完成！`);
});
```

- [ ] **Step 7: Verify in browser**

1. Open the game. A "世界地图" tab should appear in the tab bar.
2. Click the tab — Canvas should render a hex map with colored territory patches and city markers.
3. The arbiter panel should show a table with 6 factions, prestige/gold/city counts.
4. Click "推进时节" — season number increments, log entries appear.
5. Click "手动触发江湖争霸" — a random faction gains 100 prestige; alert shows winner.
6. Open DevTools → Application → IndexedDB → meta store → key "worldState" should contain the persisted state.

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css src/app.js
git commit -m "feat: integrate world map tab, arbiter panel, season advance and event buttons"
```

---

## Task 8: Connect real large event results to prestige distribution

**Files:**
- Modify: `src/app.js` (find existing tournament/ranking result handlers)

Hook the existing武道会 and 排位赛 result code into `applyRankedEventPrestige`.

- [ ] **Step 1: Find where tournament results are finalized in `src/app.js`**

Search for the section where tournament winner/rankings are determined. Look for where `tournamentHall` or tournament results are saved. Identify the faction IDs of the top participants.

```bash
grep -n "tournamentHall\|rankingHall\|tournamentWinner\|ranking.*result" src/app.js | head -20
```

- [ ] **Step 2: Add prestige award after existing tournament result processing**

After the existing tournament result save (where winner is determined), add:

```javascript
// 武道会声望分配
{
  // 将参赛角色的门派按名次排列（取每门派最好名次的角色代表门派）
  const factionRanks = buildFactionRankingFromTournament(tournamentResults);
  worldState = applyRankedEventPrestige(worldState, "tournament", factionRanks);
  await storage.putWorldState(worldState);
}
```

Add helper `buildFactionRankingFromTournament` near the tournament code section:

```javascript
function buildFactionRankingFromTournament(rankedBuilds) {
  // rankedBuilds: array of builds sorted by finish position
  const seen = new Set();
  const factionOrder = [];
  rankedBuilds.forEach((build) => {
    if (!seen.has(build.faction)) {
      seen.add(build.faction);
      factionOrder.push(build.faction);
    }
  });
  return factionOrder;
}
```

- [ ] **Step 3: Add prestige award after 排位赛 result (same pattern)**

Find where ranking results are finalized. After the ranking save, add:

```javascript
// 排位赛声望分配
{
  const factionRanks = buildFactionRankingFromTournament(rankedBuildsInOrder);
  worldState = applyRankedEventPrestige(worldState, "ranking", factionRanks);
  await storage.putWorldState(worldState);
}
```

- [ ] **Step 4: Add prestige award after 江湖争霸 result**

Find where 江湖争霸 winner is determined. After the winner save, add:

```javascript
// 江湖争霸声望分配
worldState = applyJianghuPrestige(worldState, winnerFaction);
await storage.putWorldState(worldState);
```

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat: connect real event results to world map prestige distribution"
```

---

## Task 9: Final polish — pan/zoom interaction on world map

**Files:**
- Modify: `src/world-ui.js`
- Modify: `src/app.js`

Allow the player to pan and zoom the world map canvas.

- [ ] **Step 1: Add pan/zoom state to world map init in `src/app.js`**

```javascript
let worldViewState = { offsetX: 0, offsetY: 0, zoom: 1 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

const canvas = document.getElementById("world-map-canvas");
if (canvas) {
  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStart = { x: e.clientX - worldViewState.offsetX, y: e.clientY - worldViewState.offsetY };
  });
  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    worldViewState = { ...worldViewState, offsetX: e.clientX - dragStart.x, offsetY: e.clientY - dragStart.y };
    renderWorldMap(canvas, worldState, worldViewState);
  });
  canvas.addEventListener("mouseup", () => { isDragging = false; });
  canvas.addEventListener("mouseleave", () => { isDragging = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    worldViewState = { ...worldViewState, zoom: Math.max(0.3, Math.min(5, worldViewState.zoom * factor)) };
    renderWorldMap(canvas, worldState, worldViewState);
  }, { passive: false });
}
```

- [ ] **Step 2: Re-render map when tab is revisited (use existing viewState)**

Update the tab switch handler to pass `worldViewState`:

```javascript
if (tabName === "world-map") {
  const canvas = document.getElementById("world-map-canvas");
  const panel = document.getElementById("world-arbiter-panel");
  if (canvas && panel) {
    renderWorldMap(canvas, worldState, worldViewState);
    renderArbiterPanel(panel, worldState);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: world map pan and zoom interaction"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ 六边形网格 (~40×40) — `WORLD_MAP_RADIUS = 40` in config
- ✅ 六派初始位置 — hardcoded in `INITIAL_CITIES`
- ✅ 城池层级 (总部/大城/小城) — `WORLD_CITY_TIERS`
- ✅ 边界地形 (草原/大山/大海) — `getTerrainAt()` rules
- ✅ 中原五地形 — hash-based generation
- ✅ 声望系统 — `WORLD_PRESTIGE_COSTS`, `WORLD_PRESTIGE_REWARDS`, `addPrestige`, `spendPrestige`
- ✅ 金币系统 — `tickGoldProduction`, `WORLD_GOLD_TICK`
- ✅ 角色三态 (驻守/漫游/出征) — `WORLD_CHARACTER_STATES`, `aiUpdateCharacterStates`
- ✅ 漫游小事件 — `triggerRoamingEvents`
- ✅ 重伤状态 — `injured` + `injuredUntilSeason` fields; cleared in `advanceSeason`
- ✅ 江湖争霸声望 (100) — `applyJianghuPrestige`
- ✅ 武道会声望 (800/480/250/100) — `WORLD_PRESTIGE_REWARDS.tournament`
- ✅ 排位赛声望 (1000/600/300/150/50) — `WORLD_PRESTIGE_REWARDS.ranking`
- ✅ 攻城战费用 (500/1000/2500) — `WORLD_PRESTIGE_COSTS`
- ✅ 全员决战触发 — `checkAndTriggerLastStand`, `isHQSurrounded`
- ✅ 门派吞并 — `applyLastStandResult` transfers all cities
- ✅ 玩家仲裁者操作 — "推进时节", "触发江湖争霸", "触发武道会" buttons
- ✅ 拍卖会接口预留 — not implemented, no code (per spec §九)
- ✅ Canvas 渲染沿用六边形体系 — `hexToPixel`, `hexCorners` in `world-ui.js`
- ✅ 持久化 — `META_KEYS.WORLD_STATE`, `getWorldState`/`putWorldState` in storage
- ✅ DB version bump (10→11) — `storage-normalizer.js` note + `openDb` updated

**Potential issue:** `border duel` (边界冲突单挑) is described in spec §4.3 but only a `injured` flag and `injuredUntilSeason` field are wired — the actual duel trigger between two roaming characters in border hexes is stubbed in `triggerRoamingEvents` (the "duel" event type logs a message but doesn't launch a real battle). This is acceptable for v1; hooking the duel to `battle-system.js` requires more integration work and can be a follow-up task.
