import { GRADE_SCALE, MAX_LEVEL } from "./config.js";
import { computeCombatScoreFromPrimary, formatSkillDescription, formatSkillValueSummary } from "./game-data.js";

const TEXT = {
  totalRoles: "\u89d2\u8272\u603b\u6570",
  generated: "\u5df2\u751f\u6210",
  totalWins: "\u603b\u80dc\u573a",
  leadingFaction: "\u9886\u5148\u95e8\u6d3e",
  baseData: "\u57fa\u7840\u8d44\u6599",
  noLeader: "\u6682\u65e0",
  initReset: "\u521d\u59cb\u5316\u4f1a\u4e00\u5e76\u6e05\u7a7a",
  factionWins: "\u603b\u80dc\u5229\u6570",
  tournamentChampion: "\u6b66\u9053\u4f1a\u51a0\u519b",
  rankingChampion: "\u6392\u4f4d\u8d5b\u51a0\u519b",
  roles: "\u540d\u89d2\u8272",
  noRoleData: "\u8fd8\u6ca1\u6709\u89d2\u8272\u6570\u636e\u3002\u4e0a\u4f20\u74f6\u76d6\u56fe\u7247\u6216\u751f\u6210\u6d4b\u8bd5\u6570\u636e\u540e\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc\u3002",
  roleDetail: "\u89d2\u8272\u8be6\u60c5",
  clickCardTip: "\u70b9\u51fb\u5de6\u4fa7\u5361\u7247\u67e5\u770b\u57fa\u7840\u4fe1\u606f\u3001\u751f\u6210\u5c5e\u6027\u548c\u5f53\u524d\u72b6\u6001\u3002",
  baseOnly: "\u4ec5\u4fdd\u7559\u57fa\u7840\u8d44\u6599",
  noBuildTip: "\u8fd9\u4e2a\u89d2\u8272\u76ee\u524d\u53ea\u4fdd\u7559\u57fa\u7840\u5c5e\u6027\uff0c\u8fd8\u6ca1\u6709\u5f53\u524d\u7248\u672c\u7684\u751f\u6210\u5c5e\u6027\u3002",
  generateBuild: "\u751f\u6210\u5c5e\u6027",
  level: "\u7b49\u7ea7",
  exp: "\u7ecf\u9a8c",
  record: "\u6218\u7ee9",
  championCount: "\u6b66\u9053\u4f1a\u51a0\u519b",
  kad: "\u51fb\u6740/\u52a9\u653b/\u6b7b\u4ea1",
  combatScore: "\u5f3a\u5ea6\u8bc4\u5206",
  skillSlots: "\u6280\u80fd\u7a7a\u4f4d",
  flourish: "\u534e\u4e3d\u5ea6",
  colors: "\u989c\u8272\u6570",
  complexity: "\u590d\u6742\u5ea6",
  symmetry: "\u5bf9\u79f0\u6027",
  lastEvent: "\u6700\u8fd1\u4e8b\u4ef6",
  none: "\u65e0",
  currentStats: "\u5f53\u524d\u5c5e\u6027",
  honorStatus: "\u8363\u8a89\u72b6\u6001",
  equipment: "\u88c5\u5907",
  skills: "\u6280\u80fd",
  biography: "\u4eba\u7269\u5c0f\u4f20",
  finalStats: "\u67e5\u770b 50 \u7ea7\u7ec8\u76d8\u5c5e\u6027",
  regenBuild: "\u91cd\u65b0\u751f\u6210\u5c5e\u6027",
  resetLevel: "\u6e05\u96f6\u7b49\u7ea7",
  deleteBuild: "\u5220\u9664\u751f\u6210\u5c5e\u6027",
  pending: "\u5f85\u751f\u6210",
  ungenerated: "\u672a\u751f\u6210",
  emptySlot: "\u7a7a\u4f4d",
  noSkillTip: "\u5f53\u524d\u8fd8\u6ca1\u6709\u9886\u609f\u6280\u80fd\u3002",
  noEquipmentTip: "\u8be5\u90e8\u4f4d\u5f53\u524d\u6ca1\u6709\u88c5\u5907\u3002",
  noBiographyTip: "\u6c5f\u6e56\u8def\u8fdc\uff0c\u8fd9\u540d\u89d2\u8272\u8fd8\u6ca1\u6709\u7559\u4e0b\u503c\u5f97\u8bb0\u5f55\u7684\u4e8b\u8ff9\u3002",
  noHonorTip: "\u5f53\u524d\u6ca1\u6709\u957f\u671f\u8363\u8a89\u72b6\u6001\u3002",
  battleGlory: "\u767e\u6218\u767e\u80dc",
  sectGlory: "\u6c5f\u6e56\u5927\u6d3e",
  favoredOne: "\u5929\u4e4b\u9a84\u5b50",
  runnerUpGlory: "\u7a0d\u900a\u98ce\u9a9a",
  risingStar: "\u540e\u8d77\u4e4b\u79c0",
  fateChange: "\u9006\u5929\u6539\u547d",
  wholeAttrBonus: "\u5168\u5c5e\u6027",
  honorTotal: "\u8363\u8a89\u603b\u8ba1",
  factionCollapse: "\u70b9\u51fb\u5c55\u5f00/\u6298\u53e0"
};

