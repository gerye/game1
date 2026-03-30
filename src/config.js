export const GAME_VERSION = "1.1.0";
export const CHARACTER_ARCH_VERSION = 4;
export const DB_NAME = "BottleCapBattleDB";
export const DB_VERSION = 10;

export const HEX_RADIUS = 13;
export const BATTLE_LOG_LIMIT = 20;
export const MAX_LEVEL = 50;
export const AVATAR_SIZE = 192;

export const CRIT_CHANCE = 0.05;
export const CRIT_DAMAGE_MULTIPLIER = 1.5;

export const STORES = {
  legacyCaps: "caps",
  capBases: "capBases",
  capBuilds: "capBuilds",
  capProgress: "capProgress",
  skills: "skills",
  equipment: "equipment",
  events: "events",
  bloodlines: "bloodlines",
  statuses: "statuses",
  meta: "meta"
};

export const GRADE_SCALE = ["E", "D", "C", "B", "A", "S", "SS", "SSS"];

export const GRADE_COLORS = {
  E: "#b8bcc3",
  D: "#f2dc8a",
  C: "#2f9e44",
  B: "#2563eb",
  A: "#7c3aed",
  S: "#111111",
  SS: "#f97316",
  SSS: "#dc2626"
};

export const ROLE_LABELS = {
  melee: "近战",
  ranged: "远射",
  caster: "法术"
};

export const FACTIONS = [
  {
    key: "palace",
    name: "教廷",
    color: "#d8cfbd",
    terrainAffinity: "plain",
    hue: [0, 40],
    light: [68, 100],
    sat: [0, 22]
  },
  {
    key: "demon",
    name: "魔教",
    color: "#d85a34",
    terrainAffinity: "lava",
    hue: [341, 25],
    light: [20, 100],
    sat: [26, 100]
  },
  {
    key: "shaolin",
    name: "少林",
    color: "#d6a21f",
    terrainAffinity: "plain",
    hue: [26, 74],
    light: [18, 100],
    sat: [18, 100]
  },
  {
    key: "qingyun",
    name: "青云门",
    color: "#3d8d56",
    terrainAffinity: "forest",
    hue: [75, 170],
    light: [14, 100],
    sat: [18, 100]
  },
  {
    key: "isle",
    name: "仙岛",
    color: "#2b83c9",
    terrainAffinity: "water",
    hue: [171, 235],
    light: [16, 100],
    sat: [20, 100]
  },
  {
    key: "soul",
    name: "魂殿",
    color: "#2f3640",
    terrainAffinity: "rock",
    hue: [236, 340],
    light: [0, 34],
    sat: [0, 36]
  }
];

export const TERRAIN_TYPES = {
  plain: {
    name: "平原",
    color: "#d8c18f",
    moveCost: 1,
    physMod: 0,
    magicMod: 0,
    physDef: 0,
    magicDef: 0
  },
  water: {
    name: "水域",
    color: "#8ecae6",
    moveCost: 1.25,
    physMod: -0.04,
    magicMod: 0.06,
    physDef: 0.02,
    magicDef: 0.05
  },
  forest: {
    name: "林地",
    color: "#8fbf7b",
    moveCost: 1.15,
    physMod: 0.02,
    magicMod: 0,
    physDef: 0.08,
    magicDef: 0.04
  },
  rock: {
    name: "岩地",
    color: "#a8a29e",
    moveCost: 1.35,
    physMod: 0.03,
    magicMod: -0.02,
    physDef: 0.1,
    magicDef: 0.08
  },
  lava: {
    name: "熔区",
    color: "#e76f51",
    moveCost: 1.4,
    physMod: 0.04,
    magicMod: 0.12,
    physDef: -0.05,
    magicDef: -0.04
  },
  wall: {
    name: "绝壁",
    color: "#5a5147",
    moveCost: 999,
    physMod: 0,
    magicMod: 0,
    physDef: 0.16,
    magicDef: 0.16,
    blocked: true
  }
};
