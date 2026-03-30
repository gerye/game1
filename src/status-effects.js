import { GAME_VERSION } from "./config.js";

const STATUS_SEEDS = [
  {
    id: "sick-half",
    name: "吃坏肚子",
    kind: "debuff",
    duration: 0,
    unique: true,
    desc: "本场战斗开始时只以一半生命值出战。",
    battleStartHpRatio: 0.5,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "sick",
    visualColor: "#84cc16",
    visualAccent: "#d9f99d"
  },
  {
    id: "revive-full",
    name: "死里逃生",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "本场战斗中满血死亡后会在出生点满血复活一次，然后移除该状态。",
    reviveOnDeath: "full-spawn",
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "halo",
    visualColor: "#f59e0b",
    visualAccent: "#fde68a"
  },
  {
    id: "bind",
    name: "束缚",
    kind: "debuff",
    duration: 1.5,
    unique: false,
    desc: "持续时间内无法移动，但仍可攻击和释放技能。",
    blocksMove: true,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "bind",
    visualColor: "#8b5cf6",
    visualAccent: "#c4b5fd"
  },
  {
    id: "burn",
    name: "灼烧",
    kind: "debuff",
    duration: 2.5,
    unique: true,
    desc: "持续 2.5 秒，每秒损失最大生命值 2.5% 的生命。",
    hpLossPerSecondRatio: 0.025,
    periodicTickSeconds: 0.1,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "burn",
    visualColor: "#f97316",
    visualAccent: "#fdba74"
  },
  {
    id: "paralyze",
    name: "麻痹",
    kind: "debuff",
    duration: 1.5,
    unique: true,
    desc: "持续期间不能移动、攻击或释放技能。",
    blocksMove: true,
    blocksAttack: true,
    blocksSkill: true,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "paralyze",
    visualColor: "#facc15",
    visualAccent: "#fde047"
  },
  {
    id: "sleep",
    name: "睡眠",
    kind: "debuff",
    duration: 150,
    unique: true,
    desc: "在下一次受到攻击前不能移动、攻击或释放技能，且下一次承受的攻击伤害变为 2.5 倍，最长持续 150 秒。",
    incomingDamageMultiplier: 2.5,
    breaksOnHit: true,
    blocksMove: true,
    blocksAttack: true,
    blocksSkill: true,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "sleep",
    visualColor: "#60a5fa",
    visualAccent: "#dbeafe"
  },
  {
    id: "sect-glory",
    name: "江湖大派",
    kind: "buff",
    duration: 0,
    unique: false,
    desc: "所属门派每获得 1 次武道会或排位赛冠军，该门派全员全属性 +2%。可叠层。",
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#10b981",
    visualAccent: "#a7f3d0"
  },
  {
    id: "favored-one",
    name: "天之骄子",
    kind: "buff",
    duration: 0,
    unique: false,
    desc: "每获得 1 次武道会或排位赛冠军，自身全属性 +5%。可叠层。",
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#f59e0b",
    visualAccent: "#fde68a"
  },
  {
    id: "runner-up-glory",
    name: "稍逊风骚",
    kind: "buff",
    duration: 0,
    unique: false,
    desc: "每获得 1 次武道会或排位赛亚军，自身全属性 +2%。可叠层。",
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#fb923c",
    visualAccent: "#fed7aa"
  },
  {
    id: "rising-star",
    name: "后起之秀",
    kind: "buff",
    duration: 0,
    unique: false,
    desc: "每获得 1 次武道会或排位赛前四，自身全属性 +1%。可叠层。",
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#38bdf8",
    visualAccent: "#bae6fd"
  },
  {
    id: "azure-dragon-aura",
    name: "青龙附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "每秒回复最大生命值 0.5% 的生命。",
    hpRegenMaxRatioPerSecond: 0.005,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "halo",
    visualColor: "#2563eb",
    visualAccent: "#93c5fd"
  },
  {
    id: "white-tiger-aura",
    name: "白虎附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "物攻与法攻提高 100%。",
    derivedRatioBonuses: {
      physicalAttack: 1,
      magicAttack: 1
    },
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#f8fafc",
    visualAccent: "#d4d4d8"
  },
  {
    id: "vermilion-bird-aura",
    name: "朱雀附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "每次战斗开始时获得死里逃生。",
    battleStartGrantedStatusIds: ["revive-full"],
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "burn",
    visualColor: "#ef4444",
    visualAccent: "#fb923c"
  },
  {
    id: "black-tortoise-aura",
    name: "玄武附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "物防与法防提高 100%。",
    derivedRatioBonuses: {
      physicalDefense: 1,
      magicDefense: 1
    },
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#334155",
    visualAccent: "#94a3b8"
  },
  {
    id: "angel-aura",
    name: "天使附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "额外减少 10% 的 CD。",
    cooldownExtraReductionRatio: 0.1,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "halo",
    visualColor: "#fbbf24",
    visualAccent: "#fef3c7"
  },
  {
    id: "demon-aura",
    name: "恶魔附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "每秒回复最大生命值 0.2% 的生命。",
    hpRegenMaxRatioPerSecond: 0.002,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#7c3aed",
    visualAccent: "#c4b5fd"
  },
  {
    id: "feral-beast-aura",
    name: "凶兽附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%。",
    cooldownExtraReductionRatio: 0.03,
    hpRegenMaxRatioPerSecond: 0.001,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#65a30d",
    visualAccent: "#bef264"
  },
  {
    id: "mammoth-beast-aura",
    name: "蛮兽附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%。",
    cooldownExtraReductionRatio: 0.03,
    hpRegenMaxRatioPerSecond: 0.001,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#92400e",
    visualAccent: "#fcd34d"
  },
  {
    id: "ape-beast-aura",
    name: "荒兽附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%。",
    cooldownExtraReductionRatio: 0.03,
    hpRegenMaxRatioPerSecond: 0.001,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#166534",
    visualAccent: "#86efac"
  },
  {
    id: "ox-beast-aura",
    name: "夷兽附体",
    kind: "buff",
    duration: 0,
    unique: true,
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%。",
    cooldownExtraReductionRatio: 0.03,
    hpRegenMaxRatioPerSecond: 0.001,
    templateVersion: GAME_VERSION,
    source: "system",
    visualType: "buff",
    visualColor: "#57534e",
    visualAccent: "#d6d3d1"
  }
];