export function renderHeroStats({ container, entries, gameVersion, winSummary, factionSections }) {
  const buildCount = entries.filter((entry) => entry.build).length;
  const totalWins = winSummary.totalWins || 0;
  const topFaction = factionSections
    .filter((section) => section.faction.key !== "pending")
    .reduce((best, section) => (!best || section.wins > best.wins ? section : best), null);
  const items = [
    { label: TEXT.totalRoles, value: `${entries.length}`, sub: TEXT.baseData },
    { label: TEXT.generated, value: `${buildCount}`, sub: `\u5f53\u524d\u7248\u672c ${gameVersion}` },
    { label: TEXT.totalWins, value: `${totalWins}`, sub: TEXT.initReset },
    { label: TEXT.leadingFaction, value: topFaction ? topFaction.faction.name : "-", sub: topFaction ? `${topFaction.wins} \u80dc` : TEXT.noLeader }
  ];
  container.innerHTML = items
    .map((item) => `<div class="badge"><span>${item.label}</span><strong>${item.value}</strong><small>${item.sub}</small></div>`)
    .join("");
}

export function renderBuildGrid({
  container,
  entries,
  selectedCode,
  factionSections,
  tournamentMeta,
  rankingMeta,
  roleLabels,
  gradeColor,
  expToNextLevel,
  skills,
  equipment,
  getEquippedItems,
  equippedSlotLabels,
  escapeHtml,
  expandedFactions = new Set()
}) {
  if (entries.length === 0) {
    container.innerHTML = `<div class="cap-card"><p class="muted">${TEXT.noRoleData}</p></div>`;
    return;
  }
  container.innerHTML = factionSections.map((section) => {
    const isExpanded = expandedFactions.has(section.faction.key);
    const gradePills = buildGradeDistPills(section.entries, gradeColor);
    const totalWins = section.wins || 0;
    const tChampions = tournamentMeta?.byFaction?.[section.faction.key] || 0;
    const rChampions = rankingMeta?.byFaction?.[section.faction.key] || 0;
    return `
    <section class="faction-section">
      <div class="faction-section-head faction-toggle-head" data-faction-toggle="${section.faction.key}" title="${TEXT.factionCollapse}">
        <div class="faction-head-stack">
          <div class="faction-head-row">
            <strong class="faction-head-name" style="color:${section.faction.color}">${section.faction.name}</strong>
            <span class="faction-total-badge">${section.entries.length}\u4eba</span>
            <span class="faction-head-meta">\u4e89\u9738\u80dc ${totalWins}&ensp;\u00b7&ensp;\u6b66\u9053\u4f1a\u51a0 ${tChampions}&ensp;\u00b7&ensp;\u6392\u4f4d\u51a0 ${rChampions}</span>
          </div>
          ${gradePills}
        </div>
        <span class="faction-chevron">${isExpanded ? "\u25be" : "\u25b8"}</span>
      </div>
      <div class="faction-grid${isExpanded ? "" : " faction-grid--collapsed"}">
        ${section.entries.map((entry) => renderBuildCard({
          entry,
          selectedCode,
          roleLabels,
          gradeColor,
          expToNextLevel,
          skills,
          equipment,
          getEquippedItems,
          equippedSlotLabels,
          escapeHtml
        })).join("")}
      </div>
    </section>
  `;
  }).join("");
}

function buildGradeDistPills(entries, gradeColor) {
  const counts = {};
  for (const entry of entries) {
    const grade = entry.build?.potential;
    if (!grade) continue;
    counts[grade] = (counts[grade] || 0) + 1;
  }
  const chips = [...GRADE_SCALE]
    .reverse()
    .filter((g) => counts[g])
    .map((g) => {
      const color = gradeColor(g);
      return `<span class="faction-grade-chip" style="color:${color};border-color:${color}">${g}<small>\xd7${counts[g]}</small></span>`;
    })
    .join("");
  return chips ? `<div class="faction-grade-row">${chips}</div>` : "";
}

