import { GAME_VERSION, GRADE_COLORS, GRADE_SCALE, ROLE_LABELS } from "./config.js";
import { createSeededRandom, gradeIndex } from "./utils.js";

export const EQUIPMENT_SLOT_LABELS = {
  weapon: "武器",
  armor: "防具",
  accessory: "饰品"
};

const ROLE_PRIMARY_PREFS = {
  melee: ["strength", "vitality"],
  ranged: ["strength", "agility"],
  caster: ["intelligence", "spirit"],
  all: ["vitality", "spirit"]
};

const ROLE_DERIVED_PREFS = {
  melee: ["physicalAttack", "physicalDefense"],
  ranged: ["physicalAttack", "physicalDefense"],
  caster: ["magicAttack", "magicDefense"],
  all: ["physicalDefense", "magicDefense"]
};

const GRADE_FLAT_TOTAL = {
  E: 2,
  D: 10
};

const GRADE_DERIVED_RATIO = {
  C: 0.1,
  B: 0.15,
  A: 0.2
};

const GRADE_PRIMARY_RATIO = {
  S: 0.2,
  SS: 0.25,
  SSS: 0.3
};

const GRADE_PREFIX = {
  D: "旅装",
  C: "精工",
  B: "名铸",
  A: "玄曦",
  S: "天工",
  SS: "圣辉",
  SSS: "神铸"
};

const ROLE_ITEM_NAMES = {
  melee: {
    weapon: "战刀",
    accessory: "虎纹护符"
  },
  ranged: {
    weapon: "长弓",
    accessory: "游隼指环"
  },
  caster: {
    weapon: "法杖",
    accessory: "灵辉吊坠"
  },
  all: {
    armor: "护甲",
    accessory: "通玄徽记"
  }
};

const BLOODLINE_STONE_TABLE = [
  // SSS 系列（S / SS / SSS）
  {
    id: "white-tiger",
    name: "白虎之石",
    stoneType: "white-tiger",
    grades: {
      SSS: { derivedRatioBonuses: { physicalAttack: 0.33, magicAttack: 0.33 } },
      SS:  { derivedRatioBonuses: { physicalAttack: 0.20, magicAttack: 0.20 } },
      S:   { derivedRatioBonuses: { physicalAttack: 0.10, magicAttack: 0.10 } }
    }
  },
  {
    id: "black-tortoise",
    name: "玄武之石",
    stoneType: "black-tortoise",
    grades: {
      SSS: { derivedRatioBonuses: { physicalDefense: 0.33, magicDefense: 0.33 } },
      SS:  { derivedRatioBonuses: { physicalDefense: 0.20, magicDefense: 0.20 } },
      S:   { derivedRatioBonuses: { physicalDefense: 0.10, magicDefense: 0.10 } }
    }
  },
  {
    id: "azure-dragon",
    name: "青龙之石",
    stoneType: "azure-dragon",
    grades: {
      SSS: { hpRegenMaxRatioPerSecond: 0.0017 },
      SS:  { hpRegenMaxRatioPerSecond: 0.0010 },
      S:   { hpRegenMaxRatioPerSecond: 0.0005 }
    }
  },
  {
    id: "vermilion-bird",
    name: "朱雀之石",
    stoneType: "vermilion-bird",
    grades: {
      SSS: { reviveHpPct: 0.33 },
      SS:  { reviveHpPct: 0.20 },
      S:   { reviveHpPct: 0.10 }
    }
  },
  // SS 系列（S / SS）
  {
    id: "blazing-sun",
    name: "烈阳之石",
    stoneType: "blazing-sun",
    grades: {
      SS: { derivedRatioBonuses: { physicalAttack: 0.05, magicAttack: 0.05 } },
      S:  { derivedRatioBonuses: { physicalAttack: 0.025, magicAttack: 0.025 } }
    }
  },
  {
    id: "cold-ice",
    name: "寒冰之石",
    stoneType: "cold-ice",
    grades: {
      SS: { derivedRatioBonuses: { physicalDefense: 0.06, magicDefense: 0.06 } },
      S:  { derivedRatioBonuses: { physicalDefense: 0.03, magicDefense: 0.03 } }
    }
  },
  {
    id: "demon",
    name: "恶魔之石",
    stoneType: "demon",
    grades: {
      SS: { hpRegenMaxRatioPerSecond: 0.0004 },
      S:  { hpRegenMaxRatioPerSecond: 0.0002 }
    }
  },
  {
    id: "angel",
    name: "天使之石",
    stoneType: "angel",
    grades: {
      SS: { cdReductionRatio: 0.02 },
      S:  { cdReductionRatio: 0.01 }
    }
  }
];

