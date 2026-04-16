import { applyEquipmentDrop } from "./equipment-data.js";
import { createSeededRandom, gradeIndex } from "./utils.js";

const AUCTION_GRADE_POOL = Object.freeze(["D", "C", "B", "A", "S", "SS"]);
const AUCTION_ALLOWED_SLOTS = new Set(["weapon", "armor"]);

function buildTieBreakMap(keys, seedKey) {
  const rng = createSeededRandom(seedKey);
  return new Map(keys.map((key) => [key, rng()]));
}

function sortByTieBreak(keys, tieBreakMap) {
  return [...keys].sort((left, right) => (tieBreakMap.get(left) || 0) - (tieBreakMap.get(right) || 0));
}

export function buildAuctionState(entries, equipment = [], factionStats = {}, seedKey = `auction:${Date.now()}`) {
  const rng = createSeededRandom(seedKey);
  const availableGrades = AUCTION_GRADE_POOL.filter((grade) =>
    equipment.some((item) =>
      !item.deleted &&
      item.grade === grade &&
      AUCTION_ALLOWED_SLOTS.has(item.slot)
    )
  );
  if (availableGrades.length < 3) {
    throw new Error("当前装备库中可用于拍卖的武器/防具品级不足 3 个。");
  }

  const shuffledGrades = [...availableGrades];
  for (let index = shuffledGrades.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffledGrades[index], shuffledGrades[swapIndex]] = [shuffledGrades[swapIndex], shuffledGrades[index]];
  }
  const grades = shuffledGrades.slice(0, 3).sort((left, right) => gradeIndex(right) - gradeIndex(left));
  const items = grades.map((grade, index) => {
    const pool = equipment.filter((item) =>
      !item.deleted &&
      item.grade === grade &&
      AUCTION_ALLOWED_SLOTS.has(item.slot)
    );
    const picked = pool[Math.floor(rng() * pool.length)];
    return {
      lotIndex: index,
      equipmentId: picked.id,
      grade: picked.grade,
      slot: picked.slot,
      name: picked.name,
      iconDataUrl: picked.iconDataUrl,
      allowedRoles: [...(picked.allowedRoles || [])]
    };
  });

  return {
    seedKey,
    resolved: false,
    items,
    goldRanking: buildAuctionGoldRanking(factionStats, `${seedKey}:gold-ranking`),
    postGoldRanking: [],
    assignments: [],
    logs: ["拍卖会开启：三件拍品已上架，点击“竞价”后按门派金币高低自动分配。"]
  };
}

export function buildAuctionGoldRanking(factionStats = {}, seedKey = `auction:gold:${Date.now()}`) {
  const factionKeys = Object.keys(factionStats || {});
  const tieBreakMap = buildTieBreakMap(factionKeys, seedKey);
  return [...factionKeys]
    .sort((left, right) => {
      const goldDiff = Number(factionStats?.[right]?.gold || 0) - Number(factionStats?.[left]?.gold || 0);
      if (goldDiff !== 0) return goldDiff;
      return (tieBreakMap.get(left) || 0) - (tieBreakMap.get(right) || 0);
    })
    .map((factionKey, index) => ({
      rank: index + 1,
      factionKey,
      gold: Number(factionStats?.[factionKey]?.gold || 0)
    }));
}

export function resolveAuctionLots({
  auction,
  entries,
  equipment = [],
  factionStats = {},
  compareEntries,
  factionLookup = new Map()
}) {
  if (!auction || auction.resolved) {
    return {
      assignments: [],
      buildUpdates: new Map(),
      factionStats,
      goldRanking: [],
      logs: []
    };
  }

  const winningFactions = buildAuctionGoldRanking(factionStats, `${auction.seedKey}:winners`).slice(0, auction.items.length);
  const nextFactionStats = { ...factionStats };
  const buildUpdates = new Map();
  const assignments = [];
  const logs = [];

  auction.items.forEach((lot, index) => {
    const winner = winningFactions[index];
    if (!winner) return;
    const factionKey = winner.factionKey;
    const factionEntries = entries
      .filter((entry) => entry.build?.faction?.key === factionKey && entry.progress)
      .sort(compareEntries);
    let assignedEntry = null;
    let assignedBuild = null;
    for (const entry of factionEntries) {
      const currentBuild = buildUpdates.get(entry.build.buildId) || entry.build;
      const nextBuild = applyEquipmentDrop(currentBuild, lot.equipmentId, equipment);
      if (nextBuild !== currentBuild) {
        assignedEntry = entry;
        assignedBuild = nextBuild;
        buildUpdates.set(entry.build.buildId, nextBuild);
        break;
      }
    }

    nextFactionStats[factionKey] = {
      ...(nextFactionStats[factionKey] || {}),
      gold: 0
    };
    const factionName = factionLookup.get(factionKey)?.name || factionKey;
    const assignment = {
      factionKey,
      factionName,
      originalGold: winner.gold,
      lot,
      recipientBuildId: assignedEntry?.build?.buildId || "",
      recipientCode: assignedEntry?.base?.code || "",
      recipientName: assignedEntry?.displayName || "",
      applied: Boolean(assignedEntry && assignedBuild)
    };
    assignments.push(assignment);
    logs.push(
      assignment.applied
        ? `${factionName} 以 ${winner.gold} 金币拿下 ${lot.grade} ${lot.name}，由 ${assignment.recipientName} 获得。`
        : `${factionName} 以 ${winner.gold} 金币拿下 ${lot.grade} ${lot.name}，但门派内无人可继续提升该部位装备。`
    );
  });

  return {
    assignments,
    buildUpdates,
    factionStats: nextFactionStats,
    goldRanking: buildAuctionGoldRanking(nextFactionStats, `${auction.seedKey}:post-gold`),
    logs
  };
}
