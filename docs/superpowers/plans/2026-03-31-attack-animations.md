# Attack Animation Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich attack animations in `src/battle-system.js` with slash-trail residual arcs, hit impact rings, dodge ghost residuals, attacker lunge, and defender shake — all synced to attack speed.

**Architecture:** All changes live in `src/battle-system.js`. Three new animation types (`impact`, `ghost`, plus a slash-trail inline branch), a new pixel-space `nudgeAnim` system for entity displacement, and two new push helpers. Existing `battle.animations[]` / `tickVisuals()` / `drawAnimations()` pipeline is extended in-place. `fast-sim.js` is unaffected (it never calls push functions).

**Tech Stack:** Vanilla JS ES6+, Canvas 2D API, existing `clamp`/`lerp`/`project` utilities already imported.

---

## File Map

| File | Changes |
|------|---------|
| `src/battle-system.js` | All changes. Entity init (~line 196), `tickVisuals` (~line 1611), `drawEntities` (~line 1872), `drawAnimations` (~line 1928), `performBasicAttack` (~line 897), `castSkill` (~line 830), `applyDamage` (~line 913), new push helpers (~line 2260+) |

---

### Task 1: Add `nudgeAnim` field to entity initialization and tick it in `tickVisuals`

**Files:**
- Modify: `src/battle-system.js:196` (entity init)
- Modify: `src/battle-system.js:1621` (tickVisuals entity loop)

- [ ] **Step 1: Add `nudgeAnim: null` to entity initialization**

Find this line (around line 196):
```js
    moveAnim: null,
```
Replace with:
```js
    moveAnim: null,
    nudgeAnim: null,
```

- [ ] **Step 2: Add nudgeAnim tick inside the entity loop in `tickVisuals`**

In `tickVisuals`, the entity loop starts at ~line 1621:
```js
  battle.entities.forEach((entity) => {
    if (entity.hp > entity.hpDamageAnchor) {
      entity.hpDamageAnchor = entity.hp;
    }
    if (!entity.moveAnim) {
```

After the entire `if (!entity.moveAnim) { ... }` block (after the `if (t >= 1) entity.moveAnim = null;` and closing brace), add:

```js
    if (entity.nudgeAnim) {
      entity.nudgeAnim.elapsed += dt;
      if (entity.nudgeAnim.phase === 'out' && entity.nudgeAnim.elapsed >= entity.nudgeAnim.outDuration) {
        entity.nudgeAnim.elapsed -= entity.nudgeAnim.outDuration;
        entity.nudgeAnim.phase = 'back';
      } else if (entity.nudgeAnim.phase === 'back' && entity.nudgeAnim.elapsed >= entity.nudgeAnim.backDuration) {
        entity.nudgeAnim = null;
      }
    }
```

- [ ] **Step 3: Verify no syntax errors**

Open `src/battle-system.js` in the browser dev tools or check with: `node --input-type=module < src/battle-system.js 2>&1 | head -5`
(If node unavailable, just open index.html and check the console for errors.)

- [ ] **Step 4: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: add nudgeAnim field and tick to entity system"
```

---

### Task 2: Apply `nudgeAnim` pixel offset in `drawEntities`

**Files:**
- Modify: `src/battle-system.js:1878` (inside `drawEntities` entity loop)

- [ ] **Step 1: Add nudgeAnim offset after `pos` is computed**

In `drawEntities`, find this line (~line 1878):
```js
    const pos = project(entity.renderQ, entity.renderR, layout, battle.cameraMode);
    const size = layout.entityRadius;
```

Replace with:
```js
    const pos = project(entity.renderQ, entity.renderR, layout, battle.cameraMode);
    if (entity.nudgeAnim) {
      const nFrom = project(entity.nudgeAnim.fromQ, entity.nudgeAnim.fromR, layout, battle.cameraMode);
      const nTo = project(entity.nudgeAnim.toQ, entity.nudgeAnim.toR, layout, battle.cameraMode);
      const ndx = nTo.x - nFrom.x;
      const ndy = nTo.y - nFrom.y;
      const nlen = Math.hypot(ndx, ndy) || 1;
      const maxDist = entity.nudgeAnim.distFrac * layout.hexRadius;
      const nt = clamp(entity.nudgeAnim.elapsed / (entity.nudgeAnim.phase === 'out' ? entity.nudgeAnim.outDuration : entity.nudgeAnim.backDuration), 0, 1);
      const dist = entity.nudgeAnim.phase === 'out' ? nt * maxDist : (1 - nt) * maxDist;
      pos.x += (ndx / nlen) * dist;
      pos.y += (ndy / nlen) * dist;
    }
    const size = layout.entityRadius;