export async function syncEquipmentLibrary(storage) {
  const current = await storage.getEquipmentRaw();
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const seeds = buildEquipmentSeeds();
  const seedIds = new Set(seeds.map((item) => item.id));

  for (const item of current) {
    if (!seedIds.has(item.id)) {
      await storage.putEquipment({
        ...item,
        deleted: true,
        templateVersion: GAME_VERSION
      });
    }
  }

  for (const seed of seeds) {
    const existing = currentMap.get(seed.id);
    await storage.putEquipment({
      ...existing,
      ...seed,
      deleted: existing?.deleted ?? false,
      templateVersion: GAME_VERSION
    });
  }

  return storage.getAllEquipment();
}

function getStarterEquipmentIds(role, allEquipment) {
  const starterWeaponId = {
    melee: "equip-starter-sword-e",
    ranged: "equip-starter-bow-e",
    caster: "equip-starter-staff-e"
  }[role] || "";
  const starterArmorId = "equip-starter-shield-e";
  return {
    weapon: hasEquipment(allEquipment, starterWeaponId) ? starterWeaponId : "",
    armor: hasEquipment(allEquipment, starterArmorId) ? starterArmorId : "",
    accessory: ""
  };
}

export function normalizeEquipmentBySlot(equipmentBySlot = {}, role, allEquipment = []) {
  const starter = getStarterEquipmentIds(role, allEquipment);
  const next = {
    weapon: "",
    armor: "",
    accessory: "",
    ...(equipmentBySlot || {})
  };

  Object.keys(next).forEach((slot) => {
    const item = allEquipment.find((equipment) => equipment.id === next[slot] && !equipment.deleted) || null;
    if (!item || item.slot !== slot || !canRoleEquip(item, role)) {
      next[slot] = "";
    }
  });

  if (!next.weapon) next.weapon = starter.weapon;
  if (!next.armor) next.armor = starter.armor;
  return next;
}

export function getEquippedItems(build, allEquipment = []) {
  const equipmentBySlot = normalizeEquipmentBySlot(build?.equipmentBySlot, build?.role, allEquipment);
  return Object.entries(equipmentBySlot)
    .map(([slot, equipmentId]) => ({
      slot,
      item: allEquipment.find((equipment) => equipment.id === equipmentId) || null
    }));
}

export function applyEquipmentBonuses(build, whitePrimary, whiteDerived, allEquipment = []) {
  const greenPrimary = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0
  };
  const greenDerived = {
    physicalAttack: 0,
    magicAttack: 0,
    physicalDefense: 0,
    magicDefense: 0,
    hpMax: 0,
    hpRegen: 0,
    castSpeed: 0,
    meleeRange: 0,
    rangedRange: 0,
    magicRange: 0,
    attackInterval: 0,
    chantTime: 0
  };
  const stoneDerivedRatioBonuses = {};
  let stoneCdReductionRatio = 0;
  let stoneHpRegenMaxRatioPerSecond = 0;
  let stoneReviveHpPct = 0;

  const equipmentStars = build.equipmentStars || {};
  const equipped = getEquippedItems(build, allEquipment);
  equipped.forEach(({ slot, item }) => {
    if (!item) return;
    const stars = equipmentStars[slot] || 0;
    const starMultiplier = 1 + stars * 0.05;
    (item.effects || []).forEach((effect) => {
      if (effect.target === "primary") {
        const base = effect.mode === "pct"
          ? (whitePrimary[effect.key] || 0) * effect.value
          : effect.value;
        greenPrimary[effect.key] += base * starMultiplier;
        return;
      }
      const base = effect.mode === "pct"
        ? (whiteDerived[effect.key] || 0) * effect.value
        : effect.value;
      greenDerived[effect.key] += base * starMultiplier;
    });
    if (item.stoneEffects) {
      const se = item.stoneEffects;
      if (se.derivedRatioBonuses) {
        Object.entries(se.derivedRatioBonuses).forEach(([k, v]) => {
          stoneDerivedRatioBonuses[k] = (stoneDerivedRatioBonuses[k] || 0) + v * starMultiplier;
        });
      }
      if (se.hpRegenMaxRatioPerSecond) stoneHpRegenMaxRatioPerSecond += se.hpRegenMaxRatioPerSecond * starMultiplier;
      if (se.cdReductionRatio) stoneCdReductionRatio += se.cdReductionRatio * starMultiplier;
      if (se.reviveHpPct) stoneReviveHpPct = Math.max(stoneReviveHpPct, se.reviveHpPct * starMultiplier);
    }
  });

  return { greenPrimary, greenDerived, stoneDerivedRatioBonuses, stoneCdReductionRatio, stoneHpRegenMaxRatioPerSecond, stoneReviveHpPct };
}

