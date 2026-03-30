import { CRIT_CHANCE, CRIT_DAMAGE_MULTIPLIER, HEX_RADIUS, ROLE_LABELS, TERRAIN_TYPES } from "./config.js";
import {
  addStatus,
  createRuntimeStatuses,
  findStatusWithFlag,
  getStatusSeedById,
  hasStatusFlag,
  removeStatus,
  tickStatuses
} from "./status-effects.js";
import { expToNextLevel, getEffectiveSheet } from "./game-data.js";
import { clamp, gradeColor as gradeTint, gradeIndex, lerp, round2, shuffleArray } from "./utils.js";

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 }
];

const TERRAIN_PATCHES = ["water", "forest", "rock", "lava"];
const NEAR_TARGET_BAND = 12;
const SEEK_STUCK_TIMEOUT = 1.2;
const PATH_REFRESH = 0.5;
const MAX_LOGS = 140;
const MAX_COMBAT_EVENTS = 260;
const MAX_BATTLE_DURATION = 300;

export function createBattleState({
  entries,
  skills,
  equipment,
  statuses,
  factionWins = {},
  speed,
  cameraMode,
  arenaMode = "field",
  arenaRadius = HEX_RADIUS,
  competitionType = "chaos"
}) {
  const terrain = arenaMode === "tournament"
    ? generateTournamentTerrain(arenaRadius)
    : generateTerrain(arenaRadius);
  const skillMap = new Map(skills.map((skill) => [skill.id, skill]));
  const equipmentList = equipment || [];
  const statusMap = new Map((statuses || []).map((status) => [status.id, status]));
  const entities = entries.map((entry, index) => createBattleEntity(entry, skillMap, equipmentList, statusMap, index));
  if (arenaMode === "tournament" && entities.length === 2) {
    assignDuelSpawnCells(entities, terrain);
  } else {
    assignSpawnCells(entities, terrain, factionWins);
  }
  const battle = {
    mode: arenaMode,
    terrain,
    entities,
    logs: ["\u6218\u573a\u5df2\u521d\u59cb\u5316\u3002"],
    combatEvents: [],
    animations: [],
    announcements: [],
    elapsed: 0,
    paused: false,
    speed,
    cameraMode,
    competitionType,
    factionWins,
    forcedFocus: {
      mode: "elite-sequence",
      targetId: null,
      eliteKills: 0
    },
    winner: null,
    rewardsApplied: false
  };
  announceInitialStatuses(battle);
  return battle;
}

export function updateBattleState(battle, dt) {
  if (!battle || battle.winner) return;

  battle.elapsed += dt;
  tickVisuals(battle, dt);

  const living = battle.entities.filter((entity) => entity.alive);
  const factionKeys = [...new Set(living.map((entity) => entity.faction.key))];
  if (factionKeys.length <= 1) {
    if (battle.competitionType === "chaos") {
      battle.winner = living[0]?.faction || null;
    } else {
      const winnerEntity = living[0] || null;
      battle.winner = winnerEntity
        ? { key: winnerEntity.id, name: winnerEntity.name, entityId: winnerEntity.id }
        : null;
    }
    return;
  }

  if (battle.elapsed >= MAX_BATTLE_DURATION) {
    resolveBattleTimeout(battle, living);
    return;
  }

  syncForcedFocusState(battle, living);
  const factionCounts = buildFactionCounts(living);
  let occupancy = buildOccupancy(living);

  living.forEach((entity) => {
    tickEntityResources(entity, battle, dt);
    tickStatuses(entity, dt);
    tickStatusEffects(entity, battle, dt);
  });

  for (const entity of living) {
    if (!entity.alive) continue;
    occupancy = updateEntity(entity, battle, occupancy, factionCounts, dt);
  }
}

export function renderBattleScene({ battle, ctx, canvas, getAvatarImage, gradeColor }) {
  clearBattleCanvas(ctx, canvas);
  if (!battle) return;

  const layout = getBattleLayout(canvas, battle.cameraMode, battle.terrain.radius);
  drawTerrain(ctx, battle, layout);
  if (battle.mode === "tournament") {
    drawTournamentArena(ctx, canvas);
  }
  drawLockRelations(ctx, battle, layout);
  drawAnimations(ctx, battle, layout);
  drawStatusEffects(ctx, battle, layout);
  drawEntities(ctx, battle, layout, getAvatarImage, gradeColor || gradeTint);
  drawAnnouncements(ctx, battle, layout);
  if (battle.entities.length === 2) {
    drawDuelHud(ctx, battle, canvas);
  }
}

function createBattleEntity(entry, skillMap, equipmentList, statusMap, index) {
  const normalizedProgress = {
    ...entry.progress,
    pendingStatusIds: [],
    nextBattleHalfHp: false,
    nextBattleRevive: false,
    nextBattleRandomSpawn: false
  };
  const sheet = getEffectiveSheet(
    entry.build,
    entry.progress.level,
    [...skillMap.values()],
    equipmentList,
    entry.honorContext || {}
  );
  const derived = sheet.derived;
  const roleAttackRange = getAttackRange(entry.build.role, derived);
  const pendingStatusIds = getPendingBattleStatusIds(entry.progress);
  const persistentStatusIds = [...new Set(entry.persistentStatusIds || [])];
    const persistentStatuses = createRuntimeStatuses(persistentStatusIds, statusMap);
    const grantedStatusIds = persistentStatuses.flatMap((status) => status?.battleStartGrantedStatusIds || []);
    const statuses = createRuntimeStatuses([...new Set([...persistentStatusIds, ...pendingStatusIds, ...grantedStatusIds])], statusMap)
      .map((status) => buildStatusRuntimePayload({ derived }, status));
  const startHpRatio = Number(findStatusWithFlag({ statuses }, "battleStartHpRatio")?.battleStartHpRatio || 0);
  const initialHp = startHpRatio > 0
    ? Math.round(derived.hpMax * clamp(startHpRatio, 0.05, 1))
    : derived.hpMax;

  return {
    id: entry.base.code,
    name: entry.displayName,
    brand: entry.base.brand || entry.base.sourceName || "",
    base: entry.base,
    build: entry.build,
    progress: normalizedProgress,
    faction: entry.build.faction,
    role: entry.build.role,
    potential: entry.build.potential,
    level: entry.progress.level,
    primary: sheet.primary,
    derived,
    whitePrimary: sheet.whitePrimary,
    greenPrimary: sheet.greenPrimary,
    whiteDerived: sheet.whiteDerived,
    greenDerived: sheet.greenDerived,
    hp: initialHp,
    hpDamageAnchor: initialHp,
    maxHp: derived.hpMax,
    alive: true,
    q: 0,
    r: 0,
    cellKey: "",
    spawnCellKey: "",
    renderQ: 0,
    renderR: 0,
    moveAnim: null,
    moveCharge: 1 + (index % 5) * 0.08,
    attackCooldown: entry.build.role === "caster" ? 0 : (index % 3) * 0.12,
    skills: entry.build.skillIds
      .map((skillId) => skillMap.get(skillId))
      .filter(Boolean)
      .map((skill) => ({ ...skill, remaining: 0 })),
    attackRange: roleAttackRange,
    desiredRange: roleAttackRange,
    aiState: "seek",
    lockedTargetId: null,
    path: [],
    pathTargetKey: "",
    pathRefreshAt: 0,
    lastAggressorId: null,
    lastAggroAt: 0,
    lastMovedAt: 0,
    noMoveTime: 0,
    damageDone: 0,
    damageTaken: 0,
    healingDone: 0,
    reviveTriggers: 0,
    kills: 0,
    assists: 0,
    deaths: 0,
    pendingExp: 0,
    damageLedger: new Map(),
    chantProgress: 0,
    pressuredAttack: false,
    statuses,
    escapeImmuneUntil: 0,
    randomSpawnNextBattle: Boolean(entry.progress?.nextBattleRandomSpawn),
    hudAttackMessage: "等待交锋",
    hudStatusMessage: "当前无特殊状态"
  };
}

function getPendingBattleStatusIds(progress = {}) {
  return [...new Set([
    ...(progress.pendingStatusIds || []),
    ...(progress.nextBattleHalfHp ? ["sick-half"] : []),
    ...(progress.nextBattleRevive ? ["revive-full"] : [])
  ])];
}

function assignSpawnCells(entities, terrain, factionWins = {}) {
  const occupied = new Map();
  const allFactionGroups = entities.reduce((map, entity) => {
    if (!map.has(entity.faction.key)) map.set(entity.faction.key, []);
    map.get(entity.faction.key).push(entity);
    return map;
  }, new Map());

  const centerFactionKey = pickCenterFactionKey(allFactionGroups, factionWins);
  const randomSpawnEntities = entities.filter((entity) => entity.randomSpawnNextBattle);
  randomSpawnEntities.forEach((entity) => {
    const slots = terrain.cells
      .filter((cell) => !cell.blocked && !occupied.has(cell.key))
      .sort(() => Math.random() - 0.5);
    const slot = slots[0];
    if (!slot) return;
    occupyCell(entity, slot, occupied);
    entity.spawnCellKey = slot.key;
    entity.renderQ = slot.q;
    entity.renderR = slot.r;
  });

  const factionGroups = entities.reduce((map, entity) => {
    if (entity.randomSpawnNextBattle) return map;
    if (!map.has(entity.faction.key)) map.set(entity.faction.key, []);
    map.get(entity.faction.key).push(entity);
    return map;
  }, new Map());

  const corners = shuffleArray([
    { q: terrain.radius, r: 0 },
    { q: 0, r: terrain.radius },
    { q: -terrain.radius, r: terrain.radius },
    { q: -terrain.radius, r: 0 },
    { q: 0, r: -terrain.radius },
    { q: terrain.radius, r: -terrain.radius }
  ]);

  const anchorsByFaction = new Map();
  if (centerFactionKey && factionGroups.has(centerFactionKey)) {
    anchorsByFaction.set(centerFactionKey, { q: 0, r: 0 });
  }
  [...factionGroups.keys()]
    .filter((factionKey) => factionKey !== centerFactionKey)
    .forEach((factionKey, index) => {
      anchorsByFaction.set(factionKey, corners[index % corners.length]);
    });

  [...factionGroups.entries()].forEach(([factionKey, members]) => {
    const anchor = anchorsByFaction.get(factionKey) || { q: 0, r: 0 };
    const slots = collectSpawnCells(anchor, terrain, members.length, occupied);
    members.forEach((entity, memberIndex) => {
      const slot = slots[Math.min(memberIndex, slots.length - 1)];
      occupyCell(entity, slot, occupied);
      entity.spawnCellKey = slot.key;
      entity.renderQ = slot.q;
      entity.renderR = slot.r;
    });
  });
}