```

- [ ] **Step 2: Verify in browser**

Open `index.html`, start any battle. Entities should still render normally (nudgeAnim is null until wired up). No console errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: render nudgeAnim displacement offset on entities"
```

---

### Task 3: Add `pushImpactAnimation` and `pushGhostAnimation` helper functions

**Files:**
- Modify: `src/battle-system.js` (after `pushRadialAnimation` at ~line 2259)

- [ ] **Step 1: Add two new push functions after `pushRadialAnimation`**

Find this block (~line 2259):
```js
function pushRadialAnimation(battle, q, r, color, radius, ttl) {
  battle.animations.push({ type: "radial", q, r, color, radius, ttl, maxTtl: ttl });
}
```

After that closing brace, insert:
```js

function pushImpactAnimation(battle, q, r, isCrit, ttlOverride) {
  const ttl = ttlOverride ?? 0.18;
  battle.animations.push({ type: "impact", q, r, isCrit: !!isCrit, ttl, maxTtl: ttl });
}

function pushGhostAnimation(battle, q, r, color, ttlOverride) {
  const ttl = ttlOverride ?? 0.18;
  battle.animations.push({ type: "ghost", q, r, color, ttl, maxTtl: ttl });
}
```

- [ ] **Step 2: Verify no syntax errors**

Open `index.html`, check browser console — no errors, battle runs normally.

