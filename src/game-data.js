import { BIOGRAPHY_ENTRY_LIMIT, CHARACTER_ARCH_VERSION, GAME_VERSION, GRADE_SCALE, MAX_LEVEL, ROLE_LABELS } from "./config.js";
import { applyEquipmentBonuses, normalizeEquipmentBySlot } from "./equipment-data.js";
import { pickFactionFromBase } from "./image-tools.js";
import {
  clampTier,
  getComplexityTierLabel,
  getSymmetryTierLabel,
  mapPotentialGrade,
  normalizeColorBand,
  POTENTIAL_SCORE_RANGE_BY_GRADE
} from "./rule-tables.js";
import { clamp, createSeededRandom, gradeColor, gradeIndex, gradeMultiplier, lerp, normalizeMetric, round1 } from "./utils.js";

const BASE_SKILL_FAMILIES = [
  {
    familyId: "power-attack",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u5f3a\u529b\u653b\u51fb",
    category: "damage",
    damageType: "adaptive",
    target: "enemy",
    range: 0,
    radius: 0,
    cooldown: 5,
    mpCost: 0,
    multiplier: 1.2,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0
  },
  {
    familyId: "burn-attack",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u707c\u70e7\u653b\u51fb",
    category: "status-hit",
    damageType: "adaptive",
    target: "enemy",
    range: 0,
    radius: 0,
    cooldown: 5,
    mpCost: 0,
    multiplier: 1,
    flatDamage: 0,
    statusEffect: "burn",
    extraDamageRatio: 0.2
  },
  {
    familyId: "paralyze-attack",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u9ebb\u75f9\u653b\u51fb",
    category: "status-hit",
    damageType: "adaptive",
    target: "enemy",
    range: 0,
    radius: 0,
    cooldown: 5,
    mpCost: 0,
    multiplier: 1,
    flatDamage: 0,
    statusEffect: "paralyze",
    extraDamageRatio: 0.2
  },
  {
    familyId: "sleep-attack",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u7761\u7720\u653b\u51fb",
    category: "status-hit",
    damageType: "adaptive",
    target: "enemy",
    range: 0,
    radius: 0,
    cooldown: 5,
    mpCost: 0,
    multiplier: 1,
    flatDamage: 0,
    statusEffect: "sleep",
    extraDamageRatio: 0.2
  },
  {
    familyId: "strength-boost",
    role: "all",
    allowedRoles: ["melee", "ranged"],
    name: "\u529b\u91cf\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "primary",
    modifierKey: "strength",
    bonusRatio: 0.1
  },
  {
    familyId: "vitality-boost",
    role: "all",
    allowedRoles: ["melee"],
    name: "\u4f53\u8d28\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "primary",
    modifierKey: "vitality",
    bonusRatio: 0.1
  },
  {
    familyId: "agility-boost",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u654f\u6377\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "primary",
    modifierKey: "agility",
    bonusRatio: 0.1
  },
  {
    familyId: "intelligence-boost",
    role: "all",
    allowedRoles: ["caster"],
    name: "\u667a\u529b\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "primary",
    modifierKey: "intelligence",
    bonusRatio: 0.1
  },
  {
    familyId: "spirit-boost",
    role: "all",
    allowedRoles: ["melee", "caster"],
    name: "\u7cbe\u795e\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "primary",
    modifierKey: "spirit",
    bonusRatio: 0.1
  },
  {
    familyId: "physical-attack-boost",
    role: "all",
    allowedRoles: ["melee", "ranged"],
    name: "\u7269\u653b\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "derived",
    modifierKey: "physicalAttack",
    bonusRatio: 0.1
  },
  {
    familyId: "physical-defense-boost",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u7269\u9632\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "derived",
    modifierKey: "physicalDefense",
    bonusRatio: 0.1
  },
  {
    familyId: "magic-attack-boost",
    role: "all",
    allowedRoles: ["caster"],
    name: "\u6cd5\u653b\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "derived",
    modifierKey: "magicAttack",
    bonusRatio: 0.1
  },
  {
    familyId: "magic-defense-boost",
    role: "all",
    allowedRoles: ["melee", "ranged", "caster"],
    name: "\u6cd5\u9632\u589e\u5f3a",
    category: "passive",
    damageType: "adaptive",
    target: "self",
    range: 0,
    radius: 0,
    cooldown: 0,
    mpCost: 0,
    multiplier: 0,
    flatDamage: 0,
    statusEffect: null,
    extraDamageRatio: 0,
    modifierTarget: "derived",
    modifierKey: "magicDefense",
    bonusRatio: 0.1
  }
];

const ACTIVE_SKILL_COOLDOWNS = {
  E: 20,
  D: 19,
  C: 18,
  B: 17,
  A: 16,
  S: 14,
  SS: 12,
  SSS: 10
};

function isPinnedBiographyEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.type === "ranking-placement") return true;
  if (entry.type === "bloodline-awakening") return true;
  return entry.type === "tournament-placement" && ["冠军", "亚军", "3-4"].includes(entry.placement || "");
}

function getBiographyEntryPriority(entry) {
  if (!entry || typeof entry !== "object") return 0;
  if (entry.type === "ranking-placement") return 3;
  if (entry.type === "bloodline-awakening") return 2;
  if (entry.type === "tournament-placement" && ["冠军", "亚军", "3-4"].includes(entry.placement || "")) return 1;
  return 0;
}

function trimBiographyEntries(entries = [], limit = BIOGRAPHY_ENTRY_LIMIT) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (list.length <= limit) return list.slice(0, limit);
  const pinned = list
    .filter((entry) => isPinnedBiographyEntry(entry))
    .sort((left, right) => getBiographyEntryPriority(right) - getBiographyEntryPriority(left));
  if (pinned.length >= limit) {
    const pinnedSet = new Set(pinned.slice(0, limit));
    return list.filter((entry) => pinnedSet.has(entry)).slice(0, limit);
  }
  const normal = list.filter((entry) => !isPinnedBiographyEntry(entry)).slice(0, Math.max(0, limit - pinned.length));
  const keepSet = new Set([...pinned, ...normal]);
  return list.filter((entry) => keepSet.has(entry));
}

