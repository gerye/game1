// src/world-ui.js
// 世界地图渲染 + 仲裁者操作面板

import { WORLD_MAP_RADIUS, WORLD_CITY_TIERS } from "./config.js";
import {
  ALL_CITIES, hexDistance, inBounds
} from "./world-map.js";
import { FACTION_IDS, computePowerScore } from "./faction-state.js";
import { getSeasonLabel } from "./world-tick.js";

// ── 门派颜色与名称 ────────────────────────────────
export const FACTION_COLORS = {
  qingyun:  "#1a7f5e",
  shaolin:  "#c8960c",
  demon:    "#b32c2c",
  palace:   "#d8cfbd",
  isle:     "#4a8fcf",
  soul:     "#6b3fa0",
};

export const FACTION_NAMES = {
  qingyun:  "青云门",
  shaolin:  "少林",
  demon:    "魔教",
  palace:   "教廷",
  isle:     "仙岛",
  soul:     "魂殿",
};

// ── 六边形坐标到像素 ─────────────────────────────

const HEX_SIZE = 8;

function hexToPixel(q, r) {
  const x = HEX_SIZE * (3 / 2) * q;
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

function hexCorners(cx, cy, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return corners;
}

// ── Canvas 渲染 ──────────────────────────────────

/**
 * 渲染完整世界地图到 Canvas
 * @param {HTMLCanvasElement} canvas
 * @param {Object} worldState
 * @param {{ offsetX?: number, offsetY?: number, zoom?: number }} viewState
 */
export function renderWorldMap(canvas, worldState, viewState = {}, entries = []) {
  const ctx = canvas.getContext("2d");
  const { offsetX = 0, offsetY = 0, zoom = 1 } = viewState;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  ctx.scale(zoom, zoom);

  // 构建 hex → faction 映射（只有被控制的城市领地才有颜色）
  const cityOwnership = Object.fromEntries(
    (worldState.cities || []).map((c) => [c.id, c.faction])
  );
  const territories = worldState.cityTerritories || {};
  const hexFactionMap = new Map();
  for (const [cityId, hexKeys] of Object.entries(territories)) {
    const faction = cityOwnership[cityId];
    if (!faction) continue;   // 中立城市：不涂色
    for (const key of hexKeys) {
      hexFactionMap.set(key, faction);
    }
  }

  // 绘制所有格子
  for (let q = -WORLD_MAP_RADIUS; q <= WORLD_MAP_RADIUS; q++) {
    for (let r = -WORLD_MAP_RADIUS; r <= WORLD_MAP_RADIUS; r++) {
      if (!inBounds(q, r)) continue;
      drawHex(ctx, q, r, hexFactionMap);
    }
  }

  // 绘制城池建筑（从大到小，保证小城不被大城覆盖）
  const sortedCities = [...ALL_CITIES].sort((a, b) => {
    const tierOrder = { hq: 0, large: 1, small: 2 };
    return (tierOrder[a.tier] ?? 3) - (tierOrder[b.tier] ?? 3);
  });
  sortedCities.forEach((city) => {
    const owner = cityOwnership[city.id]; // null means neutral (不使用模板 faction 作为 fallback)
    const color = owner ? FACTION_COLORS[owner] : "#666666";
    if (city.tier === WORLD_CITY_TIERS.HQ) {
      drawHQBuilding(ctx, city, color);
    } else if (city.tier === WORLD_CITY_TIERS.LARGE) {
      drawLargeCityBuilding(ctx, city, color);
    } else {
      drawSmallCityBuilding(ctx, city, color);
    }
  });

  // 绘制角色图标
  if (entries.length) {
    drawCharacterIcons(ctx, worldState, entries);
  }

  ctx.restore();
}

// 图片缓存（避免重复创建 Image 对象）
const _avatarImageCache = new Map();

function getAvatarImage(dataUrl) {
  if (!dataUrl) return null;
  if (_avatarImageCache.has(dataUrl)) return _avatarImageCache.get(dataUrl);
  const img = new Image();
  img.src = dataUrl;
  _avatarImageCache.set(dataUrl, img);
  return img;
}

/**
 * 在地图上绘制角色图标
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} worldState
 * @param {Object[]} entries  getEntries() 返回的角色数组（含 base.avatarDataUrl, build.buildId, build.faction.key）
 */
function drawCharacterIcons(ctx, worldState, entries) {
  const charStates = worldState.characterStates || {};
  const cityTemplates = Object.fromEntries(
    (worldState.cities || []).map((c) => {
      const t = ALL_CITIES.find((a) => a.id === c.id);
      return [c.id, t];
    })
  );

  // 按城池聚合驻守角色（错开偏移）
  const cityGroups = {};

  entries.forEach((entry) => {
    const cs = charStates[entry.build?.buildId];
    if (!cs) return;

    let drawQ, drawR;
    if (cs.state === "garrison" && cs.cityId) {
      const t = cityTemplates[cs.cityId];
      if (!t) return;
      drawQ = t.q; drawR = t.r;
      const key = cs.cityId;
      if (!cityGroups[key]) cityGroups[key] = [];
      cityGroups[key].push({ entry, q: drawQ, r: drawR });
    } else if (cs.q != null && cs.r != null) {
      drawSingleCharIcon(ctx, cs.q, cs.r, 0, 0, entry);
    }
  });

  // 驻守角色错开排列（最多显示8个，超出省略）
  Object.values(cityGroups).forEach((group) => {
    group.slice(0, 8).forEach((item, idx) => {
      const offsetX = (idx % 4 - 1.5) * 5;
      const offsetY = Math.floor(idx / 4) * 6 - 3;
      drawSingleCharIcon(ctx, item.q, item.r, offsetX, offsetY, item.entry);
    });
  });
}

function drawSingleCharIcon(ctx, q, r, offsetX, offsetY, entry) {
  const { x, y } = hexToPixel(q, r);
  const cx = x + offsetX;
  const cy = y + offsetY;
  const radius = 4;
  const factionColor = FACTION_COLORS[entry.build?.faction?.key] || "#888";

  ctx.save();

  // 外圈（派系色）
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
  ctx.fillStyle = factionColor;
  ctx.fill();

  // 头像（clip 到圆形）
  const avatarUrl = entry.base?.avatarDataUrl;
  const img = avatarUrl ? getAvatarImage(avatarUrl) : null;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    // 无头像：用派系色深色填充
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = factionColor + "cc";
    ctx.fill();
  }

  ctx.restore();
}

