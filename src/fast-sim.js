import { EQUIPMENT_SLOT_LABELS } from "./equipment-data.js";

const FAST_SIM_STAGES = [
  { level: 1, championGrade: "C", runnerUpGrade: "D" },
  { level: 11, championGrade: "B", runnerUpGrade: "C" },
  { level: 21, championGrade: "A", runnerUpGrade: "B" },
  { level: 31, championGrade: "S", runnerUpGrade: "A" },
  { level: 41, championGrade: "SS", runnerUpGrade: "S" },
  { level: 50, championGrade: "SS", runnerUpGrade: "S" }
];

const FAST_SIM_EXPLORATION_STAGES = [5, 15, 25, 35, 45];
const FAST_SIM_REWARD_SLOTS = Object.keys(EQUIPMENT_SLOT_LABELS);
// 半年单元：6组 [season, season, chaos]（12个时节）
const _half = [
  { type: "season" }, { type: "season" }, { type: "chaos" },
  { type: "season" }, { type: "season" }, { type: "chaos" },
  { type: "season" }, { type: "season" }, { type: "chaos" },
  { type: "season" }, { type: "season" }, { type: "chaos" },
  { type: "season" }, { type: "season" }, { type: "chaos" },
  { type: "season" }, { type: "season" }, { type: "chaos" },
];
// 大循环（3年，114步）：
//   前半年×6 → 秘境探索 → 拍卖会 → 后半年×6 → 武道会（年1、年2）/ 排位赛（年3）
const ENDLESS_FAST_SIM_CYCLE = [
  ..._half, { type: "exploration" }, { type: "auction" }, ..._half, { type: "tournament" }, // 年1
  ..._half, { type: "exploration" }, { type: "auction" }, ..._half, { type: "tournament" }, // 年2
  ..._half, { type: "exploration" }, { type: "auction" }, ..._half, { type: "ranking" },    // 年3
];

export function normalizeFastSimMeta(meta = {}) {
  const allowedPendingActionTypes = new Set([
    "season",
    "chaos",
    "exploration",
    "auction",
    "tournament",
    "ranking"
  ]);
  const endlessPendingActionType = String(meta.endlessPendingActionType || "");
  return {
    completedStages: [...new Set(
      Array.isArray(meta.completedStages)
        ? meta.completedStages
          .map((value) => String(value))
          .filter((value) => value)
        : []
    )].sort(),
    finalWinnerCode: typeof meta.finalWinnerCode === "string" ? meta.finalWinnerCode : "",
    bracketCount: Math.max(0, Math.floor(Number(meta.bracketCount || 0))),
    endlessStep: Math.max(0, Math.floor(Number(meta.endlessStep || 0))) % ENDLESS_FAST_SIM_CYCLE.length,
    endlessCycleCount: Math.max(0, Math.floor(Number(meta.endlessCycleCount || 0))),
    endlessPendingActionType: allowedPendingActionTypes.has(endlessPendingActionType) ? endlessPendingActionType : ""
  };
}

export function getNextFastSimBracketMode(meta = {}) {
  const normalized = normalizeFastSimMeta(meta);
  const nextCount = normalized.bracketCount + 1;
  return nextCount % 3 === 0 ? "ranking" : "tournament";
}

export function advanceFastSimBracketMeta(meta = {}) {
  const normalized = normalizeFastSimMeta(meta);
  return normalizeFastSimMeta({
    ...normalized,
    bracketCount: normalized.bracketCount + 1
  });
}

export function getEligibleFastSimTournamentStage(entries, fastSimMeta) {
  const completed = new Set(fastSimMeta?.completedStages || []);
  return FAST_SIM_STAGES.find((stage) =>
    !completed.has(`tournament:${stage.level}`) &&
    entries.filter((entry) => (entry.progress?.level || 1) >= stage.level).length >= 4
  ) || null;
}

export function getEligibleFastSimExplorationStage(entries, fastSimMeta) {
  const completed = new Set(fastSimMeta?.completedStages || []);
  return FAST_SIM_EXPLORATION_STAGES.find((level) =>
    !completed.has(`exploration:${level}`) &&
    entries.some((entry) => (entry.progress?.level || 1) >= level)
  ) || null;
}

function pickRandomFastSimSlot(slots = FAST_SIM_REWARD_SLOTS) {
  return slots[Math.floor(Math.random() * slots.length)] || "weapon";
}

export function buildFastSimRewardSpec(stage, pickSlot = pickRandomFastSimSlot) {
  return {
    champion: { grade: stage.championGrade, slot: pickSlot() },
    runnerUp: { grade: stage.runnerUpGrade, slot: pickSlot() }
  };
}

export function getEndlessFastSimAction(meta = {}) {
  const normalized = normalizeFastSimMeta(meta);
  return ENDLESS_FAST_SIM_CYCLE[normalized.endlessStep] || ENDLESS_FAST_SIM_CYCLE[0];
}

export function advanceEndlessFastSimMeta(meta = {}) {
  const normalized = normalizeFastSimMeta(meta);
  const nextStep = normalized.endlessStep + 1;
  return normalizeFastSimMeta({
    ...normalized,
    endlessStep: nextStep % ENDLESS_FAST_SIM_CYCLE.length,
    endlessCycleCount: normalized.endlessCycleCount + (nextStep >= ENDLESS_FAST_SIM_CYCLE.length ? 1 : 0)
  });
}

// 武道会奖励：冠军 SS，亚军 S
export function buildEndlessTournamentRewardSpec(pickSlot = pickRandomFastSimSlot) {
  return {
    champion: { grade: "SS", slot: pickSlot() },
    runnerUp: { grade: "S", slot: pickSlot() }
  };
}

// 排位赛奖励：冠军 SSS，亚军 SS
export function buildEndlessRankingRewardSpec(pickSlot = pickRandomFastSimSlot) {
  return {
    champion: { grade: "SSS", slot: pickSlot() },
    runnerUp: { grade: "SS", slot: pickSlot() }
  };
}