const BASE_LEVEL1_AVG = 1;
const BASE_LEVEL50_AVG = 200;
const GROWTH_EXPONENT = 1.85;
const SKILL_SLOT_TABLE = [
  { slots: 5, threshold: 0.1 },
  { slots: 4, threshold: 0.35 },
  { slots: 3, threshold: 1 }
];
const SKILL_SLOT_ATTR_MULTIPLIER = {
  3: 1,
  4: 0.955,
  5: 0.91
};
const EVENT_SEEDS = [
  {
    id: "idle",
    name: "无事发生",
    desc: "什么都没有发生。",
    weight: 100,
    type: "none",
    payload: {}
  },
  {
    id: "train",
    name: "勤学苦练",
    desc: "获得当级 20% 的经验。",
    weight: 50,
    type: "exp",
    payload: { ratio: 0.2 }
  },
  {
    id: "insight",
    name: "顿悟",
    desc: "获得当级 50% 的经验。",
    weight: 2,
    type: "exp",
    payload: { ratio: 0.5 }
  },
  {
    id: "sick",
    name: "吃坏肚子",
    desc: "下次战斗开始时获得“吃坏肚子”状态。",
    weight: 20,
    type: "debuff",
    payload: { statusId: "sick-half" }
  },
  {
    id: "learn-skill",
    name: "领悟技能",
    desc: "领悟一个新的技能，若空位不足则替换最低潜力技能。",
    weight: 2,
    type: "learn-skill",
    payload: {}
  },
  {
    id: "martial-progress",
    name: "武艺精进",
    desc: "增加 1 点随机一级属性（白字属性）。",
    weight: 20,
    type: "primary-bonus",
    payload: {}
  },
  {
    id: "love-sleep",
    name: "就爱睡觉",
    desc: "下次战斗开始时获得“睡眠”状态。",
    weight: 20,
    type: "debuff",
    payload: { statusId: "sleep" }
  },
  {
    id: "lost-direction",
    name: "路痴发作",
    desc: "下次战斗开始时在随机地点出生。",
    weight: 10,
    type: "random-spawn",
    payload: {}
  },
  {
    id: "survive",
    name: "死里逃生",
    desc: "下次战斗开始时获得一次“死里逃生”状态。",
    weight: 9,
    type: "revive",
    payload: { statusId: "revive-full" }
  },
  {
    id: "explore-ruins",
    name: "探索遗迹",
    desc: "低概率发现一件适合自己职业的装备。",
    weight: 1,
    type: "gain-equipment",
    payload: {}
  },
  {
    id: "junk-find",
    name: "捡到破烂",
    desc: "获得一件满足职业要求的随机 D 级装备。",
    weight: 20,
    type: "gain-equipment-grade",
    payload: { grade: "D" }
  },
  {
    id: "windfall",
    name: "一笔横财",
    desc: "获得一件满足职业要求的随机 C 级装备。",
    weight: 10,
    type: "gain-equipment-grade",
    payload: { grade: "C" }
  }
];

export async function syncSkillLibrary(storage) {
  const current = await storage.getSkillsRaw();
  const currentMap = new Map(current.map((skill) => [skill.id, skill]));
  const allowedFamilies = new Set(BASE_SKILL_FAMILIES.map((family) => family.familyId));
  const allowedIds = new Set(buildBaseSkillSeeds().map((skill) => skill.id));

  for (const skill of current) {
    if ((skill.familyId && !allowedFamilies.has(skill.familyId)) || !allowedIds.has(skill.id)) {
      await storage.putSkill({ ...skill, deleted: true, userEdited: true });
    }
  }

  for (const seed of buildBaseSkillSeeds()) {
    const existing = currentMap.get(seed.id);
    if (existing && existing.userEdited && existing.templateVersion === GAME_VERSION) {
      await storage.putSkill({
        ...seed,
        ...existing,
        templateVersion: GAME_VERSION
      });
      continue;
    }
    await storage.putSkill({
      ...existing,
      ...seed,
      deleted: existing?.deleted ?? false
    });
  }

  return storage.getAllSkills();
}

export function getBaseSkillFamilies() {
  return BASE_SKILL_FAMILIES.map((family) => ({ ...family }));
}

export async function syncEventLibrary(storage) {
  const current = await storage.getEventsRaw();
  const currentMap = new Map(current.map((event) => [event.id, event]));
  const seedIds = new Set(EVENT_SEEDS.map((event) => event.id));

  for (const event of current) {
    if (!seedIds.has(event.id)) {
      await storage.putEvent({ ...event, deleted: true, userEdited: false, templateVersion: GAME_VERSION });
    }
  }

  for (const seed of EVENT_SEEDS) {
    const existing = currentMap.get(seed.id);
    await storage.putEvent({
      ...existing,
      ...seed,
      deleted: false,
      userEdited: false,
      templateVersion: GAME_VERSION
    });
  }
  return storage.getAllEvents();
}

