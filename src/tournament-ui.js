import { ROLE_LABELS } from "./config.js";

export function renderTournamentMatchPreview({ match, getEntryByCode, gradeColor, escapeHtml }) {
  if (!match) {
    return `<div class="prelude-card"><div class="prelude-event">当前轮次已全部完成，等待结算。</div></div>`;
  }
  const left = getEntryByCode(match.leftCode);
  const right = getEntryByCode(match.rightCode);
  return `
    <div class="prelude-grid">
      ${[left, right].map((entry, index) => entry ? `
        <article class="prelude-card">
          <div class="prelude-top">
            <img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
            <div class="cell-stack">
              <div class="prelude-name" style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</div>
              <div class="mini-text">${escapeHtml(entry.build.faction.name)} | ${escapeHtml(entry.build.roleLabel || ROLE_LABELS[entry.build.role])} | 潜力 ${entry.build.potential}</div>
            </div>
          </div>
          <div class="prelude-event">${index === 0 ? "红角选手" : "蓝角选手"}，确认后进入擂台对决。</div>
        </article>
      ` : "").join("")}
    </div>
  `;
}

export function getTournamentMatchState(match, isFinal = false) {
  if (match.winnerCode && match.byeCode) return "轮空晋级";
  if (match.winnerCode) return isFinal ? "已决出冠军" : "已决出胜者";
  if (match.leftCode && match.rightCode) return "等待开战";
  return "等待补全对阵";
}

