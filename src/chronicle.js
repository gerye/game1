import { CHRONICLE_ENTRY_LIMIT, FACTIONS, GRADE_COLORS } from "./config.js";
import { clamp } from "./utils.js";

const FACTION_MAP = new Map(FACTIONS.map((faction) => [faction.key, faction]));
const MILESTONE_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const ENTRY_LIMIT = CHRONICLE_ENTRY_LIMIT;

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function tintColor(hex, ratio = 0.78) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#f3ead7";
  const mix = (channel) => Math.round(channel + (255 - channel) * clamp(ratio, 0, 1));
  const toHex = (channel) => mix(channel).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function shadeColor(hex, ratio = 0.32) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#5b4730";
  const mix = (channel) => Math.round(channel * (1 - clamp(ratio, 0, 1)));
  const toHex = (channel) => mix(channel).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function resolveFaction(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return FACTIONS.find((item) => item.key === value || item.name === value) || null;
  }
  if (typeof value === "object") {
    if (value.key && FACTION_MAP.has(value.key)) {
      return { ...FACTION_MAP.get(value.key), ...value };
    }
    if (value.name) {
      const matched = FACTIONS.find((item) => item.name === value.name);
      return matched ? { ...matched, ...value } : value;
    }
  }
  return null;
}

function normalizeFactionRef(faction) {
  const resolved = resolveFaction(faction);
  if (!resolved?.name) return null;
  return {
    key: resolved.key || "",
    name: resolved.name || "",
    color: resolved.color || ""
  };
}

function createSubject(input, factionFallback = null, gradeFallback = "") {
  if (!input) return null;
  if (typeof input === "string") {
    const faction = normalizeFactionRef(factionFallback);
    return {
      name: input,
      grade: gradeFallback || "",
      factionKey: faction?.key || "",
      factionName: faction?.name || "",
      factionColor: faction?.color || ""
    };
  }
  const faction = normalizeFactionRef(input.faction || input.factionKey || input.factionName || factionFallback);
  return {
    name: input.name || input.displayName || "",
    grade: input.grade || input.potential || gradeFallback || "",
    factionKey: input.factionKey || faction?.key || "",
    factionName: input.factionName || faction?.name || "",
    factionColor: input.factionColor || faction?.color || ""
  };
}

function normalizeSubject(subject) {
  if (!subject || typeof subject !== "object" || typeof subject.name !== "string" || !subject.name) return null;
  return createSubject(subject, subject.factionKey || subject.factionName || null, subject.grade || "");
}

function normalizeReward(reward) {
  if (!reward) return null;
  if (typeof reward === "string") {
    return { name: reward, grade: "" };
  }
  if (typeof reward === "object" && typeof reward.name === "string") {
    return { name: reward.name, grade: reward.grade || "" };
  }
  return null;
}

function normalizeBloodline(bloodline) {
  if (!bloodline) return null;
  if (typeof bloodline === "string") {
    return { name: bloodline, grade: "" };
  }
  if (typeof bloodline === "object" && typeof bloodline.name === "string") {
    return {
      name: bloodline.name,
      grade: bloodline.grade || "",
      symbol: bloodline.symbol || ""
    };
  }
  return null;
}

function normalizeSubjectArray(values = []) {
  return Array.isArray(values)
    ? values.map((item) => normalizeSubject(item)).filter(Boolean)
    : [];
}

function normalizeChronicleEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const normalized = {
    type: typeof entry.type === "string" ? entry.type : "",
    index: Number.isFinite(Number(entry.index)) ? Number(entry.index) : Date.now(),
    title: String(entry.title || ""),
    text: String(entry.text || "")
  };
  if (!normalized.title || !normalized.text) return null;
  const subject = normalizeSubject(entry.subject);
  if (subject) normalized.subject = subject;
  const faction = normalizeFactionRef(entry.faction);
  if (faction) normalized.faction = faction;
  const championSubject = normalizeSubject(entry.championSubject);
  if (championSubject) normalized.championSubject = championSubject;
  const runnerUpSubject = normalizeSubject(entry.runnerUpSubject);
  if (runnerUpSubject) normalized.runnerUpSubject = runnerUpSubject;
  const reward = normalizeReward(entry.reward);
  if (reward) normalized.reward = reward;
  const runnerUpReward = normalizeReward(entry.runnerUpReward);
  if (runnerUpReward) normalized.runnerUpReward = runnerUpReward;
  const bloodline = normalizeBloodline(entry.bloodline);
  if (bloodline) normalized.bloodline = bloodline;
  if (entry.tierSubjects && typeof entry.tierSubjects === "object") {
    normalized.tierSubjects = Object.fromEntries(
      Object.entries(entry.tierSubjects)
        .map(([key, value]) => [key, normalizeSubjectArray(value)])
        .filter(([, value]) => value.length > 0)
    );
  }
  if (Array.isArray(entry.subjects)) normalized.subjects = normalizeSubjectArray(entry.subjects);
  if (typeof entry.level === "number") normalized.level = entry.level;
  if (typeof entry.wins === "number") normalized.wins = entry.wins;
  if (typeof entry.kills === "number") normalized.kills = entry.kills;
  if (typeof entry.count === "number") normalized.count = entry.count;
  if (typeof entry.skillName === "string") normalized.skillName = entry.skillName;
  if (typeof entry.skillGrade === "string") normalized.skillGrade = entry.skillGrade;
  if (typeof entry.equipmentName === "string") normalized.equipmentName = entry.equipmentName;
  if (typeof entry.equipmentGrade === "string") normalized.equipmentGrade = entry.equipmentGrade;
  return normalized;
}

function renderFactionBadge(faction, escapeHtml) {
  const resolved = normalizeFactionRef(faction);
  if (!resolved?.name) return "";
  return `<span class="chronicle-faction-tag" style="background:${tintColor(resolved.color)};color:${shadeColor(resolved.color)};border-color:${resolved.color};">${escapeHtml(resolved.name)}</span>`;
}

function renderSubject(subject, escapeHtml) {
  const normalized = createSubject(subject);
  if (!normalized) return `<span class="chronicle-subject-name">无名侠客</span>`;
  const factionPart = normalized.factionName
    ? `${renderFactionBadge({
        key: normalized.factionKey,
        name: normalized.factionName,
        color: normalized.factionColor
      }, escapeHtml)}的`
    : "";
  const nameColor = GRADE_COLORS[normalized.grade] || "inherit";
  return `${factionPart}<span class="chronicle-subject-name" style="color:${nameColor}">${escapeHtml(normalized.name)}</span>`;
}

function renderSubjectList(subjects, escapeHtml) {
  if (!subjects || subjects.length === 0) return "无人";
  return subjects.map((subject) => renderSubject(subject, escapeHtml)).join("、");
}

function renderReward(reward, escapeHtml) {
  const normalized = normalizeReward(reward);
  if (!normalized) return escapeHtml("无奖励");
  const color = GRADE_COLORS[normalized.grade] || "inherit";
  return `<span class="chronicle-grade-token" style="color:${color}">${escapeHtml(normalized.name)}</span>`;
}

function renderBloodline(bloodline, escapeHtml) {
  const normalized = normalizeBloodline(bloodline);
  if (!normalized) return escapeHtml("无名血脉");
  const color = GRADE_COLORS[normalized.grade] || "inherit";
  const symbol = normalized.symbol ? `${escapeHtml(normalized.symbol)} ` : "";
  return `<span class="chronicle-grade-token" style="color:${color}">${symbol}${escapeHtml(normalized.name)}</span>`;
}

function renderChronicleBody(entry, escapeHtml) {
  switch (entry.type) {
    case "faction-victory-milestone":
      return `${renderFactionBadge(entry.faction, escapeHtml)}已经取得第 ${entry.wins || entry.index} 场江湖争霸胜利，门派威望再度震动江湖。`;
    case "fate-change":
      return `${renderSubject(entry.subject, escapeHtml)}逆天改命成功${entry.count > 1 ? `，这是他的第 ${entry.count} 次逆天改命` : ""}。`;
    case "kill-milestone":
      return `${renderSubject(entry.subject, escapeHtml)}成为首位达成 ${entry.kills || entry.index} 次击杀的角色之一，凶名已传遍江湖。`;
    case "tournament":
      return `第 ${entry.index} 次天下第一武道会中，冠军是${renderSubject(entry.championSubject, escapeHtml)}，获得${renderReward(entry.reward, escapeHtml)}。亚军是${renderSubject(entry.runnerUpSubject, escapeHtml)}，获得${renderReward(entry.runnerUpReward, escapeHtml)}。`;
    case "exploration":
      return `第 ${entry.index} 次秘境探索中，达到 S 级的是${renderSubjectList(entry.tierSubjects?.S, escapeHtml)}。达到 SS 级的是${renderSubjectList(entry.tierSubjects?.SS, escapeHtml)}。达到 SSS 级的是${renderSubjectList(entry.tierSubjects?.SSS, escapeHtml)}。`;
    case "bloodline":
      return `${renderSubject(entry.subject, escapeHtml)}获得了${renderBloodline(entry.bloodline, escapeHtml)}。`;
    case "ranking":
      return `第 ${entry.index} 次江湖排位的前八名依次为：${renderSubjectList(entry.subjects, escapeHtml)}。`;
    case "milestone":
      return `${renderSubject(entry.subject, escapeHtml)}成为第一个达到 ${entry.level || entry.index} 级的角色。`;
    case "legendary-skill":
      return `${renderSubject(entry.subject, escapeHtml)}学会绝世神功<span class="chronicle-grade-token" style="color:${GRADE_COLORS[entry.skillGrade] || "inherit"}">${escapeHtml(entry.skillName || "")}</span>。`;
    case "legendary-equipment":
      return `${renderSubject(entry.subject, escapeHtml)}获得绝世神兵<span class="chronicle-grade-token" style="color:${GRADE_COLORS[entry.equipmentGrade] || "inherit"}">${escapeHtml(entry.equipmentName || "")}</span>。`;
    default:
      return escapeHtml(entry.text);
  }
}