export function buildCharacterProfile(base, skills, allEquipment = []) {
  const faction = pickFactionFromBase(base);
  const seedKey = `${GAME_VERSION}:${base.code}`;
  const rng = createSeededRandom(seedKey);
  const role = chooseRole(rng);
  const potentialEval = evaluatePotential(base);
  const potential = potentialEval.grade;
  const skillSlots = pickSkillSlotCount(rng);
  const attributeBand = computeAttributeBand(potential, skillSlots);
  const primaryWeights = buildPrimaryWeights(getCompleteMetrics(base.metrics), role, `${seedKey}:primary`);
  const primaryStart = distributePrimaryBudget(primaryWeights, attributeBand.level1Average * 5);
  const primaryFinal = distributePrimaryBudget(primaryWeights, attributeBand.level50Average * 5);
  const growthCurves = Object.fromEntries(
    Object.keys(primaryStart).map((key) => [key, GROWTH_EXPONENT])
  );
  const growthSeries = buildGrowthSeries(primaryStart, primaryFinal, growthCurves, role);
  const initialSkillIds = pickInitialSkillIds(skills, role, potential, `${seedKey}:initial-skill`);
  const skillScore = initialSkillIds
    .map((id) => skills.find((skill) => skill.id === id))
    .filter(Boolean)
    .reduce((sum, skill) => sum + (skill?.impact || 0), 0);

  return {
    buildId: `${GAME_VERSION}:${base.code}`,
    capCode: base.code,
    archVersion: CHARACTER_ARCH_VERSION,
    gameVersion: GAME_VERSION,
    faction,
    originalFaction: faction,  // 固有门派：灭门战等只改 faction，此字段不变
    role,
    roleLabel: ROLE_LABELS[role],
    potential,
    potentialScore: potentialEval.score,
    potentialReason: potentialEval.reason,
    primaryStart,
    primaryFinal,
    growthCurves,
    growthSeries,
    skillSlots,
    skillIds: initialSkillIds,
    equipmentBySlot: normalizeEquipmentBySlot({}, role, allEquipment),
    skillScore,
    attributeBand,
    combatScore: Math.round(skillScore + Object.values(primaryFinal).reduce((sum, value) => sum + value, 0) * 2.4),
    generatedAt: Date.now()
  };
}

export function createDefaultProgress(buildId) {
  return {
    buildId,
    level: 1,
    experience: 0,
    totalBattles: 0,
    wins: 0,
    kills: 0,
    assists: 0,
    deaths: 0,
    nextBattleHalfHp: false,
    nextBattleRevive: false,
    nextBattleRandomSpawn: false,
    pendingStatusIds: [],
    bloodlineId: "",
    bloodlineGrantedSkillId: "",
    bloodlineFateBonusApplied: 0,
    nonBloodlineFateChangeCount: 0,
    bloodlineTaskCounts: {
      azureDragonHealerWins: 0,
      whiteTigerRecordBreaks: 0,
      vermilionBirdRevives: 0,
      blackTortoiseTankWins: 0
    },
    primaryBonus: {
      strength: 0,
      vitality: 0,
      agility: 0,
      intelligence: 0,
      spirit: 0
    },
      lastEventId: "",
      lastEventText: "",
      tournamentChampionCount: 0,
      tournamentRunnerUpCount: 0,
      tournamentTopFourCount: 0,
      fateChangeCount: 0,
      killMilestones: [],
      biographyEntries: []
    };
  }

export function normalizeProgressRecord(progress, buildId) {
  const normalized = {
    ...createDefaultProgress(buildId || progress?.buildId || ""),
    ...(progress || {})
  };

  normalized.pendingStatusIds = [...new Set(
    Array.isArray(normalized.pendingStatusIds)
      ? normalized.pendingStatusIds.filter((item) => typeof item === "string" && item)
      : []
    )];
    normalized.bloodlineId = typeof normalized.bloodlineId === "string" ? normalized.bloodlineId : "";
    normalized.bloodlineGrantedSkillId = typeof normalized.bloodlineGrantedSkillId === "string" ? normalized.bloodlineGrantedSkillId : "";
    normalized.bloodlineFateBonusApplied = Math.max(0, Math.floor(Number(normalized.bloodlineFateBonusApplied || 0)));
    normalized.nonBloodlineFateChangeCount = Math.max(
      0,
      Math.floor(Number(
        normalized.nonBloodlineFateChangeCount ??
        (Number(normalized.fateChangeCount || 0) - Number(normalized.bloodlineFateBonusApplied || 0))
      ))
    );
    normalized.bloodlineTaskCounts = {
      azureDragonHealerWins: Math.max(0, Math.floor(Number(normalized.bloodlineTaskCounts?.azureDragonHealerWins || 0))),
      whiteTigerRecordBreaks: Math.max(0, Math.floor(Number(normalized.bloodlineTaskCounts?.whiteTigerRecordBreaks || 0))),
      vermilionBirdRevives: Math.max(0, Math.floor(Number(normalized.bloodlineTaskCounts?.vermilionBirdRevives || 0))),
      blackTortoiseTankWins: Math.max(0, Math.floor(Number(normalized.bloodlineTaskCounts?.blackTortoiseTankWins || 0)))
    };
    normalized.tournamentChampionCount = Math.max(0, Math.floor(Number(normalized.tournamentChampionCount || 0)));
    normalized.tournamentRunnerUpCount = Math.max(0, Math.floor(Number(normalized.tournamentRunnerUpCount || 0)));
    normalized.tournamentTopFourCount = Math.max(0, Math.floor(Number(normalized.tournamentTopFourCount || 0)));
    normalized.fateChangeCount = Math.max(
      0,
      normalized.nonBloodlineFateChangeCount + normalized.bloodlineFateBonusApplied
    );
    normalized.killMilestones = [...new Set(
      Array.isArray(normalized.killMilestones)
        ? normalized.killMilestones
          .map((item) => Math.floor(Number(item)))
          .filter((item) => item > 0)
        : []
    )].sort((a, b) => a - b).slice(-24);
    normalized.nextBattleRandomSpawn = Boolean(normalized.nextBattleRandomSpawn);
    normalized.primaryBonus = {
      strength: Math.max(0, Math.floor(Number(normalized.primaryBonus?.strength || 0))),
    vitality: Math.max(0, Math.floor(Number(normalized.primaryBonus?.vitality || 0))),
    agility: Math.max(0, Math.floor(Number(normalized.primaryBonus?.agility || 0))),
    intelligence: Math.max(0, Math.floor(Number(normalized.primaryBonus?.intelligence || 0))),
    spirit: Math.max(0, Math.floor(Number(normalized.primaryBonus?.spirit || 0)))
  };
  normalized.biographyEntries = Array.isArray(normalized.biographyEntries)
    ? trimBiographyEntries(
      normalized.biographyEntries
        .map((item) => {
          if (typeof item === "string" && item) return { text: item, type: "legacy" };
          if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text) return null;
          return {
            type: typeof item.type === "string" ? item.type : "entry",
            text: item.text,
            subjectName: typeof item.subjectName === "string" ? item.subjectName : "",
            subjectGrade: typeof item.subjectGrade === "string" ? item.subjectGrade : "",
            skillName: typeof item.skillName === "string" ? item.skillName : "",
            skillGrade: typeof item.skillGrade === "string" ? item.skillGrade : "",
            equipmentName: typeof item.equipmentName === "string" ? item.equipmentName : "",
            equipmentGrade: typeof item.equipmentGrade === "string" ? item.equipmentGrade : "",
            rewardName: typeof item.rewardName === "string" ? item.rewardName : "",
            rewardGrade: typeof item.rewardGrade === "string" ? item.rewardGrade : "",
            placement: typeof item.placement === "string" ? item.placement : ""
          };
        })
        .filter(Boolean)
    )
    : [];

  return normalized;
}

