# 无尽推演完整化 + 攻城视觉战场 设计文档

**日期**：2026-04-15  
**状态**：已审批，待实现

---

## 背景

当前无尽推演（endless sim）的 `season` 步骤是一套独立的简化路径：只静默更新世界状态文字，跳过驻守经验、游历奇遇、单挑队列、视觉攻城战。攻城战（普通攻城 + 灭门战）全部用随机种子伪解决，不上战场。世界地图侧边面板底部的"江湖格局日志"显示的是低级的世界状态文字流，不是真正有意义的大事记。

---

## 目标

1. 无尽推演的 season 步骤 = 自动点击手动"推进时节"按钮的完整流程
2. 攻城战（包括普通攻城和灭门战）在战场上真实对决
3. 灭门战为单场特殊多派混战，AI 有阶段切换逻辑
4. 仲裁面板底部改为显示近期江湖大事记

---

## 模块一：season 步骤 → 真实推进时节

### 当前问题

`toggleFastSimulation` 里的 `action?.type === "season"` 分支自己写了一套逻辑，与手动按钮 `dom.advanceSeasonBtn` 的逻辑重复且不完整（缺驻守经验、游历奇遇、单挑检测、面板渲染）。

### 设计

**抽取 `runSeasonAdvance()`**：把手动按钮的完整逻辑搬入此函数：

```
1. advanceSeason(worldState, builds)
2. 结算驻守经验（garrison XP）
3. applyPreBattleEvents(roamingEntries)（游历奇遇）
4. detectAdjacentDuels → 写入 state.seasonDuelQueue
5. state.seasonSiegePending = true
6. 保存世界状态
7. 显示时节结算面板（renderSeasonPrelude）
```

**手动按钮**：改为调用 `runSeasonAdvance()`，行为不变。

**Fast sim season 分支**：
- 调用 `runSeasonAdvance()`（完整流程，含面板渲染）
- 立刻自动确认：若 `seasonDuelQueue.length > 0` → `startSeasonDuel(queue.shift())`；否则 → `runSeasonSiege()`
- 不加任何 delay，与 `startNextTournamentMatch()` 节奏相同
- **删除**原来 fast sim season 分支里的独立实现

### 状态机衔接

Fast sim loop 已有以下检测（不变）：

```js
// battle 进行中 → return（等待）
// battle 结束 → resetBattle()
// seasonDuelQueue 有内容 → startSeasonDuel(next)（已有）
// siegeBattleQueue 有内容 → startNextSiegeBattle()（新增，见模块二）
// 无任何活跃状态 → 执行 runSeasonAdvance() + 自动确认
```

---

## 模块二：攻城战 → 视觉战场

### 当前问题

`runSeasonSiege()` 调用 `runOrdinarySiege` / `runExtinctionWar`，两者内部用 `resolveBattle(seed)` 随机决出胜负，不进战场。

### 新增状态

```js
state.siegeBattleQueue = []   // 待打的攻城场次
state.currentSiege = null     // 当前正在打的攻城上下文
```

每个队列项的结构：

```js
// 普通攻城
{
  type: "ordinary",
  attackerFaction: string,
  defenderFaction: string | null,  // null 表示中立城市
  cityId: string,
  attackerBuilds: Build[],
  defenderBuilds: Build[]
}

// 灭门战（单场，见模块三）
{
  type: "extinction",
  targetFaction: string,
  attackers: { factionId: string, citiesHeld: string[] }[],
  attackerBuilds: Build[],   // 所有进攻方弟子（按 selectCombatants 选出）
  defenderBuilds: Build[]    // 防守方全员
}
```

### 重构 `runSeasonSiege()`

```
1. runSiegeAI(ws, builds) → siegeEvents
2. 对每个 siegeEvent，调 selectCombatants 选出参战弟子，入 siegeBattleQueue
3. checkExtinctionWar(ws)
   - 若触发 → 组建 extinction 队列项，追加到 siegeBattleQueue（放最后）
4. startNextSiegeBattle()
```

`runOrdinarySiege` / `runExtinctionWar` 的**世界状态结算逻辑**（城市易主、重伤写入、faction changes）保留为纯函数，但从"战前随机决出"改为"战后根据 battle.winner 调用"。

### `startNextSiegeBattle()`

```
1. 若 siegeBattleQueue 为空 → checkConnectivity + 刷新地图，结束
2. 取出队首 siege 项，写入 state.currentSiege
3. 查询参战弟子对应的完整 entries（base + build + progress）
4. startChaosBattle(entries, { competitionType: siege.type === "extinction" ? "extinctionWar" : "siege" })
```

