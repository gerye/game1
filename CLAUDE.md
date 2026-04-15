# 瓶盖派系战争 (Bottle Cap Faction War) — CLAUDE.md

## 项目概述

浏览器端纯前端 RPG 游戏，玩家上传现实瓶盖照片，系统自动提取头像与特征码，生成具有属性、技能、装备与成长机制的角色，并模拟派系大战、竞标赛、排位赛等多种对战模式。

- **版本**: v1.1.0
- **入口**: `index.html`（主界面）、`trial.html`（1v1 试炼）
- **无后端**：完全客户端运行，数据存储于 IndexedDB

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 语言 | JavaScript ES6+ 模块 |
| 渲染 | Canvas 2D API（六边形格战场） |
| UI | 原生 DOM 操作，无框架 |
| 持久化 | IndexedDB（主）+ File System Access API（手动存档） |
| 图像处理 | Canvas 感知哈希 + 颜色分析 |
| 构建工具 | 无，直接浏览器运行 |

---

## 目录结构

```
game/
├── index.html              # 主游戏页面（页面顺序：世界地图→战场→角色门派→角色录入）
├── trial.html              # 1v1 试炼页面
├── app.js                  # 根入口（仅引导模块）
├── styles.css              # 全局样式
├── package.json            # 项目元数据
├── README.md               # 快速说明
├── CLAUDE.md               # 本文件
│
├── src/                    # 核心逻辑（约 35 个模块）
│   ├── app.js              # 主编排器：UI 事件绑定、状态管理
│   ├── battle-system.js    # 战斗引擎：六边形寻路、AI 状态机、伤害计算
│   ├── game-data.js        # 角色生成：属性缩放、技能获取、升级、荣耀
│   ├── character-ui.js     # 角色卡片与详情面板渲染
│   ├── image-tools.js      # 照片分析：感知哈希、颜色采样、特征码生成
│   ├── status-effects.js   # 状态效果数据库（灼烧/麻痹/睡眠等 12+ 种）
│   ├── tournament-ui.js    # 竞标赛树形图渲染
│   ├── ranking-ui.js       # 排行榜 UI
│   ├── ranking-utils.js    # 瑞士积分制算法
│   ├── tournament-utils.js # 单败淘汰赛逻辑
│   ├── exploration-utils.js# 秘境探索系统
│   ├── fast-sim.js         # 快速/无尽推演
│   ├── chronicle.js        # 江湖大事记（历史记录）
│   ├── bloodlines.js       # 血脉特殊能力
│   ├── bloodline-tasks.js  # 血脉任务系统
│   ├── equipment-data.js   # 装备数据库
│   ├── database-ui.js      # 数据库查看面板
│   ├── storage.js          # IndexedDB 抽象层
│   ├── storage-normalizer.js # 数据迁移工具
│   ├── config.js           # 游戏常量与配置（WORLD_MAP_RADIUS=40）
│   ├── rule-tables.js      # 属性缩放与潜力映射表
│   ├── entry-utils.js      # 角色录入工具
│   ├── prebattle.js        # 战前/时节随机事件系统；renderSeasonPrelude
│   ├── ranking-history.js  # 历史排名快照
│   ├── chronicle-ui.js     # 大事记可视化
│   ├── trial-app.js        # 试炼场实现
│   ├── exploration-ui.js   # 秘境 UI
│   ├── utils.js            # 通用工具函数
│   ├── role-save.js        # 角色存档功能
│   ├── role-save-actions.js# 存取档操作
│   │
│   │   ── 江湖世界地图模块（新增）──
│   ├── world-map.js        # 城市布局（42座）、坐标、Voronoi领地预计算、hexDistance
│   ├── world-ui.js         # 大地图 Canvas 渲染：六边形格、城市建筑、弟子图标
│   ├── world-tick.js       # 时节推进、角色状态机（驻守/游历）、detectAdjacentDuels
│   ├── world-events.js     # 攻城事件、声望事件、runSiegeAI、applySiegeResult
│   ├── faction-state.js    # 门派金币/声望状态（FACTION_IDS 统一用新ID）
│   └── BATTLE_STATE_MACHINE.md # 战斗 AI 状态机文档
│
├── docs/
│   └── GAME_SYSTEM.md      # 完整游戏系统设计文档
│
├── pic/                    # 46 张示例瓶盖图片
└── saves/                  # 存档目录（JSON 格式）
```

---

## 核心游戏常量（config.js）

```javascript
GAME_VERSION = "1.1.0"
CHARACTER_ARCH_VERSION = 4
DB_VERSION = 10
MAX_LEVEL = 50
HEX_RADIUS = 13          // 战场半径（格数）
WORLD_MAP_RADIUS = 40    // 大地图半径（格数，城市坐标最大半径30）
CRIT_CHANCE = 0.05       // 暴击率
CRIT_DAMAGE_MULTIPLIER = 1.5
AVATAR_SIZE = 192        // 头像像素
BATTLE_LOG_LIMIT = 20    // 战斗日志条数上限
```