function getMaxStarsForGrade(grade) {
  if (grade === "S" || grade === "SS" || grade === "SSS") return 5;
  return 3;
}

export function applyEquipmentDrop(build, equipmentId, allEquipment = []) {
  const item = allEquipment.find((equipment) => equipment.id === equipmentId && !equipment.deleted) || null;
  if (!item || !canRoleEquip(item, build.role)) return build;

  const equipmentBySlot = normalizeEquipmentBySlot(build.equipmentBySlot, build.role, allEquipment);
  const equipmentStars = { weapon: 0, armor: 0, accessory: 0, ...(build.equipmentStars || {}) };
  const previousId = equipmentBySlot[item.slot];
  const previous = allEquipment.find((equipment) => equipment.id === previousId) || null;

  if (previous) {
    const nextGradeIdx = gradeIndex(item.grade);
    const previousGradeIdx = gradeIndex(previous.grade);
    if (nextGradeIdx < previousGradeIdx) return build;

    if (nextGradeIdx === previousGradeIdx) {
      const maxStars = getMaxStarsForGrade(previous.grade);
      const currentStars = equipmentStars[item.slot] || 0;
      if (currentStars >= maxStars) {
        const nextGradeStr = GRADE_SCALE[gradeIndex(previous.grade) + 1];
        if (!nextGradeStr || previous.grade === "SSS") {
          return build;
        }
        const upgradePool = allEquipment.filter((eq) =>
          !eq.deleted &&
          eq.grade === nextGradeStr &&
          eq.slot === item.slot &&
          canRoleEquip(eq, build.role)
        );
        if (upgradePool.length === 0) {
          return build;
        }
        const rng = createSeededRandom(`${build.buildId}:star-upgrade:${item.slot}:${Date.now()}`);
        const picked = upgradePool[Math.floor(rng() * upgradePool.length)];
        return {
          ...build,
          equipmentBySlot: { ...equipmentBySlot, [item.slot]: picked.id },
          equipmentStars: { ...equipmentStars, [item.slot]: 0 }
        };
      }
      const newStars = currentStars + 1;

      if (newStars >= maxStars) {
        const nextGradeStr = GRADE_SCALE[gradeIndex(previous.grade) + 1];
        if (!nextGradeStr || previous.grade === "SSS") {
          return build;
        }
        const upgradePool = allEquipment.filter((eq) =>
          !eq.deleted &&
          eq.grade === nextGradeStr &&
          eq.slot === item.slot &&
          canRoleEquip(eq, build.role)
        );
        if (upgradePool.length === 0) {
          return build;
        }
        const rng = createSeededRandom(`${build.buildId}:star-upgrade:${item.slot}:${Date.now()}`);
        const picked = upgradePool[Math.floor(rng() * upgradePool.length)];
        return {
          ...build,
          equipmentBySlot: { ...equipmentBySlot, [item.slot]: picked.id },
          equipmentStars: { ...equipmentStars, [item.slot]: 0 }
        };
      }

      return {
        ...build,
        equipmentBySlot,
        equipmentStars: { ...equipmentStars, [item.slot]: newStars }
      };
    }
  }

  return {
    ...build,
    equipmentBySlot: {
      ...equipmentBySlot,
      [item.slot]: item.id
    },
    equipmentStars: { ...equipmentStars, [item.slot]: 0 }
  };
}