export function createChronicleState() {
  return {
    chaosCount: 0,
    tournamentCount: 0,
    explorationCount: 0,
    rankingCount: 0,
    entries: [],
    levelMilestones: {},
    killMilestones: {}
  };
}

export function normalizeChronicleState(raw = {}) {
  return {
    chaosCount: Math.max(0, Math.floor(Number(raw.chaosCount || 0))),
    tournamentCount: Math.max(0, Math.floor(Number(raw.tournamentCount || 0))),
    explorationCount: Math.max(0, Math.floor(Number(raw.explorationCount || 0))),
    rankingCount: Math.max(0, Math.floor(Number(raw.rankingCount || 0))),
    entries: Array.isArray(raw.entries)
      ? raw.entries.map((entry) => normalizeChronicleEntry(entry)).filter(Boolean).slice(0, ENTRY_LIMIT)
      : [],
    levelMilestones: raw.levelMilestones && typeof raw.levelMilestones === "object"
      ? Object.fromEntries(
          Object.entries(raw.levelMilestones)
            .filter(([key, value]) => Number(key) > 0 && typeof value === "string" && value)
            .map(([key, value]) => [String(Math.floor(Number(key))), value])
        )
      : {},
    killMilestones: raw.killMilestones && typeof raw.killMilestones === "object"
      ? Object.fromEntries(
          Object.entries(raw.killMilestones)
            .filter(([key, value]) => Number(key) > 0 && typeof value === "string" && value)
            .map(([key, value]) => [String(Math.floor(Number(key))), value])
        )
      : {}
  };
}

export function appendChronicleEntry(chronicle, entry) {
  return normalizeChronicleState({
    ...chronicle,
    entries: [entry, ...(chronicle?.entries || [])].slice(0, ENTRY_LIMIT)
  });
}

export function renderChroniclePanel(entries, escapeHtml) {
  if (!entries || entries.length === 0) {
    return `<p class="muted">江湖仍在酝酿故事，完成一场江湖争霸、武道会、排位赛或秘境探索后，这里会留下记录。</p>`;
  }
  return `
    <div class="chronicle-list">
      ${entries.map((entry) => `<article class="chronicle-entry"><strong>${escapeHtml(entry.title)}</strong><p>${renderChronicleBody(entry, escapeHtml)}</p></article>`).join("")}
    </div>
  `;
}

export function buildFactionVictoryMilestoneEntry(faction, wins) {
  const factionRef = normalizeFactionRef(faction);
  return {
    type: "faction-victory-milestone",
    index: wins,
    wins,
    faction: factionRef,
    title: `门派霸业 · ${wins} 胜`,
    text: `${factionRef?.name || "无门无派"}已经取得第 ${wins} 场江湖争霸胜利，门派威望再度震动江湖。`
  };
}

export function buildFateChangeChronicleEntry(subject, count) {
  const normalizedSubject = createSubject(subject);
  return {
    type: "fate-change",
    index: Date.now(),
    count,
    subject: normalizedSubject,
    title: "逆天改命",
    text: `${normalizedSubject?.factionName ? `${normalizedSubject.factionName}的` : ""}${normalizedSubject?.name || "无名侠客"}逆天改命成功。`
  };
}