export function renderCapDetail({
  container,
  entry,
  panelOpen = true,
  roleLabels,
  gradeColor,
  expToNextLevel,
  skills,
  equipment,
  getEffectiveSheet,
  getHonorBonusContext,
  getEquippedItems,
  equippedSlotLabels,
  escapeHtml
}) {
  const toggleBtn = `<button class="detail-panel-toggle tiny-btn alt" data-detail-action="toggle-panel" title="${panelOpen ? "\u6298\u53e0\u8be6\u60c5" : "\u5c55\u5f00\u8be6\u60c5"}">${panelOpen ? "\u25b4" : "\u25be"}</button>`;
  if (!entry) {
    container.innerHTML = `<div class="detail-panel-head">${toggleBtn}<h3>${TEXT.roleDetail}</h3></div>${panelOpen ? `<p class="muted">${TEXT.clickCardTip}</p>` : ""}`;
    return;
  }
  if (!entry.build || !entry.progress) {
    container.innerHTML = `
      <div class="detail-panel-head">
        ${toggleBtn}
        <div class="card-top" style="flex:1">
          <img class="avatar large" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
          <div class="cell-stack">
            <h3 style="color:${gradeColor(entry.build?.potential || "E")}">${escapeHtml(entry.displayName)}</h3>
            <span class="mini-text">${TEXT.baseOnly}</span>
          </div>
        </div>
      </div>
      ${panelOpen ? `
      <div class="detail-section"><p class="muted">${TEXT.noBuildTip}</p></div>
      <div class="card-actions">
        <button class="tiny-btn alt" data-detail-action="regen" data-id="${entry.base.code}">${TEXT.generateBuild}</button>
      </div>` : ""}
    `;
    return;
  }

  const honorContext = entry.honorContext || getHonorBonusContext(entry.build, entry.progress);
  const current = getEffectiveSheet(entry.build, entry.progress.level, skills, equipment, honorContext);
  const final = getEffectiveSheet(entry.build, MAX_LEVEL, skills, equipment, honorContext);
  const combatScore = computeCombatScoreFromPrimary(current.primary, entry.build.skillScore || 0);

  container.innerHTML = `
    <div class="detail-panel-head">
      ${toggleBtn}
      <div class="card-top" style="flex:1">
        <img class="avatar large" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
        <div class="cell-stack">
          <h3 style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</h3>
          <span class="mini-text">${entry.build.faction.name} | ${roleLabels[entry.build.role]}</span>
        </div>
        ${renderPotentialBadge(entry.build.potential, gradeColor)}
      </div>
    </div>
    ${panelOpen ? `
    <div class="detail-section">
      <div class="stat-pair"><span>${TEXT.level}</span><strong>Lv.${entry.progress.level}</strong></div>
      <div class="stat-pair"><span>${TEXT.exp}</span><strong>${entry.progress.experience}/${expToNextLevel(entry.progress.level)}</strong></div>
      <div class="stat-pair"><span>${TEXT.record}</span><strong>${entry.progress.wins}/${entry.progress.totalBattles}</strong></div>
      <div class="stat-pair"><span>${TEXT.championCount}</span><strong>${entry.progress.tournamentChampionCount || 0}</strong></div>
      <div class="stat-pair"><span>${TEXT.kad}</span><strong>${entry.progress.kills}/${entry.progress.assists}/${entry.progress.deaths}</strong></div>
      <div class="stat-pair"><span>${TEXT.combatScore}</span><strong>${combatScore}</strong></div>
      <div class="stat-pair"><span>${TEXT.skillSlots}</span><strong>${entry.build.skillIds.length}/${entry.build.skillSlots || 1}</strong></div>
      <div class="stat-pair"><span>${TEXT.flourish}</span><strong>${entry.build.potentialScore}</strong></div>
      <div class="stat-pair"><span>${TEXT.colors}</span><strong>${formatPotentialColors(entry.build.potentialReason)}</strong></div>
      <div class="stat-pair"><span>${TEXT.complexity}</span><strong>${formatPotentialComplexity(entry.build.potentialReason)}</strong></div>
      <div class="stat-pair"><span>${TEXT.symmetry}</span><strong>${formatPotentialSymmetry(entry.build.potentialReason)}</strong></div>
      <div class="stat-pair"><span>${TEXT.lastEvent}</span><strong>${escapeHtml(entry.progress.lastEventText || TEXT.none)}</strong></div>
    </div>
    <div class="detail-section">
      <h3>${TEXT.currentStats}</h3>
      ${renderPrimaryPairs(current.whitePrimary, current.greenPrimary, current.primary)}
      ${renderDerivedPairs(current.whiteDerived, current.greenDerived, current.derived)}
    </div>
    <div class="detail-section">
      <h3>${TEXT.honorStatus}</h3>
      ${renderHonorStatusView(entry, gradeColor)}
    </div>
    <div class="detail-section">
      <h3>${TEXT.equipment}</h3>
      ${renderEquipmentDetails(entry.build, equipment, getEquippedItems, equippedSlotLabels, gradeColor, roleLabels, escapeHtml)}
    </div>
    <div class="detail-section">
      <h3>${TEXT.skills}</h3>
      ${renderSkillDetails(entry.build.skillIds, entry.build.skillSlots || 1, skills, roleLabels, gradeColor, escapeHtml)}
    </div>
    <div class="detail-section">
      <h3>${TEXT.biography}</h3>
        ${renderBiographyDetails(entry.progress, gradeColor, escapeHtml)}
    </div>
    <details class="detail-section">
      <summary>${TEXT.finalStats}</summary>
      ${renderPrimaryPairs(final.whitePrimary, final.greenPrimary, final.primary)}
      ${renderDerivedPairs(final.whiteDerived, final.greenDerived, final.derived)}
    </details>
    <div class="card-actions">
      <button class="tiny-btn alt" data-detail-action="regen" data-id="${entry.base.code}">${TEXT.regenBuild}</button>
      <button class="tiny-btn alt" data-detail-action="reset" data-id="${entry.base.code}">${TEXT.resetLevel}</button>
      <button class="tiny-btn" data-detail-action="delete-build" data-id="${entry.base.code}">${TEXT.deleteBuild}</button>
    </div>
    ` : ""}
  `;
}