export function grantRandomEquipmentForBuild(build, allEquipment = [], seedKey = `${build.buildId}:equipment`) {
  const rng = createSeededRandom(seedKey);
  const grade = rollEquipmentGrade(rng);
  return grantEquipmentForBuildByGrade(build, allEquipment, grade, seedKey, rng);
}

export function grantEquipmentForBuildByGrade(build, allEquipment = [], grade = "D", seedKey = `${build.buildId}:equipment`, existingRng = null) {
  const rng = existingRng || createSeededRandom(seedKey);
  const gradePool = allEquipment.filter((item) =>
    !item.deleted &&
    item.grade === grade &&
    canRoleEquip(item, build.role)
  );
  if (gradePool.length === 0) {
    return { build, equipment: null };
  }

  const slots = [...new Set(gradePool.map((item) => item.slot))];
  const slot = slots[Math.floor(rng() * slots.length)];
  const slotPool = gradePool.filter((item) => item.slot === slot);
  const picked = slotPool[Math.floor(rng() * slotPool.length)] || null;
  if (!picked) {
    return { build, equipment: null };
  }

  return {
    build: applyEquipmentDrop(build, picked.id, allEquipment),
    equipment: picked
  };
}

export function canRoleEquip(item, role) {
  return !Array.isArray(item.allowedRoles) || item.allowedRoles.includes(role);
}

function hasEquipment(allEquipment, equipmentId) {
  return allEquipment.some((item) => item.id === equipmentId && !item.deleted);
}

function rollEquipmentGrade(rng) {
  const weights = [
    { grade: "SSS", weight: 1 },
    { grade: "SS", weight: 2 },
    { grade: "S", weight: 4 },
    { grade: "A", weight: 10 },
    { grade: "B", weight: 20 },
    { grade: "C", weight: 40 },
    { grade: "D", weight: 100 }
  ];
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of weights) {
    cursor -= item.weight;
    if (cursor <= 0) return item.grade;
  }
  return "D";
}

function buildEquipmentSeeds() {
  const starter = [
    makeEquipmentSeed({
      id: "equip-starter-sword-e",
      grade: "E",
      slot: "weapon",
      role: "melee",
      allowedRoles: ["melee"],
      name: "新手剑",
      effects: buildSplitEffects("primary", ROLE_PRIMARY_PREFS.melee, GRADE_FLAT_TOTAL.E, [0.5, 0.5]),
      flavor: "粗糙但顺手的练习剑。"
    }),
    makeEquipmentSeed({
      id: "equip-starter-bow-e",
      grade: "E",
      slot: "weapon",
      role: "ranged",
      allowedRoles: ["ranged"],
      name: "新手弓",
      effects: buildSplitEffects("primary", ROLE_PRIMARY_PREFS.ranged, GRADE_FLAT_TOTAL.E, [0.5, 0.5]),
      flavor: "轻便木弓，适合最初的瞄准训练。"
    }),
    makeEquipmentSeed({
      id: "equip-starter-staff-e",
      grade: "E",
      slot: "weapon",
      role: "caster",
      allowedRoles: ["caster"],
      name: "新手法杖",
      effects: buildSplitEffects("primary", ROLE_PRIMARY_PREFS.caster, GRADE_FLAT_TOTAL.E, [0.5, 0.5]),
      flavor: "入门法杖，能稳定引导最基础的术式。"
    }),
    makeEquipmentSeed({
      id: "equip-starter-shield-e",
      grade: "E",
      slot: "armor",
      role: "all",
      allowedRoles: ["melee", "ranged", "caster"],
      name: "新手圆盾",
      effects: buildSplitEffects("primary", ["vitality", "spirit"], GRADE_FLAT_TOTAL.E, [0.5, 0.5]),
      flavor: "结实的圆盾，谁都能先拿来保命。"
    })
  ];

  const advanced = GRADE_SCALE.filter((grade) => grade !== "E").flatMap((grade) => ([
    createRoleEquipment(grade, "melee", "weapon"),
    createRoleEquipment(grade, "ranged", "weapon"),
    createRoleEquipment(grade, "caster", "weapon"),
    createRoleEquipment(grade, "all", "armor")
  ]));

  const bloodstones = buildBloodlineStones();

  return [...starter, ...advanced, ...bloodstones];
}

