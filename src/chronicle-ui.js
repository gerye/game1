export function getSelectedRankingHistorySnapshot(rankingHistory = [], selectedIndex = 0) {
  if (!rankingHistory.length) return null;
  const safeIndex = Math.min(
    Math.max(0, Number(selectedIndex || 0)),
    rankingHistory.length - 1
  );
  return rankingHistory[safeIndex] || null;
}

function renderChronicleTopTabs(chronicleTab) {
  return `
    <div class="chronicle-mode-tabs">
      <button
        type="button"
        class="chronicle-mode-tab ${chronicleTab === "entries" ? "active" : ""}"
        data-chronicle-action="switch-tab"
        data-chronicle-tab="entries"
      >
        江湖大事记
      </button>
      <button
        type="button"
        class="chronicle-mode-tab ${chronicleTab === "ranking-history" ? "active" : ""}"
        data-chronicle-action="switch-tab"
        data-chronicle-tab="ranking-history"
      >
        历届排位
      </button>
    </div>
  `;
}

function renderRankingHistoryIndexTabs(rankingHistory, selectedIndex, escapeHtml, snapshot) {
  if (!rankingHistory.length) return "";
  return `
    <div class="ranking-history-tabs">
      ${rankingHistory.map((item, index) => `
        <button
          type="button"
          class="ranking-history-tab ${snapshot && index === selectedIndex ? "active" : ""}"
          data-chronicle-action="select-ranking-history"
          data-ranking-history-index="${index}"
        >
          ${escapeHtml(item.title || `第${index + 1}次排位`)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderRankingHistoryPanel({
  rankingHistory,
  selectedRankingHistoryIndex,
  selectedRankingHistoryBoardTab,
  renderRankingBoardContent,
  getRankingRoundRows,
  getRankingStandings,
  getRankingKnockoutPreview,
  getEntryByCode,
  gradeColor,
  escapeHtml
}) {
  const snapshot = getSelectedRankingHistorySnapshot(rankingHistory, selectedRankingHistoryIndex);
  if (!snapshot) {
    return `
      ${renderRankingHistoryIndexTabs(rankingHistory, selectedRankingHistoryIndex, escapeHtml, null)}
      <div class="prelude-card">
        <div class="prelude-name">历届排位</div>
        <div class="prelude-event">当前还没有任何江湖排位历史记录。</div>
      </div>
    `;
  }
  return `
    ${renderRankingHistoryIndexTabs(rankingHistory, selectedRankingHistoryIndex, escapeHtml, snapshot)}
    <div class="ranking-board-panel">
      <div class="mini-text">当前查看：${escapeHtml(snapshot.title)}</div>
      ${renderRankingBoardContent({
        ranking: snapshot,
        activeTab: selectedRankingHistoryBoardTab || "swiss-1",
        getRankingRoundRows,
        getRankingStandings,
        getRankingKnockoutPreview,
        getEntryByCode: (code) => getEntryByCode(snapshot, code),
        gradeColor,
        escapeHtml
      })}
    </div>
  `;
}

export function renderChronicleStageHtml({
  chronicleTab,
  chroniclePanelHtml,
  rankingHistory,
  selectedRankingHistoryIndex,
  selectedRankingHistoryBoardTab,
  renderRankingBoardContent,
  getRankingRoundRows,
  getRankingStandings,
  getRankingKnockoutPreview,
  getEntryByCode,
  gradeColor,
  escapeHtml
}) {
  return `
    <div class="chronicle-stage">
      <div class="prelude-head">
        <div>
          <h3>江湖大事记</h3>
          <p class="muted">在这里可以查看江湖大事记，以及历届江湖排位的完整成绩快照。</p>
        </div>
      </div>
      ${renderChronicleTopTabs(chronicleTab)}
      <div class="chronicle-stage-body">
        ${chronicleTab === "ranking-history"
          ? renderRankingHistoryPanel({
              rankingHistory,
              selectedRankingHistoryIndex,
              selectedRankingHistoryBoardTab,
              renderRankingBoardContent,
              getRankingRoundRows,
              getRankingStandings,
              getRankingKnockoutPreview,
              getEntryByCode,
              gradeColor,
              escapeHtml
            })
          : chroniclePanelHtml}
      </div>
    </div>
  `;
}