function collectSpawnCells(anchor, terrain, count, occupied) {
  const cells = terrain.cells
    .filter((cell) => !cell.blocked && hexDistance(cell, anchor) <= 3)
    .sort((left, right) => hexDistance(left, anchor) - hexDistance(right, anchor));
  const result = cells.filter((cell) => !occupied.has(cell.key));

  if (result.length >= count) return result;

  return terrain.cells
    .filter((cell) => !cell.blocked && !occupied.has(cell.key))
    .sort((left, right) => hexDistance(left, anchor) - hexDistance(right, anchor))
    .slice(0, Math.max(count, 1));
}

function assignDuelSpawnCells(entities, terrain) {
  const radius = Math.max(2, Math.floor(terrain.radius * 0.65));
  const left = getCell(terrain, makeCellKey(-radius, 0)) || getCell(terrain, makeCellKey(-1, 0)) || terrain.cells[0];
  const right = getCell(terrain, makeCellKey(radius, 0)) || getCell(terrain, makeCellKey(1, 0)) || terrain.cells[terrain.cells.length - 1];
  [left, right].forEach((slot, index) => {
    const entity = entities[index];
    if (!entity || !slot) return;
    entity.q = slot.q;
    entity.r = slot.r;
    entity.cellKey = slot.key;
    entity.spawnCellKey = slot.key;
    entity.renderQ = slot.q;
    entity.renderR = slot.r;
  });
}

function generateTerrain(radius) {
  const cells = [];
  const map = new Map();
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > radius) continue;
      const cell = { q, r, key: makeCellKey(q, r), terrain: "plain", blocked: false };
      cells.push(cell);
      map.set(cell.key, cell);
    }
  }

  const anchors = TERRAIN_PATCHES.map((terrain) => {
    const seed = cells[Math.floor(Math.random() * cells.length)];
    return { terrain, q: seed.q, r: seed.r };
  });

  cells.forEach((cell) => {
    let best = { terrain: "plain", score: Infinity };
    anchors.forEach((anchor) => {
      const score = hexDistance(cell, anchor) + Math.random() * 1.1;
      if (score < best.score) best = { terrain: anchor.terrain, score };
    });
    cell.terrain = best.score < 2.6 ? best.terrain : "plain";
  });

  const forbidden = new Set(spawnSafetyKeys(radius));
  const candidates = shuffleArray(cells.filter((cell) => !forbidden.has(cell.key)));
  const maxWalls = Math.floor(cells.length * 0.08);
  let walls = 0;
  for (const cell of candidates) {
    if (walls >= maxWalls) break;
    const previous = cell.terrain;
    cell.terrain = "wall";
    cell.blocked = true;
    if (!isTerrainConnected(cells)) {
      cell.terrain = previous;
      cell.blocked = false;
      continue;
    }
    walls += 1;
  }

  cells.forEach((cell) => {
    cell.blocked = Boolean(TERRAIN_TYPES[cell.terrain]?.blocked);
  });

  return { radius, cells, map };
}

function generateTournamentTerrain(radius) {
  const cells = [];
  const map = new Map();
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > radius) continue;
      const cell = { q, r, key: makeCellKey(q, r), terrain: "plain", blocked: false };
      cells.push(cell);
      map.set(cell.key, cell);
    }
  }
  return { radius, cells, map };
}

function spawnSafetyKeys(radius) {
  const corners = [
    { q: radius, r: 0 },
    { q: 0, r: radius },
    { q: -radius, r: radius },
    { q: -radius, r: 0 },
    { q: 0, r: -radius },
    { q: radius, r: -radius }
  ];
  const safe = new Set();
  corners.forEach((corner) => {
    for (const cell of ringAround(corner, 3)) {
      safe.add(makeCellKey(cell.q, cell.r));
    }
  });
  for (const cell of ringAround({ q: 0, r: 0 }, 3)) {
    safe.add(makeCellKey(cell.q, cell.r));
  }
  return safe;
}

function pickCenterFactionKey(factionGroups, factionWins = {}) {
  const scores = [...factionGroups.entries()].map(([factionKey, members]) => ({
    factionKey,
    wins: Number(factionWins?.[factionKey] || 0)
  }));
  if (scores.length === 0) return null;
  const maxWins = Math.max(...scores.map((item) => item.wins));
  const top = scores.filter((item) => item.wins === maxWins);
  return shuffleArray(top)[0]?.factionKey || null;
}

function ringAround(center, radius) {
  const cells = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      const cell = { q: center.q + dq, r: center.r + dr };
      if (hexDistance(cell, center) <= radius) cells.push(cell);
    }
  }
  return cells;
}

function tickEntityResources(entity, battle, dt) {
  const previousHp = entity.hp;
  const hpMaxRegenRatio = entity.statuses?.reduce((sum, status) => sum + Number(status?.hpRegenMaxRatioPerSecond || 0), 0) || 0;
  entity.hp = Math.min(entity.maxHp, entity.hp + entity.derived.hpRegen * 0.05 * dt);
  if (hpMaxRegenRatio > 0) {
    entity.hp = Math.min(entity.maxHp, entity.hp + entity.maxHp * hpMaxRegenRatio * dt);
  }
  if (entity.hp > previousHp) {
    entity.healingDone += entity.hp - previousHp;
  }
  entity.attackCooldown = Math.max(0, entity.attackCooldown - dt);
  entity.moveCharge = Math.min(2.2, entity.moveCharge + getMoveRate(entity, battle) * dt);
  entity.skills.forEach((skill) => {
    skill.remaining = Math.max(0, skill.remaining - dt);
  });
}

function resolveBattleTimeout(battle, living) {
  if (!living.length) {
    battle.winner = null;
    pushBattleLog(battle, "战斗超时，场上已无存活单位。");
    return;
  }

  if (battle.competitionType === "chaos") {
    const byFaction = new Map();
    living.forEach((entity) => {
      const current = byFaction.get(entity.faction.key) || {
        faction: entity.faction,
        count: 0,
        hp: 0,
        maxHp: 0
      };
      current.count += 1;
      current.hp += Math.max(0, entity.hp);
      current.maxHp += Math.max(1, entity.maxHp);
      byFaction.set(entity.faction.key, current);
    });
    const winnerGroup = [...byFaction.values()].sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      const rightHpRatio = right.hp / Math.max(1, right.maxHp);
      const leftHpRatio = left.hp / Math.max(1, left.maxHp);
      if (rightHpRatio !== leftHpRatio) return rightHpRatio - leftHpRatio;
      if (right.hp !== left.hp) return right.hp - left.hp;
      const rightWins = Number(battle.factionWins?.[right.faction.key] || 0);
      const leftWins = Number(battle.factionWins?.[left.faction.key] || 0);
      if (rightWins !== leftWins) return rightWins - leftWins;
      return String(left.faction.key).localeCompare(String(right.faction.key), "zh-Hans-CN");
    })[0];
    battle.winner = winnerGroup?.faction || null;
    if (winnerGroup) {
      pushBattleLog(
        battle,
        `战斗超时，${winnerGroup.faction.name}以存活${winnerGroup.count}人、剩余血量${Math.round((winnerGroup.hp / Math.max(1, winnerGroup.maxHp)) * 100)}%、总生命${Math.round(winnerGroup.hp)}获胜。`
      );
    }
    return;
  }

  const winnerEntity = [...living].sort((left, right) => {
    const rightHpRatio = right.hp / Math.max(1, right.maxHp);
    const leftHpRatio = left.hp / Math.max(1, left.maxHp);
    if (rightHpRatio !== leftHpRatio) return rightHpRatio - leftHpRatio;
    if (right.hp !== left.hp) return right.hp - left.hp;
    if (right.damageDone !== left.damageDone) return right.damageDone - left.damageDone;
    if (right.maxHp !== left.maxHp) return right.maxHp - left.maxHp;
    return String(left.id).localeCompare(String(right.id), "en");
  })[0];
  battle.winner = winnerEntity
    ? { key: winnerEntity.id, name: winnerEntity.name, entityId: winnerEntity.id }
    : null;
  if (winnerEntity) {
    pushBattleLog(
      battle,
      `战斗超时，${winnerEntity.name}以剩余血量${Math.round((winnerEntity.hp / Math.max(1, winnerEntity.maxHp)) * 100)}%、生命${Math.round(winnerEntity.hp)}获胜。`
    );
  }
}

function tickStatusEffects(entity, battle, dt) {
  if (!entity.alive || !entity.statuses?.length) return;
  const periodicStatuses = entity.statuses.filter((status) => Number(status.hpLossPerSecondRatio || 0) > 0);
  periodicStatuses.forEach((status) => {
      const tickSeconds = Math.max(0.1, Number(status.periodicTickSeconds || 1));
      status.dotTick = (status.dotTick || 0) + dt;
      while (status.dotTick >= tickSeconds) {
        status.dotTick -= tickSeconds;
        const ratio = Number(status.hpLossPerSecondRatio || 0);
        const damage = Math.max(0.1, entity.maxHp * ratio * tickSeconds);
        entity.hp = Math.max(0, entity.hp - damage);
        entity.damageTaken += damage;
        pushCombatEvent(battle, {
          type: "status-damage",
        actorId: entity.id,
        targetId: entity.id,
        actorName: entity.name,
        targetName: entity.name,
        sourceName: status.name,
        damageType: "status",
        finalDamage: Math.round(damage),
          detail: `最大生命 ${Math.round(entity.maxHp)} x ${round2(ratio * 100)}%/秒 x ${round2(tickSeconds)}秒`
        });
      pushFloatingText(battle, entity.q, entity.r, `${status.name} ${Math.round(damage)}`, status.visualColor || "#f97316", {
        kind: "damage",
        ttl: 0.95,
        fontSize: 15
      });
      pushBattleLog(battle, `${entity.name} 受到${status.name}伤害。`);
      setHudStatusMessage(entity, `状态${status.name}：损失 ${Math.round(damage)} 生命`);
      if (entity.hp <= 0) {
        if (!tryReviveOnDeath(entity, battle, occupancyFromBattle(battle), `${status.name}触发死亡`)) {
          entity.alive = false;
          entity.deaths += 1;
        }
        break;
      }
    }
  });
}

function updateEntity(entity, battle, occupancy, factionCounts, dt) {
  const enemies = getEnemyEntities(entity, battle);
  if (enemies.length === 0) return occupancy;

  let moved = false;
  let target = resolveLockedTarget(entity, enemies, battle);

  if (entity.aiState === "seek") {
    ({ moved, target } = runSeekState(entity, enemies, battle, occupancy, factionCounts, moved, target));
  }

  if (entity.aiState === "encounter") {
    ({ moved, target } = runEncounterState(entity, enemies, battle, occupancy, moved));
  }

  if (entity.aiState === "battle") {
    ({ moved, target } = runBattleState(entity, enemies, battle, occupancy, dt, moved));
  }

  moved = applyNonBattleFallbackMovement(entity, target, battle, occupancy, moved);
  finalizeEntityMotionState(entity, moved, battle, dt);

  return occupancy;
}