function createRoleEquipment(grade, role, slot) {
  const effects = grade === "D"
    ? buildSplitEffects("primary", ROLE_PRIMARY_PREFS[role], GRADE_FLAT_TOTAL.D, [0.6, 0.4])
    : GRADE_DERIVED_RATIO[grade]
      ? buildSplitEffects("derived", ROLE_DERIVED_PREFS[role], GRADE_DERIVED_RATIO[grade], [0.6, 0.4], "pct")
      : buildSplitEffects("primary", ROLE_PRIMARY_PREFS[role], GRADE_PRIMARY_RATIO[grade], [0.6, 0.4], "pct");

  const itemName = `${GRADE_PREFIX[grade]}${ROLE_ITEM_NAMES[role][slot]}`;
  return makeEquipmentSeed({
    id: `equip-${role}-${slot}-${grade.toLowerCase()}`,
    grade,
    slot,
    role,
    allowedRoles: role === "all" ? ["melee", "ranged", "caster"] : [role],
    name: itemName,
    effects,
    flavor: buildFlavorText(role, slot, grade)
  });
}

function buildSplitEffects(target, keys, total, shares, mode = "flat") {
  return keys.slice(0, shares.length).map((key, index) => ({
    target,
    key,
    mode,
    value: mode === "pct"
      ? roundPct(total * shares[index])
      : Math.round(total * shares[index])
  }));
}

function makeEquipmentSeed({ id, grade, slot, role, allowedRoles, name, effects, flavor }) {
  return {
    id,
    grade,
    slot,
    role,
    allowedRoles,
    name,
    effects,
    desc: buildEquipmentDesc(effects, flavor),
    iconDataUrl: buildEquipmentIconDataUrl({ grade, slot, role, name }),
    templateVersion: GAME_VERSION,
    source: "system"
  };
}

function buildEquipmentDesc(effects, flavor) {
  const effectText = effects.map((effect) => {
    const label = effect.target === "primary"
      ? PRIMARY_LABELS[effect.key]
      : DERIVED_LABELS[effect.key];
    if (effect.mode === "pct") {
      return `${label} +${Math.round(effect.value * 100)}%`;
    }
    return `${label} +${effect.value}`;
  }).join("，");
  return `${effectText}。${flavor}`;
}

function buildFlavorText(role, slot, grade) {
  const roleLabel = role === "all" ? "通用" : ROLE_LABELS[role];
  const slotLabel = EQUIPMENT_SLOT_LABELS[slot];
  return `${roleLabel}${slotLabel}，${grade} 级锻造风格更鲜明。`;
}