export function getFactionSections(entries, factions, gradeIndex, winSummary = { byFaction: {} }) {
  const sections = factions.map((faction) => {
    const factionEntries = entries
      .filter((entry) => entry.build?.faction.key === faction.key)
      .sort((left, right) => compareFactionEntries(left, right, gradeIndex));
    return {
      faction,
      entries: factionEntries,
      wins: winSummary.byFaction?.[faction.key] || 0
    };
  }).filter((section) => section.entries.length > 0);

  const pending = entries.filter((entry) => !entry.build);
  if (pending.length > 0) {
    sections.push({
      faction: { key: "pending", name: TEXT.pending, color: "#61706a" },
      entries: pending.sort((left, right) => compareFactionEntries(left, right, gradeIndex)),
      wins: 0
    });
  }

  return sections;
}

export function compareFactionEntries(left, right, gradeIndex) {
  const leftPriority = getEntryDisplayPriority(left);
  const rightPriority = getEntryDisplayPriority(right);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;

  const leftHasBloodline = left.progress?.bloodlineId ? 1 : 0;
  const rightHasBloodline = right.progress?.bloodlineId ? 1 : 0;
  if (leftHasBloodline !== rightHasBloodline) return rightHasBloodline - leftHasBloodline;

  const leftPotential = left.build ? gradeIndex(left.build.potential) : -1;
  const rightPotential = right.build ? gradeIndex(right.build.potential) : -1;
  if (leftPotential !== rightPotential) return rightPotential - leftPotential;

  const leftLevel = left.progress?.level || 0;
  const rightLevel = right.progress?.level || 0;
  if (leftLevel !== rightLevel) return rightLevel - leftLevel;

  const leftExp = left.progress?.experience || 0;
  const rightExp = right.progress?.experience || 0;
  if (leftExp !== rightExp) return rightExp - leftExp;

  const leftCreatedAt = left.base?.createdAt || 0;
  const rightCreatedAt = right.base?.createdAt || 0;
  if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;

  return String(left.base?.code || "").localeCompare(String(right.base?.code || ""));
}

export function getEntryDisplayPriority(entry) {
  const progress = entry.progress || {};
  if ((progress.tournamentChampionCount || 0) > 0) return 5;
  if ((progress.tournamentRunnerUpCount || 0) > 0) return 4;
  if ((progress.tournamentTopFourCount || 0) > 0) return 3;
  if (progress.bloodlineId) return 2;
  return 1;
}

