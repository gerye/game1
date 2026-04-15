import { META_KEYS } from "./config.js";
import { stripEmbeddedBaseImages } from "./cap-asset-store.js";
import { buildStorageSnapshot } from "./storage.js";

export async function createRoleSaveSnapshot(storage, {
  bases = [],
  builds = [],
  progress = [],
  winSummary = { totalWins: 0, byFaction: {} },
  tournamentMeta = { byFaction: {}, byCap: {} },
  rankingMeta = { byFaction: {}, byCap: {} },
  chronicle = null,
  rankingHistory = [],
  fastSimMeta = null,
  bloodlineTaskState = null
} = {}) {
  const latestWinSummary = await storage.getMeta(META_KEYS.BATTLE_WIN_SUMMARY) || winSummary || { totalWins: 0, byFaction: {} };
  const latestTournamentMeta = await storage.getMeta(META_KEYS.TOURNAMENT_HALL) || tournamentMeta || { byFaction: {}, byCap: {} };
  const latestRankingMeta = await storage.getMeta(META_KEYS.RANKING_HALL) || rankingMeta || { byFaction: {}, byCap: {} };
  const latestChronicle = await storage.getMeta(META_KEYS.JIANGHU_CHRONICLE) || chronicle || null;
  const latestRankingHistory = await storage.getMeta(META_KEYS.RANKING_HISTORY) || rankingHistory || [];
  const latestFastSimMeta = await storage.getMeta(META_KEYS.FAST_SIM_META) || fastSimMeta || null;
  const latestBloodlineTaskState = await storage.getMeta(META_KEYS.BLOODLINE_TASK_STATE) || bloodlineTaskState || null;

  return buildStorageSnapshot({
    capBases: (bases || []).map((base) => stripEmbeddedBaseImages(base)),
    capBuilds: builds,
    capProgress: progress,
    meta: {
      [META_KEYS.BATTLE_WIN_SUMMARY]:   latestWinSummary,
      [META_KEYS.TOURNAMENT_HALL]:      latestTournamentMeta,
      [META_KEYS.RANKING_HALL]:         latestRankingMeta,
      [META_KEYS.JIANGHU_CHRONICLE]:    latestChronicle,
      [META_KEYS.RANKING_HISTORY]:      latestRankingHistory,
      [META_KEYS.FAST_SIM_META]:        latestFastSimMeta,
      [META_KEYS.BLOODLINE_TASK_STATE]: latestBloodlineTaskState
    }
  });
}
