export async function applyPreBattleEvents({
  entries,
  events,
  allSkills,
  allEquipment,
  storage,
  rollEvent,
  expToNextLevel,
  grantExp,
  learnSkillForBuild,
  grantRandomEquipmentForBuild,
  grantEquipmentForBuildByGrade,
  normalizeProgressRecord,
  addPendingStatus,
  addPrimaryBonus,
  setNextBattleRandomSpawn,
  onProgressChanged,
  onSkillLearned,
  onEquipmentGained
}) {
  const logs = [];
  const details = [];
  const battleSeed = `${Date.now()}`;
  const primaryLabels = {
    strength: "力量",
    vitality: "体质",
    agility: "敏捷",
    intelligence: "智力",
    spirit: "精神"
  };

  for (const [index, entry] of entries.entries()) {
    const event = rollEvent(events, `${battleSeed}:${entry.base.code}:${index}`);
    if (!event || !entry.build || !entry.progress) continue;

    let build = entry.build;
    let progress = normalizeProgressRecord(entry.progress, entry.progress.buildId);
    let detail = event.desc || event.name;

    if (event.type === "exp") {
      const previousLevel = progress.level;
      const gain = Math.round(expToNextLevel(progress.level) * (event.payload?.ratio || 0));
      grantExp(progress, gain);
      await onProgressChanged?.({ entry, build, progress, previousLevel });
      detail = `${event.name}：获得 ${gain} 经验`;
    } else if (event.type === "primary-bonus") {
      const keys = ["strength", "vitality", "agility", "intelligence", "spirit"];
      const bonusSeed = `${battleSeed}:${entry.base.code}:primary-bonus`;
      const pickedKey = keys[Math.floor(randomFromSeed(bonusSeed) * keys.length)] || "strength";
      progress = addPrimaryBonus(progress, pickedKey, 1);
      detail = `${event.name}：${primaryLabels[pickedKey] || pickedKey} +1`;
    } else if (event.type === "debuff") {
      progress = addPendingStatus(progress, event.payload?.statusId || "sick-half");
      detail = `${event.name}：${event.desc || "下场战斗获得负面状态"}`;
    } else if (event.type === "revive") {
      progress = addPendingStatus(progress, event.payload?.statusId || "revive-full");
      detail = `${event.name}：下场战斗获得“死里逃生”状态`;
    } else if (event.type === "random-spawn") {
      progress = setNextBattleRandomSpawn(progress, true);
      detail = `${event.name}：下场战斗将在随机地点出生`;
    } else if (event.type === "learn-skill") {
      const previousSkillIds = [...build.skillIds];
      build = learnSkillForBuild(build, allSkills, `${battleSeed}:${entry.base.code}:learn`);
      const learnedId = build.skillIds.find((skillId) => !previousSkillIds.includes(skillId)) || "";
      if (learnedId) {
        const learnedSkill = allSkills.find((skill) => skill.id === learnedId) || null;
        await onSkillLearned?.({ entry, build, progress, skill: learnedSkill });
      }
      detail = `${event.name}：${build.skillIds.length > entry.build.skillIds.length ? "领悟新技能" : "替换最低等级技能"}`;
    } else if (event.type === "gain-equipment") {
      const result = grantRandomEquipmentForBuild(build, allEquipment, `${battleSeed}:${entry.base.code}:equipment`);
      build = result.build;
      if (result.equipment) {
        await onEquipmentGained?.({ entry, build, progress, equipment: result.equipment });
      }
      detail = result.equipment
        ? `${event.name}：得到 ${result.equipment.name}`
        : `${event.name}：这次没能带回可用装备`;
    } else if (event.type === "gain-equipment-grade") {
      const targetGrade = event.payload?.grade || "D";
      const result = grantEquipmentForBuildByGrade(build, allEquipment, targetGrade, `${battleSeed}:${entry.base.code}:${targetGrade}-equipment`);
      build = result.build;
      if (result.equipment) {
        await onEquipmentGained?.({ entry, build, progress, equipment: result.equipment });
      }
      detail = result.equipment
        ? `${event.name}：得到 ${result.equipment.name}`
        : `${event.name}：这次没能找到合适的 ${targetGrade} 级装备`;
    }

    progress.lastEventId = event.id;
    progress.lastEventText = detail;
    await storage.putBuild(build);
    await storage.putProgress(progress);
    logs.push(`[游历] ${entry.displayName} - ${detail}`);
    details.push({ code: entry.base.code, detail });
  }

  return { logs, details };
}

function randomFromSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function renderBattlePrelude({
  container,
  summaryContainer,
  logContainer,
  pendingBattle,
  gradeColor,
  escapeHtml,
  onStart
}) {
  if (!pendingBattle) return;

  summaryContainer.innerHTML = `
    <div class="summary-row"><span>状态</span><strong>游历阶段</strong></div>
    <div class="summary-row"><span>角色数</span><strong>${pendingBattle.previewItems.length}</strong></div>
    <div class="summary-row"><span>下一步</span><strong>确认后开始战斗</strong></div>
  `;

  logContainer.innerHTML = pendingBattle.logs
    .slice()
    .reverse()
    .map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`)
    .join("");

  container.innerHTML = `
    <div class="prelude-head">
      <div>
        <h3>游历阶段</h3>
        <p class="muted">每个角色都会先经历一次战前事件。确认结果后，再进入正式战斗。</p>
      </div>
      <button class="primary-btn" type="button" id="preludeStartBtn">开始战斗</button>
    </div>
    <div class="prelude-grid">
      ${pendingBattle.previewItems.map((entry) => `
        <article class="prelude-card">
          <div class="prelude-top">
            <img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">
            <div class="cell-stack">
              <div class="prelude-name" style="color:${gradeColor(entry.build.potential)}">${escapeHtml(entry.displayName)}</div>
              <div class="mini-text">${escapeHtml(entry.build.faction.name)} | ${escapeHtml(entry.build.roleLabel)} | 潜力 ${entry.build.potential}</div>
            </div>
          </div>
          <div class="prelude-event">${escapeHtml(entry.preludeText)}</div>
        </article>
      `).join("")}
    </div>
  `;

  container.querySelector("#preludeStartBtn")?.addEventListener("click", onStart, { once: true });
}

/**
 * 渲染时节事件面板（驻守XP + 游历奇遇 + 单挑配对）
 */
export function renderSeasonPrelude({
  container,
  summaryContainer,
  logContainer,
  garrisonResults,
  eventResults,
  duelPairs,
  allEntries,
  escapeHtml,
  onConfirm
}) {
  const duelEntries = duelPairs.map(({ buildA, buildB }) => {
    const entryA = allEntries.find((e) => e.build?.buildId === buildA.buildId);
    const entryB = allEntries.find((e) => e.build?.buildId === buildB.buildId);
    return { nameA: entryA?.displayName || buildA.buildId, nameB: entryB?.displayName || buildB.buildId, buildA, buildB };
  });

  const totalEvents = garrisonResults.length + (eventResults?.details?.length || 0) + duelEntries.length;

  summaryContainer.innerHTML = `
    <div class="summary-row"><span>状态</span><strong>时节结算</strong></div>
    <div class="summary-row"><span>驻守</span><strong>${garrisonResults.length} 人</strong></div>
    <div class="summary-row"><span>游历</span><strong>${eventResults?.details?.length || 0} 人</strong></div>
    <div class="summary-row"><span>单挑</span><strong>${duelEntries.length} 场</strong></div>
  `;

  const logs = [
    ...garrisonResults.map((r) => `[驻守] ${r.name} 获得 ${r.xpGain} 经验`),
    ...(eventResults?.logs || [])
  ];
  logContainer.innerHTML = logs
    .slice()
    .reverse()
    .map((entry) => `<div class="battle-log-entry">${escapeHtml(entry)}</div>`)
    .join("");

  const garrisonHtml = garrisonResults.length
    ? `<h4 style="margin:8px 0 4px;color:#888">驻守（获得经验）</h4>
       <div class="prelude-grid">
         ${garrisonResults.map((r) => `
           <article class="prelude-card">
             <div class="prelude-top">
               ${r.avatarDataUrl ? `<img class="avatar" src="${r.avatarDataUrl}" alt="${escapeHtml(r.name)}">` : ""}
               <div class="cell-stack">
                 <div class="prelude-name">${escapeHtml(r.name)}</div>
               </div>
             </div>
             <div class="prelude-event">驻守城市 +${r.xpGain} 经验</div>
           </article>
         `).join("")}
       </div>`
    : "";

  const roamingHtml = (eventResults?.details?.length)
    ? `<h4 style="margin:8px 0 4px;color:#888">游历（奇遇）</h4>
       <div class="prelude-grid">
         ${allEntries
           .filter((e) => eventResults.details.find((d) => d.code === e.base?.code))
           .map((entry) => {
             const d = eventResults.details.find((di) => di.code === entry.base.code);
             return `
               <article class="prelude-card">
                 <div class="prelude-top">
                   ${entry.base?.avatarDataUrl ? `<img class="avatar" src="${entry.base.avatarDataUrl}" alt="${escapeHtml(entry.displayName)}">` : ""}
                   <div class="cell-stack">
                     <div class="prelude-name">${escapeHtml(entry.displayName)}</div>
                   </div>
                 </div>
                 <div class="prelude-event">${escapeHtml(d?.detail || "无事发生")}</div>
               </article>
             `;
           }).join("")}
       </div>`
    : "";

  const duelHtml = duelEntries.length
    ? `<h4 style="margin:8px 0 4px;color:#888">单挑（将逐场进行）</h4>
       <div class="prelude-grid">
         ${duelEntries.map((d) => `
           <article class="prelude-card">
             <div class="prelude-event" style="text-align:center;padding:12px">
               ⚔️ ${escapeHtml(d.nameA)} vs ${escapeHtml(d.nameB)}
             </div>
           </article>
         `).join("")}
       </div>`
    : "";

  const confirmLabel = duelEntries.length > 0 ? `确认并开始单挑（${duelEntries.length} 场）` : "确认";

  container.innerHTML = `
    <div class="prelude-head">
      <div>
        <h3>时节结算</h3>
        <p class="muted">${totalEvents > 0 ? "本时节各角色事件如下。" : "本时节风平浪静。"}</p>
      </div>
      <button class="primary-btn" type="button" id="seasonConfirmBtn">${escapeHtml(confirmLabel)}</button>
    </div>
    ${garrisonHtml}
    ${roamingHtml}
    ${duelHtml}
  `;

  container.querySelector("#seasonConfirmBtn")?.addEventListener("click", onConfirm, { once: true });
}
