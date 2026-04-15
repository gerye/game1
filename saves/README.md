# 角色存档说明

这个文件夹用于保存角色存档文件。

## 使用方式

1. 在旧电脑上点击“导出角色存档”。
2. 选择当前项目根目录下的 `saves` 文件夹。
3. 系统会在这里写入 `bottle-cap-save.json`。
4. 将整个项目文件夹复制到其他电脑。
5. 在新电脑上点击“从角色存档导入”。
6. 再次选择该电脑上的 `saves` 文件夹。

## 当前角色存档范围

角色存档只保存角色与战场相关进度，不保存规则库。

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

这些规则库会在项目启动时由代码自动同步。