export function getBuiltinStatuses() {
  return STATUS_SEEDS.map((status) => ({ ...status }));
}

export function getStatusSeedById(statusId) {
  const matched = STATUS_SEEDS.find((status) => status.id === statusId);
  return matched ? { ...matched } : null;
}

export function findStatusWithFlag(entity, flagName) {
  return entity?.statuses?.find((status) => Boolean(status?.[flagName])) || null;
}

export function hasStatusFlag(entity, flagName) {
  return Boolean(entity?.statuses?.some((status) => Boolean(status?.[flagName])));
}

export function mergeStatusLibrary(records = []) {
  const merged = new Map();
  for (const seed of STATUS_SEEDS) {
    merged.set(seed.id, { ...seed, deleted: false });
  }
  for (const record of records) {
    if (!record?.id) continue;
    const seed = merged.get(record.id);
    if (seed) {
      merged.set(record.id, {
        ...seed,
        ...record,
        deleted: false,
        source: record.source || seed.source || "system",
        templateVersion: GAME_VERSION
      });
      continue;
    }
    if (record.deleted) continue;
    merged.set(record.id, { ...record });
  }
  return [...merged.values()].filter((status) => !status.deleted);
}

export async function syncStatusLibrary(storage) {
  const current = await storage.getStatusesRaw();
  const currentMap = new Map(current.map((status) => [status.id, status]));
  const seedIds = new Set(STATUS_SEEDS.map((status) => status.id));

  for (const status of current) {
    if (!seedIds.has(status.id) && status.source === "system") {
      await storage.putStatus({
        ...status,
        deleted: true,
        source: "system",
        templateVersion: GAME_VERSION
      });
    }
  }

  for (const seed of STATUS_SEEDS) {
    const existing = currentMap.get(seed.id);
    if (existing && existing.userEdited && existing.templateVersion === GAME_VERSION) {
      await storage.putStatus({
        ...seed,
        ...existing,
        deleted: false,
        source: existing.source || seed.source || "system",
        templateVersion: GAME_VERSION
      });
      continue;
    }

    await storage.putStatus({
      ...existing,
      ...seed,
      deleted: false,
      source: existing?.source || seed.source || "system",
      templateVersion: GAME_VERSION
    });
  }

  const synced = await storage.getStatusesRaw();
  return mergeStatusLibrary(synced);
}

export function createRuntimeStatuses(statusIds = [], statusMap = new Map()) {
  return statusIds
    .map((statusId) => {
      const template = statusMap.get(statusId);
      if (!template || template.deleted) return null;
      return {
        ...template,
        duration: Number(template.duration || 0),
        remaining: Number(template.duration || 0),
        desc: template.desc || "",
        unique: Boolean(template.unique)
      };
    })
    .filter(Boolean);
}

export function addStatus(entity, statusTemplate) {
  if (!entity.statuses) entity.statuses = [];

  const existing = entity.statuses.find((status) => status.id === statusTemplate.id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, Number(statusTemplate.duration || existing.duration || 0));
    return existing;
  }

  const runtime = {
    ...statusTemplate,
    duration: Number(statusTemplate.duration || 0),
    remaining: Number(statusTemplate.duration || 0),
    desc: statusTemplate.desc || "",
    unique: Boolean(statusTemplate.unique)
  };
  entity.statuses.push(runtime);
  return runtime;
}

export function removeStatus(entity, statusId) {
  if (!entity.statuses?.length) return;
  entity.statuses = entity.statuses.filter((status) => status.id !== statusId);
}

export function tickStatuses(entity, dt) {
  if (!entity.statuses?.length) return;
  entity.statuses = entity.statuses.filter((status) => {
    if (!status.duration || status.duration <= 0) return true;
    status.remaining = Math.max(0, status.remaining - dt);
    return status.remaining > 0;
  });
}