function buildKillMilestoneChronicleEntry(subject, kills) {
  const normalizedSubject = createSubject(subject);
  return {
    type: "kill-milestone",
    index: kills,
    kills,
    subject: normalizedSubject,
    title: `杀业滔天 · ${kills} 击杀`,
    text: `${normalizedSubject?.factionName ? `${normalizedSubject.factionName}的` : ""}${normalizedSubject?.name || "无名侠客"}达成 ${kills} 击杀。`
  };
}

function buildKillMilestoneBiographyEntry(kills) {
  return {
    type: "kill-milestone",
    text: `达成 ${kills} 击杀，凶名已传遍江湖。`,
    kills
  };
}

function formatTournamentPlacementRange(roundsLength, roundIndex) {
  const end = 2 ** (roundsLength - roundIndex);
  const start = Math.floor(end / 2) + 1;
  return `${start}-${end}`;
}

export function buildTournamentPlacementMap(tournament) {
  const placements = {};
  const rounds = tournament?.rounds || [];
  const lastRoundIndex = rounds.length - 1;
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match) => {
      if (!match.winnerCode || !match.leftCode || !match.rightCode) return;
      const loserCode = match.leftCode === match.winnerCode ? match.rightCode : match.leftCode;
      if (!loserCode) return;
      placements[loserCode] = roundIndex === lastRoundIndex ? "亚军" : formatTournamentPlacementRange(rounds.length, roundIndex);
    });
  });
  if (tournament?.championCode) placements[tournament.championCode] = "冠军";
  return placements;
}

export function buildTournamentChronicleEntry(index, championEntry, championReward, runnerUpEntry, runnerUpReward, championCode, runnerUpCode) {
  const championSubject = championEntry
    ? createSubject({ name: championEntry.displayName, faction: championEntry.build?.faction, grade: championEntry.build?.potential })
    : createSubject(championCode || "无名侠客");
  const runnerUpSubject = runnerUpEntry
    ? createSubject({ name: runnerUpEntry.displayName, faction: runnerUpEntry.build?.faction, grade: runnerUpEntry.build?.potential })
    : createSubject(runnerUpCode || "无名侠客");
  return {
    type: "tournament",
    index,
    championSubject,
    runnerUpSubject,
    reward: normalizeReward(championReward || "无奖励"),
    runnerUpReward: normalizeReward(runnerUpReward || "无奖励"),
    title: `第 ${index} 次天下第一武道会`,
    text: `第 ${index} 次天下第一武道会中，冠军与亚军已经决出。`
  };
}

export function buildTournamentBiographyEntry(index, placement, reward) {
  const normalizedReward = normalizeReward(reward);
  return {
    type: "tournament-placement",
    text: `在第 ${index} 次天下第一武道会中获得 ${placement} 名次，获得${normalizedReward?.name || "无奖励"}。`,
    placement,
    rewardName: normalizedReward?.name || "",
    rewardGrade: normalizedReward?.grade || ""
  };
}

export function buildBloodlineChronicleEntry(subject, bloodline) {
  const normalizedSubject = createSubject(subject);
  const normalizedBloodline = normalizeBloodline(bloodline);
  return {
    type: "bloodline",
    index: Date.now(),
    subject: normalizedSubject,
    bloodline: normalizedBloodline,
    title: "血脉现世",
    text: `${normalizedSubject?.name || "无名侠客"}获得了${normalizedBloodline?.name || "神秘血脉"}。`
  };
}

export function buildBloodlineBiographyEntry(bloodline) {
  const normalizedBloodline = normalizeBloodline(bloodline);
  return {
    type: "bloodline",
    text: `获得了${normalizedBloodline?.name || "神秘血脉"}。`,
    bloodlineName: normalizedBloodline?.name || "",
    bloodlineGrade: normalizedBloodline?.grade || ""
  };
}

export function buildExplorationChronicleEntry(index, tierMap = {}) {
  return {
    type: "exploration",
    index,
    tierSubjects: {
      S: normalizeSubjectArray(tierMap.S || []),
      SS: normalizeSubjectArray(tierMap.SS || []),
      SSS: normalizeSubjectArray(tierMap.SSS || [])
    },
    title: `第 ${index} 次秘境探索`,
    text: `第 ${index} 次秘境探索中，各档位奖励已发放。`
  };
}

