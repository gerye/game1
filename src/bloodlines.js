import { GAME_VERSION } from "./config.js";

const BLOODLINE_SEEDS = [
  {
    id: "azure-dragon",
    name: "青龙血脉",
    grade: "SSS",
    symbol: "🐉",
    statusId: "azure-dragon-aura",
    statusName: "青龙附体",
    fateBonus: 3,
    skillId: "paralyze-attack-sss",
    desc: "每秒回复最大生命值 1% 的生命，附带 3 次逆天改命，并习得 SSS 级麻痹攻击。"
  },
  {
    id: "white-tiger",
    name: "白虎血脉",
    grade: "SSS",
    symbol: "🐅",
    statusId: "white-tiger-aura",
    statusName: "白虎附体",
    fateBonus: 3,
    skillId: "power-attack-sss",
    desc: "物攻与法攻提高 100%，附带 3 次逆天改命，并习得 SSS 级强力攻击。"
  },
  {
    id: "vermilion-bird",
    name: "朱雀血脉",
    grade: "SSS",
    symbol: "🐦‍🔥",
    statusId: "vermilion-bird-aura",
    statusName: "朱雀附体",
    fateBonus: 3,
    skillId: "burn-attack-sss",
    desc: "每次战斗开始时获得死里逃生，附带 3 次逆天改命，并习得 SSS 级灼烧攻击。"
  },
  {
    id: "black-tortoise",
    name: "玄武血脉",
    grade: "SSS",
    symbol: "🐢",
    statusId: "black-tortoise-aura",
    statusName: "玄武附体",
    fateBonus: 3,
    skillId: "sleep-attack-sss",
    desc: "物防与法防提高 100%，附带 3 次逆天改命，并习得 SSS 级睡眠攻击。"
  },
  {
    id: "angel",
    name: "天使血脉",
    grade: "SS",
    symbol: "🪽",
    statusId: "angel-aura",
    statusName: "天使附体",
    fateBonus: 2,
    skillId: "spirit-boost-ss",
    desc: "额外减少 10% 的 CD，附带 2 次逆天改命，并习得 SS 级精神增强。"
  },
  {
    id: "demon-blood",
    name: "恶魔血脉",
    grade: "SS",
    symbol: "😈",
    statusId: "demon-aura",
    statusName: "恶魔附体",
    fateBonus: 2,
    skillId: "vitality-boost-ss",
    desc: "每秒回复最大生命值 0.4% 的生命，附带 2 次逆天改命，并习得 SS 级体质增强。"
  },
  {
    id: "blazing-sun",
    name: "烈阳血脉",
    grade: "SS",
    symbol: "☀️",
    statusId: "blazing-sun-aura",
    statusName: "烈阳附体",
    fateBonus: 2,
    skillId: "power-attack-ss",
    desc: "物攻与法攻各提高 25%，附带 2 次逆天改命，并习得 SS 级强力攻击。"
  },
  {
    id: "frost-ice",
    name: "寒冰血脉",
    grade: "SS",
    symbol: "🧊",
    statusId: "frost-ice-aura",
    statusName: "寒冰附体",
    fateBonus: 2,
    skillId: "sleep-attack-ss",
    desc: "物防与法防各提高 30%，附带 2 次逆天改命，并习得 SS 级睡眠攻击。"
  },
  {
    id: "feral-beast",
    name: "凶兽血脉",
    grade: "S",
    symbol: "🦬",
    statusId: "feral-beast-aura",
    statusName: "凶兽附体",
    fateBonus: 1,
    skillId: "vitality-boost-s",
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%，附带 1 次逆天改命，并习得 S 级体质增强。"
  },
  {
    id: "mammoth-beast",
    name: "蛮兽血脉",
    grade: "S",
    symbol: "🦣",
    statusId: "mammoth-beast-aura",
    statusName: "蛮兽附体",
    fateBonus: 1,
    skillId: "strength-boost-s",
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%，附带 1 次逆天改命，并习得 S 级力量增强。"
  },
  {
    id: "ape-beast",
    name: "荒兽血脉",
    grade: "S",
    symbol: "🦍",
    statusId: "ape-beast-aura",
    statusName: "荒兽附体",
    fateBonus: 1,
    skillId: "vitality-boost-s",
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%，附带 1 次逆天改命，并习得 S 级体质增强。"
  },
  {
    id: "ox-beast",
    name: "夷兽血脉",
    grade: "S",
    symbol: "🐂",
    statusId: "ox-beast-aura",
    statusName: "夷兽附体",
    fateBonus: 1,
    skillId: "vitality-boost-s",
    desc: "额外减少 3% 的 CD，并每秒回复最大生命值 0.1%，附带 1 次逆天改命，并习得 S 级体质增强。"
  }
];