export function appendBiographyEntry(progress, text) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  const nextEntries = trimBiographyEntries(
    [text, ...(normalized.biographyEntries || [])]
      .filter((item, index, array) => item && array.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index)
  );
  return {
    ...normalized,
    biographyEntries: nextEntries
  };
}

export function clearPendingBattleEffects(progress) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  return {
    ...normalized,
    nextBattleHalfHp: false,
    nextBattleRevive: false,
    nextBattleRandomSpawn: false,
    pendingStatusIds: []
  };
}

export function hasPendingBattleEffects(progress) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  return Boolean(
    normalized.nextBattleHalfHp ||
    normalized.nextBattleRevive ||
    normalized.nextBattleRandomSpawn ||
    (normalized.pendingStatusIds?.length || 0) > 0
  );
}

export function addPendingStatus(progress, statusId) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  return {
    ...normalized,
    pendingStatusIds: [...new Set([...(normalized.pendingStatusIds || []), statusId])]
  };
}

export function addPrimaryBonus(progress, key, value = 1) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  return {
    ...normalized,
    primaryBonus: {
      ...normalized.primaryBonus,
      [key]: Math.max(0, Math.floor(Number(normalized.primaryBonus[key] || 0) + value))
    }
  };
}

export function setNextBattleRandomSpawn(progress, enabled = true) {
  const normalized = normalizeProgressRecord(progress, progress?.buildId);
  return {
    ...normalized,
    nextBattleRandomSpawn: Boolean(enabled)
  };
}

function getCurrentPrimary(build, level) {
  const safeLevel = clamp(level, 1, MAX_LEVEL);
  return build.growthSeries[safeLevel - 1]?.primary || build.primaryFinal;
}

export function getEffectiveSheet(build, level, allSkills = [], allEquipment = [], bonusContext = {}) {
  const whitePrimary = getCurrentPrimary(build, level);
  const passiveSkills = (build.skillIds || [])
    .map((skillId) => allSkills.find((skill) => skill.id === skillId))
    .filter((skill) => skill && skill.category === "passive" && skillSupportsRole(skill, build.role));
  const greenPrimary = createPrimaryZeroes();
  const progressPrimaryBonus = mergeStatLayers(createPrimaryZeroes(), bonusContext.progress?.primaryBonus || createPrimaryZeroes());
  passiveSkills
    .filter((skill) => skill.modifierTarget === "primary")
    .forEach((skill) => {
      greenPrimary[skill.modifierKey] += whitePrimary[skill.modifierKey] * (skill.bonusRatio || 0);
    });
  const equipmentPrimary = mergeStatLayers(
    createPrimaryZeroes(),
    applyEquipmentBonuses(build, whitePrimary, createDerivedZeroes(), allEquipment).greenPrimary
  );
  const honorBonuses = applyHonorBonuses(
    whitePrimary,
    bonusContext.factionBattleWinCount || 0,
    bonusContext.progress || null,
    bonusContext.factionChampionCount || 0
  );
  const totalPrimaryBonus = mergeStatLayers(
    mergeStatLayers(mergeStatLayers(progressPrimaryBonus, greenPrimary), equipmentPrimary),
    honorBonuses.greenPrimary
  );
  const fateRatio = Math.max(0, Number(bonusContext.progress?.fateChangeCount || 0)) * 0.2;
  if (fateRatio > 0) {
    Object.keys(totalPrimaryBonus).forEach((key) => {
      totalPrimaryBonus[key] += whitePrimary[key] * fateRatio;
    });
  }
  const primary = mergeStatLayers(whitePrimary, totalPrimaryBonus);
  const whiteDerived = deriveStats(primary, build.role);
  const greenDerived = createDerivedZeroes();
  passiveSkills
    .filter((skill) => skill.modifierTarget === "derived")
    .forEach((skill) => {
      greenDerived[skill.modifierKey] += whiteDerived[skill.modifierKey] * (skill.bonusRatio || 0);
    });
  const equipmentBonuses = applyEquipmentBonuses(build, whitePrimary, whiteDerived, allEquipment);
  const statusDerivedBonuses = createDerivedZeroes();
  let cooldownExtraReductionRatio = 0;
  (bonusContext.persistentStatuses || []).forEach((status) => {
    const ratios = status?.derivedRatioBonuses || {};
    Object.keys(statusDerivedBonuses).forEach((key) => {
      const ratio = Number(ratios[key] || 0);
      if (!ratio) return;
      statusDerivedBonuses[key] += whiteDerived[key] * ratio;
    });
    cooldownExtraReductionRatio += Math.max(0, Number(status?.cooldownExtraReductionRatio || 0));
  });
  // 血脉之石：衍生属性比例加成（独立层，基于 whiteDerived）
  const stoneDerivedBonuses = createDerivedZeroes();
  const stoneRatios = equipmentBonuses.stoneDerivedRatioBonuses || {};
  Object.keys(stoneDerivedBonuses).forEach((key) => {
    const ratio = Number(stoneRatios[key] || 0);
    if (ratio) stoneDerivedBonuses[key] = (whiteDerived[key] || 0) * ratio;
  });
  // 血脉之石：CD 缩减
  cooldownExtraReductionRatio += Math.max(0, equipmentBonuses.stoneCdReductionRatio || 0);
  const totalDerivedBonus = mergeStatLayers(
    mergeStatLayers(mergeStatLayers(greenDerived, equipmentBonuses.greenDerived), statusDerivedBonuses),
    stoneDerivedBonuses
  );
  const derived = mergeStatLayers(
      whiteDerived,
      totalDerivedBonus
    );
  const cooldownBaseMultiplier = round1(Number(whiteDerived.cooldownDurationMultiplierPct || 100));
  const cooldownExtraMultiplier = round1(clamp(1 - cooldownExtraReductionRatio, 0.1, 1) * 100);
  const cooldownFinalMultiplier = round1(cooldownBaseMultiplier * (cooldownExtraMultiplier / 100));
  const cooldownFinalReduction = round1(100 - cooldownFinalMultiplier);
  const cooldownBaseReduction = round1(100 - cooldownBaseMultiplier);
  return {
      primary,
      derived: {
        ...derived,
        cooldownReduction: cooldownFinalReduction,
        cooldownDurationMultiplierPct: cooldownFinalMultiplier,
        stoneHpRegenMaxRatioPerSecond: equipmentBonuses.stoneHpRegenMaxRatioPerSecond || 0,
        stoneReviveHpPct: equipmentBonuses.stoneReviveHpPct || 0
      },
      whitePrimary,
      greenPrimary: totalPrimaryBonus,
      whiteDerived: {
        ...whiteDerived,
        cooldownReduction: cooldownBaseReduction
      },
      greenDerived: {
        ...totalDerivedBonus,
        cooldownReduction: round1(cooldownFinalReduction - cooldownBaseReduction),
        cooldownDurationMultiplierPct: cooldownExtraMultiplier
      }
    };
}

