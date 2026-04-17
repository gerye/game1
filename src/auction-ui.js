import { EQUIPMENT_SLOT_LABELS } from "./equipment-data.js";

function renderAuctionLotCard(lot, gradeColor, escapeHtml) {
  return `
    <div class="detail-skill-card equipment-card" style="border-color:${gradeColor(lot.grade)}">
      <div class="detail-skill-head" style="color:${gradeColor(lot.grade)}">
        <strong style="color:${gradeColor(lot.grade)}">${escapeHtml(lot.name)}</strong>
        <span>${EQUIPMENT_SLOT_LABELS[lot.slot] || lot.slot} | ${lot.grade}</span>
      </div>
      <div class="equipment-detail-top">
        <div class="equipment-art-wrap">
          <img class="equipment-art" src="${lot.iconDataUrl}" alt="${escapeHtml(lot.name)}">
        </div>
        <p>拍品 ${lot.lotIndex + 1}<br><span class="mini-text">会逐件拍卖，先过滤掉完全用不上这件装备的门派，再由当前金币第一的门派按“第二名金额 + 1”成交。</span></p>
      </div>
    </div>
  `;
}

function renderGoldRankingRows(ranking = [], factionLookup = new Map(), escapeHtml) {
  if (!ranking.length) {
    return `<div class="battle-log-entry">暂无门派金币数据。</div>`;
  }
  return ranking.map((row) => {
    const faction = factionLookup.get(row.factionKey);
    const factionName = faction?.name || row.factionKey;
    const factionColor = faction?.color || "#8f5d32";
    return `
      <div class="summary-row">
        <span>#${row.rank} <strong style="color:${factionColor}">${escapeHtml(factionName)}</strong></span>
        <strong>${row.gold}</strong>
      </div>
    `;
  }).join("");
}

export function renderAuctionPrelude({ auction, factionLookup = new Map(), gradeColor, escapeHtml }) {
  if (!auction) {
    return `
      <div class="prelude-card">
        <div class="prelude-event">点击“开始拍卖会”后，这里会展示拍品与竞价结果。</div>
      </div>
    `;
  }

  const controlCard = auction.resolved
    ? `
      <div class="prelude-card">
        <div class="prelude-event">竞价已经完成，结果如下。</div>
      </div>
    `
    : `
      <div class="prelude-card">
        <div class="prelude-event">每件拍品单独竞拍。会先排除掉对这件装备完全无用的门派，再由当前金币最高的门派买走该拍品，只需支付比第二名多 1 金币的价格；若前两名金额相同，则按同额成交。</div>
        <div class="card-actions">
          <button id="auctionBidBtnPrimary" class="primary-btn" type="button">竞价</button>
        </div>
      </div>
    `;

  const resultList = auction.resolved
    ? `
      <div class="skill-detail-list">
        ${auction.assignments.map((assignment) => `
          <div class="detail-skill-card" style="border-color:${gradeColor(assignment.lot.grade)}">
            <div class="detail-skill-head" style="color:${gradeColor(assignment.lot.grade)}">
              <strong style="color:${gradeColor(assignment.lot.grade)}">${escapeHtml(assignment.lot.name)}</strong>
              <span>${assignment.lot.grade}</span>
            </div>
            <p>
              <span style="color:${factionLookup.get(assignment.factionKey)?.color || "#8f5d32"}">${escapeHtml(assignment.factionName)}</span>
              以 ${assignment.spentGold} 金币成交，
              ${assignment.applied
                ? ` 由 ${escapeHtml(assignment.recipientName)} 获得`
                : ` 获得拍品，但门派内无人可继续提升该部位装备`}
            </p>
          </div>
        `).join("")}
      </div>
    `
    : "";

  return `
    <div class="chronicle-stage">
      <div class="prelude-head">
        <div>
          <h3>拍卖会</h3>
          <p class="muted">本次随机上架三件武器 / 防具，品级互不相同。每件拍品都会先过滤掉无资格提升的门派，再按“当前金币第一、成交价只比第二名高 1”的规则逐件拍卖。</p>
        </div>
      </div>
      ${controlCard}
      ${resultList}
      <div class="skill-detail-list">
        ${auction.items.map((lot) => renderAuctionLotCard(lot, gradeColor, escapeHtml)).join("")}
      </div>
    </div>
  `;
}

export function renderAuctionPanels({ auction, factionLookup = new Map(), escapeHtml, logLimit = 20 }) {
  const summaryRows = [
    ["状态", auction?.resolved ? "竞价完成" : "等待竞价"],
    ["拍品数量", `${auction?.items?.length || 0}`],
    ["最高优先门派", auction?.goldRanking?.[0]
      ? (factionLookup.get(auction.goldRanking[0].factionKey)?.name || auction.goldRanking[0].factionKey)
      : "-"]
  ];

  const summaryHtml = `
    ${summaryRows.map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")}
    <div class="summary-row"><span>金币排行</span><strong>${auction?.resolved ? "竞价后" : "竞价前"}</strong></div>
    ${renderGoldRankingRows(auction?.resolved ? auction.postGoldRanking : auction?.goldRanking, factionLookup, escapeHtml)}
  `;

  const logHtml = (auction?.logs || [])
    .slice(-logLimit)
    .reverse()
    .map((log) => `<div class="battle-log-entry">${escapeHtml(log)}</div>`)
    .join("");

  return { summaryHtml, logHtml };
}
