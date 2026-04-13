import { DB_NAME, DB_VERSION, GAME_VERSION, STORES } from "./config.js";
import { createDefaultProgress, normalizeProgressRecord } from "./game-data.js";

const FILE_NAME = "bottle-cap-save.json";
const FILE_SCHEMA_VERSION = 2;
const PRESERVED_META_KEYS = ["legacyMigrated"];

export async function createStorage() {
  const db = await openDb();
  const storeApi = createIndexedDbApi(db);
  await migrateLegacyData(storeApi);

  return {
    db,
    getAllCapBases: () => storeApi.getAllCapBases(),
    putCapBase: (record) => storeApi.putCapBase(record),
    deleteCapBase: (code) => storeApi.deleteCapBase(code),
    deleteBuildsForCapCode: (code, keepBuildId = "") => storeApi.deleteBuildsForCapCode(code, keepBuildId),
    getAllBuilds: () => storeApi.getAllBuilds(),
    getBuild: (buildId) => storeApi.getBuild(buildId),
    putBuild: (record) => storeApi.putBuild(record),
    deleteBuild: (buildId) => storeApi.deleteBuild(buildId),
    getProgress: (buildId) => storeApi.getProgress(buildId),
    async putProgress(record) {
      const normalized = normalizeProgressRecord(record, record?.buildId);
      await storeApi.putProgress(normalized);
      return normalized;
    },
    async ensureProgress(buildId) {
      const record = await storeApi.getProgress(buildId);
      if (record) return normalizeProgressRecord(record, buildId);
      const progress = createDefaultProgress(buildId);
      await storeApi.putProgress(progress);
      return progress;
    },
    resetAllProgress: () => storeApi.resetAllProgress(),
    getAllSkills: () => storeApi.getAllSkills(),
    getSkillsRaw: () => storeApi.getSkillsRaw(),
    putSkill: (skill) => storeApi.putSkill(skill),
    deleteSkill: (skillId) => storeApi.deleteSkill(skillId),
    getAllEquipment: () => storeApi.getAllEquipment(),
    getEquipmentRaw: () => storeApi.getEquipmentRaw(),
    putEquipment: (equipment) => storeApi.putEquipment(equipment),
    deleteEquipment: (equipmentId) => storeApi.deleteEquipment(equipmentId),
    getAllEvents: () => storeApi.getAllEvents(),
    getEventsRaw: () => storeApi.getEventsRaw(),
    putEvent: (event) => storeApi.putEvent(event),
    deleteEvent: (eventId) => storeApi.deleteEvent(eventId),
    getAllBloodlines: () => storeApi.getAllBloodlines(),
    getBloodlinesRaw: () => storeApi.getBloodlinesRaw(),
    putBloodline: (bloodline) => storeApi.putBloodline(bloodline),
    deleteBloodline: (bloodlineId) => storeApi.deleteBloodline(bloodlineId),
    getAllStatuses: () => storeApi.getAllStatuses(),
    getStatusesRaw: () => storeApi.getStatusesRaw(),
    putStatus: (status) => storeApi.putStatus(status),
    deleteStatus: (statusId) => storeApi.deleteStatus(statusId),
    saveMeta: (key, value) => storeApi.saveMeta(key, value),
    getMeta: (key) => storeApi.getMeta(key),
    getWorldState: () => storeApi.getMeta("worldState"),
    putWorldState: (state) => storeApi.saveMeta("worldState", state),
    async exportRoleSave(snapshot) {
      const directoryHandle = await pickSaveDirectory();
      const fileHandle = await directoryHandle.getFileHandle(FILE_NAME, { create: true });
      await writeFileState(fileHandle, buildStorageSnapshot(snapshot));
      return { mode: "manual", label: "\u624b\u52a8\u89d2\u8272\u5b58\u6863", filename: FILE_NAME };
    },
    async importRoleSave() {
      const directoryHandle = await pickSaveDirectory();
      const fileHandle = await directoryHandle.getFileHandle(FILE_NAME, { create: false });
      const { data, invalid } = await readFileState(fileHandle);
      if (invalid) {
        throw new Error("\u89d2\u8272\u5b58\u6863\u6587\u4ef6\u5df2\u635f\u574f\uff0c\u65e0\u6cd5\u5bfc\u5165\u3002");
      }
      await overwriteIndexedDbFromState(storeApi, data);
      return normalizeFileState(data);
    },
    async getStorageInfo() {
      return { mode: "manual", label: "\u624b\u52a8\u89d2\u8272\u5b58\u6863", filename: FILE_NAME };
    }
  };
}

