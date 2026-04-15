# 攻击动画强化设计文档

**日期**: 2026-03-31  
**版本**: v1.0  
**范围**: `src/battle-system.js` 的动画系统扩展

---

## 目标

在现有动画基础上，分三个维度强化攻击动画：
1. **C（首要）** — 视觉特效本身更丰富：刀光残影、命中冲击环、闪避残影
2. **A（次要）** — 攻击者发起攻击时有轻微前冲位移
3. **B（次要）** — 被击者受击时有轻微抖动反馈

**设计约束**：
- 特效风格：轻度差异（暴击稍亮稍大，闪避有残影，不夸张）
- 动画时长：与攻速同步（TTL = attackInterval × 0.4，clamp [0.10, 0.45]s）
- 暂不区分派系/品质，但保留接口供未来扩展
- 不影响 fast-sim.js 的无渲染路径

---

## 一、动画数据结构扩展

### 现有动画对象结构

```js
{
  type,      // 'projectile' | 'slash' | 'radial' | 'trail'
  kind,      // 'arrow' | 'heavy-arrow' | 'orb' | 'flare'
  x, y,      // 起点坐标
  tx, ty,    // 终点坐标（projectile/slash 用）
  ttl,       // 剩余生命
  maxTtl,    // 初始生命
  color,     // 主色
  r,         // 半径（projectile/radial 用）
  w,         // 线宽（slash 用）
}
```

### 新增字段（可选，向后兼容）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `grade` | string | `null` | 技能品质（'E'~'SSS'），**预留，暂不使用** |
| `faction` | string | `null` | 派系 ID，**预留，暂不使用** |
| `isCrit` | boolean | `false` | 是否暴击，影响 impact 环颜色和大小 |
| `isDodge` | boolean | `false` | 是否闪避，跳过 impact，触发 ghost |
| `trailFrames` | array | `null` | slash-trail 的残影帧（由渲染器内部生成，不由调用者填充） |

### 新增 kind 值

| kind | 所属 type | 说明 |
|------|-----------|------|
| `slash-trail` | `slash` | 刀光残影序列（在主 slash 渲染内部处理，不单独 push） |
| `impact` | `radial` | 命中瞬间的冲击环 |
| `ghost` | `ghost`（新 type） | 闪避残影圆 |

---

## 二、新视觉特效规格

### 2.1 刀光残影（slash-trail）

**触发条件**：近战攻击（role === 'melee'）的 slash 动画，进度 > 60%  
**实现方式**：在 `drawAnimations()` 的 slash 渲染分支内，额外绘制 3 条弧线残影

| 残影帧 | 角度偏移 | α 值 |
|--------|---------|------|
| 帧 1 | +8° | 0.40 |
| 帧 2 | +16° | 0.25 |
| 帧 3 | +24° | 0.10 |

偏移方向：沿攻击弧线法线方向散开，不单独占用 TTL，随主 slash 消亡。

### 2.2 命中冲击环（impact）

**触发条件**：任意攻击命中（非闪避），在 `performBasicAttack()` / `applySkill()` 命中路径下 push  
**实现**：新调用 `pushImpactAnimation(battle, x, y, isCrit, ttlOverride)`

| 属性 | 普通命中 | 暴击 |
|------|---------|------|
| 初始半径 | 0 | 0 |
| 最大半径 | `1.2 × layout.hexRadius` | `1.7 × layout.hexRadius` |
| 颜色 | 白色（rgba(255,255,255,0.7)） | 金黄色（#FFD700，α=0.85） |
| 线宽 | 1.5px → 0.5px（随进度衰减） | 2.5px → 0.8px |
| TTL | attackInterval × 0.25，clamp [0.08, 0.20]s | 同左 × 1.3 |

### 2.3 闪避残影（ghost）

**触发条件**：物理闪避（evade 路径），在被击者坐标 push，跳过 impact  
**实现**：新调用 `pushGhostAnimation(battle, x, y, color, ttlOverride)`

