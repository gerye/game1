export async function normalizeStoredCharacterData({
  storage,
  skills,
  equipment,
  loadBases,
  loadBuilds,
  refreshBase,
  normalizeBase,
  buildCharacterProfile,
  rebuildLearnedSkillState,
  normalizeEquipmentBySlot,
  normalizeProgressRecord
}) {
  const bases = await loadBases();
  const builds = await loadBuilds();
  const buildByCode = builds.reduce((map, build) => {
    const previous = map.get(build.capCode);
    if (!previous || (build.generatedAt || 0) > (previous.generatedAt || 0)) {
      map.set(build.capCode, build);
    }
    return map;
  }, new Map());

  for (const rawBase of bases) {
    const base = normalizeBase(await refreshBase(rawBase));
    await storage.putCapBase(base);
    if (!buildByCode.has(base.code)) continue;

    const previousBuild = buildByCode.get(base.code);
    const previousProgress = previousBuild ? await storage.getProgress(previousBuild.buildId) : null;
    const nextProfile = buildCharacterProfile(base, skills, equipment);
    const build = rebuildLearnedSkillState({
      ...nextProfile,
      skillIds: previousBuild?.skillIds || [],
      equipmentBySlot: previousBuild
        ? normalizeEquipmentBySlot(previousBuild.equipmentBySlot, nextProfile.role, equipment)
        : nextProfile.equipmentBySlot
    }, skills);

    await storage.putBuild(build);
    await storage.putProgress(normalizeProgressRecord({
      ...(previousProgress || {}),
      buildId: build.buildId
    }, build.buildId));
    await storage.deleteBuildsForCapCode(base.code, build.buildId);
    await storage.ensureProgress(build.buildId);
  }
}

// DB v11: 新增 worldState store 用于江湖世界地图持久化状态
// Store 在 openDb() onupgradeneeded 中由 ensureStore 自动创建
