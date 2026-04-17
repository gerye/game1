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
    logs: ["拍卖会开启：三件拍品已上架，点击“竞价”后会逐件拍卖，由金币最高的门派按“第二名金额 + 1”成交。"]
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

function findEligibleRecipient(entries, factionKey, lot, equipment, compareEntries, buildUpdates) {
  const factionEntries = entries
    .filter((entry) => entry.build?.faction?.key === factionKey && entry.progress)
    .sort(compareEntries);

  for (const entry of factionEntries) {
    const currentBuild = buildUpdates.get(entry.build.buildId) || entry.build;
    const nextBuild = applyEquipmentDrop(currentBuild, lot.equipmentId, equipment);
    if (nextBuild !== currentBuild) {
      return { entry, nextBuild };
    }
  }

  return { entry: null, nextBuild: null };
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

  const nextFactionStats = { ...factionStats };
  const buildUpdates = new Map();
  const assignments = [];
  const logs = [];

  auction.items.forEach((lot) => {
    const eligibleFactionKeys = Object.keys(nextFactionStats).filter((factionKey) =>
      Boolean(findEligibleRecipient(entries, factionKey, lot, equipment, compareEntries, buildUpdates).entry)
    );
    const eligibleFactionStats = Object.fromEntries(
      eligibleFactionKeys.map((factionKey) => [factionKey, nextFactionStats[factionKey]])
    );
    const ranking = buildAuctionGoldRanking(eligibleFactionStats, `${auction.seedKey}:lot-${lot.lotIndex}`);
    const winner = ranking[0];
    if (!winner) {
      logs.push(`${lot.grade} ${lot.name} 流拍：当前没有任何门派能从这件拍品获得提升。`);
      assignments.push({
        factionKey: "",
        factionName: "",
        originalGold: 0,
        spentGold: 0,
        remainingGold: 0,
        lot,
        recipientBuildId: "",
        recipientCode: "",
        recipientName: "",
        applied: false
      });
      return;
    }
    const runnerUp = ranking[1] || null;
    const factionKey = winner.factionKey;
    const topGold = Number(winner.gold || 0);
    const secondGold = Number(runnerUp?.gold || 0);
    const price = !runnerUp
      ? topGold
      : topGold === secondGold
        ? topGold
        : Math.min(topGold, secondGold + 1);
    const { entry: assignedEntry, nextBuild: assignedBuild } = findEligibleRecipient(
      entries,
      factionKey,
      lot,
      equipment,
      compareEntries,
      buildUpdates
    );
    if (assignedEntry && assignedBuild) {
      buildUpdates.set(assignedEntry.build.buildId, assignedBuild);
    }

    nextFactionStats[factionKey] = {
      ...(nextFactionStats[factionKey] || {}),
      gold: Math.max(0, topGold - price)
    };
    const factionName = factionLookup.get(factionKey)?.name || factionKey;
    const assignment = {
      factionKey,
      factionName,
      originalGold: winner.gold,
      spentGold: price,
      remainingGold: Math.max(0, topGold - price),
      lot,
      recipientBuildId: assignedEntry?.build?.buildId || "",
      recipientCode: assignedEntry?.base?.code || "",
      recipientName: assignedEntry?.displayName || "",
      applied: Boolean(assignedEntry && assignedBuild)
    };
    assignments.push(assignment);
    logs.push(
      assignment.applied
        ? `${factionName} 以 ${price} 金币拿下 ${lot.grade} ${lot.name}，由 ${assignment.recipientName} 获得，剩余 ${assignment.remainingGold} 金币。`
        : `${factionName} 以 ${price} 金币拿下 ${lot.grade} ${lot.name}，但该门派当前无人能接收这件拍品，剩余 ${assignment.remainingGold} 金币。`
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
