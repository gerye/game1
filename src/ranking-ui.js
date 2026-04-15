import { DEFAULT_FACTION_COLOR } from "./config.js";

export function getDefaultRankingBoardTab(ranking) {
  if (!ranking) return "swiss-1";
  if (ranking.currentPhase === "knockout" && ranking.knockout) return "knockout";
  return `swiss-${Math.max(1, ranking.rounds?.length || 1)}`;
}

function buildDenseRanks(rows = []) {
  let lastTuple = null;
  let displayRank = 0;
  return rows.map((row) => {
    const tuple = `${row.points}|${row.oppPoints}|${row.oppOppPoints}`;
    if (tuple !== lastTuple) {
      displayRank = row.rank;
      lastTuple = tuple;
    }
    return { ...row, displayRank };
  });
}

function renderEmptyCard(message) {
  return `
    <div class="prelude-card">
      <div class="prelude-event">${message}</div>
    </div>
  `;
}

export function renderRankingModeInfo({ ranking, getRankingStandings, formatMatchName, escapeHtml }) {
  if (!ranking) {
    return `<div class="terrain-item">江湖排位采用瑞士轮加淘汰赛赛制，先完成全部瑞士轮，再由前 12 强进入淘汰赛。</div>`;
  }
  const currentSwissRound = Math.min(ranking.rounds.length, ranking.swissRoundCount);
  const phaseLabel = ranking.currentPhase === "knockout"
    ? "淘汰赛阶段"
    : `瑞士轮第 ${currentSwissRound} 轮`;
  const standings = getRankingStandings(ranking).slice(0, 5);
  const topText = standings.map((item) => `${item.rank}.${escapeHtml(formatMatchName(item.code))}`).join(" / ") || "暂无";
  return `
    <div class="terrain-item">当前阶段：${escapeHtml(phaseLabel)}</div>
    <div class="terrain-item">当前前五：${topText}</div>
    <div class="card-actions">
      <button class="primary-btn" type="button" data-ranking-info-action="open-board">查看完整对阵页</button>
    </div>
  `;
}