function applyHonorBonuses(whitePrimary, factionBattleWinCount = 0, progress = null, factionChampionCount = 0) {
  const championCount = Math.max(0, Number(progress?.tournamentChampionCount || 0));
  const runnerUpCount = Math.max(0, Number(progress?.tournamentRunnerUpCount || 0));
  const topFourCount = Math.max(0, Number(progress?.tournamentTopFourCount || 0));
  const totalRatio =
    factionBattleWinCount * 0.005 +
    championCount * 0.05 +
    factionChampionCount * 0.02 +
    runnerUpCount * 0.02 +
    topFourCount * 0.01;
  if (totalRatio <= 0) {
    return {
      greenPrimary: createPrimaryZeroes(),
      greenDerived: createDerivedZeroes()
    };
  }
  return {
    greenPrimary: Object.fromEntries(Object.entries(whitePrimary).map(([key, value]) => [key, value * totalRatio])),
    greenDerived: createDerivedZeroes()
  };
}

function deriveStats(primary, role) {
  const rangeBonus = role === "ranged" ? 0.4 : role === "caster" ? 0.6 : 0;
  const attackBase = role === "melee" ? 1.2 : role === "ranged" ? 1.45 : 1.7;
  const cooldownMastery = (primary.intelligence + primary.spirit) * 0.5;
  const statusResilience = (primary.strength + primary.vitality) * 0.5;
  const cooldownDurationMultiplier = computeDiminishingThirdMultiplier(cooldownMastery);
  const statusDurationMultiplier = computeDiminishingThirdMultiplier(statusResilience);
  const cooldownReductionRatio = 1 - cooldownDurationMultiplier;
  const statusResistanceRatio = 1 - statusDurationMultiplier;
  return {
    physicalAttack: primary.strength * 3,
    magicAttack: primary.intelligence * 3,
    physicalDefense: primary.vitality,
    magicDefense: primary.spirit,
    hpMax: 100 + primary.vitality * 10,
    hpRegen: round1(primary.vitality * 0.2),
    castSpeed: round1(1 + primary.agility * 0.04 + primary.intelligence * 0.04),
      mpMax: 0,
      mpRegen: 0,
      cooldownReduction: round1(cooldownReductionRatio * 100),
      cooldownDurationMultiplierPct: round1(cooldownDurationMultiplier * 100),
      statusResistance: round1(statusResistanceRatio * 100),
      statusDurationMultiplierPct: round1(statusDurationMultiplier * 100),
      meleeRange: 1.25,
    rangedRange: round1(3.6 + rangeBonus),
    magicRange: round1(4.2 + rangeBonus),
    attackInterval: round1(Math.max(role === "melee" ? 0.55 : 0.7, attackBase - primary.agility * 0.018)),
    chantTime: round1(Math.max(0.9, 2.2 - (primary.agility * 0.03 + primary.intelligence * 0.03)))
  };
}

export function expToNextLevel(level) {
  const safeLevel = Math.max(1, level);
  const band = Math.floor((safeLevel - 1) / 10);
  const withinBand = (safeLevel - 1) % 10;
  return (100 + withinBand * 50) * Math.pow(5, band);
}

export function grantExp(progress, expGain) {
  progress.experience += expGain;
  while (progress.level < MAX_LEVEL && progress.experience >= expToNextLevel(progress.level)) {
    progress.experience -= expToNextLevel(progress.level);
    progress.level += 1;
  }
  if (progress.level >= MAX_LEVEL) progress.experience = 0;
}

export function renderSkillChip(skill) {
  return `
    <span class="skill-chip" style="border-color:${gradeColor(skill.grade)};background:${gradeColor(skill.grade)}22;color:${gradeColor(skill.grade)};box-shadow:inset 0 0 0 1px rgba(31,43,36,0.16);text-shadow:0 1px 0 rgba(255,252,244,0.65)">
      ${skill.name}
      <span class="skill-tooltip">
        <strong>${skill.name}</strong><br>
        \u7b49\u7ea7 ${skill.grade} | CD ${skill.cooldown}s<br>
        ${skill.desc}
      </span>
    </span>
  `;
}