function renderBuildCard({
  entry,
  selectedCode,
  roleLabels,
  gradeColor,
  expToNextLevel,
  skills,
  equipment,
  getEquippedItems,
  equippedSlotLabels,
  escapeHtml
}) {
  const build = entry.build;
  const progress = entry.progress;
  const activeClass = entry.base.code === selectedCode ? "active" : "";
  const expText = build && progress ? `${progress.experience}/${expToNextLevel(progress.level)}` : TEXT.ungenerated;
  const nameColor = build ? gradeColor(build.potential) : "inherit";
  return `
    <article class="cap-card ${activeClass}" data-open-id="${entry.base.code}">
      <div class="card-top">
        <img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
        <div class="cell-stack">
          <strong style="color:${nameColor}">${escapeHtml(entry.displayName)}</strong>
          <span class="mini-text">${build ? build.faction.name : TEXT.pending} | ${build ? roleLabels[build.role] : TEXT.ungenerated}</span>
        </div>
        ${build ? renderPotentialBadge(build.potential, gradeColor) : `<span class="tag muted-tag">${TEXT.ungenerated}</span>`}
      </div>
      <div class="detail-section compact-section">
        <div class="stat-pair"><span>${TEXT.level}</span><strong>${progress ? `Lv.${progress.level}` : "-"}</strong></div>
        <div class="stat-pair"><span>${TEXT.exp}</span><strong>${expText}</strong></div>
        <div class="stat-pair"><span>\u95e8\u6d3e</span><strong>${build ? build.faction.name : "-"}</strong></div>
        <div class="stat-pair"><span>${TEXT.record}</span><strong>${progress ? `${progress.kills}/${progress.assists}/${progress.deaths}` : "-"}</strong></div>
      </div>
      <div class="card-skill-strip">
        ${build ? renderEquipmentStrip(build, equipment, getEquippedItems, equippedSlotLabels, gradeColor, roleLabels, escapeHtml) : ""}
      </div>
      <div class="card-skill-strip">
        ${build ? renderSkillList(build.skillIds, skills, gradeColor, escapeHtml, "compact", build.skillSlots || 1) : `<span class="mini-text">\u70b9\u51fb\u751f\u6210\u5c5e\u6027\u540e\u4f1a\u83b7\u5f97\u6280\u80fd\u4f4d</span>`}
      </div>
    </article>
  `;
}

function renderPotentialBadge(grade, gradeColor) {
  return `<span class="potential-pill" style="--grade-color:${gradeColor(grade)}">\u6f5c\u529b ${grade}</span>`;
}

function renderSkillList(skillIds, skills, gradeColor, escapeHtml, mode = "full", slots = skillIds.length) {
  const learned = skillIds.map((skillId) => {
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) return "";
    return mode === "compact"
      ? `
        <span class="skill-pill" style="--skill-grade:${gradeColor(skill.grade)};color:${gradeColor(skill.grade)}">
          ${escapeHtml(skill.name)}
          <span class="skill-tooltip">
            <strong style="color:${gradeColor(skill.grade)}">${escapeHtml(skill.name)}</strong><br>
            \u7b49\u7ea7 ${skill.grade} | CD ${skill.cooldown}s<br>
            ${escapeHtml(formatSkillDescription(skill))}
          </span>
        </span>
      `
      : "";
  }).filter(Boolean);

  const emptyCount = Math.max(0, slots - learned.length);
  for (let index = 0; index < emptyCount; index += 1) {
    learned.push(mode === "compact"
      ? `<span class="skill-pill empty-pill">${TEXT.emptySlot}</span>`
      : `<span class="skill-chip empty-chip">${TEXT.emptySlot}</span>`);
  }
  return learned.join("");
}

function renderSkillDetails(skillIds, slots, skills, roleLabels, gradeColor, escapeHtml) {
  const learned = skillIds
    .map((skillId) => skills.find((item) => item.id === skillId))
    .filter(Boolean);
  const rows = learned.map((skill) => `
    <div class="detail-skill-card" style="border-color:${gradeColor(skill.grade)}">
      <div class="detail-skill-head" style="color:${gradeColor(skill.grade)}">
        <strong style="color:${gradeColor(skill.grade)}">${escapeHtml(skill.name)}</strong>
        <span>${skill.grade}</span>
      </div>
      <div class="mini-text">${skill.role === "all" ? "\u8fd1\u6218 / \u8fdc\u5c04 / \u6cd5\u672f" : roleLabels[skill.role]} | CD ${skill.cooldown}s | \u5c04\u7a0b ${skill.range || "\u6309\u804c\u4e1a"}</div>
      <div class="mini-text">${escapeHtml(formatSkillValueSummary(skill))}</div>
      <p>${escapeHtml(formatSkillDescription(skill))}</p>
    </div>
  `);
  for (let index = learned.length; index < slots; index += 1) {
    rows.push(`<div class="detail-skill-card empty-card"><div class="detail-skill-head"><strong>${TEXT.emptySlot}</strong><span>--</span></div><p class="mini-text">${TEXT.noSkillTip}</p></div>`);
  }
  return `<div class="skill-detail-list">${rows.join("")}</div>`;
}