function getEnemyEntities(entity, battle) {
  return battle.entities.filter((target) => target.alive && target.faction.key !== entity.faction.key);
}

function resolveLockedTarget(entity, enemies, battle) {
  const forcedTarget = selectForcedFocusTarget(entity, enemies, battle);
  if (forcedTarget) {
    entity.lockedTargetId = forcedTarget.id;
    entity.aiState = canAttackTarget(entity, forcedTarget) ? "battle" : "encounter";
    return forcedTarget;
  }

  const locked = entity.lockedTargetId
    ? enemies.find((enemy) => enemy.id === entity.lockedTargetId) || null
    : null;
  if (locked) return locked;

  entity.lockedTargetId = null;
  if (entity.aiState !== "seek") entity.aiState = "seek";
  return null;
}

function runSeekState(entity, enemies, battle, occupancy, factionCounts, moved, target) {
  const nextTarget = selectEncounterTarget(entity, enemies, battle, factionCounts);
  if (nextTarget) {
    entity.lockedTargetId = nextTarget.id;
    entity.aiState = "encounter";
    return { moved, target: nextTarget };
  }

  return {
    moved: moved || moveTowardEnemyDensity(entity, enemies, battle, occupancy),
    target
  };
}

function runEncounterState(entity, enemies, battle, occupancy, moved) {
  const target = entity.lockedTargetId
    ? enemies.find((enemy) => enemy.id === entity.lockedTargetId) || null
    : null;
  if (!target) {
    resetEntityState(entity);
    return {
      moved: moved || moveTowardEnemyDensity(entity, enemies, battle, occupancy),
      target: null
    };
  }

  if (canAttackTarget(entity, target)) {
    entity.aiState = "battle";
    return { moved, target };
  }

  return {
    moved: moved || moveToEngageTarget(entity, target, battle, occupancy),
    target
  };
}

function runBattleState(entity, enemies, battle, occupancy, dt, moved) {
  const target = entity.lockedTargetId
    ? enemies.find((enemy) => enemy.id === entity.lockedTargetId) || null
    : null;
  if (!target) {
    resetEntityState(entity);
    return { moved, target: null };
  }

  if (!canAttackTarget(entity, target)) {
    entity.aiState = "encounter";
    return {
      moved: moved || moveToEngageTarget(entity, target, battle, occupancy),
      target
    };
  }

  return {
    moved: moved || executeBattleState(entity, target, enemies, battle, occupancy, dt),
    target
  };
}

function applyNonBattleFallbackMovement(entity, target, battle, occupancy, moved) {
  if (entity.aiState === "battle" || moved || entity.moveCharge < 1) return moved;
  return moveAnyAvailableDirection(
    entity,
    battle,
    occupancy,
    target ? getCell(battle.terrain, target.cellKey) : null
  );
}

function finalizeEntityMotionState(entity, moved, battle, dt) {
  if (moved) {
    entity.lastMovedAt = battle.elapsed;
    entity.noMoveTime = 0;
    return;
  }

  if (entity.aiState === "battle") return;

  entity.noMoveTime += dt;
  if (entity.noMoveTime < SEEK_STUCK_TIMEOUT) return;

  entity.path = [];
  entity.pathTargetKey = "";
  entity.pathRefreshAt = 0;
  if (entity.aiState === "encounter") {
    entity.lockedTargetId = null;
    entity.aiState = "seek";
  }
}

function executeBattleState(entity, target, enemies, battle, occupancy, dt) {
  if (entity.role === "melee") return executeMelee(entity, target, enemies, battle, occupancy);
  if (entity.role === "ranged") return executeRanged(entity, target, enemies, battle, occupancy);
  return executeCaster(entity, target, enemies, battle, occupancy, dt);
}

function executeMelee(entity, target, enemies, battle, occupancy) {
  if (!canEntityAttack(entity) && !canEntityUseSkills(entity)) return false;
  if (!canAttackTarget(entity, target)) {
    entity.aiState = "encounter";
    return false;
  }
  if (canEntityUseSkills(entity)) {
    castSkillBurst(entity, target, enemies, battle, occupancy);
  }
  if (canEntityAttack(entity) && entity.attackCooldown <= 0) {
    performBasicAttack(entity, target, "physical", battle, occupancy);
    entity.attackCooldown = entity.derived.attackInterval;
  }
  return false;
}

function executeRanged(entity, target, enemies, battle, occupancy) {
  if (!canEntityAttack(entity) && !canEntityUseSkills(entity)) return false;
  const distance = hexDistance(entity, target);
  if (distance <= 1) {
    applyPressureDelay(entity, getActionCycle(entity), "cooldown");
  } else {
    entity.pressuredAttack = false;
  }
  if (distance <= 1 && entity.moveCharge >= 1) {
    const moved = retreatFromTarget(entity, target, battle, occupancy, 3);
    if (moved) return true;
  }
  if (canEntityUseSkills(entity)) {
    castSkillBurst(entity, target, enemies, battle, occupancy);
  }
  if (canEntityAttack(entity) && entity.attackCooldown <= 0 && canAttackTarget(entity, target)) {
    performBasicAttack(entity, target, "physical", battle, occupancy);
    entity.attackCooldown = entity.derived.attackInterval * 0.92;
    entity.pressuredAttack = false;
  }
  return false;
}

function executeCaster(entity, target, enemies, battle, occupancy, dt) {
  if (!canEntityAttack(entity) && !canEntityUseSkills(entity)) return false;
  const distance = hexDistance(entity, target);
  const castDuration = getCasterBasicCastDuration(entity);
  if (distance <= 1) {
    applyPressureDelay(entity, castDuration, "chant");
  } else {
    entity.pressuredAttack = false;
  }
  if (distance <= 1 && entity.moveCharge >= 1) {
    const moved = retreatFromTarget(entity, target, battle, occupancy, 3);
    if (moved) return true;
  }
  const castAnySkill = canEntityUseSkills(entity)
    ? castSkillBurst(entity, target, enemies, battle, occupancy)
    : false;
  if (castAnySkill) {
    entity.chantProgress = 0;
    entity.pressuredAttack = false;
  }
  if (!canAttackTarget(entity, target)) {
    entity.aiState = "encounter";
    return false;
  }
  if (!canEntityAttack(entity)) return false;
  entity.chantProgress += dt;
  if (entity.chantProgress >= castDuration) {
    performBasicAttack(entity, target, "magic", battle, occupancy);
    entity.chantProgress = 0;
    entity.pressuredAttack = false;
  }
  return false;
}

function applyPressureDelay(entity, cycleDuration, mode) {
  if (entity.pressuredAttack) return;
  if (mode === "cooldown") {
    if (entity.attackCooldown > 0) {
      entity.attackCooldown = Math.min(cycleDuration * 2, entity.attackCooldown * 2);
      entity.pressuredAttack = true;
    }
    return;
  }

  if (mode === "chant" && entity.chantProgress > 0) {
    const remaining = Math.max(0, cycleDuration - entity.chantProgress);
    entity.chantProgress = Math.max(0, cycleDuration - remaining * 2);
    entity.pressuredAttack = true;
  }
}

function castSkillBurst(entity, target, enemies, battle, occupancy) {
  let castAny = false;
  while (true) {
    const skill = chooseNextSkill(entity, target);
    if (!skill) break;
    castSkill(entity, target, enemies, skill, battle, occupancy);
    castAny = true;
    if (!target.alive) break;
  }
  return castAny;
}

function chooseNextSkill(entity, target) {
  const prioritized = [...entity.skills]
    .filter((skill) => skill.category !== "passive")
    .sort(compareSkillPriority);

  for (const skill of prioritized) {
    const spec = getResolvedSkillSpec(entity, skill);
    const inRange = hexDistance(entity, target) <= Math.max(1, Math.round(spec.range));
    if (!inRange || skill.remaining > 0) continue;
    return skill;
  }

  return null;
}

function compareSkillPriority(left, right) {
  const gradeGap = gradeIndex(right.grade) - gradeIndex(left.grade);
  if (gradeGap !== 0) return gradeGap;
  const impactGap = (right.impact || 0) - (left.impact || 0);
  if (impactGap !== 0) return impactGap;
  return String(left.id).localeCompare(String(right.id));
}

function castSkill(entity, target, enemies, skill, battle, occupancy) {
  const spec = getResolvedSkillSpec(entity, skill);
  skill.remaining = round2(skill.cooldown * getCooldownDurationMultiplier(entity));
  pushAnnouncement(battle, entity.id, skill.name, gradeTint(skill.grade), { kind: "skill-tag", ttl: 0.9, fontSize: 15 });
  if (spec.radius > 0.1) {
    const victims = enemies.filter((enemy) => enemy.alive && hexDistance(enemy, target) <= Math.max(1, Math.round(spec.radius)));
    victims.forEach((victim) => {
      applyDamage(entity, victim, skill.multiplier, skill.flatDamage, spec.damageType, battle, {
        label: `${skill.name}: `,
        color: gradeTint(skill.grade)
      }, occupancy, skill);
    });
    pushRadialAnimation(battle, target.q, target.r, "#c2410c", Math.max(1, spec.radius), 0.45);
    if (entity.role === "melee") {
      pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, 6);
    } else if (entity.role === "ranged") {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, "heavy-arrow");
    } else {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.28, "flare");
    }
    pushBattleLog(battle, `${entity.name} \u91ca\u653e ${skill.name}\uff0c\u547d\u4e2d ${victims.length} \u4e2a\u76ee\u6807\u3002`);
    return;
  }
  const result = applyDamage(entity, target, skill.multiplier, skill.flatDamage, spec.damageType, battle, {
    label: `${skill.name}: `,
    color: gradeTint(skill.grade)
  }, occupancy, skill);
  if (result.hit && skill.category === "status-hit") {
    const bonusDamage = Math.max(1, result.damage * (skill.extraDamageRatio || 0));
    target.hp = Math.max(0, target.hp - bonusDamage);
    entity.damageDone += bonusDamage;
    target.damageTaken += bonusDamage;
    target.damageLedger.set(entity.id, (target.damageLedger.get(entity.id) || 0) + bonusDamage);
    pushCombatEvent(battle, {
      type: "bonus-damage",
      actorId: entity.id,
      targetId: target.id,
      actorName: entity.name,
      targetName: target.name,
      sourceName: skill.name,
      damageType: spec.damageType,
      finalDamage: Math.round(bonusDamage),
      detail: `追加伤害 = 本次命中 ${Math.round(result.damage)} x ${Math.round((skill.extraDamageRatio || 0) * 100)}%`
    });
    pushFloatingText(battle, target.q, target.r, `${skill.name}: 追加 ${Math.round(bonusDamage)}`, gradeTint(skill.grade), {
      kind: "damage",
      ttl: 1,
      fontSize: 16
    });
    applyStatus(target, getStatusPayload(skill.statusEffect), battle);
    if (target.hp <= 0) {
      if (!tryReviveOnDeath(target, battle, occupancy, `${skill.name}命中后濒死`)) {
        finalizeDeath(entity, target, battle, occupancy);
      }
    }
  }
  if (entity.role === "melee") {
    pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.22, 5);
  } else if (entity.role === "ranged") {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.22, "heavy-arrow");
  } else {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, "flare");
    pushRadialAnimation(battle, target.q, target.r, gradeTint(skill.grade), 1.15, 0.26);
  }
  pushBattleLog(battle, `${entity.name} \u4f7f\u7528 ${skill.name} \u547d\u4e2d ${target.name}\u3002`);
}

