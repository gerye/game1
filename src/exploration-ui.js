export function renderExplorationTierDivider(label, escapeHtml) {
  return `<div class="exploration-tier-divider">—— ${escapeHtml(label)} ——</div>`;
}

export function renderExplorationRoleCard(entry, rewardName, gradeColor, escapeHtml) {
  if (!entry) return "";
  const tooltip = rewardName
    ? `<span class="skill-tooltip"><strong>${escapeHtml(entry.displayName)}</strong><br>最终奖励：${escapeHtml(rewardName)}</span>`
    : "";
  return `
    <article class="exploration-role-card">
      <img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
      <div class="mini-text" style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</div>
      ${tooltip}
    </article>
  `;
}

export function renderExplorationTierSection(grade, entries, rewardMap, gradeColor, escapeHtml) {
  return `
    <section class="exploration-tier-section">
      <div class="faction-section-head">
        <strong style="color:${gradeColor(grade)}">${grade}级</strong>
        <span class="tag">${entries.length} 名角色</span>
      </div>
      <div class="exploration-tier-grid">
        ${entries.length > 0
          ? entries.map((entry) => renderExplorationRoleCard(entry, rewardMap?.[entry.base.code] || "", gradeColor, escapeHtml)).join("")
          : `<div class="mini-text">当前无人停留在该奖励区。</div>`}
      </div>
    </section>
  `;
}

export function renderExplorationPanelsHtml({ exploration, visibleGrades, tierEntries, gradeColor, escapeHtml, logLimit }) {
  const counts = visibleGrades.reduce((map, grade) => {
    map[grade] = (tierEntries[grade] || []).length;
    return map;
  }, {});
  const summaryRows = [
    ["状态", exploration.finished ? (exploration.rewardsGranted ? "奖励已发放" : "等待领奖") : `挑战 ${exploration.currentTier} 级奖励区`],
    ["总人数", `${exploration.participantCodes.length}`],
    ["当前提问", exploration.currentQuestion?.text || "等待进入下一轮"],
    ["SSS人数", `${counts.SSS || 0}`],
    ["SS人数", `${counts.SS || 0}`],
    ["S人数", `${counts.S || 0}`]
  ];
  return {
    summaryHtml: summaryRows
      .map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`)
      .join(""),
    logHtml: (exploration.logs || [])
      .slice(-logLimit)
      .reverse()
      .map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`)
      .join("")
  };
}