function renderEquipmentStrip(build, equipment, getEquippedItems, equippedSlotLabels, gradeColor, roleLabels, escapeHtml) {
  const equipped = getEquippedItems(build, equipment);
  const equipmentStars = build.equipmentStars || {};
  return `
    <div class="equipment-slot-row">
      ${equipped.map(({ slot, item }) => renderEquipmentSlot(slot, item, equippedSlotLabels, gradeColor, roleLabels, escapeHtml, "compact", equipmentStars[slot] || 0)).join("")}
    </div>
  `;
}

function renderEquipmentDetails(build, equipment, getEquippedItems, equippedSlotLabels, gradeColor, roleLabels, escapeHtml) {
  const equipped = getEquippedItems(build, equipment);
  const equipmentStars = build.equipmentStars || {};
  return `
    <div class="equipment-detail-list">
      ${equipped.map(({ slot, item }) => renderEquipmentSlot(slot, item, equippedSlotLabels, gradeColor, roleLabels, escapeHtml, "detail", equipmentStars[slot] || 0)).join("")}
    </div>
  `;
}

function renderEquipmentSlot(slot, item, equippedSlotLabels, gradeColor, roleLabels, escapeHtml, mode = "compact", stars = 0) {
  const label = equippedSlotLabels[slot] || slot;
  if (!item) {
    return mode === "detail"
      ? `<div class="detail-skill-card empty-card equipment-card"><div class="detail-skill-head"><strong>${label}</strong><span>${TEXT.emptySlot}</span></div><p class="mini-text">${TEXT.noEquipmentTip}</p></div>`
      : `<span class="equipment-slot empty-slot" data-slot="${slot}"><span class="equipment-slot-icon">${getEquipmentSlotGlyph(slot)}</span><span class="equipment-slot-label">${label}</span></span>`;
  }

  const starsHtml = stars > 0
    ? `<span class="equipment-stars">${Array.from({ length: stars }, () => "<span>\u2605</span>").join("")}</span>`
    : "";

  const tooltip = `
    <span class="skill-tooltip">
      <strong style="color:${gradeColor(item.grade)}">${escapeHtml(item.name)}</strong>${stars > 0 ? ` ${"★".repeat(stars)}` : ""}<br>
      ${escapeHtml(label)} | ${escapeHtml((item.allowedRoles || []).map((role) => roleLabels[role]).join(" / "))}${stars > 0 ? ` | +${stars * 5}%` : ""}<br>
      ${escapeHtml(item.desc || "")}
    </span>
  `;

  if (mode === "detail") {
    return `
      <div class="detail-skill-card equipment-card" style="border-color:${gradeColor(item.grade)}">
        <div class="detail-skill-head" style="color:${gradeColor(item.grade)}">
          <strong style="color:${gradeColor(item.grade)}">${escapeHtml(item.name)}</strong>
          <span>${label} | ${item.grade}${stars > 0 ? ` | ${"★".repeat(stars)}` : ""}</span>
        </div>
        <div class="equipment-detail-top">
          <div class="equipment-art-wrap">
            <img class="equipment-art" src="${item.iconDataUrl}" alt="${escapeHtml(item.name)}">
            ${starsHtml}
          </div>
          <p>${escapeHtml(item.desc || "")}${stars > 0 ? `<br><span class="equipment-star-bonus">\u5c5e\u6027 +${stars * 5}%</span>` : ""}</p>
        </div>
      </div>
    `;
  }

  return `
    <span class="equipment-slot" data-slot="${slot}" style="--slot-grade:${gradeColor(item.grade)}">
      <div class="equipment-slot-art-wrap">
        <img class="equipment-slot-art" src="${item.iconDataUrl}" alt="${escapeHtml(item.name)}">
        ${starsHtml}
      </div>
      <span class="equipment-slot-label">${label}</span>
      ${tooltip}
    </span>
  `;
}

function getEquipmentSlotGlyph(slot) {
  return {
    weapon: "\u5203",
    armor: "\u76fe",
    accessory: "\u9970"
  }[slot] || "\u69fd";
}