function createIndexedDbApi(db) {
  return {
    db,
    getAllCapBases: () => readAll(db, STORES.capBases),
    putCapBase: (record) => putRecord(db, STORES.capBases, record),
    async deleteCapBase(code) {
      await deleteRecord(db, STORES.capBases, code);
      await this.deleteBuildsForCapCode(code);
    },
    async deleteBuildsForCapCode(code, keepBuildId = "") {
      const builds = await readAll(db, STORES.capBuilds);
      const targets = builds.filter((build) => build?.capCode === code && build.buildId !== keepBuildId);
      for (const build of targets) {
        await deleteRecord(db, STORES.capBuilds, build.buildId);
        await deleteRecord(db, STORES.capProgress, build.buildId);
      }
    },
    getAllBuilds: () => readAll(db, STORES.capBuilds),
    getAllCapProgress: () => readAll(db, STORES.capProgress),
    getBuild: (buildId) => getRecord(db, STORES.capBuilds, buildId),
    putBuild: (record) => putRecord(db, STORES.capBuilds, record),
    async deleteBuild(buildId) {
      await deleteRecord(db, STORES.capBuilds, buildId);
      await deleteRecord(db, STORES.capProgress, buildId);
    },
    getProgress: (buildId) => getRecord(db, STORES.capProgress, buildId),
    putProgress: (record) => putRecord(db, STORES.capProgress, normalizeProgressRecord(record, record?.buildId)),
    async ensureProgress(buildId) {
      const record = await getRecord(db, STORES.capProgress, buildId);
      if (record) return normalizeProgressRecord(record, buildId);
      const progress = createDefaultProgress(buildId);
      await putRecord(db, STORES.capProgress, progress);
      return progress;
    },
    async resetAllProgress() {
      const builds = await readAll(db, STORES.capBuilds);
      for (const build of builds) {
        await putRecord(db, STORES.capProgress, createDefaultProgress(build.buildId));
      }
    },
    getAllSkills: async () => (await readAll(db, STORES.skills)).filter((skill) => !skill.deleted),
    getSkillsRaw: () => readAll(db, STORES.skills),
    putSkill: (skill) => putRecord(db, STORES.skills, skill),
    async deleteSkill(skillId) {
      const skill = await getRecord(db, STORES.skills, skillId);
      if (!skill) return;
      await putRecord(db, STORES.skills, { ...skill, deleted: true, userEdited: true });
    },
    getAllEquipment: async () => (await readAll(db, STORES.equipment)).filter((item) => !item.deleted),
    getEquipmentRaw: () => readAll(db, STORES.equipment),
    putEquipment: (equipment) => putRecord(db, STORES.equipment, equipment),
    async deleteEquipment(equipmentId) {
      const item = await getRecord(db, STORES.equipment, equipmentId);
      if (!item) return;
      await putRecord(db, STORES.equipment, { ...item, deleted: true, userEdited: true });
    },
    getAllEvents: async () => (await readAll(db, STORES.events)).filter((event) => !event.deleted),
    getEventsRaw: () => readAll(db, STORES.events),
    putEvent: (event) => putRecord(db, STORES.events, event),
    async deleteEvent(eventId) {
      const event = await getRecord(db, STORES.events, eventId);
      if (!event) return;
      await putRecord(db, STORES.events, { ...event, deleted: true, userEdited: true });
    },
    getAllBloodlines: async () => (await readAll(db, STORES.bloodlines)).filter((bloodline) => !bloodline.deleted),
    getBloodlinesRaw: () => readAll(db, STORES.bloodlines),
    putBloodline: (bloodline) => putRecord(db, STORES.bloodlines, bloodline),
    async deleteBloodline(bloodlineId) {
      const bloodline = await getRecord(db, STORES.bloodlines, bloodlineId);
      if (!bloodline) return;
      await putRecord(db, STORES.bloodlines, { ...bloodline, deleted: true, userEdited: true });
    },
    getAllStatuses: async () => (await readAll(db, STORES.statuses)).filter((status) => !status.deleted),
    getStatusesRaw: () => readAll(db, STORES.statuses),
    putStatus: (status) => putRecord(db, STORES.statuses, status),
    async deleteStatus(statusId) {
      const status = await getRecord(db, STORES.statuses, statusId);
      if (!status) return;
      await putRecord(db, STORES.statuses, { ...status, deleted: true, userEdited: true });
    },
    saveMeta: (key, value) => putRecord(db, STORES.meta, { key, value }),
    async getMeta(key) {
      const record = await getRecord(db, STORES.meta, key);
      return record?.value;
    }
  };
}

async function pickSaveDirectory() {
  if (!window.showDirectoryPicker) {
    throw new Error("\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u6587\u4ef6\u7cfb\u7edf\u8bbf\u95ee\u3002");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("\u6ca1\u6709\u83b7\u5f97\u5b58\u6863\u76ee\u5f55\u7684\u8bfb\u5199\u6743\u9650\u3002");
  }
  return handle;
}

async function overwriteIndexedDbFromState(storeApi, state) {
  await clearIndexedStore(storeApi.db, STORES.capBases);
  await clearIndexedStore(storeApi.db, STORES.capBuilds);
  await clearIndexedStore(storeApi.db, STORES.capProgress);
  await clearIndexedStore(storeApi.db, STORES.equipment);
  await clearIndexedStore(storeApi.db, STORES.meta, PRESERVED_META_KEYS);

  for (const base of state.capBases) await storeApi.putCapBase(base);
  for (const build of state.capBuilds) await storeApi.putBuild(build);
  for (const progress of state.capProgress) await storeApi.putProgress(progress);
  for (const item of state.equipment || []) await storeApi.putEquipment(item);
  for (const [key, value] of Object.entries(state.meta || {})) {
    await storeApi.saveMeta(key, value);
  }
}