function performBasicAttack(attacker, defender, damageType, battle, occupancy) {
  const color = gradeTint(attacker.potential);
  if (damageType === "magic") {
    pushProjectileAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, 0.2, "orb");
    pushRadialAnimation(battle, defender.q, defender.r, color, 0.72, 0.18);
  } else if (attacker.role === "ranged") {
    pushProjectileAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, 0.16, "arrow");
  } else {
    pushSlashAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, 0.14, 4);
  }
  return applyDamage(attacker, defender, 1, 0, damageType, battle, {
    label: "\u666e\u901a\u653b\u51fb: ",
    color
  }, occupancy, null);
}

function applyDamage(attacker, defender, powerScalar, flatDamage, damageType, battle, source = {}, occupancy = null, skill = null) {
  if (!defender.alive) return { hit: false, damage: 0, killed: false };
  defender.lastAggressorId = attacker.id;
  defender.lastAggroAt = battle.elapsed;
  const baseAttack = damageType === "magic" ? attacker.derived.magicAttack : attacker.derived.physicalAttack;
  const baseDefense = damageType === "magic" ? defender.derived.magicDefense : defender.derived.physicalDefense;
  const attackTerrain = TERRAIN_TYPES[getCell(battle.terrain, attacker.cellKey)?.terrain || "plain"];
  const defenseTerrain = TERRAIN_TYPES[getCell(battle.terrain, defender.cellKey)?.terrain || "plain"];
  const attackMod = 1 + (damageType === "magic" ? attackTerrain.magicMod : attackTerrain.physMod);
  const defenseMod = 1 + (damageType === "magic" ? defenseTerrain.magicDef : defenseTerrain.physDef);
  if (damageType === "physical") {
    const evadeChance = computeAgilityAvoidChance(attacker, defender);
    if (Math.random() < evadeChance) {
      pushCombatEvent(battle, {
        type: "evade",
        actorId: attacker.id,
        targetId: defender.id,
        actorName: attacker.name,
        targetName: defender.name,
        sourceName: skill?.name || source.label || "普通攻击",
        damageType,
        evaded: true,
        evadeChance,
        detail: `闪避率 ${Math.round(evadeChance * 100)}%`
      });
      pushFloatingText(battle, defender.q, defender.r, `${source.label || ""}\u88ab\u95ea\u907f`, source.color || gradeTint(attacker.potential), {
        kind: "damage",
        ttl: 1.05,
        fontSize: 16
      });
      pushBattleLog(battle, `${attacker.name} \u7684\u653b\u51fb\u88ab ${defender.name} \u95ea\u907f\u4e86\u3002`);
      defender.hpDamageAnchor = defender.hp;
      setHudAttackMessage(defender, `受到 ${attacker.name} 的${skill?.name || "攻击"}，损失 0 生命（闪避）`);
      return { hit: false, damage: 0, killed: false, evaded: true };
    }
  }
  const crit = Math.random() < CRIT_CHANCE ? CRIT_DAMAGE_MULTIPLIER : 1;
  let damage = ((baseAttack * powerScalar * attackMod * crit) / Math.max(12, baseDefense * defenseMod)) * 13 + flatDamage;
  damage = Math.max(6, damage);
  let sleepAmp = 1;
  const sleepStatus = findStatusWithFlag(defender, "incomingDamageMultiplier");
  if (sleepStatus) {
    sleepAmp = Number(sleepStatus.incomingDamageMultiplier || 1);
    damage *= sleepAmp;
    if (sleepStatus.breaksOnHit) {
      removeStatus(defender, sleepStatus.id);
    }
    pushFloatingText(battle, defender.q, defender.r, "睡眠破除", "#f97316", {
      kind: "damage",
      ttl: 0.9,
      fontSize: 15
    });
    setHudStatusMessage(defender, "睡眠被打破");
  }
  const previousHp = defender.hp;
  defender.hp -= damage;
  defender.hpDamageAnchor = previousHp;
  attacker.damageDone += damage;
  defender.damageTaken += damage;
  defender.damageLedger.set(attacker.id, (defender.damageLedger.get(attacker.id) || 0) + damage);
  pushCombatEvent(battle, {
    type: "damage",
    actorId: attacker.id,
    targetId: defender.id,
    actorName: attacker.name,
    targetName: defender.name,
    sourceName: skill?.name || source.label || "普通攻击",
    damageType,
    powerScalar,
    flatDamage,
    baseAttack: round2(baseAttack),
    baseDefense: round2(baseDefense),
    attackMod: round2(attackMod),
    defenseMod: round2(defenseMod),
    crit: round2(crit),
    sleepAmp: round2(sleepAmp),
    finalDamage: Math.round(damage),
    detail: `(${round2(baseAttack)} x ${round2(powerScalar)} x ${round2(attackMod)} x ${round2(crit)} x ${round2(sleepAmp)}) / max(12, ${round2(baseDefense)} x ${round2(defenseMod)}) x 13 + ${flatDamage}`
  });
  pushFloatingText(battle, defender.q, defender.r, `${source.label || ""}\u4f24\u5bb3 ${Math.round(damage)}`, source.color || gradeTint(attacker.potential), {
    kind: "damage",
    ttl: 1.05,
    fontSize: 16
  });
  setHudAttackMessage(defender, `受到 ${attacker.name} 的${skill?.name || "普通攻击"}，损失 ${Math.round(damage)} 生命`);

  if (defender.hp <= 0) {
    if (tryReviveOnDeath(defender, battle, occupancy, `${skill?.name || "攻击"}命中后濒死`)) {
      defender.hpDamageAnchor = defender.hp;
      return { hit: true, damage, killed: false, revived: true };
    }
    finalizeDeath(attacker, defender, battle, occupancy);
    return { hit: true, damage, killed: true };
  }
  return { hit: true, damage, killed: false };
}

function finalizeDeath(attacker, defender, battle, occupancy) {
  defender.hp = 0;
  defender.alive = false;
  defender.deaths += 1;
  attacker.kills += 1;
  if (battle?.forcedFocus?.targetId === defender.id) {
    if (battle.forcedFocus.mode === "elite-sequence") {
      battle.forcedFocus.eliteKills = (battle.forcedFocus.eliteKills || 0) + 1;
    }
    battle.forcedFocus.targetId = null;
  }
  distributeKillExp(attacker, defender, battle);
  pushFloatingText(battle, attacker.q, attacker.r, "\u51fb\u6740 +1", "#ef4444", {
    kind: "kill",
    ttl: 1.2,
    fontSize: 22
  });
  defender.damageLedger.forEach((_value, contributorId) => {
    if (contributorId === attacker.id) return;
    const assistant = battle.entities.find((candidate) => candidate.id === contributorId);
    if (!assistant) return;
    assistant.assists += 1;
    if (assistant.alive) {
      pushFloatingText(battle, assistant.q, assistant.r, "\u52a9\u653b +1", "#f59e0b", {
        kind: "assist",
        ttl: 1.1,
        fontSize: 18
      });
    }
  });
  pushBattleLog(battle, `${attacker.name} \u51fb\u5012\u4e86 ${defender.name}\u3002`);
  setHudAttackMessage(defender, `被 ${attacker.name} 击倒`);
  setHudStatusMessage(attacker, `击倒 ${defender.name}，完成击杀`);
}

function tryReviveOnDeath(entity, battle, occupancy, reason = "") {
  const reviveStatus = findStatusWithFlag(entity, "reviveOnDeath");
  if (!reviveStatus || !occupancy) return false;
  entity.deaths += 1;
  entity.reviveTriggers += 1;
  removeStatus(entity, reviveStatus.id);
  reviveEntity(entity, battle, occupancy, {
    fullHp: reviveStatus.reviveOnDeath === "full-spawn",
    useSpawn: reviveStatus.reviveOnDeath === "full-spawn"
  });
  pushFloatingText(battle, entity.q, entity.r, "死里逃生", "#f97316", {
    kind: "kill",
    ttl: 1.2,
    fontSize: 20
  });
  pushBattleLog(battle, `${entity.name} 触发了死里逃生。${reason ? `（${reason}）` : ""}`);
  setHudStatusMessage(entity, "触发死里逃生，满血复苏");
  return true;
}

function occupancyFromBattle(battle) {
  const occupancy = new Map();
  battle.entities
    .filter((entity) => entity.alive && entity.cellKey)
    .forEach((entity) => {
      occupancy.set(entity.cellKey, entity.id);
    });
  return occupancy;
}

function distributeKillExp(killer, defender, battle) {
  const totalExp = Math.max(1, Math.round(expToNextLevel(defender.level) * 0.4));
  const contributors = [...defender.damageLedger.keys()].filter((id) => id !== killer.id);
  const killerExp = contributors.length === 0 ? totalExp : Math.round(totalExp * 0.7);
  killer.pendingExp += killerExp;
  if (contributors.length === 0) return;
  const shared = totalExp - killerExp;
  const each = Math.floor(shared / contributors.length);
  const remainder = shared - each * contributors.length;
  contributors.forEach((id, index) => {
    const entity = battle.entities.find((candidate) => candidate.id === id);
    if (!entity) return;
    entity.pendingExp += each + (index === 0 ? remainder : 0);
  });
}

function reviveEntity(entity, battle, occupancy, options = {}) {
  const currentKey = entity.cellKey;
  if (currentKey) occupancy.delete(currentKey);
  const preferredSpawn = options.useSpawn ? getCell(battle.terrain, entity.spawnCellKey) : null;
  const spawn = preferredSpawn && !preferredSpawn.blocked && !occupancy.has(preferredSpawn.key)
    ? preferredSpawn
    : shuffleArray(battle.terrain.cells.filter((cell) => !cell.blocked && !occupancy.has(cell.key)))[0];
  if (!spawn) {
    entity.hp = options.fullHp ? entity.maxHp : Math.max(1, Math.round(entity.maxHp * 0.35));
    entity.hpDamageAnchor = entity.hp;
    entity.alive = true;
    occupancy.set(entity.cellKey, entity.id);
    return;
  }
  entity.alive = true;
  entity.hp = options.fullHp ? entity.maxHp : Math.max(1, Math.round(entity.maxHp * 0.35));
  entity.hpDamageAnchor = entity.hp;
  entity.aiState = "seek";
  entity.lockedTargetId = null;
  entity.path = [];
  entity.pathTargetKey = "";
  entity.pathRefreshAt = 0;
  entity.moveAnim = null;
  entity.escapeImmuneUntil = battle.elapsed + 1;
  occupyCell(entity, spawn, occupancy);
  entity.renderQ = spawn.q;
  entity.renderR = spawn.r;
}