function renderRankingRoundTable({ ranking, roundNumber, getRankingRoundRows, getEntryByCode, gradeColor, escapeHtml }) {
  const rows = buildDenseRanks(getRankingRoundRows(ranking, roundNumber));
  if (!rows.length) {
    return renderEmptyCard(`第 ${roundNumber} 轮对阵表尚未生成。`);
  }
  return `
    <div class="prelude-table-wrap">
      <table class="prelude-table ranking-table">
        <thead>
          <tr>
            <th>当轮排名</th>
            <th>姓名</th>
            <th>门派</th>
            <th>积分</th>
            <th>第一小分</th>
            <th>第二小分</th>
            <th>本轮对手</th>
            <th>胜负情况</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const entry = getEntryByCode(row.code);
            const opponent = row.opponentCode ? getEntryByCode(row.opponentCode) : null;
            const factionColor = entry?.build?.faction?.color || DEFAULT_FACTION_COLOR;
            const opponentText = row.outcome === "轮空" ? "轮空" : (row.opponentCode || "-");
            const opponentHtml = opponent
              ? `<span style="color:${gradeColor(opponent?.build?.potential || "E")}">${escapeHtml(opponent.displayName)}</span>`
              : escapeHtml(opponentText);
            const rowClass = row.rank === 12 ? "ranking-cutoff-row" : "";
            return `
              <tr class="${rowClass}">
                <td>${row.displayRank}</td>
                <td style="color:${gradeColor(entry?.build?.potential || "E")}">${escapeHtml(entry?.displayName || row.code)}</td>
                <td><span style="color:${factionColor}">${escapeHtml(entry?.build?.faction?.name || "-")}</span></td>
                <td>${row.points}</td>
                <td>${row.oppPoints}</td>
                <td>${row.oppOppPoints}</td>
                <td>${opponentHtml}</td>
                <td>${escapeHtml(row.outcome || "-")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRankingSwissFinalTable({ ranking, getRankingStandings, getEntryByCode, gradeColor, escapeHtml }) {
  const rows = buildDenseRanks(getRankingStandings(ranking));
  return `
    <div class="prelude-table-wrap">
      <table class="prelude-table ranking-table">
        <thead>
          <tr>
            <th>最终排名</th>
            <th>姓名</th>
            <th>门派</th>
            <th>积分</th>
            <th>第一小分</th>
            <th>第二小分</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const entry = getEntryByCode(row.code);
            const factionColor = entry?.build?.faction?.color || DEFAULT_FACTION_COLOR;
            const rowClass = row.rank === 12 ? "ranking-cutoff-row" : "";
            return `
              <tr class="${rowClass}">
                <td>${row.displayRank}</td>
                <td style="color:${gradeColor(entry?.build?.potential || "E")}">${escapeHtml(entry?.displayName || row.code)}</td>
                <td><span style="color:${factionColor}">${escapeHtml(entry?.build?.faction?.name || "-")}</span></td>
                <td>${row.points}</td>
                <td>${row.oppPoints}</td>
                <td>${row.oppOppPoints}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRankingBoardTabs({ ranking, activeTab }) {
  if (!ranking) return "";
  const swissRoundCount = Math.max(1, ranking.swissRoundCount || 1);
  const swissButtons = Array.from({ length: swissRoundCount }, (_, index) => {
    const roundNumber = index + 1;
    return `
      <button
        class="ranking-bookmark ${activeTab === `swiss-${roundNumber}` ? "active" : ""}"
        type="button"
        data-ranking-action="switch-board-tab"
        data-ranking-tab="swiss-${roundNumber}"
      >
        第${roundNumber}轮
      </button>
    `;
  }).join("");
  return `
    ${swissButtons}
    <button
      class="ranking-bookmark ${activeTab === "swiss-final" ? "active" : ""}"
      type="button"
      data-ranking-action="switch-board-tab"
      data-ranking-tab="swiss-final"
    >
      瑞士轮最终成绩
    </button>
    <button
      class="ranking-bookmark ${activeTab === "knockout" ? "active" : ""}"
      type="button"
      data-ranking-action="switch-board-tab"
      data-ranking-tab="knockout"
    >
      淘汰赛
    </button>
  `;
}

function getRankingKnockoutSeedLabels(match) {
  const byId = {
    "playin-1": ["#5", "#12"],
    "playin-2": ["#6", "#11"],
    "playin-3": ["#7", "#10"],
    "playin-4": ["#8", "#9"],
    "qf-1": ["#1", "#8/9"],
    "qf-2": ["#4", "#5/12"],
    "qf-3": ["#3", "#6/11"],
    "qf-4": ["#2", "#7/10"],
    "sf-1": ["上半区", "下半区"],
    "sf-2": ["上半区", "下半区"],
    final: ["决赛席位", "决赛席位"]
  };
  return byId[match?.id] || ["", ""];
}

function renderRankingTreeSlot(code, winner, { getEntryByCode, gradeColor, escapeHtml }, options = {}) {
  const seedLabel = options.seedLabel || "";
  const fallback = options.fallback || "待定";
  const labelPrefix = seedLabel ? `<span class="ranking-tree-seed">${escapeHtml(seedLabel)}：</span>` : "";
  if (!code) {
    return `
      <div class="ranking-tree-slot">
        <div class="ranking-tree-slot-name">${labelPrefix}${escapeHtml(fallback)}</div>
      </div>
    `;
  }
  const entry = getEntryByCode(code);
  if (!entry) {
    return `
      <div class="ranking-tree-slot">
        <div class="ranking-tree-slot-name ${winner ? "winner" : ""}">${labelPrefix}${escapeHtml(code)}</div>
      </div>
    `;
  }
  return `
    <div class="ranking-tree-slot">
      <div class="ranking-tree-slot-name ${winner ? "winner" : ""}">
        ${labelPrefix}<span style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</span>
      </div>
      <div class="ranking-tree-slot-meta">
        <span style="color:${entry.build?.faction?.color || DEFAULT_FACTION_COLOR}">${escapeHtml(entry.build?.faction?.name || "-")}</span>
      </div>
    </div>
  `;
}

function renderRankingTreeMatch(match, deps, options = {}) {
  const side = options.side || "left";
  const isFinal = Boolean(options.isFinal);
  const [leftSeed, rightSeed] = getRankingKnockoutSeedLabels(match);
  const rightFallback = match.byeCode ? "轮空位" : "待定";
  return `
    <article class="ranking-tree-match ${side} ${isFinal ? "final-card" : ""}">
      ${renderRankingTreeSlot(match.leftCode, match.winnerCode === match.leftCode, deps, { seedLabel: leftSeed, fallback: "待定" })}
      ${renderRankingTreeSlot(match.rightCode, match.winnerCode === match.rightCode, deps, { seedLabel: rightSeed, fallback: rightFallback })}
      <div class="ranking-tree-match-state">${deps.escapeHtml(match.winnerCode ? "已结束" : "等待开战")}</div>
    </article>
  `;
}

function renderRankingKnockoutTable({ ranking, getRankingKnockoutPreview, getEntryByCode, gradeColor, escapeHtml }) {
  const rounds = getRankingKnockoutPreview(ranking);
  if (!rounds.length) {
    return renderEmptyCard("当前暂无可展示的淘汰赛种子位。");
  }
  const [playInRound, quarterRound, semifinalRound, finalRound] = rounds;
  const championCode = finalRound?.matches?.[0]?.winnerCode || "";
  const playInOrder = [3, 0, 2, 1];
  const quarterOrder = [0, 1, 3, 2];
  const orderedPlayIn = playInOrder.map((index) => playInRound?.matches?.[index]).filter(Boolean);
  const orderedQuarter = quarterOrder.map((index) => quarterRound?.matches?.[index]).filter(Boolean);
  const deps = { getEntryByCode, gradeColor, escapeHtml };
  return `
    <div class="ranking-tree-shell">
      <div class="ranking-tree-column playin">
        <div class="ranking-tree-head">12进8</div>
        ${orderedPlayIn.map((match, index) => `
          <div class="ranking-tree-cell playin-${index + 1}">
            ${renderRankingTreeMatch(match, deps, { side: "left" })}
          </div>
        `).join("")}
      </div>
      <div class="ranking-tree-column quarter">
        <div class="ranking-tree-head">8强</div>
        ${orderedQuarter.map((match, index) => `
          <div class="ranking-tree-cell quarter-${index + 1}">
            ${renderRankingTreeMatch(match, deps, { side: "left" })}
          </div>
        `).join("")}
      </div>
      <div class="ranking-tree-column semifinal">
        <div class="ranking-tree-head">半决赛</div>
        ${(semifinalRound?.matches || []).map((match, index) => `
          <div class="ranking-tree-cell semifinal-${index + 1}">
            ${renderRankingTreeMatch(match, deps, { side: "left" })}
          </div>
        `).join("")}
      </div>
      <div class="ranking-tree-column final">
        <div class="ranking-tree-head">决赛</div>
        <div class="ranking-tree-cell final-1">
          ${renderRankingTreeMatch(finalRound?.matches?.[0] || { id: "final", leftCode: "", rightCode: "", winnerCode: "" }, deps, { side: "left", isFinal: true })}
        </div>
      </div>
      <div class="ranking-tree-column champion">
        <div class="ranking-tree-head">冠军</div>
        <div class="ranking-tree-cell champion-1">
          <article class="ranking-tree-match champion-card">
            ${renderRankingTreeSlot(championCode, true, deps, { seedLabel: "冠军", fallback: "待定" })}
          </article>
        </div>
      </div>
    </div>
  `;
}

export function renderRankingBoardContent({
  ranking,
  activeTab,
  getRankingRoundRows,
  getRankingStandings,
  getRankingKnockoutPreview,
  getEntryByCode,
  gradeColor,
  escapeHtml
}) {
  if (!ranking) {
    return `<p class="muted">当前还没有可展示的江湖排位对阵页。</p>`;
  }
  let bodyHtml = "";
  if (activeTab === "knockout") {
    bodyHtml = renderRankingKnockoutTable({ ranking, getRankingKnockoutPreview, getEntryByCode, gradeColor, escapeHtml });
  } else if (activeTab === "swiss-final") {
    bodyHtml = renderRankingSwissFinalTable({ ranking, getRankingStandings, getEntryByCode, gradeColor, escapeHtml });
  } else {
    bodyHtml = renderRankingRoundTable({
      ranking,
      roundNumber: Number(activeTab.replace("swiss-", "")) || 1,
      getRankingRoundRows,
      getEntryByCode,
      gradeColor,
      escapeHtml
    });
  }
  return `
    <div class="ranking-board-shell">
      <aside class="ranking-bookmarks">
        ${renderRankingBoardTabs({ ranking, activeTab })}
      </aside>
      <section class="ranking-board-main">
        ${bodyHtml}
      </section>
    </div>
  `;
}

export function renderRankingLastResult({ result, gradeColor, escapeHtml }) {
  return `
    <div class="prelude-card">
      <div class="prelude-event">
        上一场结果：
        <span style="color:${gradeColor(result.winnerGrade || "E")}">${escapeHtml(result.winnerName)}</span>
        战胜
        <span style="color:${gradeColor(result.loserGrade || "E")}">${escapeHtml(result.loserName)}</span>。
        伤害统计：
        <span style="color:${gradeColor(result.winnerGrade || "E")}">${escapeHtml(result.winnerName)}</span>
        ${Math.round(result.winnerDamage)}
        /
        <span style="color:${gradeColor(result.loserGrade || "E")}">${escapeHtml(result.loserName)}</span>
        ${Math.round(result.loserDamage)}。
      </div>
    </div>
  `;
}

export function renderRankingMatchPreview({ match, getEntryByCode, gradeColor, escapeHtml, roleLabels }) {
  if (!match) {
    return renderEmptyCard("当前阶段所有对局都已结束，请生成下一轮或进入淘汰赛。");
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
              <div class="mini-text">${escapeHtml(entry.build.faction.name)} | ${escapeHtml(entry.build.roleLabel || roleLabels[entry.build.role])} | 潜力 ${entry.build.potential}</div>
            </div>
          </div>
          <div class="prelude-event">${index === 0 ? "红角选手" : "蓝角选手"}，确认后进入排位对决。</div>
        </article>
      ` : "").join("")}
    </div>
  `;
}