function drawHex(ctx, q, r, hexFactionMap) {
  const { x, y } = hexToPixel(q, r);
  const corners = hexCorners(x, y, HEX_SIZE - 0.5);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();

  const faction = hexFactionMap?.get(`${q},${r}`);
  if (faction) {
    ctx.fillStyle = FACTION_COLORS[faction];
  } else {
    ctx.fillStyle = "#f0eed8";
  }
  ctx.fill();
  ctx.strokeStyle = "#00000018";
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

// 辅助：计算某颜色的暗化版本（简单混合黑色）
function darkenColor(hexColor, amount = 0.4) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr},${dg},${db})`;
}

// 填充指定 (q,r) 格子为深色（城池格子使用）
function fillHexDark(ctx, q, r, color) {
  if (!inBounds(q, r)) return;
  const { x, y } = hexToPixel(q, r);
  const corners = hexCorners(x, y, HEX_SIZE - 0.5);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// 六邻格坐标（axial 坐标系）
const HEX_NEIGHBOR_DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
];

/**
 * 小城：3格（中心 + 东 + 西）填充暗色，绘制驿站图标
 * 图标：两个小塔楼夹一个城门洞
 */
function drawSmallCityBuilding(ctx, city, factionColor) {
  ctx.save();
  const dark = darkenColor(factionColor, 0.35);
  const { q, r } = city;

  // 填充3格（中心、右邻、左邻）
  fillHexDark(ctx, q, r, dark);
  fillHexDark(ctx, q + 1, r, dark);
  fillHexDark(ctx, q - 1, r, dark);

  // 绘制图标（以中心像素为原点）
  const { x, y } = hexToPixel(q, r);
  const ic = "rgba(255,255,255,0.92)";

  ctx.fillStyle = ic;

  // 左塔
  ctx.fillRect(x - 9, y - 6, 5, 9);
  // 左塔垛口
  ctx.fillRect(x - 10, y - 8, 2, 3);
  ctx.fillRect(x - 7, y - 8, 2, 3);

  // 右塔
  ctx.fillRect(x + 4, y - 6, 5, 9);
  // 右塔垛口
  ctx.fillRect(x + 3, y - 8, 2, 3);
  ctx.fillRect(x + 6, y - 8, 2, 3);

  // 中间城墙（连接两塔）
  ctx.fillRect(x - 3, y - 3, 6, 6);

  // 城门拱洞
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y + 1, 2, Math.PI, 0);
  ctx.rect(x - 2, y + 1, 4, 3);
  ctx.fill();
  ctx.restore();
}

/**
 * 大城：7格（中心+6邻格）填充暗色，绘制城池图标
 * 图标：六边形城墙轮廓 + 内部三角屋顶建筑
 */
function drawLargeCityBuilding(ctx, city, factionColor) {
  ctx.save();
  const dark = darkenColor(factionColor, 0.3);
  const { q, r } = city;

  // 填充7格
  fillHexDark(ctx, q, r, dark);
  for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
    fillHexDark(ctx, q + dq, r + dr, dark);
  }

  // 绘制图标
  const { x, y } = hexToPixel(q, r);
  const ic = "rgba(255,255,255,0.90)";
  ctx.strokeStyle = ic;
  ctx.lineWidth = 1.2;

  // 城墙六边形轮廓（稍小于格子）
  const wallR = HEX_SIZE * 1.6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const wx = x + wallR * Math.cos(angle);
    const wy = y + wallR * Math.sin(angle);
    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.closePath();
  ctx.stroke();

  // 城墙四角哨楼（小方块）
  ctx.fillStyle = ic;
  for (let i = 0; i < 6; i += 2) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const wx = x + wallR * Math.cos(angle);
    const wy = y + wallR * Math.sin(angle);
    ctx.fillRect(wx - 1.5, wy - 1.5, 3, 3);
  }

  // 内部主建筑（宝塔形：三角+矩形叠层）
  ctx.fillStyle = ic;
  // 底层
  ctx.fillRect(x - 5, y + 1, 10, 5);
  // 中层
  ctx.fillRect(x - 3, y - 3, 6, 5);
  // 屋顶
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 3);
  ctx.lineTo(x, y - 8);
  ctx.lineTo(x + 5, y - 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 总部：7格填充，绘制宫殿图标
 * 图标：双层城墙 + 中央高塔（区别于大城的高度和装饰）
 */
function drawHQBuilding(ctx, city, factionColor) {
  ctx.save();
  const dark = darkenColor(factionColor, 0.25);
  const { q, r } = city;

  // 填充7格（更亮一点，HQ比大城显眼）
  const darkHQ = darkenColor(factionColor, 0.2);
  fillHexDark(ctx, q, r, darkHQ);
  for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
    fillHexDark(ctx, q + dq, r + dr, dark);
  }

  const { x, y } = hexToPixel(q, r);
  const ic = "rgba(255,245,200,0.95)";  // 金白色，区别于大城的纯白
  ctx.strokeStyle = ic;

  // 外城墙
  ctx.lineWidth = 1.4;
  const outerR = HEX_SIZE * 1.7;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const wx = x + outerR * Math.cos(angle);
    const wy = y + outerR * Math.sin(angle);
    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.closePath();
  ctx.stroke();

  // 内城墙（小一圈）
  ctx.lineWidth = 0.8;
  const innerR = HEX_SIZE * 1.0;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const wx = x + innerR * Math.cos(angle);
    const wy = y + innerR * Math.sin(angle);
    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.closePath();
  ctx.stroke();

  // 六角全填充（城楼）
  ctx.fillStyle = ic;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const wx = x + outerR * Math.cos(angle);
    const wy = y + outerR * Math.sin(angle);
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中央高塔（比大城高出约1.5倍）
  ctx.fillStyle = ic;
  // 底座
  ctx.fillRect(x - 4, y + 2, 8, 4);
  // 中层
  ctx.fillRect(x - 3, y - 2, 6, 5);
  // 高层
  ctx.fillRect(x - 2, y - 6, 4, 5);
  // 尖顶
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 6);
  ctx.lineTo(x, y - 11);
  ctx.lineTo(x + 3, y - 6);
  ctx.closePath();
  ctx.fill();
  // 顶部旗帜（小三角形）
  ctx.beginPath();
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x + 4, y - 9);
  ctx.lineTo(x, y - 7);
  ctx.closePath();
  ctx.fillStyle = factionColor;
  ctx.fill();
  ctx.restore();
}

// ── 仲裁者信息面板 ──────────────────────────────


/**
 * 渲染门派三维状态表格到 DOM 容器
 * @param {HTMLElement} container
 * @param {Object} worldState
 */
export function renderArbiterPanel(container, worldState, chronicle, entries = []) {
  const stats = worldState.factionStats || {};
  const cities = worldState.cities || [];
  const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chronicleEntries = chronicle?.entries ? chronicle.entries.slice(0, 8) : [];

  container.innerHTML = `
    <div class="world-panel">
      <h3>${getSeasonLabel(worldState.season || 1)} · 江湖格局</h3>
      <table class="world-stats-table">
        <thead>
          <tr><th>门派</th><th>实力</th><th>声望</th><th>金币</th><th>城池</th></tr>
        </thead>
        <tbody>
          ${FACTION_IDS.map((fid) => {
            const fs = stats[fid] || { prestige: 0, gold: 0 };
            const power = computePowerScore(fid, cities, entries);
            const cityCount = cities.filter((c) => c.faction === fid).length;
            return `<tr>
              <td><span class="faction-dot" style="background:${FACTION_COLORS[fid]}"></span>${FACTION_NAMES[fid]}</td>
              <td>${power}</td>
              <td>${fs.prestige}</td>
              <td>${fs.gold}</td>
              <td>${cityCount}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="world-log">
        ${chronicleEntries.length > 0
          ? chronicleEntries.map((e) => `<div class="chronicle-entry-mini"><strong>${escHtml(e.title || "")}</strong><p>${escHtml(e.text || "")}</p></div>`).join("")
          : `<div class="log-line" style="opacity:0.5">江湖故事正在酝酿中…</div>`
        }
      </div>
    </div>
  `;
}