- [ ] **Step 3: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: add pushImpactAnimation and pushGhostAnimation helpers"
```

---

### Task 4: Render `impact` and `ghost` animation types in `drawAnimations`

**Files:**
- Modify: `src/battle-system.js:1987` (end of `drawAnimations` forEach)

- [ ] **Step 1: Add impact and ghost rendering branches**

In `drawAnimations`, find the closing of the slash branch and the closing of the forEach (around line 1986-1988):
```js
    } else if (animation.type === "slash") {
      // ... existing slash code ...
      ctx.stroke();
    }
  });
}
```

Replace the closing `}` of the slash branch (just before `});`) with:
```js
    } else if (animation.type === "slash") {
      // ... existing slash code unchanged ...
      ctx.stroke();
    } else if (animation.type === "impact") {
      const pos = project(animation.q, animation.r, layout, battle.cameraMode);
      const progress = 1 - animation.ttl / animation.maxTtl;
      const maxRadius = animation.isCrit ? layout.hexRadius * 1.7 : layout.hexRadius * 1.2;
      const radius = progress * maxRadius;
      const lineWidth = animation.isCrit ? lerp(2.5, 0.8, progress) : lerp(1.5, 0.5, progress);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = animation.isCrit ? '#FFD700' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(0.1, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (animation.type === "ghost") {
      const pos = project(animation.q, animation.r, layout, battle.cameraMode);
      ctx.save();
      ctx.globalAlpha = 0.5 * (animation.ttl / animation.maxTtl);
      ctx.fillStyle = animation.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, layout.entityRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
```

Note: The `progress` variable is already declared at the top of the forEach for other branches — but it uses `animation.ttl/maxTtl`. The impact branch re-calculates `progress` locally so there is no conflict. Actually, looking at the code, `progress` is declared at the top: `const progress = 1 - animation.ttl / animation.maxTtl;` — so do NOT redeclare it with `const` inside the impact branch. Instead, just use the existing `progress` variable:

The actual edit: in the impact/ghost branches, remove the line `const progress = 1 - animation.ttl / animation.maxTtl;` — it's already declared at the forEach top.

Correct impact branch (without re-declaring progress):
```js
    } else if (animation.type === "impact") {
      const pos = project(animation.q, animation.r, layout, battle.cameraMode);
      const maxRadius = animation.isCrit ? layout.hexRadius * 1.7 : layout.hexRadius * 1.2;
      const radius = progress * maxRadius;
      const lineWidth = animation.isCrit ? lerp(2.5, 0.8, progress) : lerp(1.5, 0.5, progress);
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = animation.isCrit ? '#FFD700' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(0.1, radius), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (animation.type === "ghost") {
      const pos = project(animation.q, animation.r, layout, battle.cameraMode);
      ctx.save();
      ctx.globalAlpha = 0.5 * (animation.ttl / animation.maxTtl);
      ctx.fillStyle = animation.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, layout.entityRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
```

- [ ] **Step 2: Verify in browser**

Open `index.html`, start a battle. No console errors, battle still renders normally. (impact/ghost not yet triggered — wired up in Task 6.)

- [ ] **Step 3: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: render impact ring and ghost residual animation types"
```

---

### Task 5: Add slash-trail rendering in the slash branch of `drawAnimations`

**Files:**
- Modify: `src/battle-system.js` (inside the `slash` branch of `drawAnimations`)

- [ ] **Step 1: Add trail arcs after the main slash stroke**

In `drawAnimations`, find the complete slash branch (around lines 1968–1986):
```js
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
```

Replace the entire slash branch with:
```js
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
      if (progress > 0.6) {
        const trailFade = (progress - 0.6) / 0.4;
        const trailOffsets = [8, 16, 24];
        const trailAlphas = [0.40, 0.25, 0.10];
        trailOffsets.forEach((offset, i) => {
          ctx.save();
          ctx.globalAlpha = trailAlphas[i] * (1 - trailFade * 0.6);
          ctx.strokeStyle = animation.color;
          ctx.lineWidth = animation.width * 0.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(start.x + nx * offset, start.y + ny * offset);
          ctx.quadraticCurveTo(
            mx + nx * (lift + offset),
            my + ny * (lift + offset),
            end.x + nx * offset,
            end.y + ny * offset
          );
          ctx.stroke();
          ctx.restore();
        });
      }
    }
```

- [ ] **Step 2: Verify slash-trail in browser**

Open `index.html`, start a battle with melee characters. After a few seconds you should see a faint "fan" of 3 residual arcs trailing behind each slash animation during its latter half. If characters are far apart or not melee, switch to trial.html for a 1v1 duel to get a clearer view.

- [ ] **Step 3: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: add slash-trail residual arc fan to melee attacks"
```

---

### Task 6: Wire up impact, ghost, and nudgeAnim in `performBasicAttack` and `applyDamage`

**Files:**
- Modify: `src/battle-system.js:897` (`performBasicAttack`)
- Modify: `src/battle-system.js:913` (`applyDamage`)

- [ ] **Step 1: Rewrite `performBasicAttack` to use attackInterval-synced TTL and set attacker nudgeAnim**

Find `performBasicAttack` (~line 897):
```js
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
```

Replace entirely with:
```js
function performBasicAttack(attacker, defender, damageType, battle, occupancy) {
  const color = gradeTint(attacker.potential);
  const attackInterval = attacker.derived.attackInterval ?? 1.0;
  const baseTtl = clamp(attackInterval * 0.4, 0.10, 0.45);
  if (damageType === "magic") {
    pushProjectileAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, baseTtl, "orb");
    pushRadialAnimation(battle, defender.q, defender.r, color, 0.72, baseTtl * 0.85);
  } else if (attacker.role === "ranged") {
    pushProjectileAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, baseTtl, "arrow");
    attacker.nudgeAnim = {
      fromQ: attacker.q, fromR: attacker.r,
      toQ: defender.q, toR: defender.r,
      distFrac: 0.15,
      outDuration: clamp(attackInterval * 0.10, 0.04, 0.18),
      backDuration: clamp(attackInterval * 0.10, 0.04, 0.18),
      elapsed: 0, phase: "out"
    };
  } else {
    pushSlashAnimation(battle, attacker.q, attacker.r, defender.q, defender.r, color, baseTtl, 4);
    attacker.nudgeAnim = {
      fromQ: attacker.q, fromR: attacker.r,
      toQ: defender.q, toR: defender.r,
      distFrac: 0.30,
      outDuration: clamp(attackInterval * 0.12, 0.05, 0.20),
      backDuration: clamp(attackInterval * 0.12, 0.05, 0.20),
      elapsed: 0, phase: "out"
    };
  }
  return applyDamage(attacker, defender, 1, 0, damageType, battle, {
    label: "\u666e\u901a\u653b\u51fb: ",
    color
  }, occupancy, null);
}
```

- [ ] **Step 2: Add ghost push to the evade path in `applyDamage`**

In `applyDamage`, find the evade return (~line 944):
```js
      pushBattleLog(battle, `${attacker.name} \u7684\u653b\u51fb\u88ab ${defender.name} \u95ea\u907f\u4e86\u3002`);
      defender.hpDamageAnchor = defender.hp;
      setHudAttackMessage(defender, `受到 ${attacker.name} 的${skill?.name || "攻击"}，损失 0 生命（闪避）`);
      return { hit: false, damage: 0, killed: false, evaded: true };
```

Insert one line before the `return`:
```js
      pushBattleLog(battle, `${attacker.name} \u7684\u653b\u51fb\u88ab ${defender.name} \u95ea\u907f\u4e86\u3002`);
      defender.hpDamageAnchor = defender.hp;
      setHudAttackMessage(defender, `受到 ${attacker.name} 的${skill?.name || "攻击"}，损失 0 生命（闪避）`);
      pushGhostAnimation(battle, defender.q, defender.r, gradeTint(defender.potential));
      return { hit: false, damage: 0, killed: false, evaded: true };
```

- [ ] **Step 3: Add impact push and defender nudgeAnim to the hit path in `applyDamage`**

In `applyDamage`, find where `crit` is calculated and where `damage` is computed (~line 949):
```js
  const crit = Math.random() < CRIT_CHANCE ? CRIT_DAMAGE_MULTIPLIER : 1;
  let damage = ((baseAttack * powerScalar * attackMod * crit) / Math.max(12, baseDefense * defenseMod)) * 13 + flatDamage;
```

After the `crit` line, insert:
```js
  const crit = Math.random() < CRIT_CHANCE ? CRIT_DAMAGE_MULTIPLIER : 1;
  const isCrit = crit > 1;
  const impactTtl = clamp((attacker.derived.attackInterval ?? 1.0) * 0.25, 0.08, 0.20);
  pushImpactAnimation(battle, defender.q, defender.r, isCrit, impactTtl);
  defender.nudgeAnim = {
    fromQ: attacker.q, fromR: attacker.r,
    toQ: defender.q, toR: defender.r,
    distFrac: 0.15,
    outDuration: 0.05,
    backDuration: 0.07,
    elapsed: 0, phase: "out"
  };
  let damage = ((baseAttack * powerScalar * attackMod * crit) / Math.max(12, baseDefense * defenseMod)) * 13 + flatDamage;
```

- [ ] **Step 4: Verify in browser**

Open `index.html`, start a battle. You should now see:
- **Melee attackers** lunge forward briefly toward their target
- **Ranged attackers** rock slightly forward when shooting
- **Defenders** jolt back on every hit
- **On dodge**: a faint ghost circle appears at the defender's position and fades out
- **On normal hit**: a small white expanding ring appears at the defender
- **On crit**: a gold expanding ring, slightly larger

Check browser console — no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: wire impact, ghost, and nudgeAnim into basic attack and damage paths"
```

---

### Task 7: Wire attacker nudgeAnim into `castSkill`

**Files:**
- Modify: `src/battle-system.js:830` (`castSkill`)

- [ ] **Step 1: Add attacker nudgeAnim and synced TTL to the AoE skill branch**

In `castSkill`, find the AoE skill animation block (~lines 843-850):
```js
    pushRadialAnimation(battle, target.q, target.r, "#c2410c", Math.max(1, spec.radius), 0.45);
    if (entity.role === "melee") {
      pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, 6);
    } else if (entity.role === "ranged") {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, "heavy-arrow");
    } else {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.28, "flare");
    }
```

Replace with:
```js
    pushRadialAnimation(battle, target.q, target.r, "#c2410c", Math.max(1, spec.radius), 0.45);
    const aoeInterval = entity.derived.attackInterval ?? 1.0;
    const aoeTtl = clamp(aoeInterval * 0.4, 0.10, 0.45);
    if (entity.role === "melee") {
      pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), aoeTtl, 6);
      entity.nudgeAnim = {
        fromQ: entity.q, fromR: entity.r,
        toQ: target.q, toR: target.r,
        distFrac: 0.30,
        outDuration: clamp(aoeInterval * 0.12, 0.05, 0.20),
        backDuration: clamp(aoeInterval * 0.12, 0.05, 0.20),
        elapsed: 0, phase: "out"
      };
    } else if (entity.role === "ranged") {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), aoeTtl, "heavy-arrow");
      entity.nudgeAnim = {
        fromQ: entity.q, fromR: entity.r,
        toQ: target.q, toR: target.r,
        distFrac: 0.15,
        outDuration: clamp(aoeInterval * 0.10, 0.04, 0.18),
        backDuration: clamp(aoeInterval * 0.10, 0.04, 0.18),
        elapsed: 0, phase: "out"
      };
    } else {
      pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), aoeTtl, "flare");
    }
```

- [ ] **Step 2: Add attacker nudgeAnim and synced TTL to the single-target skill branch**

In `castSkill`, find the single-target animation block (~lines 886-893):
```js
  if (entity.role === "melee") {
    pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.22, 5);
  } else if (entity.role === "ranged") {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.22, "heavy-arrow");
  } else {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), 0.24, "flare");
    pushRadialAnimation(battle, target.q, target.r, gradeTint(skill.grade), 1.15, 0.26);
  }
  pushBattleLog(battle, `${entity.name} \u4f7f\u7528 ${skill.name} \u547d\u4e2d ${target.name}\u3002`);
```

Replace with:
```js
  const stInterval = entity.derived.attackInterval ?? 1.0;
  const stTtl = clamp(stInterval * 0.4, 0.10, 0.45);
  if (entity.role === "melee") {
    pushSlashAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), stTtl, 5);
    entity.nudgeAnim = {
      fromQ: entity.q, fromR: entity.r,
      toQ: target.q, toR: target.r,
      distFrac: 0.30,
      outDuration: clamp(stInterval * 0.12, 0.05, 0.20),
      backDuration: clamp(stInterval * 0.12, 0.05, 0.20),
      elapsed: 0, phase: "out"
    };
  } else if (entity.role === "ranged") {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), stTtl, "heavy-arrow");
    entity.nudgeAnim = {
      fromQ: entity.q, fromR: entity.r,
      toQ: target.q, toR: target.r,
      distFrac: 0.15,
      outDuration: clamp(stInterval * 0.10, 0.04, 0.18),
      backDuration: clamp(stInterval * 0.10, 0.04, 0.18),
      elapsed: 0, phase: "out"
    };
  } else {
    pushProjectileAnimation(battle, entity.q, entity.r, target.q, target.r, gradeTint(skill.grade), stTtl, "flare");
    pushRadialAnimation(battle, target.q, target.r, gradeTint(skill.grade), 1.15, 0.26);
  }
  pushBattleLog(battle, `${entity.name} \u4f7f\u7528 ${skill.name} \u547d\u4e2d ${target.name}\u3002`);
```

- [ ] **Step 3: Final browser verification**

Open `index.html`, run a full battle (chaos or tournament mode). Verify:
1. Melee skill use → attacker lunges visibly toward target, slash has trailing fan
2. Ranged skill use → attacker has small forward lean when shooting
3. All hits → white or gold ring expands at defender; defender jolts back
4. Dodge events → ghost circle at defender, no impact ring
5. All existing status effects, HP bars, floating text still work correctly
6. No console errors throughout

Also open `trial.html` (1v1 duel) for closer inspection of individual animations.

- [ ] **Step 4: Commit**

```bash
cd "/Users/jichao/科研工作/博士工作/game"
git add src/battle-system.js
git commit -m "feat: wire attacker nudgeAnim and synced TTL into castSkill"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Slash-trail residual arcs → Task 5
- [x] Impact ring (normal white, crit gold) → Task 3 + Task 4 + Task 6
- [x] Ghost residual on dodge → Task 3 + Task 4 + Task 6
- [x] Attacker lunge (melee 0.30, ranged 0.15, caster none) → Task 6 + Task 7
- [x] Defender shake (0.15 distFrac, away from attacker) → Task 6
- [x] TTL synced to `entity.derived.attackInterval` → Task 6 + Task 7
- [x] `grade` / `faction` fields on push functions: preserved via `opts` pattern in spec → left as natural extension (callers can add isCrit/isDodge; grade/faction are no-ops until needed)
- [x] fast-sim.js unaffected → push functions only called from battle-system.js rendering paths

**Type/name consistency:**
- `nudgeAnim` used in: entity init (Task 1), tickVisuals (Task 1), drawEntities (Task 2), performBasicAttack (Task 6), applyDamage (Task 6), castSkill (Task 7) ✓
- `pushImpactAnimation` defined in Task 3, used in Task 6 ✓
- `pushGhostAnimation` defined in Task 3, used in Task 6 ✓
- `clamp` already imported from utils.js ✓
- `lerp` already imported from utils.js ✓
- `gradeTint` aliased from `gradeColor` in utils.js import ✓
