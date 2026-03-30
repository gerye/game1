# 瓶盖江湖 1.1.0

这是一个以瓶盖角色为核心的本地前端养成与战斗项目。

## 当前核心玩法

- 上传预处理后的单瓶盖图片
- 手动录入 `颜色数 / 复杂度 / 对称度`
- 生成角色、潜力、门派、技能、装备与成长
- 进行：
  - 江湖争霸
  - 天下第一武道会
  - 江湖排位
  - 秘境探索
  - 试炼场 1v1
- 使用：
  - 快速推演
  - 无尽推演
  - 江湖大事记
  - 角色存档导出 / 导入

## 数据分层

- `capBases`
  - 基础信息
  - 图片唯一编码
  - 品牌 / 名字
  - 颜色数 / 复杂度 / 对称度
- `capBuilds`
  - 生成属性
  - 门派
  - 职业
  - 潜力
  - 技能槽
  - 技能
  - 初始装备
- `capProgress`
  - 当前等级、经验、击杀、助攻、死亡
  - 逆天改命
  - 血脉
  - 武道会 / 排位荣誉
  - 小传与任务进度

## 角色存档

角色存档为手动导出 / 导入。

包含：

- `capBases`
- `capBuilds`
- `capProgress`
- `equipment`
- `meta.battleWinSummary`
- `meta.tournamentHall`
- `meta.rankingHall`
- `meta.rankingHistory`
- `meta.jianghuChronicle`
- `meta.fastSimMeta`
- `meta.bloodlineTaskState`

不包含：

- 技能数据库
- 事件数据库
- 状态数据库
- 血脉数据库

## 当前版本重点

- 状态系统已收拢到单一状态库
- 血脉系统已独立
- 排位赛支持瑞士轮 + 淘汰赛
- 历届排位结果可长期查看
- MP 系统已移除，技能改为 CD 驱动

## 主要源码模块

- `src/app.js`：主流程编排
- `src/battle-system.js`：战斗核心
- `src/game-data.js`：角色生成与数值
- `src/image-tools.js`：图片处理
- `src/status-effects.js`：状态库
- `src/bloodlines.js`：血脉库
- `src/ranking-utils.js`：排位规则
- `src/ranking-ui.js`：排位完整对阵页
- `src/character-ui.js`：角色详情与卡片
- `src/database-ui.js`：数据库页面
- `src/storage.js`：本地数据存储
- `src/trial-app.js`：试炼场