function moveTowardEnemyDensity(entity, enemies, battle, occupancy) {
  const pool = enemies.filter((enemy) => enemy.brand !== entity.brand);
  const candidates = pool.length ? pool : enemies;
  if (candidates.length === 0) return false;

  const factionKey = pickPriorityFactionForAdvance(entity, candidates, battle);
  const cluster = candidates.filter((enemy) => enemy.faction.key === factionKey);
  const goals = pickDensityGoals(cluster, battle, occupancy, entity.id);
  if (goals.length === 0) return false;
  return stepTowardGoals(entity, goals.map((cell) => cell.key), battle, occupancy);
}

function moveToEngageTarget(entity, target, battle, occupancy) {
  const goalKeys = getEngageGoalKeys(entity, target, battle, occupancy);
  if (goalKeys.length === 0) return false;
  return stepTowardGoals(entity, goalKeys, battle, occupancy);
}

function getEngageGoalKeys(entity, target, battle, occupancy) {
  const minRange = entity.role === "melee" ? 1 : 2;
  const maxRange = entity.attackRange;
  const candidates = battle.terrain.cells.filter((cell) => {
    if (cell.blocked) return false;
    if (occupancy.has(cell.key) && cell.key !== entity.cellKey) return false;
    const distance = hexDistance(cell, target);
    return distance >= minRange && distance <= maxRange;
  });

  return candidates
    .sort((left, right) => {
      const leftScore = hexDistance(entity, left) + Math.abs(hexDistance(left, target) - entity.desiredRange) * 0.4;
      const rightScore = hexDistance(entity, right) + Math.abs(hexDistance(right, target) - entity.desiredRange) * 0.4;
      return leftScore - rightScore;
    })
    .slice(0, 6)
    .map((cell) => cell.key);
}

function stepTowardGoals(entity, goalKeys, battle, occupancy) {
  if (entity.moveCharge < 1) return false;
  const path = getPathForGoals(entity, goalKeys, battle, occupancy);
  const nextStep = path?.[1] || null;
  if (nextStep && canEnterCell(nextStep.key, entity, battle, occupancy)) {
    if (moveEntityToCell(entity, nextStep, battle, occupancy)) return true;
    return false;
  }
  const goalCell = path?.[path.length - 1] || getCell(battle.terrain, goalKeys[0]);
  return moveAnyAvailableDirection(entity, battle, occupancy, goalCell);
}

function canEntityMove(entity) {
  return !hasStatusFlag(entity, "blocksMove");
}

function canEntityAttack(entity) {
  return !hasStatusFlag(entity, "blocksAttack");
}

function canEntityUseSkills(entity) {
  return !hasStatusFlag(entity, "blocksSkill");
}

function resolveMeleePinCheck(entity, battle) {
  if (entity.role === "melee") return true;
  if (battle.elapsed < (entity.escapeImmuneUntil || 0)) return true;

  const adjacentMelee = battle.entities.filter((candidate) =>
    candidate.alive &&
    candidate.faction.key !== entity.faction.key &&
    candidate.role === "melee" &&
    hexDistance(candidate, entity) <= 1
  );
  if (adjacentMelee.length === 0) return true;

  const controller = [...adjacentMelee].sort((left, right) => right.primary.agility - left.primary.agility)[0];
  const passChance = computeAgilityAvoidChance(controller, entity);
  if (Math.random() < passChance) {
    entity.escapeImmuneUntil = battle.elapsed + 5;
    return true;
  }

  applyStatus(entity, getStatusPayload("bind"), battle);
  entity.escapeImmuneUntil = 0;
  return false;
}

function getPathForGoals(entity, goalKeys, battle, occupancy) {
  const current = getCell(battle.terrain, entity.cellKey);
  if (!current) return null;

  const topGoals = [...goalKeys]
    .map((key) => getCell(battle.terrain, key))
    .filter(Boolean)
    .sort((left, right) => hexDistance(current, left) - hexDistance(current, right))
    .slice(0, 4);
  if (topGoals.length === 0) return null;

  const bestGoal = topGoals[0];
  if (entity.pathTargetKey !== bestGoal.key || battle.elapsed >= entity.pathRefreshAt || entity.path.length <= 1) {
    let bestPath = null;
    let bestLength = Infinity;
    topGoals.forEach((goal) => {
      const path = findHexPath(current.key, goal.key, battle.terrain, occupancy, entity.id);
      if (path && path.length < bestLength) {
        bestLength = path.length;
        bestPath = path;
      }
    });
    entity.path = bestPath || [current];
    entity.pathTargetKey = bestGoal.key;
    entity.pathRefreshAt = battle.elapsed + PATH_REFRESH;
  }
  return entity.path;
}

function moveAnyAvailableDirection(entity, battle, occupancy, preferredGoal = null) {
  if (entity.moveCharge < 1 || !canEntityMove(entity)) return false;
  const current = getCell(battle.terrain, entity.cellKey);
  if (!current) return false;

  const neighbors = getNeighbors(current, battle.terrain)
    .filter((cell) => canEnterCell(cell.key, entity, battle, occupancy));
  if (neighbors.length === 0) return false;

  neighbors.sort((left, right) => {
    if (!preferredGoal) return Math.random() - 0.5;
    return hexDistance(left, preferredGoal) - hexDistance(right, preferredGoal);
  });

  return moveEntityToCell(entity, neighbors[0], battle, occupancy);
}

function retreatFromTarget(entity, target, battle, occupancy, desiredDistance) {
  if (entity.moveCharge < 1 || !canEntityMove(entity)) return false;
  const current = getCell(battle.terrain, entity.cellKey);
  if (!current) return false;

  const candidates = getNeighbors(current, battle.terrain)
    .filter((cell) => canEnterCell(cell.key, entity, battle, occupancy))
    .map((cell) => ({
      cell,
      score: hexDistance(cell, target) - Math.abs(hexDistance(cell, target) - desiredDistance) * 0.25
    }))
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) return false;
  return moveEntityToCell(entity, candidates[0].cell, battle, occupancy);
}

function moveEntityToCell(entity, nextCell, battle, occupancy) {
  if (!canEntityMove(entity)) return false;
  if (!resolveMeleePinCheck(entity, battle)) return false;
  occupancy.delete(entity.cellKey);
  const previous = { q: entity.q, r: entity.r };
  occupyCell(entity, nextCell, occupancy);
  entity.moveCharge = Math.max(0, entity.moveCharge - 1);
  entity.path = [];
  entity.pathTargetKey = "";
  entity.pathRefreshAt = 0;
  entity.moveAnim = {
    fromQ: previous.q,
    fromR: previous.r,
    toQ: nextCell.q,
    toR: nextCell.r,
    elapsed: 0,
    duration: 0.18
  };
  return true;
}

function occupyCell(entity, cell, occupied) {
  entity.q = cell.q;
  entity.r = cell.r;
  entity.cellKey = cell.key;
  if (occupied?.set) occupied.set(cell.key, entity.id);
}

function resetEntityState(entity) {
  entity.aiState = "seek";
  entity.lockedTargetId = null;
  entity.path = [];
  entity.pathTargetKey = "";
  entity.pathRefreshAt = 0;
  entity.chantProgress = 0;
  entity.pressuredAttack = false;
}

function announceInitialStatuses(battle) {
  battle.entities.forEach((entity) => {
    entity.statuses?.forEach((status) => {
      pushStatusGainText(battle, entity, status);
    });
  });
}

function applyStatus(entity, statusTemplate, battle) {
  const status = addStatus(entity, buildStatusRuntimePayload(entity, statusTemplate));
  if (battle && status) {
    pushStatusGainText(battle, entity, status);
  }
  return status;
}

function pushStatusGainText(battle, entity, status) {
  const color = status.kind === "buff" ? "#f97316" : "#7c3aed";
  pushFloatingText(battle, entity.q, entity.r, status.name, color, {
    kind: status.kind === "buff" ? "kill" : "assist",
    ttl: 0.95,
    fontSize: 18
  });
  pushBattleLog(battle, `${entity.name} 获得状态：${status.name}`);
  setHudStatusMessage(entity, `获得状态：${status.name}`);
}

function getStatusPayload(statusId) {
    return getStatusSeedById(statusId);
  }

function getCooldownDurationMultiplier(entity) {
  const multiplier = Number(entity?.derived?.cooldownDurationMultiplierPct || 100) / 100;
  return clamp(multiplier, 0.1, 1);
}

function getDebuffDurationMultiplier(entity) {
  const resistance = clamp(Number(entity?.derived?.statusResistance || 0) / 100, 0, 0.67);
  return clamp(1 - resistance, 0.33, 1);
}

function isDebuffStatus(statusTemplate) {
  return String(statusTemplate?.kind || "").toLowerCase() === "debuff";
}

function buildStatusRuntimePayload(entity, statusTemplate) {
  if (!statusTemplate) return statusTemplate;
  const payload = { ...statusTemplate };
  if (isDebuffStatus(statusTemplate) && Number.isFinite(statusTemplate.duration)) {
    payload.duration = round2(Math.max(0.1, statusTemplate.duration * getDebuffDurationMultiplier(entity)));
  }
  return payload;
}

function computeAgilityAvoidChance(attacker, defender) {
  return clamp(0.2 * (defender.primary.agility / Math.max(1, attacker.primary.agility)), 0.03, 0.6);
}

function selectEncounterTarget(entity, enemies, battle, factionCounts) {
  const nearby = enemies.filter((enemy) => hexDistance(entity, enemy) <= NEAR_TARGET_BAND);
  if (nearby.length === 0) return null;

  const recentAggressors = nearby.filter((enemy) =>
    enemy.id === entity.lastAggressorId &&
    battle.elapsed - entity.lastAggroAt <= 6
  );
  if (recentAggressors.length > 0) {
    return pickPriorityTarget(entity, recentAggressors, factionCounts, battle);
  }

  const foreignBrand = nearby.filter((enemy) => enemy.brand !== entity.brand);
  if (foreignBrand.length > 0) {
    return pickPriorityTarget(entity, foreignBrand, factionCounts, battle);
  }

  const anyForeignAlive = enemies.some((enemy) => enemy.brand !== entity.brand);
  if (anyForeignAlive) {
    return null;
  }

  return pickPriorityTarget(entity, nearby, factionCounts, battle);
}

