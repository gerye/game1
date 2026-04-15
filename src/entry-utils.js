import { buildBloodlineMap, decorateDisplayName, getBloodlineById, getBloodlinePersistentStatusIds } from "./bloodlines.js";
import { normalizeCapAssetPath } from "./cap-asset-store.js";

export function getBaseBrand(base) {
  return base?.brand ?? base?.sourceName ?? "";
}

export function getBaseName(base) {
  return base?.name ?? "";
}

export function normalizeBaseIdentity(base) {
  const brand = getBaseBrand(base);
  const name = getBaseName(base);
  return {
    ...base,
    avatarPath: normalizeCapAssetPath(base?.avatarPath || ""),
    photoPath: normalizeCapAssetPath(base?.photoPath || ""),
    avatarDataUrl: normalizeCapAssetPath(base?.avatarDataUrl || ""),
    photoDataUrl: normalizeCapAssetPath(base?.photoDataUrl || ""),
    brand,
    name,
    sourceName: `${brand}${name}` || base?.sourceName || base?.code || ""
  };
}

export function getDisplayName(base, progress = null, bloodlines = []) {
  const brand = getBaseBrand(base);
  const name = getBaseName(base);
  const raw = `${brand}${name}` || base?.sourceName || base?.code || "";
  return decorateDisplayName(raw, progress, bloodlines);
}

export function getPersistentStatuses(progress, bloodlines, statuses) {
  const persistentStatusIds = getBloodlinePersistentStatusIds(progress, bloodlines);
  const persistentStatuses = persistentStatusIds
    .map((statusId) => (statuses || []).find((status) => status.id === statusId))
    .filter(Boolean);
  return {
    persistentStatusIds,
    persistentStatuses
  };
}

export function buildHonorBonusContext(build, progress, options = {}) {
  const {
    winSummary = { byFaction: {} },
    tournamentMeta = { byFaction: {} },
    rankingMeta = { byFaction: {} },
    persistentStatuses = []
  } = options;
  return {
    progress: progress || null,
    factionBattleWinCount: winSummary?.byFaction?.[build?.faction?.key] || 0,
    factionChampionCount:
      (tournamentMeta?.byFaction?.[build?.faction?.key] || 0) +
      (rankingMeta?.byFaction?.[build?.faction?.key] || 0),
    persistentStatuses
  };
}

export function buildEntries({
  bases = [],
  builds = [],
  progressList = [],
  bloodlines = [],
  statuses = [],
  winSummary = { byFaction: {} },
  tournamentMeta = { byFaction: {} },
  rankingMeta = { byFaction: {} },
  onlyReady = false
} = {}) {
  const bloodlineMap = buildBloodlineMap(bloodlines);
  const buildByCode = new Map((builds || []).map((build) => [build.capCode, build]));
  const progressByBuildId = new Map((progressList || []).map((progress) => [progress.buildId, progress]));

  const entries = (bases || []).map((base) => {
    const build = buildByCode.get(base.code) || null;
    const progress = build ? progressByBuildId.get(build.buildId) || null : null;
    const bloodline = getBloodlineById(bloodlineMap, progress?.bloodlineId || "");
    const { persistentStatusIds, persistentStatuses } = getPersistentStatuses(progress, bloodlineMap, statuses);
    return {
      base,
      build,
      progress,
      bloodline,
      persistentStatusIds,
      displayName: getDisplayName(base, progress, bloodlineMap),
      honorContext: build
        ? buildHonorBonusContext(build, progress, {
            winSummary,
            tournamentMeta,
            rankingMeta,
            persistentStatuses
          })
        : null
    };
  });

  return onlyReady ? entries.filter((entry) => entry.build && entry.progress) : entries;
}