function renderBiographyDetails(progress, gradeColor, escapeHtml) {
  const entries = progress?.biographyEntries || [];
  if (entries.length === 0) {
    return `<p class="muted">${TEXT.noBiographyTip}</p>`;
  }
  return `
      <div class="biography-list">
        ${entries.map((item) => `<p class="biography-entry">${renderBiographyEntry(item, gradeColor, escapeHtml)}</p>`).join("")}
      </div>
    `;
}

function renderBiographyEntry(item, gradeColor, escapeHtml) {
  if (typeof item === "string") {
    return escapeHtml(item);
  }
  if (!item || typeof item !== "object") {
    return "";
  }
  let html = escapeHtml(item.text || "");
  if (item.subjectName) {
    html = html.replace(
      escapeHtml(item.subjectName),
      `<span style="color:${gradeColor(item.subjectGrade || "E")}">${escapeHtml(item.subjectName)}</span>`
    );
  }
  if (item.skillName) {
    html = html.replace(
      escapeHtml(item.skillName),
      `<span style="color:${gradeColor(item.skillGrade || "E")}">${escapeHtml(item.skillName)}</span>`
    );
  }
  if (item.equipmentName) {
    html = html.replace(
      escapeHtml(item.equipmentName),
      `<span style="color:${gradeColor(item.equipmentGrade || "E")}">${escapeHtml(item.equipmentName)}</span>`
    );
  }
  if (item.rewardName) {
    html = html.replace(
      escapeHtml(item.rewardName),
      `<span style="color:${gradeColor(item.rewardGrade || "E")}">${escapeHtml(item.rewardName)}</span>`
    );
  }
  return html;
}