export function rollEvent(eventLibrary, seedKey = `${Date.now()}`) {
  const events = eventLibrary.filter((event) => !event.deleted);
  if (events.length === 0) return null;
  const rng = createSeededRandom(seedKey);
  const total = events.reduce((sum, event) => sum + Math.max(0, event.weight || 0), 0);
  let cursor = rng() * Math.max(1, total);
  for (const event of events) {
    cursor -= Math.max(0, event.weight || 0);
    if (cursor <= 0) return structuredClone(event);
  }
  return structuredClone(events[events.length - 1]);
}

function buildBaseSkillSeeds() {
  return BASE_SKILL_FAMILIES.flatMap((family) =>
    GRADE_SCALE.map((grade) => buildSkillSeedForGrade(family, grade))
  );
}

export function buildSkillSeedForGrade(family, grade) {
  const gradeFactor = Math.pow(1.2, gradeIndex(grade));
  const gradeStepRatio = round1(0.1 * (gradeIndex(grade) + 1));
  const multiplier = family.category === "status-hit"
    ? round1(family.multiplier)
    : round1(family.multiplier * gradeFactor);
  const flatDamage = Math.round(family.flatDamage * gradeFactor);
  const extraDamageRatio = family.category === "status-hit"
    ? gradeStepRatio
    : round1((family.extraDamageRatio || 0) * gradeFactor);
  const bonusRatio = round1((family.bonusRatio || 0) * (gradeIndex(grade) + 1));
  const cooldown = family.category === "passive"
    ? 0
    : ACTIVE_SKILL_COOLDOWNS[grade] || ACTIVE_SKILL_COOLDOWNS.E;
  const statusName = {
    burn: "灼烧",
    paralyze: "麻痹",
    sleep: "睡眠"
  }[family.statusEffect] || "";
  const skillData = {
    id: `${family.familyId}-${grade.toLowerCase()}`,
    familyId: family.familyId,
    name: `${family.name}${grade}`,
    role: family.role,
    allowedRoles: family.allowedRoles ? [...family.allowedRoles] : [family.role],
    grade,
    category: family.category,
    damageType: family.damageType,
    target: family.target,
    range: family.range,
    radius: family.radius,
    cooldown,
    mpCost: 0,
    multiplier,
    flatDamage,
    statusEffect: family.statusEffect || null,
    extraDamageRatio,
    modifierTarget: family.modifierTarget || null,
    modifierKey: family.modifierKey || null,
    bonusRatio
  };
  const desc = formatSkillDescription(skillData, statusName);
  const summary = formatSkillValueSummary(skillData);

  return {
    ...skillData,
    impact: family.category === "passive"
      ? Math.round(bonusRatio * 120)
      : Math.round(multiplier * 18 + flatDamage + extraDamageRatio * 40),
    summary,
    desc,
    templateVersion: GAME_VERSION,
    source: "system"
  };
}

export function formatSkillValueSummary(skill) {
  if (skill.category === "passive") {
    return `被动加成 ${Math.round((skill.bonusRatio || 0) * 100)}%`;
  }
  return `倍率 ${skill.multiplier} | 固伤 ${skill.flatDamage}`;
}

export function formatSkillDescription(skill, explicitStatusName = "") {
  const statusName = explicitStatusName || {
    burn: "灼烧",
    paralyze: "麻痹",
    sleep: "睡眠"
  }[skill.statusEffect] || "";
  if (skill.category === "status-hit") {
    return `下一次攻击命中时附加${statusName}状态，并额外造成该次攻击 ${Math.round((skill.extraDamageRatio || 0) * 100)}% 的伤害`;
  }
  if (skill.category === "passive") {
    return `被动：提高 ${formatModifierLabel(skill.modifierKey)} ${Math.round((skill.bonusRatio || 0) * 100)}%`;
  }
  return `造成 ${skill.multiplier} 倍普通攻击伤害`;
}

function chooseRole(rng) {
  const roles = ["melee", "ranged", "caster"];
  return roles[Math.floor(rng() * roles.length)];
}

function evaluatePotential(base) {
  const metrics = getCompleteMetrics(base.metrics);
  const colorBand = normalizeColorBand(metrics.colorCountScore ?? metrics.mainColorCount ?? 1);
  const complexityTier = clampTier(metrics.patternComplexityTier ?? deriveComplexityTier(metrics.patternComplexity));
  const symmetryTier = clampTier(metrics.patternSymmetryTier ?? deriveSymmetryTier(metrics.patternSymmetry));
  const tierTotal = complexityTier + symmetryTier;
  const grade = mapPotentialGrade(colorBand, tierTotal);
  const scoreRange = getScoreRangeByGrade(grade);
  const ratio = clamp(tierTotal / 6, 0, 1);
  const score = round1(lerp(scoreRange[0], scoreRange[1], ratio));

  return {
    score,
    grade,
    reason: {
      colors: colorBand,
      complexity: complexityTier,
      complexityLabel: getComplexityTierLabel(complexityTier),
      symmetry: symmetryTier,
      symmetryLabel: getSymmetryTierLabel(symmetryTier)
    }
  };
}

