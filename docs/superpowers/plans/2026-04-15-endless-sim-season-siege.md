# 无尽推演完整化 + 攻城视觉战场 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无尽推演 season 步骤完整走手动流程；攻城战在战场上真实对决；灭门战单场多派混战含阶段切换；仲裁面板底部改为近期江湖大事记。

**Architecture:** 提取 `runSeasonAdvance()` 返回计算结果供手动按钮和 fast-sim 共用；新增 `siegeBattleQueue`/`currentSiege` 状态字段将攻城战排队进入战场；在 `battle-system.js` 中加入 `defenderFactionKey` 实现灭门战阶段切换 AI；`renderArbiterPanel` 接受第三参数 chronicle 并渲染大事记。

**Tech Stack:** JavaScript ES6 模块，Canvas 2D，IndexedDB

---

## 文件变更一览

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/app.js` | 修改 | 新增 `siegeBattleQueue`/`currentSiege` 初始状态；提取 `runSeasonAdvance()`；重构手动按钮 handler；重构 fast-sim season 分支；重构 `runSeasonSiege()`；新增 `startNextSiegeBattle()`；`applyBattleRewards` 中处理攻城结果并修正 fastSimMeta 时机；所有 `renderArbiterPanel` 调用加 chronicle 参数 |
| `src/world-ui.js` | 修改 | `renderArbiterPanel` 接受第三参数 `chronicle`，底部渲染大事记条目 |
| `src/battle-system.js` | 修改 | `createBattleState` 支持 `defenderFactionKey`；`getEnemyEntities` 加阶段过滤；`updateBattleState` 加阶段切换检测；winner 判定加 `"siege"`/`"extinction"` 类型 |
| `src/world-siege.js` | 修改 | 将 `injureCombatants`、`injureGarrisonedAt` 改为 export |

---

## Task 1：仲裁面板改为大事记

**Files:**
- Modify: `src/world-ui.js:468-501`
- Modify: `src/app.js` — 所有 `renderArbiterPanel` 调用点（8 处：行 249, 597, 1634, 2057, 2107, 2413, 3311, 3594）

- [ ] **Step 1.1：修改 `renderArbiterPanel` 签名和渲染内容**

在 `src/world-ui.js` 第 468 行，将函数改为：

```js
export function renderArbiterPanel(container, worldState, chronicle) {
  const stats = worldState.factionStats || {};
  const cities = worldState.cities || [];
  const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const entries = chronicle?.entries?.slice(0, 8) || [];

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
        ${entries.length > 0
          ? entries.map((e) => `<div class="chronicle-entry-mini"><strong>${escHtml(e.title || "")}</strong><p>${escHtml(e.body || "")}</p></div>`).join("")
          : `<div class="log-line" style="opacity:0.5">江湖故事正在酝酿中\u2026</div>`
        }
      </div>
    </div>
  `;
}
```

（原来的 `filteredLog` 行删除，不再使用 `worldState.log` 渲染。）

- [ ] **Step 1.2：更新所有 `renderArbiterPanel` 调用点**

在 `src/app.js` 中，将所有 `renderArbiterPanel(dom.worldArbiterPanel, state.worldState)` 替换为：

```js
renderArbiterPanel(dom.worldArbiterPanel, state.worldState, state.chronicle)
```

共 8 处（行 249, 597, 1634, 2057, 2107, 2413, 3311, 3594），逐一替换。

- [ ] **Step 1.3：验证**

打开浏览器，进入世界地图，仲裁面板底部应显示"江湖故事正在酝酿中…"（chronicle 为空时）或大事记标题+内容（有记录时）。原来的 log 字符串行不再出现。

- [ ] **Step 1.4：提交**

```bash
git add src/world-ui.js src/app.js
git commit -m "feat: 仲裁面板底部改为渲染近期江湖大事记"
```

---

## Task 2：灭门战阶段切换 AI（battle-system.js）

**Files:**
- Modify: `src/battle-system.js:30-79`（`createBattleState` 参数 + battle 对象）
- Modify: `src/battle-system.js:81-103`（`updateBattleState` — winner 判定 + 阶段切换）
- Modify: `src/battle-system.js:591-593`（`getEnemyEntities`）

- [ ] **Step 2.1：`createBattleState` 支持 `defenderFactionKey`**

在 `src/battle-system.js` 参数解构中（第 30 行附近），在 `competitionType = "chaos"` 之后添加 `defenderFactionKey = null`：

```js
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
  competitionType = "chaos",
  defenderFactionKey = null
}) {
```

在 `battle` 对象字面量（第 55 行附近）中，在 `competitionType,` 之后添加：

```js
    competitionType,
    defenderFactionKey,
```

- [ ] **Step 2.2：`updateBattleState` — winner 判定加 siege/extinction 类型，并加阶段切换**

在 `updateBattleState`（第 81 行）中，`battle.elapsed += dt` 之后，`tickVisuals` 之后，在 living/factionKeys 计算之前，插入阶段切换检测：

```js
  // 灭门战阶段切换：防守方全灭后解除阵营限制，各派自由混战
  if (battle.defenderFactionKey) {
    const defendersAlive = battle.entities.some(
      (e) => e.alive && e.faction.key === battle.defenderFactionKey
    );
    if (!defendersAlive) {
      battle.defenderFactionKey = null;
    }
  }
```

在 winner 判定块（第 89 行）中，将 `"chaos"` 分支扩展为：

```js
  if (factionKeys.length <= 1) {
    if (battle.competitionType === "chaos" || battle.competitionType === "siege" || battle.competitionType === "extinction") {
      battle.winner = living[0]?.faction || null;
    } else {
      const winnerEntity = living[0] || null;
      battle.winner = winnerEntity
        ? { key: winnerEntity.id, name: winnerEntity.name, entityId: winnerEntity.id }
        : null;
    }
    return;
  }
```

- [ ] **Step 2.3：`getEnemyEntities` 加阶段过滤**

在 `src/battle-system.js` 第 591 行，将 `getEnemyEntities` 改为：

```js
function getEnemyEntities(entity, battle) {
  const allEnemies = battle.entities.filter(
    (target) => target.alive && target.faction.key !== entity.faction.key
  );
  // 灭门战阶段一：防守方存活时，进攻方只攻击防守方
  if (
    battle.defenderFactionKey &&
    entity.faction.key !== battle.defenderFactionKey
  ) {
    const defenders = allEnemies.filter(
      (t) => t.faction.key === battle.defenderFactionKey
    );
    if (defenders.length > 0) return defenders;
  }
  return allEnemies;
}
```

- [ ] **Step 2.4：提交**

```bash
git add src/battle-system.js
git commit -m "feat: 灭门战 AI — 阶段一集火防守方，全灭后自由混战"
```

---

## Task 3：提取 `runSeasonAdvance()` + fast-sim 自动确认

**Files:**
- Modify: `src/app.js:160-174`（状态初始化）
- Modify: `src/app.js:374-423`（手动按钮 handler）
- Modify: `src/app.js:521-617`（fast-sim 循环）
- Add function before `renderSeasonPrelude`: `runSeasonAdvance()` in `src/app.js`

- [ ] **Step 3.1：添加新状态字段**

在 `src/app.js` 第 171 行（`seasonSiegePending: false,` 之后），添加：

```js
  seasonSiegePending: false,
  siegeBattleQueue: [],
  currentSiege: null,
```

- [ ] **Step 3.2：提取 `runSeasonAdvance()` 函数**

`advanceSeason(worldState, builds)` 只返回 `{ worldState, duelResults }`，不含驻守 XP 或游历条目。这些由调用方自行计算（原手动 handler 第 382-410 行）。

在 `renderSeasonPrelude` 函数定义之前，插入：

```js
/**
 * 执行完整的时节推进逻辑（驻守XP + 游历奇遇 + 单挑检测）
 * 返回渲染所需数据，不自行渲染面板
 */
async function runSeasonAdvance() {
  const builds = await state.storage.getAllBuilds();

  // 1. 推进时节（更新角色状态机）
  const { worldState } = advanceSeason(state.worldState, builds);
  state.worldState = worldState;

  // 2. 结算驻守经验
  const garrisonResults = [];
  for (const build of builds) {
    const cs = worldState.characterStates[build.buildId];
    if (!cs || cs.state !== "garrison") continue;
    const prog = state.progress.find((p) => p.buildId === build.buildId);
    if (!prog) continue;
    const xpGain = Math.round(expToNextLevel(prog.level || 1) * 0.1);
    const updatedProg = { ...prog };
    grantExp(updatedProg, xpGain);
    await state.storage.putProgress(updatedProg);
    const entry = getEntries().find((e) => e.build?.buildId === build.buildId);
    garrisonResults.push({
      name: entry?.displayName || build.buildId,
      xpGain,
      avatarDataUrl: entry?.base?.avatarDataUrl || "",
    });
  }

  // 3. 游历奇遇事件
  await refreshAll();
  const currentEntries = getEntries();
  const roamingEntries = currentEntries.filter((e) => {
    const cs = worldState.characterStates[e.build?.buildId];
    return cs?.state === "roaming" && e.build && e.progress;
  });
  const eventResults = roamingEntries.length > 0
    ? await applyPreBattleEvents(roamingEntries)
    : { logs: [], details: [] };
  await refreshAll();

  // 4. 检测相邻单挑
  const duelPairs = detectAdjacentDuels(worldState, builds);

  // 5. 保存世界状态
  await state.storage.putWorldState(state.worldState);

  return { garrisonResults, eventResults, duelPairs };
}
```

- [ ] **Step 3.3：手动按钮改为调用 `runSeasonAdvance()`**

将 `dom.advanceSeasonBtn` 的事件处理器（第 374-423 行）替换为：

```js
dom.advanceSeasonBtn?.addEventListener("click", async () => {
  if (state.seasonDuelQueue?.length > 0 || state.seasonSiegePending) return;
  const { garrisonResults, eventResults, duelPairs } = await runSeasonAdvance();
  state.pendingBattle = null;
  state.battle = null;
  setBattleSurfaceState({ showPrelude: true, showCanvas: false });
  renderSeasonPrelude(garrisonResults, eventResults, duelPairs);
  setBattleControlState({ pauseDisabled: true, resetDisabled: false });
  document.getElementById("battle-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setWorldBattleOverlay(true);
});
```

原有 handler 内部约 50 行的 inline 逻辑全部删除。

- [ ] **Step 3.4：重构 fast-sim season 分支**

将 `runFastSimulationStep` 中 `action?.type === "season"` 的分支（第 566-598 行，共约 33 行）替换为：

```js
    if (action?.type === "season") {
      const { garrisonResults, eventResults, duelPairs } = await runSeasonAdvance();
      // 渲染时节结算面板（快速展示结果）
      state.pendingBattle = null;
      state.battle = null;
      setBattleSurfaceState({ showPrelude: true, showCanvas: false });
      renderSeasonPrelude(garrisonResults, eventResults, duelPairs);
      setWorldBattleOverlay(true);
      // 立刻自动触发 onConfirm 逻辑（不等用户点击，与 startNextTournamentMatch 节奏相同）
      if (duelPairs.length > 0) {
        state.seasonDuelQueue = [...duelPairs];
        state.seasonSiegePending = true;
        const next = state.seasonDuelQueue.shift();
        startSeasonDuel(next);
      } else {
        state.seasonSiegePending = false;
        runSeasonSiege();
      }
      return;
    }
```

- [ ] **Step 3.5：提交**

```bash
git add src/app.js
git commit -m "feat: 提取 runSeasonAdvance()，fast-sim season 步骤走完整时节流程并自动确认"
```

---

## Task 4：攻城战视觉队列（`runSeasonSiege` 重构 + `startNextSiegeBattle`）

**Files:**
- Modify: `src/world-siege.js:70-104`（export `injureCombatants`, `injureGarrisonedAt`）
- Modify: `src/app.js` — 顶部导入；`runSeasonSiege`（第 2394 行）；新增 `startNextSiegeBattle`；`applyBattleRewards` 的 finally 块（第 2092 行）和 fastSimMeta 调用（第 2087 行）
- Modify: `src/app.js:555-560`（fast-sim 循环加攻城队列检测）

- [ ] **Step 4.1：导出 world-siege.js 中的工具函数**

在 `src/world-siege.js` 第 70 行，将 `injureCombatants` 和 `injureGarrisonedAt` 从私有函数改为 export：

```js
export function injureCombatants(worldState, combatants, factionKey) {
  // ... 原有函数体不变
}
```

```js
export function injureGarrisonedAt(worldState, cityId, factionKey) {
  // ... 原有函数体不变
}
```

- [ ] **Step 4.2：补充 app.js 顶部导入**

在 `src/app.js` 顶部，确认/添加以下导入（若已有则跳过）：

```js
import {
  selectCombatants,
  checkExtinctionWar,
  injureCombatants,
  injureGarrisonedAt,
} from "./world-siege.js";
import { transferCity, FACTION_IDS } from "./faction-state.js";
import { addWorldLog } from "./world-tick.js";
import { INITIAL_CITIES } from "./world-map.js";
import { WORLD_CITY_TIERS } from "./config.js";
```

（注意：`runOrdinarySiege`、`runExtinctionWar` 可以保留导入但不再作为主路径；`checkConnectivity` 应已导入。）

- [ ] **Step 4.3：重构 `runSeasonSiege()`**

将 `src/app.js` 第 2394 行的 `runSeasonSiege` 整体替换：

```js
async function runSeasonSiege() {
  const builds = await state.storage.getAllBuilds();
  let ws = ensurePrecomputed(state.worldState);

  // 门派 AI 决定攻城事件
  const { worldState: wsS, siegeEvents } = runSiegeAI(ws, builds);
  ws = wsS;

  // 构建攻城战队列
  state.siegeBattleQueue = [];
  for (const evt of siegeEvents) {
    const attackerFaction = evt.factionId;
    const cityId = evt.cityId;
    const defenderFaction = ws.cities.find((c) => c.id === cityId)?.faction || null;

    const atkBuilds = builds.filter((b) => (b.faction?.key || b.faction) === attackerFaction);
    const defBuilds = defenderFaction
      ? builds.filter((b) => (b.faction?.key || b.faction) === defenderFaction)
      : [];

    const attackerBuilds = selectCombatants(atkBuilds, ws.characterStates, 3, 1 / 3);
    const defenderBuilds = selectCombatants(defBuilds, ws.characterStates, 5, 1 / 3);

    state.siegeBattleQueue.push({
      type: "ordinary",
      attackerFaction,
      defenderFaction,
      cityId,
      attackerBuilds,
      defenderBuilds,
    });
  }

  // 检测灭门战
  const extWar = checkExtinctionWar(ws);
  if (extWar) {
    const defBuilds = builds.filter((b) => (b.faction?.key || b.faction) === extWar.targetFaction);
    const allAttackerBuilds = [];
    for (const { factionId, citiesHeld } of extWar.attackers) {
      const fBuilds = builds.filter((b) => (b.faction?.key || b.faction) === factionId);
      const ratio = citiesHeld.length >= 3 ? 1.0 : citiesHeld.length === 2 ? 2 / 3 : 1 / 3;
      const selected = selectCombatants(fBuilds, ws.characterStates, 3, ratio);
      allAttackerBuilds.push(...selected);
    }
    // 进攻方声望清零（预处理）
    const newFactionStats = { ...ws.factionStats };
    for (const { factionId } of extWar.attackers) {
      newFactionStats[factionId] = { ...newFactionStats[factionId], prestige: 0 };
    }
    ws = { ...ws, factionStats: newFactionStats };

    state.siegeBattleQueue.push({
      type: "extinction",
      targetFaction: extWar.targetFaction,
      attackers: extWar.attackers,
      attackerBuilds: allAttackerBuilds,
      defenderBuilds: [...defBuilds],
    });
  }

  state.worldState = ws;
  await state.storage.putWorldState(state.worldState);
  startNextSiegeBattle();
}
```

- [ ] **Step 4.4：实现 `startNextSiegeBattle()`**

在 `runSeasonSiege` 函数之后，添加：

```js
async function startNextSiegeBattle() {
  if (state.siegeBattleQueue.length === 0) {
    // 所有攻城战结束：连通性检查，刷新地图
    const builds = await state.storage.getAllBuilds();
    state.worldState = checkConnectivity(state.worldState, builds);
    await state.storage.putWorldState(state.worldState);
    setWorldBattleOverlay(false);
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState, getEntries());
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState, state.chronicle);
    // 无尽推演：队列清空时统一推进 fastSimMeta
    if (state.fastSim.enabled && state.fastSim.mode === "endless") {
      await saveFastSimMeta(advanceEndlessFastSimMeta(state.fastSimMeta));
    }
    return;
  }

  const siege = state.siegeBattleQueue.shift();
  state.currentSiege = siege;

  const allEntries = getEntries();
  const participants = [...siege.attackerBuilds, ...siege.defenderBuilds];
  const entries = participants
    .map((b) => allEntries.find((e) => e.build?.buildId === b.buildId))
    .filter(Boolean);

  if (entries.length < 2) {
    // 参战弟子不足，随机结算兜底
    state.currentSiege = null;
    if (siege.type === "ordinary") {
      const builds = await state.storage.getAllBuilds();
      state.worldState = runOrdinarySiege(
        state.worldState, builds, siege.attackerFaction, siege.cityId
      );
      await state.storage.putWorldState(state.worldState);
    }
    startNextSiegeBattle();
    return;
  }

  setWorldBattleOverlay(true);

  const competitionType = siege.type === "extinction" ? "extinction" : "siege";
  state.battle = createBattleRuntime({
    entries,
    skills: state.skills,
    equipment: state.equipment,
    statuses: state.statuses,
    factionWins: state.winSummary?.byFaction || {},
    speed: Number(dom.speedSelect.value),
    cameraMode: dom.cameraSelect.value,
    competitionType,
    defenderFactionKey: siege.type === "extinction" ? siege.targetFaction : null,
  });

  state.activeBattleMode = "chaos";
  state.pendingBattle = null;
  setBattleSurfaceState({ showPrelude: false, showCanvas: true });
  setBattleControlState({
    chaosDisabled: true,
    tournamentDisabled: true,
    explorationDisabled: true,
    pauseDisabled: false,
    resetDisabled: false,
  });
  await refreshAll();
}
```

- [ ] **Step 4.5：在 `applyBattleRewards` 中处理攻城结果**

**修改 fastSimMeta 调用（第 2087 行）**：

将：
```js
    if (state.fastSim.enabled && state.fastSim.mode === "endless" && !isSeasonDuel) {
      await saveFastSimMeta(advanceEndlessFastSimMeta(state.fastSimMeta));
    }
```

改为（攻城战也不触发，在队列清空时统一触发）：
```js
    const isSiegeBattle = state.currentSiege !== null;
    if (state.fastSim.enabled && state.fastSim.mode === "endless" && !isSeasonDuel && !isSiegeBattle) {
      await saveFastSimMeta(advanceEndlessFastSimMeta(state.fastSimMeta));
    }
```

**修改声望发放（第 2054 行）**：

将：
```js
    const isSeasonDuel = state.seasonSiegePending;
    if (state.battle.winner && state.worldState && !isSeasonDuel) {
      state.worldState = applyJianghuPrestige(state.worldState, state.battle.winner.key);
```

改为：
```js
    const isSeasonDuel = state.seasonSiegePending;
    const isSiegeBattle = state.currentSiege !== null;
    if (state.battle.winner && state.worldState && !isSeasonDuel && !isSiegeBattle) {
      state.worldState = applyJianghuPrestige(state.worldState, state.battle.winner.key);
```

**修改 finally 块（第 2092 行之后）**：

在现有的单挑队列/攻城 pending 处理之后，在 `setWorldBattleOverlay(false)` 之前，插入攻城结算块：

```js
  } finally {
    state.rewardProcessing = false;
    // 时节单挑队列
    if (state.seasonDuelQueue?.length > 0) {
      const next = state.seasonDuelQueue.shift();
      startSeasonDuel(next);
      return;
    }
    if (state.seasonSiegePending) {
      state.seasonSiegePending = false;
      runSeasonSiege();
      return;
    }
    // 攻城战队列：结算当前攻城结果
    if (state.currentSiege) {
      const siege = state.currentSiege;
      state.currentSiege = null;
      const winnerKey = state.battle?.winner?.key;
      const builds = await state.storage.getAllBuilds();

      if (siege.type === "ordinary") {
        if (winnerKey === siege.attackerFaction) {
          if (siege.defenderFaction) {
            state.worldState = injureGarrisonedAt(state.worldState, siege.cityId, siege.defenderFaction);
            state.worldState = injureCombatants(state.worldState, siege.defenderBuilds, siege.defenderFaction);
          }
          state.worldState = {
            ...state.worldState,
            cities: transferCity(state.worldState.cities, siege.cityId, siege.attackerFaction),
          };
          state.worldState = addWorldLog(state.worldState, `攻城战：${siege.attackerFaction} 占领城池！`);
        } else {
          state.worldState = injureCombatants(state.worldState, siege.attackerBuilds, siege.attackerFaction);
          state.worldState = addWorldLog(state.worldState, `攻城战：${siege.attackerFaction} 攻城失败！`);
        }
      } else if (siege.type === "extinction") {
        // 防守方参战弟子全员重伤（无论胜负）
        state.worldState = injureCombatants(state.worldState, siege.defenderBuilds, siege.targetFaction);

        if (winnerKey === siege.targetFaction) {
          // 防守方守住：三大城归防守方，进攻方弟子重伤
          const largeCityIds = INITIAL_CITIES
            .filter((c) => c.faction === siege.targetFaction && c.tier === WORLD_CITY_TIERS.LARGE)
            .map((c) => c.id);
          let cities = [...state.worldState.cities];
          for (const cid of largeCityIds) cities = transferCity(cities, cid, siege.targetFaction);
          state.worldState = { ...state.worldState, cities };
          for (const { factionId } of siege.attackers) {
            const atkBuilds = siege.attackerBuilds.filter(
              (b) => (b.faction?.key || b.faction) === factionId
            );
            state.worldState = injureCombatants(state.worldState, atkBuilds, factionId);
          }
          state.worldState = addWorldLog(state.worldState, `灭门战：${siege.targetFaction} 守住门派！`);
        } else {
          // 进攻方胜：winner 取 HQ，失败进攻方重伤，防守方弟子分配
          const hqId = `${siege.targetFaction}-hq`;
          state.worldState = {
            ...state.worldState,
            cities: transferCity(state.worldState.cities, hqId, winnerKey),
          };
          const loserFactions = siege.attackers
            .map((a) => a.factionId)
            .filter((f) => f !== winnerKey);
          for (const fid of loserFactions) {
            const fBuilds = siege.attackerBuilds.filter(
              (b) => (b.faction?.key || b.faction) === fid
            );
            state.worldState = injureCombatants(state.worldState, fBuilds, fid);
          }
          const defBuilds = siege.defenderBuilds;
          const half = Math.floor(defBuilds.length / 2);
          const joinWinner = defBuilds.slice(0, half);
          const joinOthers = defBuilds.slice(half);
          const otherFactions = FACTION_IDS.filter(
            (f) => f !== siege.targetFaction && f !== winnerKey
          );
          const factionChanges = [];
          for (const b of joinWinner) {
            factionChanges.push({ buildId: b.buildId, newFaction: winnerKey });
          }
          for (let i = 0; i < joinOthers.length; i++) {
            const targetOther = otherFactions.length > 0
              ? otherFactions[i % otherFactions.length]
              : winnerKey;
            factionChanges.push({ buildId: joinOthers[i].buildId, newFaction: targetOther });
          }
          await applyFactionChanges(factionChanges, builds);
          state.worldState = addWorldLog(
            state.worldState,
            `灭门战结束：${winnerKey} 胜出，${siege.targetFaction} 覆灭！`
          );
        }
      }

      await state.storage.putWorldState(state.worldState);
      startNextSiegeBattle();
      return;
    }

    setWorldBattleOverlay(false);
    renderWorldMap(dom.worldMapCanvas, state.worldState, state.worldViewState, getEntries());
    renderArbiterPanel(dom.worldArbiterPanel, state.worldState, state.chronicle);
  }
```

（注意：原有 `finally` 块里的最后三行 `setWorldBattleOverlay`/`renderWorldMap`/`renderArbiterPanel` 保留在最后，攻城结算分支提前 `return`。）

- [ ] **Step 4.6：fast-sim 循环加攻城队列检测**

在 `runFastSimulationStep` 中，在 `state.battle` 检测块（第 555-560 行）之后，添加：

```js
    // 攻城战队列进行中：等待 applyBattleRewards 触发 startNextSiegeBattle
    if (state.currentSiege || state.siegeBattleQueue.length > 0) return;
```

- [ ] **Step 4.7：提交**

```bash
git add src/app.js src/world-siege.js
git commit -m "feat: 攻城战排队进入真实战场，灭门战单场多派混战，fastSimMeta 在队列清空时推进"
```

---

## Task 5：验收测试

- [ ] **Step 5.1：手动时节推进完整流程**

打开浏览器，进入世界地图。点击"推进时节"按钮：
- 时节结算面板弹出（驻守XP/游历/单挑三段）
- 若有单挑，点确认后逐场进入战场
- 单挑完成后自动进入攻城战（在战场 Canvas 上显示）
- 攻城战结束后城市归属更新，地图刷新

- [ ] **Step 5.2：灭门战 AI 阶段**

手动制造灭门战条件（某门派三座大城全被占），触发灭门战：
- 阶段一：所有进攻方集火防守方（进攻方之间不互相攻击）
- 防守方全灭后：各进攻方门派互相攻击
- 结束后 HQ 易主，弟子分配

- [ ] **Step 5.3：无尽推演循环**

启动无尽推演：
- season 步骤显示时节结算面板（快速闪过），然后自动开始单挑/攻城
- 攻城战在战场上显示，完成后地图刷新
- fastSimMeta 在攻城队列清空后推进（不是每场战斗后）
- 推演循环正常：season → chaos → ... → 武道会/排位赛

- [ ] **Step 5.4：仲裁面板**

世界地图右侧仲裁面板底部显示近期大事记条目（有 chronicle 记录时），无 chronicle 时显示"江湖故事正在酝酿中…"。

---

## 关键注意事项

1. **`applyBattleRewards` 中的 `isSiegeBattle` 检测时机**：`state.currentSiege` 在 `finally` 块里被清空为 `null`，因此 `isSiegeBattle` 必须在 `finally` 块执行前（主逻辑区）捕获，不能在 finally 块里再读。在 `resolveChaosBloodlineTasks` 调用之前定义：`const isSiegeBattle = state.currentSiege !== null;`

2. **`runOrdinarySiege`/`runExtinctionWar` 保留但仅作兜底**：原有随机结算函数仍保留，在参战弟子不足时作为兜底。正常流程完全走视觉战场路径。

3. **`competitionType: "siege"` 的 winner 是 faction 对象**：`battle.winner.key` 是门派 key（`"qingyun"`, `"demon"` 等）。在攻城结算中用 `winnerKey === siege.attackerFaction` 判断进攻方是否获胜。

4. **`finally` 块中不能使用 `await`**（JavaScript 限制）：需将 `finally` 块中的异步操作（`await state.storage.putWorldState`、`await applyFactionChanges`）提到正确位置，或将 finally 块中的 siege 结算提取为单独的 async 函数。实际上 `finally` 块可以包含 `await`（async 函数的 finally 可以 await），所以这不是问题——保持原有模式即可。