### 战斗结束时应用结果

在 `applyBattleRewards` 末尾，检测 `state.currentSiege`：

```
if (state.currentSiege) {
  const siege = state.currentSiege
  state.currentSiege = null
  const winnerKey = state.battle.winner?.key

  if (siege.type === "ordinary") {
    if (winnerKey === siege.attackerFaction) → 城市易主 + 守方重伤
    else → 攻方参战弟子重伤
  }

  if (siege.type === "extinction") → 见模块三

  await state.storage.putWorldState(state.worldState)
  startNextSiegeBattle()   // 处理队列下一场
  return
}
```

---

## 模块三：灭门战 = 单场特殊多派混战

### 设计

灭门战是**一场**战斗，所有进攻方门派 + 防守方全员进入同一战场。

#### Battle System 扩展

在 `createBattleRuntime` 里支持 `competitionType === "extinctionWar"`，附加参数 `defenderFactionKey: string`。

**阶段一（防守方存活时）**：在寻敌函数（`findTarget` / AI 搜索逻辑）里加优先级过滤：

```
若 battle.defenderFactionKey 存在
  且场上仍有 defenderFactionKey 的存活实体
  → 进攻方实体只将 defenderFactionKey 实体计入候选目标
  （进攻方彼此之间不互相攻击）
```

**阶段切换检测**：每帧在 `updateBattleState` 里检测：

```
若 competitionType === "extinctionWar"
  且 defenderFactionKey 实体全部 alive = false
  → 将 battle.defenderFactionKey 清空（或标记 extinctionPhase2）
  → 进攻方各派正常互相攻击（恢复默认多派混战逻辑）
```

**阶段二（防守方全灭后）**：普通多派混战，直到最后一派存活。

#### 灭门战结算（applyBattleRewards 里）

```
const winner = state.battle.winner?.key
const siege = state.currentSiege  // type === "extinction"

// 所有攻击方声望清零（已在 runSeasonSiege 预处理）
// 防守方参战弟子全员重伤（已在战斗中死亡，直接标记）
// 胜者取防守方 HQ（`${siege.targetFaction}-hq`）
// 失败攻击方弟子重伤
// applyFactionChanges（半数归胜者，半数流散）

if (winner === siege.targetFaction) {
  // 防守方守住：三大城归防守方，进攻方弟子重伤
} else {
  // 攻击方 winner 取 HQ，执行 factionChanges
}
```

---

## 模块四：仲裁面板日志 → 近期大事记

### 当前问题

`renderArbiterPanel(container, worldState)` 底部渲染 `worldState.log`，是低级字符串流（"1.1.0:CAP-XXXX 奇遇修炼"等）。

### 设计

修改函数签名：

```js
renderArbiterPanel(container, worldState, chronicle)
```

将底部 `<div class="world-log">` 改为渲染 `chronicle.entries.slice(0, 8)`，样式复用 `chronicle-entry`（`<strong>标题</strong><p>内容</p>`）。若 chronicle 为空则显示占位文字"江湖故事正在酝酿中…"。

所有调用点（app.js 中约 8 处）统一改为：

```js
renderArbiterPanel(dom.worldArbiterPanel, state.worldState, state.chronicle)
```

`worldState.log` 保留（用于 AI 决策调试），只是不再渲染到 UI。

---

## FastSimMeta 推进时机

`saveFastSimMeta(advanceEndlessFastSimMeta(...))` 应在 season 所有子战斗（duels + sieges）**全部完成后**调用一次，而不是每场战斗结束都调用。

- 普通战斗（chaos/tournament/ranking）：沿用现有逻辑（`applyBattleRewards` 里 `!isSeasonDuel` 时调用）
- Season duel：结束时不调用（`isSeasonDuel = state.seasonSiegePending === true`，已有）
- Siege battle：结束时也不调用（检测 `state.currentSiege !== null` 跳过）
- **在 `startNextSiegeBattle()` 发现队列为空时**，若 `state.fastSim.enabled && state.fastSim.mode === "endless"`，则在此处调用 `saveFastSimMeta`

---

## 不在本次范围内

- 攻城战参战人数上限调整（沿用现有 `selectCombatants` 逻辑）
- 攻城战前的奇遇事件
- 灭门战 UI 预告面板（直接开打）