| 属性 | 值 |
|------|-----|
| 形状 | 与被击者实体圆同半径的填充圆 |
| 初始 α | 0.50 |
| 末尾 α | 0.0（线性衰减） |
| 颜色 | 被击者的 `gradeTint` 颜色（与实体同色） |
| TTL | 0.18s（固定，不随攻速变化） |

---

## 三、位移动画扩展

现有 `moveAnim`（六边形坐标空间，单段）不适合做前冲+回弹的双段动画。新增一个轻量的像素空间 `nudgeAnim` 系统，与 `moveAnim` 并存互不干扰。

### nudgeAnim 结构

```js
entity.nudgeAnim = {
  offsetX: number,   // 像素空间偏移量（方向分量 × 距离）
  offsetY: number,
  phase: 'out',      // 'out'（前冲/偏移）| 'back'（回弹）
  outDuration: number,
  backDuration: number,
  elapsed: 0
}
```

渲染时在 `drawEntities()` 中将 `nudgeAnim` 的当前偏移叠加到实体像素坐标上。

### 3.1 攻击者前冲

**触发时机**：攻击发出时（与主动画 push 同时）

| 职业 | 前冲距离（像素） | out 时长 | back 时长 |
|------|----------------|---------|----------|
| 近战 (melee) | `layout.hexRadius × 0.30` | `attackInterval × 0.12` | `attackInterval × 0.12` |
| 远射 (ranged) | `layout.hexRadius × 0.15` | `attackInterval × 0.10` | `attackInterval × 0.10` |
| 法术 (caster) | 0（不设置 nudgeAnim） | — | — |

前冲方向：攻击者像素坐标 → 目标像素坐标的单位向量。

### 3.2 被击者抖动

**触发时机**：命中时（非闪避）  
**方向**：从目标像素坐标 → 攻击者像素坐标的单位向量（被打飞方向）

| 属性 | 值 |
|------|-----|
| 偏移距离 | `layout.hexRadius × 0.15` |
| out 时长 | 0.05s |
| back 时长 | 0.07s |

闪避时跳过抖动。

---

## 四、TTL 与攻速同步规则

```js
// 在攻击事件处理处计算（entity = 攻击者实体对象）
const attackInterval = entity.derived.attackInterval ?? 1.0; // 秒
const baseTtl = Math.max(0.10, Math.min(0.45, attackInterval * 0.4));

// 各动画使用 baseTtl 或其派生值
// slash / projectile: baseTtl
// impact:            attackInterval * 0.25，clamp [0.08, 0.20]s
// ghost:             0.18s（固定）
// nudgeAnim(攻击者): attackInterval * 0.12（每段）
// nudgeAnim(被击者): 0.05s out + 0.07s back（固定）
```

---

## 五、调用接口预留

所有 push 函数签名统一增加可选的 `opts` 参数对象：

```js
pushSlashAnimation(battle, attacker, defender, opts)
pushProjectileAnimation(battle, attacker, defender, kind, opts)
pushImpactAnimation(battle, x, y, opts)   // 新函数
pushGhostAnimation(battle, x, y, color, opts)  // 新函数

// opts 结构（所有字段可选）：
{
  isCrit: false,
  isDodge: false,
  grade: null,      // 预留
  faction: null,    // 预留
  ttlOverride: null // 手动覆盖 TTL
}
```

---

## 六、不影响范围

- **fast-sim.js**：无渲染路径，不调用任何 push 函数，完全不受影响
- **trial-app.js**：通过相同 battle-system.js 接口，自动受益
- **存档格式**：动画对象不持久化，无 schema 变更
- **config.js**：不需要新增常量（TTL 从 attackInterval 派生）

---

## 七、修改文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/battle-system.js` | 主要改动：新增 `pushImpactAnimation`、`pushGhostAnimation`、`nudgeAnim` 系统；扩展 slash/impact 渲染分支；修改命中/闪避路径调用点 |

仅改动一个文件。