function renderHonorStatusView(entry, gradeColor) {
  const battleWinLayers = entry.honorContext?.factionBattleWinCount || 0;
  const factionLayers = entry.honorContext?.factionChampionCount || 0;
  const championLayers = entry.progress?.tournamentChampionCount || 0;
  const runnerUpLayers = entry.progress?.tournamentRunnerUpCount || 0;
  const topFourLayers = entry.progress?.tournamentTopFourCount || 0;
  const fateLayers = entry.progress?.fateChangeCount || 0;
  const rows = [];

  if (entry.bloodline) {
    rows.push(`<div class="stat-pair"><span>\u8840\u8109\u4f20\u627f</span><strong style="color:${gradeColor(entry.bloodline.grade)}">${entry.bloodline.symbol || ""}${entry.bloodline.name}</strong></div>`);
    const aura = entry.honorContext?.persistentStatuses?.[0];
    if (aura?.name) {
      rows.push(`<div class="stat-pair"><span>${aura.name}</span><strong>${aura.desc || "\u5e38\u9a7b\u6548\u679c"}</strong></div>`);
    }
  }
  if (battleWinLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.battleGlory}</span><strong>${battleWinLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${formatHonorPercent(battleWinLayers * 0.5)}%</strong></div>`);
  }
  if (factionLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.sectGlory}</span><strong>${factionLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${formatHonorPercent(factionLayers * 2)}%</strong></div>`);
  }
  if (championLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.favoredOne}</span><strong>${championLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${formatHonorPercent(championLayers * 5)}%</strong></div>`);
  }
  if (runnerUpLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.runnerUpGlory}</span><strong>${runnerUpLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${formatHonorPercent(runnerUpLayers * 2)}%</strong></div>`);
  }
  if (topFourLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.risingStar}</span><strong>${topFourLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${formatHonorPercent(topFourLayers)}%</strong></div>`);
  }
  if (fateLayers > 0) {
    rows.push(`<div class="stat-pair"><span>${TEXT.fateChange}</span><strong>${fateLayers} \u5c42 \u00b7 ${TEXT.wholeAttrBonus} +${Math.round(fateLayers * 20)}%</strong></div>`);
  }
  if (rows.length === 0) {
    return `<p class="muted">${TEXT.noHonorTip}</p>`;
  }

  const totalBonus =
    battleWinLayers * 0.5 +
    factionLayers * 2 +
    championLayers * 5 +
    runnerUpLayers * 2 +
    topFourLayers * 1 +
    fateLayers * 20;
  if (totalBonus > 0) {
    rows.push(`<div class="stat-pair honor-total-row"><span>${TEXT.honorTotal}</span><strong class="honor-total-value">${TEXT.wholeAttrBonus} +${formatHonorPercent(totalBonus)}%</strong></div>`);
  }

  return rows.join("");
}

function renderPrimaryPairs(whitePrimary, greenPrimary, primary) {
  return `
    <div class="stat-pair"><span>\u529b\u91cf</span><strong>${formatLayeredStat(whitePrimary.strength, greenPrimary.strength, primary.strength)}</strong></div>
    <div class="stat-pair"><span>\u4f53\u8d28</span><strong>${formatLayeredStat(whitePrimary.vitality, greenPrimary.vitality, primary.vitality)}</strong></div>
    <div class="stat-pair"><span>\u654f\u6377</span><strong>${formatLayeredStat(whitePrimary.agility, greenPrimary.agility, primary.agility)}</strong></div>
    <div class="stat-pair"><span>\u667a\u529b</span><strong>${formatLayeredStat(whitePrimary.intelligence, greenPrimary.intelligence, primary.intelligence)}</strong></div>
    <div class="stat-pair"><span>\u7cbe\u795e</span><strong>${formatLayeredStat(whitePrimary.spirit, greenPrimary.spirit, primary.spirit)}</strong></div>
  `;
}

function renderDerivedPairs(whiteDerived, greenDerived, derived) {
      return `
      <div class="stat-pair"><span>HP</span><strong>${formatLayeredStat(whiteDerived.hpMax, greenDerived.hpMax, derived.hpMax)}</strong></div>
      <div class="stat-pair"><span>\u7269\u653b</span><strong>${formatLayeredStat(whiteDerived.physicalAttack, greenDerived.physicalAttack, derived.physicalAttack)}</strong></div>
      <div class="stat-pair"><span>\u6cd5\u653b</span><strong>${formatLayeredStat(whiteDerived.magicAttack, greenDerived.magicAttack, derived.magicAttack)}</strong></div>
      <div class="stat-pair"><span>\u7269\u9632</span><strong>${formatLayeredStat(whiteDerived.physicalDefense, greenDerived.physicalDefense, derived.physicalDefense)}</strong></div>
      <div class="stat-pair"><span>\u6cd5\u9632</span><strong>${formatLayeredStat(whiteDerived.magicDefense, greenDerived.magicDefense, derived.magicDefense)}</strong></div>
      <div class="stat-pair"><span>CD\u500d\u7387</span><strong>${formatMultiplierLayeredStat(whiteDerived.cooldownDurationMultiplierPct, greenDerived.cooldownDurationMultiplierPct, derived.cooldownDurationMultiplierPct)}</strong></div>
      <div class="stat-pair"><span>\u72b6\u6001\u500d\u7387</span><strong>${formatMultiplierLayeredStat(whiteDerived.statusDurationMultiplierPct, 100, derived.statusDurationMultiplierPct)}</strong></div>
      <div class="stat-pair"><span>\u653b\u51fb\u95f4\u9694</span><strong>${formatLayeredStat(whiteDerived.attackInterval, greenDerived.attackInterval, derived.attackInterval, true, "")}</strong></div>
      `;
}

function formatLayeredStat(whiteValue, greenValue, finalValue, keepOneDecimal = false, suffix = "") {
  const white = keepOneDecimal ? Number(whiteValue || 0).toFixed(1) : Math.round(whiteValue || 0);
  const greenNumeric = Number(greenValue || 0);
  const green = keepOneDecimal ? greenNumeric.toFixed(1) : Math.round(greenNumeric);
  const final = keepOneDecimal ? Number(finalValue || 0).toFixed(1) : Math.round(finalValue || 0);
  return `<span class="layered-stat"><span class="layered-stat__value">${white}</span><span class="plus-text layered-stat__op">+</span><span class="green-text layered-stat__value">${green}</span><span class="plus-text layered-stat__op">=</span><span class="layered-stat__value">${final}${suffix}</span></span>`;
}

function formatMultiplierLayeredStat(whiteValue, greenValue, finalValue) {
  const white = `${Number(whiteValue || 100).toFixed(1)}%`;
  const green = `${Number(greenValue || 100).toFixed(1)}%`;
  const final = `${Number(finalValue || 100).toFixed(1)}%`;
  return `<span class="layered-stat"><span class="layered-stat__value">${white}</span><span class="plus-text layered-stat__op">&times;</span><span class="green-text layered-stat__value">${green}</span><span class="plus-text layered-stat__op">=</span><span class="layered-stat__value">${final}</span></span>`;
}

function formatHonorPercent(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatPotentialColors(reason = {}) {
  return reason.colors === 3.5 ? "3+" : (reason.colors ?? "-");
}

function formatPotentialComplexity(reason = {}) {
  return reason.complexityLabel ?? reason.complexity ?? "-";
}

function formatPotentialSymmetry(reason = {}) {
  return reason.symmetryLabel ?? reason.symmetry ?? "-";
}



