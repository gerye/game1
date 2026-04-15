import { GRADE_SCALE as GRADE_ORDER } from "./config.js";

export const BLOODLINE_TASK_TARGET = 20;

export const BLOODLINE_TASKS = {
  azureDragon: {
    id: "azure-dragon-healer",
    bloodlineId: "azure-dragon",
    counterKey: "azureDragonHealerWins",
    target: 20
  },
  whiteTiger: {
    id: "white-tiger-record",
    bloodlineId: "white-tiger",
    counterKey: "whiteTigerRecordBreaks",
    target: 20
  },
  vermilionBird: {
    id: "vermilion-bird-revive",
    bloodlineId: "vermilion-bird",
    counterKey: "vermilionBirdRevives",
    target: 10
  },
  blackTortoise: {
    id: "black-tortoise-tank",
    bloodlineId: "black-tortoise",
    counterKey: "blackTortoiseTankWins",
    target: 20
  }
};

export function createDefaultBloodlineTaskState() {
  return {
    whiteTigerDamageRecord: 0
  };
}

export function normalizeBloodlineTaskState(raw = {}) {
  return {
    whiteTigerDamageRecord: Math.max(0, Number(raw?.whiteTigerDamageRecord || 0))
  };
}

export function getBloodlineTaskCount(progress, key) {
  return Math.max(0, Math.floor(Number(progress?.bloodlineTaskCounts?.[key] || 0)));
}

function setBloodlineTaskCount(progress, key, value) {
  return {
    ...progress,
    bloodlineTaskCounts: {
      ...(progress?.bloodlineTaskCounts || {}),
      [key]: Math.max(0, Math.floor(Number(value || 0)))
    }
  };
}

export function incrementBloodlineTaskCount(progress, key, amount = 1) {
  return setBloodlineTaskCount(progress, key, getBloodlineTaskCount(progress, key) + Math.max(0, Math.floor(Number(amount || 0))));
}

export function pickTopEntity(entities, metricKey, options = {}) {
  const { requireAlive = false, minValue = 1 } = options;
  const filtered = (entities || []).filter((entity) => {
    if (!entity) return false;
    if (requireAlive && !entity.alive) return false;
    return Number(entity[metricKey] || 0) >= minValue;
  });
  if (filtered.length === 0) return null;
  return [...filtered].sort((left, right) => {
    const diff = Number(right[metricKey] || 0) - Number(left[metricKey] || 0);
    if (diff !== 0) return diff;
    return String(left.id || "").localeCompare(String(right.id || ""));
  })[0];
}

export function pickReviveMilestoneCandidate(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const countDiff = Number(right.nextCount || 0) - Number(left.nextCount || 0);
    if (countDiff !== 0) return countDiff;
    const gainDiff = Number(right.gain || 0) - Number(left.gain || 0);
    if (gainDiff !== 0) return gainDiff;
    return String(left.entity?.id || "").localeCompare(String(right.entity?.id || ""));
  })[0];
}

export function getTopBloodlineTaskCandidates(entries = [], bloodlines = [], bloodlineId = "", limit = 3) {
  const task = Object.values(BLOODLINE_TASKS).find((item) => item.bloodlineId === bloodlineId);
  if (!task) return [];
  const bloodlineMap = new Map((bloodlines || []).map((item) => [item.id, item]));
  return [...entries]
    .filter((entry) => {
      if (!entry?.progress) return false;
      const currentBloodline = bloodlineMap.get(entry.progress.bloodlineId || "");
      return currentBloodline?.grade !== "SSS";
    })
    .map((entry) => ({
      code: entry.base?.code || "",
      displayName: entry.displayName || entry.base?.code || "",
      grade: entry.build?.potential || "E",
      level: Number(entry.progress?.level || 1),
      experience: Number(entry.progress?.experience || 0),
      progress: getBloodlineTaskCount(entry.progress, task.counterKey),
      target: Number(task.target || BLOODLINE_TASK_TARGET)
    }))
    .sort((left, right) => {
      if (right.progress !== left.progress) return right.progress - left.progress;
      const gradeDiff = GRADE_ORDER.indexOf(right.grade) - GRADE_ORDER.indexOf(left.grade);
      if (gradeDiff !== 0) return gradeDiff;
      if (right.level !== left.level) return right.level - left.level;
      if (right.experience !== left.experience) return right.experience - left.experience;
      return String(left.code).localeCompare(String(right.code), "en");
    })
    .slice(0, Math.max(0, limit));
}

