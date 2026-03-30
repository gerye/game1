import { GRADE_SCALE } from "./config.js";
import { shuffleArray as shuffleValues } from "./utils.js";

export const EXPLORATION_GRADE_FLOW = GRADE_SCALE;

export const EXPLORATION_QUESTION_BANK = [
  { id: "kills-even", text: "该角色击杀数是否为偶数？", check: ({ progress }) => isEven(progress.kills) },
  { id: "assists-even", text: "该角色助攻数是否为偶数？", check: ({ progress }) => isEven(progress.assists) },
  { id: "deaths-even", text: "该角色死亡数是否为偶数？", check: ({ progress }) => isEven(progress.deaths) },
  { id: "str-even", text: "该角色力量是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.primary.strength)) },
  { id: "agi-even", text: "该角色敏捷是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.primary.agility)) },
  { id: "vit-even", text: "该角色体质是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.primary.vitality)) },
  { id: "int-even", text: "该角色智力是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.primary.intelligence)) },
  { id: "spi-even", text: "该角色精神是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.primary.spirit)) },
  { id: "hp-even", text: "该角色最大生命值是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.derived.hpMax)) },
  { id: "patk-even", text: "该角色物攻是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.derived.physicalAttack)) },
  { id: "pdef-even", text: "该角色物防是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.derived.physicalDefense)) },
  { id: "matk-even", text: "该角色法攻是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.derived.magicAttack)) },
  { id: "mdef-even", text: "该角色法防是否为偶数？", check: ({ sheet }) => isEven(Math.round(sheet.derived.magicDefense)) }
];

export function buildExplorationState(entries) {
  return {
    participantCodes: entries.map((entry) => entry.base.code),
    tierByCode: Object.fromEntries(entries.map((entry) => [entry.base.code, "E"])),
    questionLabels: {},
    usedQuestionIds: [],
    currentTier: "E",
    currentQuestion: null,
    selectedAnswer: true,
    selectedDigit: 0,
    finished: false,
    rewardsGranted: false,
    rewardMap: {},
    logs: ["[秘境] 所有人已进入 E 级保底奖励区。"]
  };
}

export function getExplorationCodesByTier(exploration, tier) {
  if (!exploration) return [];
  return exploration.participantCodes.filter((code) => exploration.tierByCode[code] === tier);
}

export function getVisibleExplorationGrades(exploration) {
  if (!exploration) return ["E"];
  const highestIndex = Math.max(
    0,
    ...Object.values(exploration.tierByCode || {}).map((tier) => Math.max(0, EXPLORATION_GRADE_FLOW.indexOf(tier)))
  );
  return EXPLORATION_GRADE_FLOW.slice(0, highestIndex + 1).reverse();
}

export function getExplorationNextTier(currentTier) {
  const index = EXPLORATION_GRADE_FLOW.indexOf(currentTier);
  return EXPLORATION_GRADE_FLOW[index + 1] || "";
}

function isEven(value) {
  return Math.abs(Math.round(Number(value || 0))) % 2 === 0;
}

export { shuffleValues };