**品质等级**（8 级）：E → D → C → B → A → S → SS → SSS

**六大派系 faction ID（新，已统一）**：
| 门派 | faction key | HQ 坐标 |
|------|------------|---------|
| 青云门 | `qingyun` | (0,-30) 正北 |
| 仙岛 | `isle` | (30,-30) 东北 |
| 少林 | `shaolin` | (30,0) 正东 |
| 教廷 | `palace` | (0,30) 正南 |
| 魔教 | `demon` | (-30,30) 西南 |
| 魂殿 | `soul` | (-30,0) 正西 |

> ⚠️ 旧代码使用 `jiaoting/mojiao/xiandao/hundian`，已全面替换。任何新代码只能用新 key。

**三种职业**：近战 / 远射 / 法术

---

## 已完成功能

### 角色系统
- 照片上传 + 感知哈希提取唯一特征码（CAP-XXXXXXXX）
- 手动属性录入（颜色数、复杂度、对称性）
- 程序化角色生成（派系、职业、潜力品质）
- 五项基础属性：力量、体质、敏捷、智力、精神
- 衍生属性：物理/魔法攻击/防御、最大 HP
- 50 级经验升级系统
- 三槽装备（武器/防具/饰品）

### 技能系统
- 8 品质等级技能（E-SSS），CD 机制（10~20 秒）
- 多种技能族：强力攻击、灼烧、麻痹、睡眠、属性强化
- 技能附带状态效果；智力+精神影响 CD 缩减

### 战斗系统
- 实时六边形格战场（半径 13）
- 六方向移动 + 碰撞检测
- 派系地形亲和（5 种地形：平原/水域/森林/岩石/熔岩）
- AI 三阶段状态机：搜索 → 接敌 → 战斗
- 5 分钟超时兜底判定
- 暴击系统（5% 概率，1.5 倍伤害）
- 动画队列与视觉特效

### 游戏模式
| 模式 | 说明 |
|------|------|
| 江湖争霸 (Chaos) | 多派系自由乱战 |
| 武道会 (Tournament) | 单败淘汰竞标赛 |
| 江湖排位 (Ranking) | 瑞士积分制 + 淘汰赛（前 12 晋级）|
| 秘境探索 (Exploration) | 分级问答系统 + 品质奖励 |

### 荣耀/成就系统
- 5 种荣耀称号：百战百胜、江湖大派、天之骄子、稍逊风骚、后起之秀
- 逆天改命（命运机制）

### 血脉系统（SSS 稀有度）
- 20+ 种血脉，4 种 SSS 级（任务解锁）：青龙、白虎、朱雀、玄武
- 血脉永久状态效果 + 专属技能赐予
- 血脉任务追踪系统

### 血脉之石饰品系统
- 8 种"血脉残影"饰品，全职业通用，替代旧饰品槽
- SSS 系（S/SS/SSS）：白虎之石（物攻+法攻%）、玄武之石（物防+法防%）、青龙之石（HP%/s回复）、朱雀之石（死亡复活%HP）
- SS 系（S/SS）：烈阳之石（物攻+法攻%）、寒冰之石（物防+法防%）、恶魔之石（HP%/s回复）、天使之石（CD缩减%）
- 效果通过 `stoneEffects` 字段与装备升星系统对接，每星 +5% 效果
- 朱雀之石与血脉死里逃生共存时各触发一次（同一次死亡血脉优先）

### 数据持久化
- IndexedDB 10 个存储表（capBases, capBuilds, capProgress, skills, equipment, events, bloodlines, statuses, meta, legacyCaps）
- File System Access API 手动存档/读档
- 历史数据迁移工具

### 推演系统
- **快速推演（世界地图区）**：12个时节循环，每2节随机结算一场争霸声望，附带攻城AI
- **无尽推演**：循环 30 阶段模式（10 混战 + 1 探索 + 10 混战 + 1 竞标赛）

### 江湖大事记
- 重大事件记录（血脉获取、竞标名次、排位结果）
- 角色个人小传（传记）
- 等级里程碑记录（每 5 级）
- 最多 80 条，智能淘汰旧记录

### 江湖世界地图（新）
- Canvas 大地图：六边形格（半径40），42 座城市，6 门派 HQ 分布在六角
- 城市分三级：HQ（总部）/ 大城（各派3座）/ 小城（18座中立，可被争夺）
- 领地预计算 Voronoi（存入 `worldState.cityTerritories`），控制区填门派色，未控制区米白色
- 弟子图标显示在驻守城市上（圆形头像小徽章）
- **时节推进流程**：
  1. 驻守 → 获得 10% 当级经验
  2. 游历 → 触发奇遇事件（复用战前事件系统）
  3. 相邻敌对角色 → 单挑队列（真实战斗逐场进行）
  4. 在战场区域显示时节结算面板，用户确认后依次单挑
  5. 全部完成后自动结算攻城战，刷新地图