export function getBuiltinBloodlines() {
  return BLOODLINE_SEEDS.map((item) => ({ ...item }));
}

function mergeBloodlineLibrary(records = []) {
  const merged = new Map();
  for (const seed of BLOODLINE_SEEDS) {
    merged.set(seed.id, {
      ...seed,
      deleted: false,
      source: "system",
      templateVersion: GAME_VERSION
    });
  }
  for (const record of records) {
    if (!record?.id) continue;
    const existing = merged.get(record.id);
    if (existing) {
      merged.set(record.id, {
        ...existing,
        ...record,
        deleted: false,
        source: record.source || existing.source || "system",
        templateVersion: GAME_VERSION
      });
      continue;
    }
    if (record.deleted) continue;
    merged.set(record.id, { ...record });
  }
  return [...merged.values()].filter((item) => !item.deleted);
}

export async function syncBloodlineLibrary(storage) {
  const current = await storage.getBloodlinesRaw();
  const currentMap = new Map(current.map((item) => [item.id, item]));
  const seedIds = new Set(BLOODLINE_SEEDS.map((item) => item.id));

  for (const record of current) {
    if (!seedIds.has(record.id) && record.source === "system") {
      await storage.putBloodline({
        ...record,
        deleted: true,
        source: "system",
        templateVersion: GAME_VERSION
      });
    }
  }

  for (const seed of BLOODLINE_SEEDS) {
    const existing = currentMap.get(seed.id);
    await storage.putBloodline({
      ...existing,
      ...seed,
      deleted: false,
      source: existing?.source || "system",
      templateVersion: GAME_VERSION
    });
  }

  return mergeBloodlineLibrary(await storage.getBloodlinesRaw());
}

export function buildBloodlineMap(bloodlines = []) {
  return new Map((bloodlines || []).map((item) => [item.id, item]));
}

export function getBloodlineById(bloodlines, bloodlineId) {
  if (!bloodlineId) return null;
  const map = bloodlines instanceof Map ? bloodlines : buildBloodlineMap(bloodlines);
  return map.get(bloodlineId) || null;
}

export function getBloodlinePersistentStatusIds(progress, bloodlines) {
  const bloodline = getBloodlineById(bloodlines, progress?.bloodlineId || "");
  return bloodline?.statusId ? [bloodline.statusId] : [];
}

export function decorateDisplayName(rawName, progress = null, bloodlines = []) {
  const bloodline = getBloodlineById(bloodlines, progress?.bloodlineId || "");
  const parts = [];
  const tournamentPrefix = progress?.tournamentChampionCount > 0
    ? "♛"
    : progress?.tournamentRunnerUpCount > 0
      ? "♔"
      : progress?.tournamentTopFourCount > 0
        ? "♖"
        : "";
  if (tournamentPrefix) parts.push(tournamentPrefix);
  if (bloodline?.symbol) parts.push(bloodline.symbol);
  parts.push(rawName);
  const fateSuffix = progress?.fateChangeCount > 0 ? "⬆️".repeat(progress.fateChangeCount) : "";
  return `${parts.join("")}${fateSuffix}`;
}
