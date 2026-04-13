// src/world-ui.js
// 世界地图渲染 + 仲裁者操作面板

import { WORLD_MAP_RADIUS, WORLD_CITY_TIERS } from "./config.js";
import {
  getTerrainAt, TERRAIN_COLORS, ALL_CITIES, hexDistance, inBounds
} from "./world-map.js";
import { FACTION_IDS, computePowerScore } from "./faction-state.js";

// ── 门派颜色与名称 ────────────────────────────────
export const FACTION_COLORS = {
  qingyun:  "#1a7f5e",
  shaolin:  "#c8960c",
  mojiao:   "#b32c2c",
  jiaoting: "#e8e0d0",
  xiandao:  "#4a8fcf",
  hundian:  "#6b3fa0",
};

export const FACTION_NAMES = {
  qingyun:  "青云门",
  shaolin:  "少林",
  mojiao:   "魔教",
  jiaoting: "教廷",
  xiandao:  "仙岛",
  hundian:  "魂殿",
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
    const angle = (Math.PI / 180) * (60 * i - 30);
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
export function renderWorldMap(canvas, worldState, viewState = {}) {
  const ctx = canvas.getContext("2d");
  const { offsetX = 0, offsetY = 0, zoom = 1 } = viewState;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  ctx.scale(zoom, zoom);

  const cityOwnership = Object.fromEntries(
    (worldState.cities || []).map((c) => [c.id, c.faction])
  );

  // 绘制所有格子
  for (let q = -WORLD_MAP_RADIUS; q <= WORLD_MAP_RADIUS; q++) {
    for (let r = -WORLD_MAP_RADIUS; r <= WORLD_MAP_RADIUS; r++) {
      if (!inBounds(q, r)) continue;
      drawHex(ctx, q, r, cityOwnership);
    }
  }

  // 绘制城池标记
  ALL_CITIES.forEach((city) => {
    const owner = cityOwnership[city.id] ?? city.faction;
    drawCityMarker(ctx, city, owner);
  });

  ctx.restore();
}

function drawHex(ctx, q, r, cityOwnership) {
  const { x, y } = hexToPixel(q, r);
  const corners = hexCorners(x, y, HEX_SIZE - 0.5);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();

  const terrain = getTerrainAt(q, r);
  const terrainColor = TERRAIN_COLORS[terrain] || "#cccccc";

  // 查找是否在某门派控制范围内
  let factionColor = null;
  for (const city of ALL_CITIES) {
    const owner = cityOwnership[city.id] ?? city.faction;
    if (!owner) continue;
    const dist = hexDistance(q, r, city.q, city.r);
    const range = city.tier === WORLD_CITY_TIERS.HQ ? 4
      : city.tier === WORLD_CITY_TIERS.LARGE ? 3 : 2;
    if (dist <= range) {
      factionColor = FACTION_COLORS[owner];
      break;
    }
  }

  if (factionColor) {
    ctx.fillStyle = terrainColor;
    ctx.fill();
    ctx.fillStyle = factionColor + "55";
    ctx.fill();
  } else {
    ctx.fillStyle = terrainColor;
    ctx.fill();
  }

  ctx.strokeStyle = "#00000022";
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

function drawCityMarker(ctx, city, owner) {
  const { x, y } = hexToPixel(city.q, city.r);
  const color = owner ? FACTION_COLORS[owner] : "#888888";

  ctx.beginPath();
  if (city.tier === WORLD_CITY_TIERS.HQ) {
    drawStar(ctx, x, y, 6, 3, 5);
  } else if (city.tier === WORLD_CITY_TIERS.LARGE) {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 4, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#000000aa";
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawStar(ctx, cx, cy, outerR, innerR, points) {
  const step = Math.PI / points;
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

// ── 仲裁者信息面板 ──────────────────────────────

/**
 * 渲染门派三维状态表格到 DOM 容器
 * @param {HTMLElement} container
 * @param {Object} worldState
 */
export function renderArbiterPanel(container, worldState) {
  const stats = worldState.factionStats || {};
  const cities = worldState.cities || [];

  container.innerHTML = `
    <div class="world-panel">
      <h3>第 ${worldState.season || 1} 时节 · 江湖格局</h3>
      <table class="world-stats-table">
        <thead>
          <tr><th>门派</th><th>实力</th><th>声望</th><th>金币</th><th>城池</th></tr>
        </thead>
        <tbody>
          ${FACTION_IDS.map((fid) => {
            const fs = stats[fid] || { prestige: 0, gold: 0 };
            const power = computePowerScore(fid, stats, cities);
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
        ${(worldState.log || []).slice(-8).reverse().map((l) => `<div class="log-line">${l}</div>`).join("")}
      </div>
    </div>
  `;
}