- 攻城 AI：优先占领高防御价值的中立城市，声望充足时可攻打有主城市
- 世界地图控制区按钮：推进时节 / 触发江湖争霸 / 触发武道会 / 触发排位赛 / 快速推演 / 无尽推演
- 江湖争霸不再有战前奇遇事件，直接开战

---

## 当前开发进度（2026-04-15）

### 已完成的近期工作
- ✅ 世界地图 v2：基础大地图渲染、城市建筑 SVG、弟子图标框架
- ✅ 世界地图 v3：faction ID 统一（旧 mojiao/jiaoting 等→新 demon/palace 等）、城市布局重设计（HQ 在六角）、Voronoi 领地预计算、攻城 AI、时节完整循环
- ✅ v3 修复：中立格白色、弟子 cityId 存档迁移、下个时节流程重设计、按钮移动
- ✅ 血脉之石饰品系统（8种石头，SSS/SS两系）

### 待验证（需要打开浏览器测试）
- 弟子图标实际显示效果（icon 大小/位置/颜色是否清晰可见）
- 时节结算面板 UI 样式（prelude-card / prelude-grid CSS 是否适配新内容）
- 单挑队列流程：确认 → 逐场战斗 → 攻城结算完整走通
- 快速推演 12 节循环不卡死

### 已知未完成 / 用户明确提出但尚未实现的功能

1. **大地图弟子移动动画** — 弟子图标目前静止在驻守城市，时节推进后瞬移，无过渡动画
2. **时节结算面板样式** — 新增的 `renderSeasonPrelude` 复用了 `prelude-card` CSS 类，但三段式布局（驻守/游历/单挑）的视觉分隔未专门设计，可能样式粗糙
3. **攻城战可视化** — 攻城目前在后台结算（随机50%胜率），没有在战场区域展示战斗过程
4. **世界地图缩放/平移范围** — 地图半径40但显示窗口较小，HQ 在角落可能需要滚动才能看到，体验待确认
5. **快速推演与世界地图解耦** — `worldFastSimBtn` 中调用了 `fastPickChaosWinner` 但只用了简单随机加权，实际争霸结果没有走真实战斗引擎

---

## 待完成功能

1. **音频系统** — 全程无音效
2. **攻城战场化** — 攻城目前随机结算，未来可接入真实战场（以被攻城市驻守弟子 vs 进攻方）
3. **弟子移动轨迹** — 时节推进时弟子在大地图上有路径动画
4. **AI 配置 UI** — 强制焦点系统存在但无法在界面配置
5. **装备多样性** — 血脉之石品类可继续扩充
6. **多人/联机** — 当前纯单机
7. **技能连携/组合** — 技能彼此独立，无 Combo 系统

---

## 数据架构说明

### 角色数据分层
```
capBases   → 图片特征（哈希、颜色、复杂度）
capBuilds  → 派系/职业/技能/血脉（由 bases 推导）
capProgress→ 等级/经验/荣耀/胜负统计（运行时更新）
equipment  → 装备实例
skills     → 技能实例
```

### 关键设计约定
- 角色唯一 ID：`cap-XXXXXXXX`（8 位十六进制）
- 所有随机均使用哈希种子（`hashString`）确保可复现
- 对象克隆使用 `JSON.parse(JSON.stringify(obj))`，不修改原始数据
- Canvas 渲染优先，UI 层不使用 SVG
- 数据版本号随 schema 变更递增，`storage-normalizer.js` 负责迁移

---

## 开发规范

### 模块职责
- **禁止跨层直接写数据**：UI 模块（`*-ui.js`）只读数据，写入必须经由 `storage.js`
- **`config.js` 是唯一常量源**：魔法数字必须在 config.js 中定义后引用
- **battle-system.js 不依赖 DOM**：战斗逻辑与渲染完全分离，仅接收 Canvas context

### 数据安全
- IndexedDB schema 变更时必须递增 `DB_VERSION` 并在 `storage-normalizer.js` 添加迁移逻辑
- `CHARACTER_ARCH_VERSION` 用于检测存档兼容性，角色数据结构变更时递增

### 代码风格
- ES6 模块系统，`import/export` 语法
- 工厂函数优于类（`createBattleState()`、`buildTournamentState()` 等）
- 事件驱动 UI：通过 `addEventListener` 绑定，不内联事件处理

### 性能约定
- 战斗动画使用队列机制（`animationQueue`），不直接 `requestAnimationFrame` 内堆积逻辑
- 大规模推演使用 `fast-sim.js` 的批处理路径，避免触发 Canvas 渲染

### 存档兼容性
- 手动存档（JSON）包含：bases / builds / progress / equipment / meta
- **不包含**：skills / events / statuses / bloodlines（由代码自动同步）

---

## 参考文档

- `docs/GAME_SYSTEM.md` — 完整游戏机制规格（11 个章节）
- `src/BATTLE_STATE_MACHINE.md` — 战斗 AI 状态机详细说明（9 个章节）
- `saves/README.md` — 存档系统使用说明