function buildEquipmentIconDataUrl({ grade, slot, role, name }) {
  const color = GRADE_COLORS[grade] || "#999999";
  const glow = gradeIndex(grade) >= 5 ? 0.48 : gradeIndex(grade) >= 3 ? 0.28 : 0.16;
  const sparks = Array.from({ length: Math.max(1, gradeIndex(grade)) }, (_, index) => `
    <circle cx="${24 + index * 8}" cy="${14 + (index % 3) * 10}" r="${1.4 + Math.min(2, gradeIndex(grade) * 0.12)}" fill="${color}" opacity="${0.34 + glow}" />
  `).join("");
  const shape = {
    weapon: role === "caster"
      ? `<path d="M54 18 L68 32 L62 38 L72 70 L58 76 L48 44 L42 50 L30 38 Z" fill="${color}" stroke="#fff9ef" stroke-width="3" stroke-linejoin="round"/>`
      : role === "ranged"
        ? `<path d="M26 22 Q54 18 74 44 Q55 70 28 66 Q48 48 49 44 Q48 40 26 22 Z" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 64 L73 25" stroke="#fff9ef" stroke-width="2.5"/>`
        : `<path d="M30 62 L54 18 L66 24 L46 58 L58 70 L50 78 L38 66 L24 74 L18 66 Z" fill="${color}" stroke="#fff9ef" stroke-width="3" stroke-linejoin="round"/>`,
    armor: `<path d="M28 24 L42 16 L56 20 L70 16 L84 24 L76 70 L56 82 L36 70 Z" fill="${color}" stroke="#fff9ef" stroke-width="3" stroke-linejoin="round"/><circle cx="56" cy="46" r="12" fill="rgba(255,249,239,0.24)" stroke="#fff9ef" stroke-width="2"/>`,
    accessory: `<circle cx="56" cy="48" r="22" fill="rgba(255,249,239,0.16)" stroke="${color}" stroke-width="6"/><path d="M56 16 L64 28 L56 34 L48 28 Z" fill="${color}"/><circle cx="56" cy="48" r="7" fill="${color}" opacity="0.82"/>`
  }[slot];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 96">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffaf0"/>
          <stop offset="100%" stop-color="#efe2c5"/>
        </linearGradient>
        <filter id="glow">
          <feDropShadow dx="0" dy="0" stdDeviation="${2 + gradeIndex(grade) * 0.7}" flood-color="${color}" flood-opacity="${glow}"/>
        </filter>
      </defs>
      <rect width="112" height="96" rx="24" fill="url(#bg)"/>
      <rect x="6" y="6" width="100" height="84" rx="20" fill="rgba(255,255,255,0.36)" stroke="rgba(31,43,36,0.08)"/>
      <g filter="url(#glow)">${shape}</g>
      ${sparks}
      <text x="56" y="90" text-anchor="middle" font-size="10" font-family="Avenir Next, PingFang SC, Microsoft YaHei, sans-serif" fill="#5e4939">${escapeXml(name)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function roundPct(value) {
  return Math.round(value * 1000) / 1000;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const PRIMARY_LABELS = {
  strength: "力量",
  vitality: "体质",
  agility: "敏捷",
  intelligence: "智力",
  spirit: "精神"
};

const DERIVED_LABELS = {
  physicalAttack: "物攻",
  magicAttack: "法攻",
  physicalDefense: "物防",
  magicDefense: "法防",
  hpMax: "HP",
  hpRegen: "生命回复",
  castSpeed: "施法速度",
  meleeRange: "近战范围",
  rangedRange: "远程范围",
  magicRange: "法术范围",
  attackInterval: "攻击间隔",
  chantTime: "吟唱时间"
};

function buildBloodlineStones() {
  return BLOODLINE_STONE_TABLE.flatMap(({ id, name, stoneType, grades }) =>
    Object.entries(grades).map(([grade, stoneEffects]) => ({
      id: `stone-${id}-${grade.toLowerCase()}`,
      grade,
      slot: "accessory",
      role: "all",
      allowedRoles: ["melee", "ranged", "caster"],
      stoneType,
      name: `${name}·${grade}`,
      effects: [],
      stoneEffects,
      desc: buildStoneDesc(stoneEffects),
      iconDataUrl: buildStoneIconDataUrl(stoneType, grade, name),
      templateVersion: GAME_VERSION,
      source: "system"
    }))
  );
}

function buildStoneDesc(stoneEffects) {
  const parts = [];
  if (stoneEffects.derivedRatioBonuses) {
    Object.entries(stoneEffects.derivedRatioBonuses).forEach(([k, v]) => {
      parts.push(`${DERIVED_LABELS[k] || k} +${Math.round(v * 100)}%`);
    });
  }
  if (stoneEffects.hpRegenMaxRatioPerSecond) {
    parts.push(`每秒回复最大HP的 ${(stoneEffects.hpRegenMaxRatioPerSecond * 100).toFixed(2)}%`);
  }
  if (stoneEffects.cdReductionRatio) {
    parts.push(`技能CD缩减 ${Math.round(stoneEffects.cdReductionRatio * 100)}%`);
  }
  if (stoneEffects.reviveHpPct) {
    parts.push(`阵亡后以 ${Math.round(stoneEffects.reviveHpPct * 100)}% HP复活一次`);
  }
  return parts.join("，") + "。血脉残影，力量犹在。";
}

function buildStoneIconDataUrl(stoneType, grade, stoneName) {
  const color = GRADE_COLORS[grade] || "#999999";
  const glow = gradeIndex(grade) >= 5 ? 0.48 : gradeIndex(grade) >= 3 ? 0.28 : 0.16;
  const stdDev = 2 + gradeIndex(grade) * 0.7;

  const shapes = {
    "white-tiger": `
      <path d="M28 30 Q56 18 84 34" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M24 48 Q56 36 88 50" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M28 66 Q56 54 84 68" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>`,
    "black-tortoise": `
      <polygon points="56,16 82,30 82,60 56,74 30,60 30,30" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="56,30 70,38 70,54 56,62 42,54 42,38" fill="${color}" opacity="0.45"/>
      <line x1="56" y1="16" x2="56" y2="74" stroke="${color}" stroke-width="2" opacity="0.55"/>
      <line x1="30" y1="30" x2="82" y2="60" stroke="${color}" stroke-width="2" opacity="0.55"/>
      <line x1="82" y1="30" x2="30" y2="60" stroke="${color}" stroke-width="2" opacity="0.55"/>`,
    "azure-dragon": `
      <path d="M38 68 Q26 50 40 34 Q54 18 72 32 Q88 46 78 66" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
      <path d="M48 62 Q40 48 50 38 Q60 28 70 38 Q80 48 72 60" fill="${color}" opacity="0.35" stroke="${color}" stroke-width="3"/>
      <path d="M56 28 Q62 18 72 16 Q66 26 60 30 Z" fill="${color}" opacity="0.9"/>`,
    "vermilion-bird": `
      <path d="M56 26 L30 16 Q26 34 36 44 L56 38 L76 44 Q86 34 82 16 Z" fill="${color}" opacity="0.75" stroke="${color}" stroke-width="1.5"/>
      <path d="M44 42 L36 60 Q40 65 50 60 L56 52 L62 60 Q72 65 76 60 L68 42" fill="${color}" opacity="0.5" stroke="${color}" stroke-width="1.5"/>
      <path d="M51 52 L47 72 L56 66 L65 72 L61 52 Z" fill="${color}" opacity="0.9"/>`,
    "blazing-sun": `
      <circle cx="56" cy="46" r="14" fill="${color}" opacity="0.8"/>
      <line x1="56" y1="14" x2="56" y2="26" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="56" y1="66" x2="56" y2="78" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="24" y1="46" x2="36" y2="46" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="76" y1="46" x2="88" y2="46" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="33" y1="25" x2="41" y2="33" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
      <line x1="71" y1="59" x2="79" y2="67" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
      <line x1="79" y1="25" x2="71" y2="33" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
      <line x1="41" y1="59" x2="33" y2="67" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`,
    "cold-ice": `
      <line x1="56" y1="12" x2="56" y2="80" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="20" y1="34" x2="92" y2="58" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="20" y1="58" x2="92" y2="34" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="56" y1="12" x2="46" y2="22" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <line x1="56" y1="12" x2="66" y2="22" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <line x1="56" y1="80" x2="46" y2="70" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
      <line x1="56" y1="80" x2="66" y2="70" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`,
    "demon": `
      <path d="M36 72 Q24 52 28 28 Q34 14 46 18 Q50 34 56 40 Q62 34 66 18 Q78 14 84 28 Q88 52 76 72" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="56" cy="48" r="9" fill="${color}" opacity="0.75"/>`,
    "angel": `
      <circle cx="56" cy="44" r="21" fill="none" stroke="${color}" stroke-width="6"/>
      <line x1="56" y1="12" x2="56" y2="80" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="22" y1="44" x2="90" y2="44" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`
  };

  const shape = shapes[stoneType] || shapes["angel"];
  const label = `${stoneName}·${grade}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 96">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#fffaf0"/>
          <stop offset="100%" stop-color="#efe2c5"/>
        </linearGradient>
        <filter id="glow">
          <feDropShadow dx="0" dy="0" stdDeviation="${stdDev}" flood-color="${color}" flood-opacity="${glow}"/>
        </filter>
      </defs>
      <rect width="112" height="96" rx="24" fill="url(#bg)"/>
      <rect x="6" y="6" width="100" height="84" rx="20" fill="rgba(255,255,255,0.36)" stroke="rgba(31,43,36,0.08)"/>
      <g filter="url(#glow)">${shape}</g>
      <text x="56" y="90" text-anchor="middle" font-size="9" font-family="Avenir Next, PingFang SC, Microsoft YaHei, sans-serif" fill="#5e4939">${escapeXml(label)}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