export function renderTournamentTreeSlot(code, winner, fallback = "待定", getEntryByCode, gradeColor, escapeHtml) {
  if (!code) {
    return `
      <div class="tree-slot">
        <div class="tree-slot-placeholder"></div>
        <div>
          <div class="tree-slot-name">${escapeHtml(fallback)}</div>
        </div>
      </div>
    `;
  }
  const entry = getEntryByCode(code);
  if (!entry) {
    return `
      <div class="tree-slot">
        <div class="tree-slot-placeholder"></div>
        <div>
          <div class="tree-slot-name ${winner ? "winner" : ""}">${escapeHtml(code)}</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="tree-slot">
      <img src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
      <div>
        <div class="tree-slot-name ${winner ? "winner" : ""}" style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</div>
        <div class="tree-slot-meta">Lv.${entry.progress?.level || 1} | ${escapeHtml(entry.build.faction.name)}</div>
      </div>
    </div>
  `;
}

export function renderTournamentTreeMatch(match, options, deps) {
  const side = options.side || "left";
  const isFinal = Boolean(options.isFinal);
  return `
    <article class="tree-match-card ${isFinal ? "final-card" : ""} ${side}">
      ${renderTournamentTreeSlot(match.leftCode, match.winnerCode === match.leftCode, "待定", deps.getEntryByCode, deps.gradeColor, deps.escapeHtml)}
      ${renderTournamentTreeSlot(match.rightCode, match.winnerCode === match.rightCode, match.byeCode ? "轮空位" : "等待对阵", deps.getEntryByCode, deps.gradeColor, deps.escapeHtml)}
      <div class="tree-slot-meta">${deps.escapeHtml(getTournamentMatchState(match, isFinal))}</div>
    </article>
  `;
}

export function renderTournamentFullTree({ tournament, getEntryByCode, gradeColor, escapeHtml }) {
  if (!tournament) return "";
  const rounds = tournament.rounds || [];
  if (rounds.length === 0) return "";
  const earlyRounds = rounds.slice(0, -1);
  const finalRound = rounds[rounds.length - 1];
  const treeHeight = Math.min(680, Math.max(380, 220 + ((earlyRounds[0]?.matches.length || 1) * 98)));
  const leftColumns = earlyRounds.map((round) => ({
    name: round.name,
    matches: round.matches.slice(0, Math.ceil(round.matches.length / 2))
  }));
  const rightColumns = [...earlyRounds].reverse().map((round) => ({
    name: round.name,
    matches: round.matches.slice(Math.ceil(round.matches.length / 2))
  }));
  const deps = { getEntryByCode, gradeColor, escapeHtml };
  return `
    <div class="tournament-tree-shell" style="--tree-height:${treeHeight}px; --tree-left-cols:${Math.max(leftColumns.length, 1)}; --tree-right-cols:${Math.max(rightColumns.length, 1)}">
      <div class="tournament-tree-side left">
        ${leftColumns.map((round, index) => `
          <section class="tree-round-column left depth-${index + 1}">
            <div class="tree-round-head">${escapeHtml(round.name)}</div>
            <div class="tree-round-matches">
              ${round.matches.map((match) => renderTournamentTreeMatch(match, { side: "left" }, deps)).join("")}
            </div>
          </section>
        `).join("")}
      </div>
      <div class="tournament-tree-center">
        <section class="tree-round-column final depth-final">
          <div class="tree-round-head">${escapeHtml(finalRound.name)}</div>
          <div class="tree-round-matches">
            ${finalRound.matches.map((match) => renderTournamentTreeMatch(match, { side: "center", isFinal: true }, deps)).join("")}
          </div>
        </section>
      </div>
      <div class="tournament-tree-side right">
        ${rightColumns.map((round, index) => `
          <section class="tree-round-column right depth-${index + 1}">
            <div class="tree-round-head">${escapeHtml(round.name)}</div>
            <div class="tree-round-matches">
              ${round.matches.map((match) => renderTournamentTreeMatch(match, { side: "right" }, deps)).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderTournamentSlot(code, advanced, note, getEntryByCode, gradeColor, escapeHtml) {
  if (!code) {
    return `
      <div class="tournament-slot">
        <div class="tournament-slot-placeholder"></div>
        <div>
          <div class="tournament-slot-name">待定</div>
          <div class="tournament-slot-note">${note || "等待上一场结果"}</div>
        </div>
      </div>
    `;
  }
  const entry = getEntryByCode(code);
  if (!entry) {
    return `
      <div class="tournament-slot">
        <div class="tournament-slot-placeholder"></div>
        <div>
          <div class="tournament-slot-name">${escapeHtml(code)}</div>
          <div class="tournament-slot-note">${note || "数据已更新"}</div>
        </div>
      </div>
    `;
  }
  return `
    <div class="tournament-slot">
      <img src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
      <div>
        <div class="tournament-slot-name" style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</div>
        <div class="tournament-slot-note">${note || `Lv.${entry.progress?.level || 1} | ${escapeHtml(entry.build.faction.name)}`}</div>
      </div>
    </div>
  `;
}

export function renderTournamentBracket({ tournament, getEntryByCode, gradeColor, escapeHtml }) {
  if (!tournament) {
    return `<p class="muted">生成赛程后，这里会显示每一轮晋级表。</p>`;
  }
  const active = tournament.rounds.flatMap((round, roundIndex) =>
    round.matches.map((match, matchIndex) => ({ roundIndex, matchIndex, match }))
  ).find(({ match }) => match.leftCode && match.rightCode && !match.winnerCode) || null;
  return tournament.rounds.map((round, roundIndex) => `
    <section class="tournament-round">
      <div class="tournament-round-title">${escapeHtml(round.name)}</div>
      ${round.matches.map((match, matchIndex) => `
        <article class="tournament-match ${active && active.roundIndex === roundIndex && active.matchIndex === matchIndex ? "active" : ""}">
          ${renderTournamentSlot(match.leftCode, match.winnerCode === match.leftCode, match.byeCode && match.byeCode === match.leftCode ? "轮空" : "", getEntryByCode, gradeColor, escapeHtml)}
          ${renderTournamentSlot(match.rightCode, match.winnerCode === match.rightCode, match.byeCode && match.byeCode === match.rightCode ? "轮空" : "", getEntryByCode, gradeColor, escapeHtml)}
          <div class="tournament-match-state">${escapeHtml(getTournamentMatchState(match, roundIndex === tournament.rounds.length - 1))}</div>
        </article>
      `).join("")}
    </section>
  `).join("");
}

export function renderTournamentPanelsHtml({ tournament, tournamentBattle, activeMatch, formatMatchName, formatRewardSpec, escapeHtml, logLimit }) {
  const rows = [
    ["状态", tournamentBattle ? (tournamentBattle.winner ? `本场结束 | ${tournamentBattle.winner.name}` : tournamentBattle.paused ? "对决暂停" : "对决中") : tournament.championCode ? "赛事结束" : "等待开始下一场"],
    ["总人数", `${tournament.participantCodes.length}`],
    ["当前轮次", tournament.currentRoundIndex >= 0 ? tournament.rounds[tournament.currentRoundIndex]?.name || "-" : "-"],
    ["下一场", activeMatch ? `${formatMatchName(activeMatch.leftCode)} vs ${formatMatchName(activeMatch.rightCode)}` : "全部结束"],
    ["冠军奖励", `${formatRewardSpec(tournament.rewards?.championSpec)}`],
    ["亚军奖励", `${formatRewardSpec(tournament.rewards?.runnerUpSpec)}`]
  ];
  return {
    summaryHtml: rows.map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join(""),
    logHtml: (tournament.logs || [])
      .slice(-logLimit)
      .reverse()
      .map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`)
      .join("") || `<div class="battle-log-entry">武道会尚未开始。</div>`
  };
}

export function renderTournamentPreludeHtml({
  tournament,
  nextMatch,
  champion,
  runnerUp,
  finalWinner,
  renderTournamentConfigPanelHtml,
  renderTournamentLastResultHtml,
  getEntryByCode,
  gradeColor,
  escapeHtml
}) {
  if (!tournament) {
    return `
      <div class="prelude-head">
        <div>
          <h3>武道会说明</h3>
          <p class="muted">所有角色会被随机打乱并进入淘汰赛。每场对决结束后，胜者晋级，下一轮自动回满生命，并以最新等级继续参赛。</p>
        </div>
      </div>
      <div class="prelude-card">
        <div class="prelude-event">先在上方分别选择冠军和亚军奖励池的潜力等级与装备部位，然后点击“生成赛程”。真正的装备会在名次确定后，从对应奖励池里随机抽出。</div>
      </div>
      ${renderTournamentConfigPanelHtml}
      <div class="card-actions">
        <button class="primary-btn" type="button" data-tournament-action="create">锁定奖池并生成赛程</button>
      </div>
    `;
  }

  return `
    <div class="prelude-head">
      <div>
        <h3>${champion ? "武道会结束" : "赛前准备"}</h3>
        <p class="muted">${champion ? `冠军是 <span style="color:${gradeColor(champion.build.potential)}">${escapeHtml(champion?.displayName || tournament.championCode)}</span>，奖励已发放。` : "点击下方按钮，依次推进每一场擂台战。轮空角色会直接晋级。"}</p>
      </div>
    </div>
    ${finalWinner ? `
      <div class="prelude-card">
        <div class="prelude-event" style="font-size:18px;font-weight:700;color:${gradeColor(champion.build.potential)}">
          最终胜者：${escapeHtml(champion.displayName)}。50级武道会冠军已诞生，快速推演已停止，现在可以开启无尽推演。
        </div>
      </div>
    ` : ""}
    ${renderTournamentConfigPanelHtml}
    ${tournament.lastMatchResult ? renderTournamentLastResultHtml : ""}
    ${champion
      ? `<div class="prelude-card"><div class="prelude-event">冠军：<span style="color:${gradeColor(champion.build.potential)}">${escapeHtml(champion.displayName)}</span>。${runnerUp ? `亚军：<span style="color:${gradeColor(runnerUp.build.potential)}">${escapeHtml(runnerUp.displayName)}</span>。` : ""}</div></div>`
      : renderTournamentMatchPreview({ match: nextMatch, getEntryByCode, gradeColor, escapeHtml })}
    ${champion ? "" : `<div class="card-actions"><button class="primary-btn" type="button" data-tournament-action="start-next">开始这一场对决</button></div>`}
  `;
}