function pickPriorityTarget(entity, pool, factionCounts, battle) {
  if (pool.length === 0) return null;
  return [...pool].sort((left, right) => {
    const leftForeign = left.brand !== entity.brand ? 0 : 1;
    const rightForeign = right.brand !== entity.brand ? 0 : 1;
    if (leftForeign !== rightForeign) return leftForeign - rightForeign;

    const leftWins = getFactionWinCount(left.faction.key, battle);
    const rightWins = getFactionWinCount(right.faction.key, battle);
    if (leftWins !== rightWins) return rightWins - leftWins;

    const leftFaction = factionCounts.get(left.faction.key) || 0;
    const rightFaction = factionCounts.get(right.faction.key) || 0;
    if (leftFaction !== rightFaction) return rightFaction - leftFaction;

    return hexDistance(entity, left) - hexDistance(entity, right);
  })[0];
}

function selectForcedFocusTarget(entity, enemies, battle) {
  const targetId = battle?.forcedFocus?.targetId;
  if (!targetId) return null;
  return enemies.find((enemy) => enemy.id === targetId) || null;
}

function getMoveRate(entity, battle) {
  const terrain = TERRAIN_TYPES[getCell(battle.terrain, entity.cellKey)?.terrain || "plain"];
  const affinity = getCell(battle.terrain, entity.cellKey)?.terrain === entity.faction.terrainAffinity ? 1.1 : 1;
  return ((1 + entity.primary.agility * 0.035) * affinity * 1.4) / Math.max(1, terrain.moveCost);
}

function canAttackTarget(entity, target) {
  return hexDistance(entity, target) <= entity.attackRange;
}

function getAttackRange(role, derived) {
  if (role === "melee") return 1;
  if (role === "ranged") return clamp(Math.round(derived.rangedRange), 3, 5);
  return clamp(Math.round(derived.magicRange), 3, 5);
}

function getResolvedSkillSpec(entity, skill) {
  if (skill.role !== "all") return skill;
  if (entity.role === "melee") {
    return { ...skill, damageType: "physical", range: 1.2, radius: skill.radius || 0 };
  }
  if (entity.role === "ranged") {
    return { ...skill, damageType: "physical", range: 4.7, radius: skill.radius || 0 };
  }
  return { ...skill, damageType: "magic", range: 4.9, radius: skill.radius || 0 };
}

function pickPriorityFactionForAdvance(entity, enemies, battle) {
  const grouped = new Map();
  enemies.forEach((enemy) => {
    if (!grouped.has(enemy.faction.key)) grouped.set(enemy.faction.key, []);
    grouped.get(enemy.faction.key).push(enemy);
  });

  return [...grouped.entries()]
    .map(([factionKey, members]) => {
      const centerQ = members.reduce((sum, member) => sum + member.q, 0) / members.length;
      const centerR = members.reduce((sum, member) => sum + member.r, 0) / members.length;
      const center = { q: centerQ, r: centerR };
      const averageDistance = members.reduce((sum, member) => sum + hexDistance(entity, member), 0) / members.length;
      return {
        factionKey,
        wins: getFactionWinCount(factionKey, battle),
        count: members.length,
        averageDistance,
        centerDistance: hexDistance(entity, center)
      };
    })
    .sort((left, right) => {
      if (left.wins !== right.wins) return right.wins - left.wins;
      if (left.count !== right.count) return right.count - left.count;
      if (left.averageDistance !== right.averageDistance) return left.averageDistance - right.averageDistance;
      return left.centerDistance - right.centerDistance;
    })[0]?.factionKey || enemies[0]?.faction.key;
}

function getFactionWinCount(factionKey, battle) {
  return Number(battle?.factionWins?.[factionKey] || 0);
}

function syncForcedFocusState(battle, living) {
  if (!battle.forcedFocus) {
    battle.forcedFocus = { mode: "elite-sequence", targetId: null, eliteKills: 0 };
  }

  if ((battle.forcedFocus.eliteKills || 0) >= 5) {
    battle.forcedFocus.mode = "none";
    battle.forcedFocus.targetId = null;
    return;
  }

  const eliteTarget = pickEliteFocusTarget(living, battle);
  if (eliteTarget) {
    battle.forcedFocus.mode = "elite-sequence";
    battle.forcedFocus.targetId = eliteTarget.id;
    return;
  }

  battle.forcedFocus.mode = "none";
  battle.forcedFocus.targetId = null;
}

function pickEliteFocusTarget(living, battle) {
  return [...living].sort((left, right) => {
    if (left.level !== right.level) return right.level - left.level;
    if ((left.progress?.experience || 0) !== (right.progress?.experience || 0)) {
      return (right.progress?.experience || 0) - (left.progress?.experience || 0);
    }

    const leftFactionWins = getFactionWinCount(left.faction.key, battle);
    const rightFactionWins = getFactionWinCount(right.faction.key, battle);
    if (leftFactionWins !== rightFactionWins) return rightFactionWins - leftFactionWins;

    return String(left.id).localeCompare(String(right.id));
  })[0] || null;
}

function pickDensityGoals(enemies, battle, occupancy, selfId) {
  if (enemies.length === 0) return [];
  const q = enemies.reduce((sum, enemy) => sum + enemy.q, 0) / enemies.length;
  const r = enemies.reduce((sum, enemy) => sum + enemy.r, 0) / enemies.length;
  return battle.terrain.cells
    .filter((cell) => {
      if (cell.blocked) return false;
      const occupiedBy = occupancy.get(cell.key);
      return !occupiedBy || occupiedBy === selfId;
    })
    .sort((left, right) => {
      const leftScore = Math.hypot(left.q - q, left.r - r) + nearestEnemyDistance(left, enemies) * 0.18;
      const rightScore = Math.hypot(right.q - q, right.r - r) + nearestEnemyDistance(right, enemies) * 0.18;
      return leftScore - rightScore;
    })
    .slice(0, 8);
}

function nearestEnemyDistance(cell, enemies) {
  return enemies.reduce((best, enemy) => Math.min(best, hexDistance(cell, enemy)), Infinity);
}

function findHexPath(startKey, goalKey, terrain, occupancy, selfId) {
  if (startKey === goalKey) return [getCell(terrain, startKey)];

  const open = [startKey];
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, heuristic(startKey, goalKey)]]);
  const openSet = new Set(open);

  while (open.length > 0) {
    open.sort((left, right) => (fScore.get(left) ?? Infinity) - (fScore.get(right) ?? Infinity));
    const currentKey = open.shift();
    openSet.delete(currentKey);
    if (currentKey === goalKey) return reconstructPath(cameFrom, currentKey, terrain);

    const current = getCell(terrain, currentKey);
    getNeighbors(current, terrain).forEach((neighbor) => {
      if (!canPathThrough(neighbor.key, goalKey, terrain, occupancy, selfId)) return;
      const tentative = (gScore.get(currentKey) ?? Infinity) + terrainCost(neighbor.terrain);
      if (tentative >= (gScore.get(neighbor.key) ?? Infinity)) return;
      cameFrom.set(neighbor.key, currentKey);
      gScore.set(neighbor.key, tentative);
      fScore.set(neighbor.key, tentative + heuristic(neighbor.key, goalKey));
      if (!openSet.has(neighbor.key)) {
        open.push(neighbor.key);
        openSet.add(neighbor.key);
      }
    });
  }

  return [getCell(terrain, startKey)];
}

function reconstructPath(cameFrom, endKey, terrain) {
  const path = [getCell(terrain, endKey)];
  let currentKey = endKey;
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey);
    path.unshift(getCell(terrain, currentKey));
  }
  return path.filter(Boolean);
}

function canPathThrough(cellKey, goalKey, terrain, occupancy, selfId) {
  const cell = getCell(terrain, cellKey);
  if (!cell || cell.blocked) return false;
  if (cellKey === goalKey) return true;
  return !occupancy.has(cellKey) || occupancy.get(cellKey) === selfId;
}

function canEnterCell(cellKey, entity, battle, occupancy) {
  const cell = getCell(battle.terrain, cellKey);
  if (!cell || cell.blocked) return false;
  const occupiedBy = occupancy.get(cellKey);
  return !occupiedBy || occupiedBy === entity.id;
}

function getNeighbors(cell, terrain) {
  return HEX_DIRECTIONS
    .map((direction) => getCell(terrain, makeCellKey(cell.q + direction.q, cell.r + direction.r)))
    .filter(Boolean);
}

function buildFactionCounts(entities) {
  return entities.reduce((map, entity) => {
    map.set(entity.faction.key, (map.get(entity.faction.key) || 0) + 1);
    return map;
  }, new Map());
}

function buildOccupancy(entities) {
  return entities.reduce((map, entity) => {
    map.set(entity.cellKey, entity.id);
    return map;
  }, new Map());
}

function tickVisuals(battle, dt) {
  battle.animations = battle.animations.filter((animation) => {
    animation.ttl -= dt;
    return animation.ttl > 0;
  });
  battle.announcements = battle.announcements.filter((announcement) => {
    announcement.ttl -= dt;
    announcement.yOffset -= dt * 0.45;
    return announcement.ttl > 0;
  });
  battle.entities.forEach((entity) => {
    if (entity.hp > entity.hpDamageAnchor) {
      entity.hpDamageAnchor = entity.hp;
    }
    if (!entity.moveAnim) {
      entity.renderQ = entity.q;
      entity.renderR = entity.r;
      return;
    }
    entity.moveAnim.elapsed += dt;
    const t = clamp(entity.moveAnim.elapsed / entity.moveAnim.duration, 0, 1);
    entity.renderQ = lerp(entity.moveAnim.fromQ, entity.moveAnim.toQ, t);
    entity.renderR = lerp(entity.moveAnim.fromR, entity.moveAnim.toR, t);
    if (t >= 1) entity.moveAnim = null;
  });
}

function clearBattleCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#efe3c1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(31, 43, 36, 0.48)";
  ctx.font = "22px sans-serif";
  ctx.fillText("\u7b49\u5f85\u6218\u6597\u5f00\u59cb", 32, 42);
}

function drawStatusEffects(ctx, battle, layout) {
  battle.entities.forEach((entity) => {
    if (!entity.alive || !entity.statuses?.length) return;
    const pos = project(entity.renderQ, entity.renderR, layout, battle.cameraMode);
    const baseRadius = layout.hexRadius * 0.46;
    entity.statuses.forEach((status, index) => {
      drawStatusVisual(ctx, battle.elapsed, pos.x, pos.y, baseRadius, status, index, entity.statuses.length);
    });
  });
}

function drawStatusVisual(ctx, time, x, y, radius, status, index, total) {
  const visualType = status.visualType || (status.kind === "buff" ? "halo" : "aura");
  const color = status.visualColor || (status.kind === "buff" ? "#f59e0b" : "#7c3aed");
  const accent = status.visualAccent || "#ffffff";
  const layerOffset = index - (total - 1) / 2;
  const ringRadius = radius + 4 + Math.abs(layerOffset) * 4;
  const bob = Math.sin(time * 3 + index * 1.7) * 1.5;

  ctx.save();
  switch (visualType) {
    case "burn":
      drawBurnStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    case "paralyze":
      drawParalyzeStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    case "sleep":
      drawSleepStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    case "bind":
      drawBindStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    case "sick":
      drawSickStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    case "halo":
      drawHaloStatus(ctx, time, x, y, ringRadius, color, accent);
      break;
    default:
      drawGenericStatus(ctx, time, x, y + bob, ringRadius, color, accent, status.kind);
      break;
  }
  ctx.restore();
}