function getCompleteMetrics(metrics = {}) {
  return {
    variance: Number.isFinite(metrics.variance) ? metrics.variance : 10,
    edgeDensity: Number.isFinite(metrics.edgeDensity) ? metrics.edgeDensity : 8,
    radialContrast: Number.isFinite(metrics.radialContrast) ? metrics.radialContrast : 8,
    asymmetry: Number.isFinite(metrics.asymmetry) ? metrics.asymmetry : 4,
    flourish: Number.isFinite(metrics.flourish) ? metrics.flourish : 8,
    stripeScore: Number.isFinite(metrics.stripeScore) ? metrics.stripeScore : 8,
    mirrorSymmetry: Number.isFinite(metrics.mirrorSymmetry) ? metrics.mirrorSymmetry : 50,
    rotationalSymmetry: Number.isFinite(metrics.rotationalSymmetry) ? metrics.rotationalSymmetry : 50,
    mainColorCount: Number.isFinite(metrics.mainColorCount) ? metrics.mainColorCount : 1,
    colorRichness: Number.isFinite(metrics.colorRichness) ? metrics.colorRichness : 10,
    colorCountScore: Number.isFinite(metrics.colorCountScore) ? metrics.colorCountScore : (Number.isFinite(metrics.mainColorCount) ? metrics.mainColorCount : 1),
    patternComplexity: Number.isFinite(metrics.patternComplexity) ? metrics.patternComplexity : 12,
    patternComplexityTier: Number.isFinite(metrics.patternComplexityTier) ? clampTier(metrics.patternComplexityTier) : deriveComplexityTier(metrics.patternComplexity),
    patternSymmetry: Number.isFinite(metrics.patternSymmetry) ? metrics.patternSymmetry : 50,
    patternSymmetryTier: Number.isFinite(metrics.patternSymmetryTier) ? clampTier(metrics.patternSymmetryTier) : deriveSymmetryTier(metrics.patternSymmetry)
  };
}

function getScoreRangeByGrade(grade) {
  return POTENTIAL_SCORE_RANGE_BY_GRADE[grade] || POTENTIAL_SCORE_RANGE_BY_GRADE.E;
}

function deriveComplexityTier(value = 0) {
  const safe = clamp(value, 0, 100);
  if (safe < 28) return 0;
  if (safe < 52) return 1;
  if (safe < 78) return 2;
  return 3;
}

function deriveSymmetryTier(value = 0) {
  const safe = clamp(value, 0, 100);
  if (safe < 35) return 0;
  if (safe < 60) return 1;
  if (safe < 82) return 2;
  return 3;
}

export function learnSkillForBuild(build, allSkills, seedBase = `${build.buildId}:learn`) {
  const roleSkills = allSkills.filter((skill) => skillSupportsRole(skill, build.role) && !skill.deleted);
  if (roleSkills.length === 0) return build;
  const rng = createSeededRandom(`${seedBase}:${build.skillIds.length}`);
  const learned = chooseLearningSkill(roleSkills, build.potential, rng, build.skillIds);
  if (!learned) return build;
  const nextSkillIds = [...build.skillIds];
  if (nextSkillIds.length < build.skillSlots) {
    nextSkillIds.push(learned.id);
  } else {
    const lowestIndex = findLowestGradeSkillIndex(nextSkillIds, allSkills);
    if (lowestIndex >= 0) nextSkillIds[lowestIndex] = learned.id;
  }
  return rebuildLearnedSkillState({
    ...build,
    skillIds: dedupeSkillIds(nextSkillIds)
  }, allSkills);
}

export function grantSkillToBuild(build, skillId, allSkills) {
  if (!build || !skillId) return build;
  const normalizedSkillId = normalizeSkillIdsForLibrary([skillId])[0];
  if (!allSkills.some((skill) => skill.id === normalizedSkillId)) return build;
  const currentIds = dedupeSkillIds(normalizeSkillIdsForLibrary([...(build.skillIds || [])]));
  if (currentIds.includes(normalizedSkillId)) {
    return rebuildLearnedSkillState({
      ...build,
      skillIds: currentIds
    }, allSkills);
  }

  const nextIds = [...currentIds];
  if (nextIds.length < (build.skillSlots || 1)) {
    nextIds.push(normalizedSkillId);
  } else {
    const replaceIndex = findLowestGradeSkillIndex(nextIds, allSkills);
    if (replaceIndex >= 0) {
      nextIds[replaceIndex] = normalizedSkillId;
    } else {
      nextIds.push(normalizedSkillId);
    }
  }

  return rebuildLearnedSkillState({
    ...build,
    skillIds: dedupeSkillIds(nextIds).slice(0, build.skillSlots || nextIds.length)
  }, allSkills);
}

export function rebuildLearnedSkillState(build, allSkills) {
  const skillIds = dedupeSkillIds(
    normalizeSkillIdsForLibrary((build.skillIds || []).slice(0, build.skillSlots || 1))
  );
  const skillScore = skillIds
    .map((id) => allSkills.find((skill) => skill.id === id))
    .filter(Boolean)
    .reduce((sum, skill) => sum + (skill?.impact || 0), 0);
  return {
    ...build,
    skillIds,
    skillScore,
    combatScore: Math.round(skillScore + Object.values(build.primaryFinal).reduce((sum, value) => sum + value, 0) * 2.4)
  };
}

function buildPrimaryWeights(metrics, role, seedKey) {
  const rng = createSeededRandom(seedKey);
  const roleWeights = {
    melee: { strength: 1.28, vitality: 1.12, agility: 0.96, intelligence: 0.76, spirit: 0.88 },
    ranged: { strength: 1.02, vitality: 0.92, agility: 1.22, intelligence: 0.92, spirit: 0.92 },
    caster: { strength: 0.72, vitality: 0.9, agility: 0.98, intelligence: 1.28, spirit: 1.14 }
  }[role];
  const metricWeights = {
    strength: 1 + normalizeMetric(metrics.edgeDensity, 8, 28) * 0.2,
    vitality: 1 + normalizeMetric(metrics.variance, 20, 80) * 0.18,
    agility: 1 + normalizeMetric(metrics.stripeScore, 8, 28) * 0.22,
    intelligence: 1 + normalizeMetric(metrics.radialContrast, 8, 28) * 0.22,
    spirit: 1 + normalizeMetric(metrics.flourish, 6, 40) * 0.22
  };
  const keys = Object.keys(roleWeights);
  const rawWeights = {};
  keys.forEach((key) => {
    rawWeights[key] = roleWeights[key] * metricWeights[key] * (0.96 + rng() * 0.1);
  });
  const totalWeight = keys.reduce((sum, key) => sum + rawWeights[key], 0);
  return Object.fromEntries(keys.map((key) => [key, rawWeights[key] / totalWeight]));
}

