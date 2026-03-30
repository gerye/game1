import { buildStorageSnapshot } from "./storage.js";

export async function createRoleSaveSnapshot(storage, {
  bases = [],
  builds = [],
  progress = [],
  equipment = [],
  winSummary = { totalWins: 0, byFaction: {} },
  tournamentMeta = { byFaction: {}, byCap: {} },
  rankingMeta = { byFaction: {}, byCap: {} },
  chronicle = null,
  rankingHistory = [],
  fastSimMeta = null,
  bloodlineTaskState = null
} = {}) {
  const latestWinSummary = await storage.getMeta("battleWinSummary") || winSummary || { totalWins: 0, byFaction: {} };
  const latestTournamentMeta = await storage.getMeta("tournamentHall") || tournamentMeta || { byFaction: {}, byCap: {} };
  const latestRankingMeta = await storage.getMeta("rankingHall") || rankingMeta || { byFaction: {}, byCap: {} };
  const latestChronicle = await storage.getMeta("jianghuChronicle") || chronicle || null;
  const latestRankingHistory = await storage.getMeta("rankingHistory") || rankingHistory || [];
  const latestFastSimMeta = await storage.getMeta("fastSimMeta") || fastSimMeta || null;
  const latestBloodlineTaskState = await storage.getMeta("bloodlineTaskState") || bloodlineTaskState || null;
  const latestEquipment = equipment.length > 0 ? equipment : await storage.getEquipmentRaw();

  return buildStorageSnapshot({
    capBases: bases,
    capBuilds: builds,
    capProgress: progress,
    equipment: latestEquipment,
    meta: {
      battleWinSummary: latestWinSummary,
      tournamentHall: latestTournamentMeta,
      rankingHall: latestRankingMeta,
      jianghuChronicle: latestChronicle,
      rankingHistory: latestRankingHistory,
      fastSimMeta: latestFastSimMeta,
      bloodlineTaskState: latestBloodlineTaskState
    }
  });
}
