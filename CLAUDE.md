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
├── index.html              # 主游戏页面
├── trial.html              # 1v1 试炼页面
├── app.js                  # 根入口（仅引导模块）
├── styles.css              # 全局样式
├── package.json            # 项目元数据
├── README.md               # 快速说明
├── CLAUDE.md               # 本文件
│
├── src/                    # 核心逻辑（约 30 个模块）
│   ├── app.js              # 主编排器：UI 事件绑定、状态管理（154 KB）
│   ├── battle-system.js    # 战斗引擎：六边形寻路、AI 状态机、伤害计算（85 KB）
│   ├── game-data.js        # 角色生成：属性缩放、技能获取、升级、荣耀（44 KB）
│   ├── character-ui.js     # 角色卡片与详情面板渲染（29 KB）
│   ├── image-tools.js      # 照片分析：感知哈希、颜色采样、特征码生成（29 KB）
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
│   ├── config.js           # 游戏常量与配置
│   ├── rule-tables.js      # 属性缩放与潜力映射表
│   ├── entry-utils.js      # 角色录入工具
│   ├── prebattle.js        # 战前随机事件系统
│   ├── ranking-history.js  # 历史排名快照
│   ├── chronicle-ui.js     # 大事记可视化
│   ├── trial-app.js        # 试炼场实现
│   ├── exploration-ui.js   # 秘境 UI
│   ├── utils.js            # 通用工具函数
│   ├── role-save.js        # 角色存档功能
│   ├── role-save-actions.js# 存取档操作
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
CRIT_CHANCE = 0.05       // 暴击率
CRIT_DAMAGE_MULTIPLIER = 1.5
AVATAR_SIZE = 192        // 头像像素
BATTLE_LOG_LIMIT = 20    // 战斗日志条数上限
```

**品质等级**（8 级）：E → D → C → B → A → S → SS → SSS

**六大派系**：教廷（平原）、魔教（熔岩）、少林（平原）、青云门（森林）、仙岛（水域）、魂殿（岩石）

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

### 数据持久化
- IndexedDB 10 个存储表（capBases, capBuilds, capProgress, skills, equipment, events, bloodlines, statuses, meta, legacyCaps）
- File System Access API 手动存档/读档
- 历史数据迁移工具

### 推演系统
- **快速推演**：自动跑完竞标赛/探索/排位
- **无尽推演**：循环 30 阶段模式（10 混战 + 1 探索 + 10 混战 + 1 竞标赛）

### 江湖大事记
- 重大事件记录（血脉获取、竞标名次、排位结果）
- 角色个人小传（传记）
- 等级里程碑记录（每 5 级）
- 最多 80 条，智能淘汰旧记录

---

## 待完成功能（推断）

当前代码库**无显式 TODO 注释**，以下为架构层面可扩展的方向：

1. **音频系统** — 全程无音效，战斗事件仅文字/视觉反馈
2. **地形图块精灵** — 战场地形目前仅 Canvas 绘色，无贴图资源
3. **AI 配置 UI** — 强制焦点系统存在但无法在界面配置
4. **装备多样性** — 装备名称按职业/槽位固定，可扩充变体
5. **多人/联机** — 当前纯单机，无网络架构
6. **角色交易/经济** — 装备无流通机制
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