function buildGrowthSeries(primaryStart, primaryFinal, growthCurves, role) {
  const series = [];
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const t = (level - 1) / Math.max(1, MAX_LEVEL - 1);
    const primary = {
      strength: round1(lerp(primaryStart.strength, primaryFinal.strength, Math.pow(t, growthCurves.strength))),
      vitality: round1(lerp(primaryStart.vitality, primaryFinal.vitality, Math.pow(t, growthCurves.vitality))),
      agility: round1(lerp(primaryStart.agility, primaryFinal.agility, Math.pow(t, growthCurves.agility))),
      intelligence: round1(lerp(primaryStart.intelligence, primaryFinal.intelligence, Math.pow(t, growthCurves.intelligence))),
      spirit: round1(lerp(primaryStart.spirit, primaryFinal.spirit, Math.pow(t, growthCurves.spirit)))
    };
    series.push({ level, primary, derived: deriveStats(primary, role) });
  }
  return series;
}

function computeAttributeBand(potential, skillSlots) {
  const baseLevel1 = BASE_LEVEL1_AVG * gradeMultiplier(potential);
  const baseLevel50 = BASE_LEVEL50_AVG * gradeMultiplier(potential);
  const multiplier = SKILL_SLOT_ATTR_MULTIPLIER[skillSlots] || 1;

  return {
    baseLevel1Average: round1(baseLevel1),
    baseLevel50Average: round1(baseLevel50),
    floorLevel1Average: round1(baseLevel1 * multiplier),
    floorLevel50Average: round1(baseLevel50 * multiplier),
    skillBurden: round1(1 - multiplier),
    level1Average: round1(baseLevel1 * multiplier),
    level50Average: round1(baseLevel50 * multiplier)
  };
}

function distributePrimaryBudget(weights, totalBudget) {
  const keys = Object.keys(weights);
  const totalTenths = Math.round(totalBudget * 10);
  const result = {};
  let assigned = 0;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      result[key] = round1((totalTenths - assigned) / 10);
      return;
    }
    const remainingSlots = keys.length - index - 1;
    const value = clamp(Math.floor(weights[key] * totalTenths), 0, totalTenths - assigned - remainingSlots);
    result[key] = round1(value / 10);
    assigned += value;
  });
  return result;
}

function gradeRarityWeight(grade) {
  return Math.pow(2, GRADE_SCALE.length - 1 - gradeIndex(grade));
}

function pickSkillSlotCount(rng) {
  const roll = rng();
  return SKILL_SLOT_TABLE.find((item) => roll < item.threshold)?.slots || 3;
}

function chooseLearningSkill(roleSkills, potential, rng, existingIds = []) {
  const ceiling = gradeIndex(potential);
  const available = roleSkills.filter((skill) => gradeIndex(skill.grade) <= ceiling);
  if (available.length === 0) return null;
  const weighted = available.map((skill) => ({
    skill,
    weight: gradeRarityWeight(skill.grade) * (existingIds.includes(skill.id) ? 0.15 : 1)
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return structuredClone(item.skill);
  }
  return structuredClone(weighted[weighted.length - 1].skill);
}

function skillSupportsRole(skill, role) {
  if (!skill) return false;
  if (skill.role === "all") {
    return !Array.isArray(skill.allowedRoles) || skill.allowedRoles.length === 0 || skill.allowedRoles.includes(role);
  }
  return skill.role === role;
}

function createPrimaryZeroes() {
  return {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0
  };
}

function createDerivedZeroes() {
  return {
    physicalAttack: 0,
    magicAttack: 0,
    physicalDefense: 0,
    magicDefense: 0,
    hpMax: 0,
    hpRegen: 0,
    castSpeed: 0,
      mpMax: 0,
      mpRegen: 0,
      cooldownReduction: 0,
      cooldownDurationMultiplierPct: 0,
      statusResistance: 0,
      statusDurationMultiplierPct: 0,
      meleeRange: 0,
    rangedRange: 0,
    magicRange: 0,
    attackInterval: 0,
    chantTime: 0
  };
}

function pickInitialSkillIds(allSkills, role, potential, seedKey) {
  const pool = allSkills.filter((skill) =>
    !skill.deleted &&
    skill.grade === potential &&
    skillSupportsRole(skill, role)
  );
  if (pool.length === 0) return [];
  const rng = createSeededRandom(seedKey);
  const picked = pool[Math.floor(rng() * pool.length)];
  return picked ? [picked.id] : [];
}

function mergeStatLayers(whiteStats, greenStats) {
  const result = {};
  Object.keys(whiteStats).forEach((key) => {
    result[key] = round1((whiteStats[key] || 0) + (greenStats[key] || 0));
  });
  return result;
}

function formatModifierLabel(modifierKey) {
  return {
    strength: "力量",
    vitality: "体质",
    agility: "敏捷",
    intelligence: "智力",
    spirit: "精神",
    physicalAttack: "物理攻击",
    physicalDefense: "物理防御",
    magicAttack: "魔法攻击",
    magicDefense: "魔法防御"
  }[modifierKey] || modifierKey;
}

function computeDiminishingThirdMultiplier(value = 0) {
  const safe = Math.max(0, Number(value || 0));
  return (safe + 500) / (safe * 3 + 500);
}

function findLowestGradeSkillIndex(skillIds, allSkills) {
  let bestIndex = -1;
  let bestGrade = Infinity;
  skillIds.forEach((id, index) => {
    const skill = allSkills.find((item) => item.id === id);
    const grade = gradeIndex(skill?.grade || "E");
    if (grade < bestGrade) {
      bestGrade = grade;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function dedupeSkillIds(skillIds) {
  return [...new Set(skillIds)];
}

function normalizeSkillIdsForLibrary(skillIds) {
  return skillIds.map((skillId) => {
    if (typeof skillId !== "string") return skillId;
    return skillId
      .replace(/^power-(strike|shot|orb)-/, "power-attack-")
      .replace(/^burn-(strike|shot|orb)-/, "burn-attack-")
      .replace(/^paralyze-(strike|shot|orb)-/, "paralyze-attack-")
      .replace(/^sleep-(strike|shot|orb)-/, "sleep-attack-");
  });
}