function drawBurnStatus(ctx, time, x, y, radius, color, accent) {
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, radius + Math.sin(time * 5) * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  for (let index = 0; index < 4; index += 1) {
    const angle = time * 2.7 + index * (Math.PI / 2);
    const px = x + Math.cos(angle) * (radius - 2);
    const py = y + Math.sin(angle) * (radius - 4);
    ctx.fillStyle = index % 2 === 0 ? color : accent;
    ctx.beginPath();
    ctx.arc(px, py, 2.8 + Math.sin(time * 7 + index) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParalyzeStatus(ctx, time, x, y, radius, color, accent) {
  ctx.strokeStyle = `${color}dd`;
  ctx.lineWidth = 2;
  for (let index = 0; index < 3; index += 1) {
    const angle = time * 4 + index * 2.1;
    const px = x + Math.cos(angle) * (radius - 3);
    const py = y + Math.sin(angle) * (radius - 3);
    ctx.beginPath();
    ctx.moveTo(px - 4, py - 5);
    ctx.lineTo(px, py - 1);
    ctx.lineTo(px - 2, py + 2);
    ctx.lineTo(px + 4, py + 7);
    ctx.stroke();
  }
  ctx.fillStyle = `${accent}aa`;
  ctx.beginPath();
  ctx.arc(x, y, radius - 6 + Math.sin(time * 8) * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSleepStatus(ctx, time, x, y, radius, color, accent) {
  ctx.strokeStyle = `${color}bb`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("Z", x + radius * 0.25, y - radius - 6 - Math.sin(time * 3) * 3);
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("z", x + radius * 0.02, y - radius * 0.72 - Math.sin(time * 3 + 0.6) * 2);
  ctx.font = "bold 9px sans-serif";
  ctx.fillText("z", x - radius * 0.18, y - radius * 0.48 - Math.sin(time * 3 + 1.1) * 2);
}

function drawBindStatus(ctx, time, x, y, radius, color, accent) {
  ctx.strokeStyle = `${color}c8`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let index = 0; index < 3; index += 1) {
    const angle = time * 1.5 + index * (Math.PI * 2 / 3);
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    ctx.strokeStyle = index % 2 === 0 ? color : accent;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

function drawSickStatus(ctx, time, x, y, radius, color, accent) {
  ctx.fillStyle = `${color}33`;
  ctx.beginPath();
  ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
  ctx.fill();
  for (let index = 0; index < 3; index += 1) {
    const angle = time * 1.8 + index * 2.2;
    const px = x + Math.cos(angle) * (radius * 0.5);
    const py = y - radius * 0.25 + Math.sin(angle * 1.3) * 5;
    ctx.fillStyle = index % 2 === 0 ? `${color}bb` : `${accent}88`;
    ctx.beginPath();
    ctx.arc(px, py, 3.2 - index * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHaloStatus(ctx, time, x, y, radius, color, accent) {
  ctx.strokeStyle = `${color}d8`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y - radius - 5 + Math.sin(time * 2.8) * 1.6, radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `${accent}aa`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - radius - 5 + Math.sin(time * 2.8) * 1.6, radius * 0.44, 0, Math.PI * 2);
  ctx.stroke();
}

function drawGenericStatus(ctx, time, x, y, radius, color, accent, kind) {
  ctx.strokeStyle = `${color}bb`;
  ctx.lineWidth = kind === "buff" ? 2.2 : 1.8;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `${accent}55`;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(4, radius * 0.26 + Math.sin(time * 4) * 1.2), 0, Math.PI * 2);
  ctx.fill();
}

function drawTerrain(ctx, battle, layout) {
  battle.terrain.cells.forEach((cell) => {
    const terrain = TERRAIN_TYPES[cell.terrain];
    const pos = project(cell.q, cell.r, layout, battle.cameraMode);
    ctx.beginPath();
    drawHex(ctx, pos.x, pos.y, layout.hexRadius);
    ctx.fillStyle = terrain.color;
    ctx.strokeStyle = "rgba(31, 43, 36, 0.1)";
    ctx.fill();
    ctx.stroke();
  });
}

function drawTournamentArena(ctx, canvas) {
  const size = Math.min(canvas.width, canvas.height) * 0.34;
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;
  ctx.save();
  ctx.strokeStyle = "rgba(64, 43, 22, 0.68)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = (-Math.PI / 2) + index * (Math.PI / 4);
    const x = cx + Math.cos(angle) * size;
    const y = cy + Math.sin(angle) * size * 0.84;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([16, 10]);
  ctx.strokeStyle = "rgba(255, 247, 225, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawLockRelations(ctx, battle, layout) {
  const engaged = battle.entities.filter((entity) => entity.alive && entity.aiState === "encounter" && entity.lockedTargetId);
  engaged.forEach((entity) => {
    const target = battle.entities.find((candidate) => candidate.id === entity.lockedTargetId && candidate.alive);
    if (!target) return;
    const start = project(entity.renderQ, entity.renderR, layout, battle.cameraMode);
    const end = project(target.renderQ, target.renderR, layout, battle.cameraMode);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2 - Math.max(22, layout.hexRadius * 1.2);
    const color = gradeTint(entity.potential);
    ctx.save();
    ctx.strokeStyle = `${color}bb`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(mx, my, end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = Math.atan2(end.y - my, end.x - mx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(angle - 0.45) * 10, end.y - Math.sin(angle - 0.45) * 10);
    ctx.lineTo(end.x - Math.cos(angle + 0.45) * 10, end.y - Math.sin(angle + 0.45) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawEntities(ctx, battle, layout, getAvatarImage, gradeColor) {
  const living = battle.entities
    .filter((entity) => entity.alive)
    .sort((left, right) => (left.renderQ + left.renderR) - (right.renderQ + right.renderR));

  living.forEach((entity) => {
    const pos = project(entity.renderQ, entity.renderR, layout, battle.cameraMode);
    const size = layout.entityRadius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.clip();
    const avatar = getAvatarImage(entity.base.avatarDataUrl);
    if (avatar && avatar.complete) {
      ctx.drawImage(avatar, pos.x - size, pos.y - size, size * 2, size * 2);
    } else {
      ctx.fillStyle = entity.base.dominantColor || "#b9b3a9";
      ctx.fillRect(pos.x - size, pos.y - size, size * 2, size * 2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.strokeStyle = entity.faction.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    const hpRatio = entity.hp / Math.max(1, entity.maxHp);
    const actionBase = getActionCycle(entity);
    const actionRatio = entity.role === "caster" && entity.chantProgress > 0
      ? Math.min(1, entity.chantProgress / Math.max(0.01, actionBase))
      : actionBase <= 0
        ? 1
        : Math.max(0, 1 - entity.attackCooldown / actionBase);
    const labelColor = gradeColor(entity.potential);
    ctx.fillStyle = "rgba(31, 43, 36, 0.22)";
    ctx.fillRect(pos.x - 34, pos.y - size - 24, 68, 7);
    ctx.fillStyle = hpRatio > 0.45 ? "#42a35a" : hpRatio > 0.2 ? "#d6a21f" : "#cf4d3c";
    ctx.fillRect(pos.x - 34, pos.y - size - 24, 68 * hpRatio, 7);
    ctx.fillStyle = "rgba(31, 43, 36, 0.2)";
    ctx.fillRect(pos.x - 34, pos.y + size + 10, 68, 6);
    ctx.fillStyle = entity.role === "caster" && entity.chantProgress > 0 ? "#7b67c6" : labelColor;
    ctx.fillRect(pos.x - 34, pos.y + size + 10, 68 * actionRatio, 6);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(31, 43, 36, 0.2)";
    ctx.strokeRect(pos.x - 34, pos.y + size + 10, 68, 6);
    ctx.font = "bold 16px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 250, 240, 0.92)";
    ctx.strokeText(`${entity.name.slice(0, 10)} Lv.${entity.level}`, pos.x - 34, pos.y - size - 34);
    ctx.fillStyle = labelColor;
    ctx.fillText(`${entity.name.slice(0, 10)} Lv.${entity.level}`, pos.x - 34, pos.y - size - 34);
  });
}

function drawAnimations(ctx, battle, layout) {
  battle.animations.forEach((animation) => {
    const progress = 1 - animation.ttl / animation.maxTtl;
    if (animation.type === "projectile") {
      const start = project(animation.q1, animation.r1, layout, battle.cameraMode);
      const end = project(animation.q2, animation.r2, layout, battle.cameraMode);
      const x = lerp(start.x, end.x, progress);
      const y = lerp(start.y, end.y, progress);
      ctx.fillStyle = animation.color;
      ctx.beginPath();
      const radius =
        animation.kind === "flare" ? 9 :
        animation.kind === "heavy-arrow" ? 7 :
        animation.kind === "orb" ? 6 : 4;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (animation.kind === "heavy-arrow" || animation.kind === "flare") {
        ctx.strokeStyle = `${animation.color}66`;
        ctx.lineWidth = animation.kind === "flare" ? 4 : 3;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    } else if (animation.type === "trail") {
      const start = project(animation.q1, animation.r1, layout, battle.cameraMode);
      const end = project(animation.q2, animation.r2, layout, battle.cameraMode);
      ctx.strokeStyle = `${animation.color}aa`;
      ctx.lineWidth = animation.width;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (animation.type === "radial") {
      const pos = project(animation.q, animation.r, layout, battle.cameraMode);
      ctx.strokeStyle = `${animation.color}aa`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, animation.radius * layout.hexRadius * (0.5 + progress * 0.4), 0, Math.PI * 2);
      ctx.stroke();
    } else if (animation.type === "slash") {
      const start = project(animation.q1, animation.r1, layout, battle.cameraMode);
      const end = project(animation.q2, animation.r2, layout, battle.cameraMode);
      const mx = lerp(start.x, end.x, 0.5);
      const my = lerp(start.y, end.y, 0.5);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;
      const lift = (1 - Math.abs(progress - 0.5) * 2) * animation.arc;
      ctx.strokeStyle = `${animation.color}dd`;
      ctx.lineWidth = animation.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(mx + nx * lift, my + ny * lift, end.x, end.y);
      ctx.stroke();
    }
  });
}

function drawAnnouncements(ctx, battle, layout) {
  battle.announcements.forEach((item) => {
    const pos = item.entityId
      ? (() => {
          const entity = battle.entities.find((candidate) => candidate.id === item.entityId && candidate.alive);
          return entity ? project(entity.renderQ, entity.renderR, layout, battle.cameraMode) : null;
        })()
      : project(item.q, item.r, layout, battle.cameraMode);
    if (!pos) return;
    const fontSize = item.fontSize || 14;
    const width = Math.max(54, item.text.length * (fontSize * 0.9));
    const x = pos.x - width / 2;
    const y = pos.y - layout.entityRadius - 54 + item.yOffset * 30;
    ctx.save();
    ctx.globalAlpha = Math.max(0, item.ttl / item.maxTtl);
    if (item.kind === "damage" || item.kind === "kill" || item.kind === "assist") {
      ctx.lineWidth = item.kind === "kill" ? 5 : 4;
      ctx.strokeStyle = "rgba(255, 250, 240, 0.95)";
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.strokeText(item.text, x, y);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, x, y);
    } else {
      ctx.fillStyle = "rgba(255, 252, 244, 0.92)";
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, width, 22);
      ctx.strokeRect(x, y, width, 22);
      ctx.fillStyle = item.color;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(item.text, x + 8, y + 15);
    }
    ctx.restore();
  });
}

function drawDuelHud(ctx, battle, canvas) {
  const fighters = battle.entities.slice(0, 2);
  if (fighters.length < 2) return;
  const [left, right] = fighters;
  const maxHp = Math.max(left.maxHp || 1, right.maxHp || 1);
  const panelWidth = Math.max(620, Math.min(760, Math.floor((canvas.width - 88) / 2)));
  drawDuelFighterCard(ctx, left, { x: 24, y: 20, width: panelWidth, side: "left", maxHp, elapsed: battle.elapsed });
  drawDuelFighterCard(ctx, right, { x: canvas.width - 24, y: canvas.height - 20, width: panelWidth, side: "right", maxHp, elapsed: battle.elapsed });
}

function drawDuelFighterCard(ctx, entity, options) {
  const { x, y, width, side, maxHp, elapsed = 0.1 } = options;
  const alignRight = side === "right";
  const panelHeight = 238;
  const px = alignRight ? x - width : x;
  const py = alignRight ? y - panelHeight : y;
  const nameColor = gradeTint(entity.potential);
  const roleLabel = ROLE_LABELS[entity.role] || entity.role;
  const fullBarWidth = width - 56;
  const scaledWidth = Math.max(260, fullBarWidth * ((entity.maxHp || 1) / Math.max(1, maxHp)));
  const barX = px + 28;
  const barY = py + 78;
  const hpRatio = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
  const hpDamageAnchorRatio = clamp(entity.hpDamageAnchor / Math.max(1, entity.maxHp), 0, 1);
  const dpsText = fitHudText(ctx, `输出 ${Math.round((entity.damageDone || 0) / Math.max(0.1, elapsed))}/s`, width - 56, "bold 20px sans-serif");
  const attackMessage = fitHudText(ctx, entity.hudAttackMessage || "等待交锋", width - 56, "bold 22px sans-serif");
  const statusMessage = fitHudText(ctx, entity.hudStatusMessage || "当前无特殊状态", width - 56, "bold 20px sans-serif");

  ctx.save();
  ctx.fillStyle = "rgba(255, 250, 240, 0.9)";
  ctx.strokeStyle = "rgba(31, 43, 36, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, px, py, width, panelHeight, 22);
  ctx.fill();
  ctx.stroke();

  drawHeaderLine(ctx, {
    x: px + 28,
    y: py + 40,
    width: width - 56,
    entity,
    roleLabel,
    nameColor
  });

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRectPath(ctx, barX, barY, scaledWidth, 30, 15);
  ctx.fill();

  if (hpDamageAnchorRatio > hpRatio) {
    ctx.fillStyle = "#d34b38";
    roundRectPath(ctx, barX, barY, scaledWidth * hpDamageAnchorRatio, 30, 15);
    ctx.fill();
  }
  ctx.fillStyle = "#38a169";
  roundRectPath(ctx, barX, barY, scaledWidth * hpRatio, 30, 15);
  ctx.fill();
  ctx.strokeStyle = "rgba(31, 43, 36, 0.16)";
  roundRectPath(ctx, barX, barY, scaledWidth, 30, 15);
  ctx.stroke();

  ctx.fillStyle = "#17351f";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(entity.hp)} / ${Math.round(entity.maxHp)}`, barX + 12, barY + 22);
  ctx.fillStyle = "#17351f";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(dpsText, px + 28, py + 150);
  ctx.fillStyle = "#8a2d20";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(attackMessage, px + 28, py + 190);
  ctx.fillStyle = "#6b46c1";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(statusMessage, px + 28, py + 214);
  ctx.restore();
}

function drawHeaderLine(ctx, options) {
  const { x, y, width, entity, roleLabel, nameColor } = options;
  const segments = [
    { text: entity.name, color: nameColor, font: "bold 28px sans-serif" },
    { text: entity.faction.name, color: entity.faction.color || "#666666", font: "bold 28px sans-serif" },
    { text: `Lv.${entity.level}`, color: "#17351f", font: "bold 28px sans-serif" },
    { text: roleLabel, color: "#17351f", font: "bold 28px sans-serif" }
  ];

  const gap = 18;
  let cursor = x;
  const maxX = x + width;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const segment of segments) {
    ctx.font = segment.font;
    let text = segment.text;
    const remaining = maxX - cursor;
    if (remaining <= 0) break;
    if (ctx.measureText(text).width > remaining) {
      text = fitHudText(ctx, text, remaining, segment.font);
    }
    ctx.fillStyle = segment.color;
    ctx.fillText(text, cursor, y);
    cursor += ctx.measureText(text).width + gap;
  }
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fitHudText(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.restore();
    return text;
  }
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.restore();
  return `${trimmed}…`;
}

function getBattleLayout(canvas, mode, radius) {
  const topRadius = Math.min(
    42,
    (canvas.width - 120) / (Math.sqrt(3) * (radius * 2 + 2)),
    (canvas.height - 120) / (1.5 * (radius * 2 + 1.5))
  );
  const angledRadius = topRadius * 0.88;
  const hexRadius = mode === "angled" ? angledRadius : topRadius;
  return {
    hexRadius,
    entityRadius: Math.max(14, hexRadius * 0.45),
    axialWidth: Math.sqrt(3) * hexRadius,
    axialHeight: 1.5 * hexRadius,
    centerX: canvas.width * 0.5,
    centerY: mode === "angled" ? canvas.height * 0.42 : canvas.height * 0.5
  };
}

function getActionCycle(entity) {
  if (entity.role === "ranged") return entity.derived.attackInterval * 0.92;
  if (entity.role === "caster") return getCasterBasicCastDuration(entity);
  return entity.derived.attackInterval;
}

function getCasterBasicCastDuration(entity) {
  return Math.max(
    0.45,
    (entity.derived.chantTime || 1) / Math.max(0.35, entity.derived.castSpeed || 1)
  );
}

function project(q, r, layout, mode) {
  if (mode === "angled") {
    return {
      x: layout.centerX + (q - r) * layout.axialWidth * 0.56,
      y: layout.centerY + (q + r) * layout.axialHeight * 0.32
    };
  }
  return {
    x: layout.centerX + layout.axialWidth * (q + r / 2),
    y: layout.centerY + layout.axialHeight * r
  };
}

function drawHex(ctx, cx, cy, radius) {
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function isTerrainConnected(cells) {
  const passable = cells.filter((cell) => cell.terrain !== "wall");
  if (passable.length === 0) return true;
  const passableSet = new Set(passable.map((cell) => cell.key));
  const visited = new Set();
  const stack = [passable[0]];

  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current.key)) continue;
    visited.add(current.key);
    HEX_DIRECTIONS.forEach((direction) => {
      const nextKey = makeCellKey(current.q + direction.q, current.r + direction.r);
      if (passableSet.has(nextKey) && !visited.has(nextKey)) {
        const [q, r] = nextKey.split(",").map(Number);
        stack.push({ q, r, key: nextKey });
      }
    });
  }

  return visited.size === passable.length;
}

function pushProjectileAnimation(battle, q1, r1, q2, r2, color, ttl, kind) {
  battle.animations.push({ type: "projectile", q1, r1, q2, r2, color, ttl, maxTtl: ttl, kind });
}

function pushSlashAnimation(battle, q1, r1, q2, r2, color, ttl, width) {
  battle.animations.push({
    type: "slash",
    q1,
    r1,
    q2,
    r2,
    color,
    ttl,
    maxTtl: ttl,
    width,
    arc: 18
  });
}

function pushRadialAnimation(battle, q, r, color, radius, ttl) {
  battle.animations.push({ type: "radial", q, r, color, radius, ttl, maxTtl: ttl });
}

function pushAnnouncement(battle, entityId, text, color, options = {}) {
  const ttl = options.ttl || 1.05;
  battle.announcements.push({
    entityId,
    text,
    color,
    kind: options.kind || "tag",
    ttl,
    maxTtl: ttl,
    yOffset: 0,
    fontSize: options.fontSize || 14
  });
}

function pushFloatingText(battle, q, r, text, color, options = {}) {
  const ttl = options.ttl || 1;
  battle.announcements.push({
    q,
    r,
    text,
    color,
    kind: options.kind || "damage",
    ttl,
    maxTtl: ttl,
    yOffset: 0,
    fontSize: options.fontSize || 14
  });
}

function pushBattleLog(battle, message) {
  battle.logs.push(`[${battle.elapsed.toFixed(1)}] ${message}`);
  if (battle.logs.length > MAX_LOGS) battle.logs.shift();
}

function pushCombatEvent(battle, event) {
  battle.combatEvents.push({
    at: round2(battle.elapsed),
    ...event
  });
  if (battle.combatEvents.length > MAX_COMBAT_EVENTS) {
    battle.combatEvents.shift();
  }
}

function setHudAttackMessage(entity, text) {
  entity.hudAttackMessage = text;
}

function setHudStatusMessage(entity, text) {
  entity.hudStatusMessage = text;
}

function heuristic(fromKey, toKey) {
  return hexDistance(parseCellKey(fromKey), parseCellKey(toKey));
}

function terrainCost(terrainKey) {
  const terrain = TERRAIN_TYPES[terrainKey];
  if (!terrain || terrain.blocked) return Infinity;
  return terrain.moveCost;
}

function getCell(terrain, key) {
  return terrain.map.get(key) || null;
}

function parseCellKey(key) {
  const [q, r] = String(key).split(",").map(Number);
  return { q, r };
}

function makeCellKey(q, r) {
  return `${q},${r}`;
}

function hexDistance(left, right) {
  const lq = left.q;
  const lr = left.r;
  const ls = -lq - lr;
  const rq = right.q;
  const rr = right.r;
  const rs = -rq - rr;
  return Math.max(Math.abs(lq - rq), Math.abs(lr - rr), Math.abs(ls - rs));
}