function createEmptyFileState() {
  return {
    schemaVersion: FILE_SCHEMA_VERSION,
    capBases: [],
    capBuilds: [],
    capProgress: [],
    equipment: [],
    meta: {}
  };
}

export function buildStorageSnapshot({
  capBases = [],
  capBuilds = [],
  capProgress = [],
  equipment = [],
  meta = {}
} = {}) {
  return normalizeFileState({
    schemaVersion: FILE_SCHEMA_VERSION,
    capBases,
    capBuilds,
    capProgress,
    equipment,
    meta
  });
}

function normalizeFileState(raw = {}) {
  return {
    schemaVersion: FILE_SCHEMA_VERSION,
    capBases: Array.isArray(raw.capBases) ? raw.capBases : [],
    capBuilds: Array.isArray(raw.capBuilds) ? raw.capBuilds : [],
    capProgress: Array.isArray(raw.capProgress)
      ? raw.capProgress.map((progress) => normalizeProgressRecord(progress, progress?.buildId))
      : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {}
  };
}

async function writeFileState(fileHandle, data) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(normalizeFileState(data), null, 2));
  await writable.close();
}

async function readFileState(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (!text.trim()) {
    return { data: createEmptyFileState(), invalid: false };
  }
  try {
    return {
      data: normalizeFileState(JSON.parse(text)),
      invalid: false
    };
  } catch (_error) {
    return {
      data: createEmptyFileState(),
      invalid: true
    };
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ensureStore(db, STORES.capBases, "code");
      ensureStore(db, STORES.capBuilds, "buildId");
      ensureStore(db, STORES.capProgress, "buildId");
      ensureStore(db, STORES.skills, "id");
      ensureStore(db, STORES.equipment, "id");
      ensureStore(db, STORES.events, "id");
      ensureStore(db, STORES.bloodlines, "id");
      ensureStore(db, STORES.statuses, "id");
      ensureStore(db, STORES.meta, "key");
      ensureStore(db, "worldState", "key");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function ensureStore(db, name, keyPath) {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath });
  }
}

function readAll(db, storeName) {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getRecord(db, storeName, key) {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db, storeName, record) {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve(record);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

function deleteRecord(db, storeName, key) {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function clearIndexedStore(db, storeName, preserveMetaKeys = []) {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    if (storeName !== STORES.meta || preserveMetaKeys.length === 0) {
      store.clear();
    } else {
      const request = store.getAll();
      request.onsuccess = () => {
        request.result.forEach((record) => {
          if (!preserveMetaKeys.includes(record.key)) {
            store.delete(record.key);
          }
        });
      };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function migrateLegacyData(storage) {
  const migrated = await storage.getMeta("legacyMigrated");
  if (migrated) return;
  const bases = await storage.getAllCapBases();
  if (bases.length > 0) {
    await storage.saveMeta("legacyMigrated", true);
    return;
  }
  const records = await readLegacyCaps(storage.db);
  for (const cap of records) {
    const code = cap.signature || cap.id;
    const buildId = `${GAME_VERSION}:${code}`;
    await storage.putCapBase({
      code,
      sourceName: cap.name || code,
      note: cap.note || "",
      avatarDataUrl: cap.avatarDataUrl || cap.photoDataUrl || "",
      photoDataUrl: cap.photoDataUrl || "",
      dominantColor: cap.dominantColor || "#cccccc",
      hsl: { h: 0, s: 0, l: 0.5 },
      metrics: cap.patternMetrics || { variance: 36, edgeDensity: 16, radialContrast: 12, asymmetry: 8, flourish: 18, stripeScore: 14 },
      perceptualHash: code,
      featureSignature: code,
      rotation: 0,
      createdAt: cap.createdAt || Date.now()
    });
    await storage.putBuild({
      buildId,
      capCode: code,
      archVersion: cap.archVersion || 3,
      gameVersion: cap.gameVersion || GAME_VERSION,
      faction: cap.faction,
      role: cap.role,
      roleLabel: cap.role,
      potential: cap.potential,
      primaryStart: cap.primaryStart,
      primaryFinal: cap.primaryFinal,
      growthCurves: cap.growthCurves || {},
      growthSeries: [],
      skillIds: (cap.skills || []).map((skill) => skill.id),
      skillScore: cap.skills?.reduce((sum, skill) => sum + (skill.impact || 0), 0) || 0,
      combatScore: cap.combatScore || 0,
      generatedAt: cap.createdAt || Date.now()
    });
    await storage.putProgress({
      ...createDefaultProgress(buildId),
      level: cap.progression?.level || 1,
      experience: cap.progression?.experience || 0,
      totalBattles: cap.progression?.totalBattles || 0,
      wins: cap.progression?.wins || 0
    });
  }
  await storage.saveMeta("legacyMigrated", true);
}

function readLegacyCaps(db) {
  if (!db.objectStoreNames.contains(STORES.legacyCaps)) return Promise.resolve([]);
  return readAll(db, STORES.legacyCaps);
}
