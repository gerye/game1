// src/world-connectivity.js
// 连通性工具：城市邻接图、领地反查表、连通性检查

import { FACTION_IDS } from "./faction-state.js";
import { WORLD_CHARACTER_STATES } from "./config.js";

/**
 * 根据 cityTerritories 预计算城市邻接图（Voronoi 共边相邻）
 * @param {Object} cityTerritories  { [cityId]: ["q,r", ...] }
 * @returns {Object} { [cityId]: string[] }  相邻城市 ID 数组
 */
export function buildCityAdjacency(cityTerritories) {
  const HEX_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

  // 先建反查表
  const cellToCity = {};
  for (const [cityId, cells] of Object.entries(cityTerritories)) {
    for (const cell of cells) {
      cellToCity[cell] = cityId;
    }
  }

  const adjSets = {};
  for (const cityId of Object.keys(cityTerritories)) {
    adjSets[cityId] = new Set();
  }

  for (const [cityId, cells] of Object.entries(cityTerritories)) {
    for (const cell of cells) {
      const [q, r] = cell.split(",").map(Number);
      for (const [dq, dr] of HEX_DIRS) {
        const neighborKey = `${q + dq},${r + dr}`;
        const neighborCity = cellToCity[neighborKey];
        if (neighborCity && neighborCity !== cityId) {
          adjSets[cityId].add(neighborCity);
          adjSets[neighborCity].add(cityId);
        }
      }
    }
  }

  const result = {};
  for (const [cityId, set] of Object.entries(adjSets)) {
    result[cityId] = Array.from(set);
  }
  return result;
}

/**
 * 将 cityTerritories 反转为领地反查表
 * @param {Object} cityTerritories  { [cityId]: ["q,r", ...] }
 * @returns {Object} { "q,r": cityId }
 */
export function buildTerritoryOwner(cityTerritories) {
  const owner = {};
  for (const [cityId, cells] of Object.entries(cityTerritories)) {
    for (const cell of cells) {
      owner[cell] = cityId;
    }
  }
  return owner;
}

/**
 * 确保 worldState 含有预计算字段（升级旧存档用）
 */
export function ensurePrecomputed(worldState) {
  if (worldState.cityAdjacency && worldState.territoryOwner) return worldState;
  const { cityTerritories } = worldState;
  if (!cityTerritories) return worldState;
  return {
    ...worldState,
    cityAdjacency:   worldState.cityAdjacency   || buildCityAdjacency(cityTerritories),
    territoryOwner:  worldState.territoryOwner   || buildTerritoryOwner(cityTerritories),
  };
}

/**
 * 检查各门派城市连通性（从 HQ 出发 BFS），
 * 断链城市变中立，驻守在断链城市的己方弟子重伤回 HQ。
 * @param {Object} worldState
 * @param {Object[]|null} builds
 * @returns {Object} 新的 worldState
 */
export function checkConnectivity(worldState, builds) {
  const { cityAdjacency, cities } = worldState;
  if (!cityAdjacency) return worldState;

  // 当前城市门派快查表（可变，用于处理连锁断链）
  const cityFactionMap = Object.fromEntries(cities.map((c) => [c.id, c.faction]));
  const disconnectedCities = new Set();

  for (const factionId of FACTION_IDS) {
    const hqId = `${factionId}-hq`;
    if (cityFactionMap[hqId] !== factionId) continue;

    // BFS 遍历己方连通域
    const visited = new Set([hqId]);
    const queue = [hqId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const neighbor of (cityAdjacency[current] || [])) {
        if (!visited.has(neighbor) && cityFactionMap[neighbor] === factionId) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // 未被访问的己方城市 → 断链
    for (const [cityId, faction] of Object.entries(cityFactionMap)) {
      if (faction === factionId && !visited.has(cityId)) {
        disconnectedCities.add(cityId);
        cityFactionMap[cityId] = null; // 更新快查，处理连锁
      }
    }
  }

  if (disconnectedCities.size === 0) return worldState;

  // 更新城市状态
  const newCities = worldState.cities.map((c) =>
    disconnectedCities.has(c.id) ? { ...c, faction: null } : c
  );

  // 将驻守在断链城市的弟子重伤传回 HQ
  const prevFactionMap = Object.fromEntries(worldState.cities.map((c) => [c.id, c.faction]));
  const newCharStates = { ...worldState.characterStates };

  if (builds) {
    for (const build of builds) {
      const cs = newCharStates[build.buildId];
      if (!cs) continue;
      const factionKey = build.faction?.key || build.faction;
      if (
        cs.state === WORLD_CHARACTER_STATES.GARRISON &&
        cs.cityId &&
        disconnectedCities.has(cs.cityId) &&
        prevFactionMap[cs.cityId] === factionKey
      ) {
        newCharStates[build.buildId] = {
          ...cs,
          injured: true,
          injuredUntilSeason: worldState.season + 1,
          state: WORLD_CHARACTER_STATES.GARRISON,
          cityId: `${factionKey}-hq`,
        };
      }
    }
  }

  return { ...worldState, cities: newCities, characterStates: newCharStates };
}