export function buildRankingChronicleEntry(index, topEntries = []) {
  return {
    type: "ranking",
    index,
    subjects: normalizeSubjectArray(topEntries),
    title: `第 ${index} 次江湖排位`,
    text: `第 ${index} 次江湖排位的前八名已经决出。`
  };
}

export function buildRankingBiographyEntry(index, placement, reward) {
  const normalizedReward = normalizeReward(reward);
  return {
    type: "ranking-placement",
    text: `在第 ${index} 次江湖排位中获得 ${placement}，获得${normalizedReward?.name || "无奖励"}。`,
    placement,
    rewardName: normalizedReward?.name || "",
    rewardGrade: normalizedReward?.grade || ""
  };
}

export function buildExplorationBiographyEntry(index, tier, reward) {
  const normalizedReward = normalizeReward(reward);
  return {
    type: "exploration-reward",
    text: `在第 ${index} 次秘境探险中，达到了 ${tier} 级，获得了${normalizedReward?.name || "无奖励"}。`,
    tier,
    rewardName: normalizedReward?.name || "",
    rewardGrade: normalizedReward?.grade || ""
  };
}

export function recordLevelMilestones(chronicle, previousLevel, nextLevel, subject) {
  const nextChronicle = normalizeChronicleState(chronicle);
  const milestoneLevels = { ...(nextChronicle.levelMilestones || {}) };
  const entries = [];
  const biographies = [];
  const normalizedSubject = createSubject(subject);
  for (const level of MILESTONE_LEVELS) {
    if (previousLevel < level && nextLevel >= level && !milestoneLevels[String(level)]) {
      milestoneLevels[String(level)] = normalizedSubject?.name || "无名侠客";
      entries.push({
        title: `等级里程碑 · ${level} 级`,
        text: `${normalizedSubject?.name || "无名侠客"}成为第一个达到 ${level} 级的角色。`,
        type: "milestone",
        index: level,
        level,
        subject: normalizedSubject
      });
      biographies.push({
        type: "level-milestone",
        text: `成为第一个达到 ${level} 级的角色。`,
        level
      });
    }
  }
  return {
    chronicle: normalizeChronicleState({ ...nextChronicle, levelMilestones: milestoneLevels }),
    entries,
    biographies
  };
}

export function recordKillMilestones(chronicle, previousKills, nextKills, subject) {
  const nextChronicle = normalizeChronicleState(chronicle);
  const milestoneKills = { ...(nextChronicle.killMilestones || {}) };
  const entries = [];
  const biographies = [];
  const normalizedSubject = createSubject(subject);
  for (let kills = 50; kills <= nextKills; kills += 50) {
    if (previousKills < kills && !milestoneKills[String(kills)]) {
      milestoneKills[String(kills)] = normalizedSubject?.name || "无名侠客";
      entries.push(buildKillMilestoneChronicleEntry(normalizedSubject, kills));
      biographies.push(buildKillMilestoneBiographyEntry(kills));
    }
  }
  return {
    chronicle: normalizeChronicleState({ ...nextChronicle, killMilestones: milestoneKills }),
    entries,
    biographies
  };
}

export function buildLegendarySkillRecord(subject, skill) {
  const normalizedSubject = createSubject(subject);
  const skillName = typeof skill === "object" ? skill.name || "" : skill;
  const skillGrade = typeof skill === "object" ? skill.grade || "" : "";
  return {
    chronicleEntry: {
      title: "绝世神功现世",
      text: `${normalizedSubject?.name || "无名侠客"}学会绝世神功${skillName}。`,
      type: "legendary-skill",
      index: Date.now(),
      subject: normalizedSubject,
      skillName,
      skillGrade
    },
    biographyText: {
      type: "legendary-skill",
      text: `学会绝世神功${skillName}。`,
      skillName,
      skillGrade
    }
  };
}

export function buildLegendaryEquipmentRecord(subject, equipment) {
  const normalizedSubject = createSubject(subject);
  const equipmentName = typeof equipment === "object" ? equipment.name || "" : equipment;
  const equipmentGrade = typeof equipment === "object" ? equipment.grade || "" : "";
  return {
    chronicleEntry: {
      title: "绝世神兵现世",
      text: `${normalizedSubject?.name || "无名侠客"}获得绝世神兵${equipmentName}。`,
      type: "legendary-equipment",
      index: Date.now(),
      subject: normalizedSubject,
      equipmentName,
      equipmentGrade
    },
    biographyText: {
      type: "legendary-equipment",
      text: `获得绝世神兵${equipmentName}。`,
      equipmentName,
      equipmentGrade
    }
  };
}
