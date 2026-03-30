import { createRoleSaveSnapshot } from "./role-save.js";

const DEFAULT_ROLE_SAVE_LABEL = "角色存档";
const DEFAULT_ROLE_SAVE_FILENAME = "bottle-cap-save.json";

export async function renderRoleSaveStatus(storage, target) {
  if (!target || !storage?.getStorageInfo) return;
  const info = await storage.getStorageInfo();
  const label = info?.label || DEFAULT_ROLE_SAVE_LABEL;
  const filename = info?.filename || DEFAULT_ROLE_SAVE_FILENAME;
  target.textContent = `${label}：${filename}`;
}

export async function exportRoleSaveFromState(storage, snapshotState) {
  const snapshot = await createRoleSaveSnapshot(storage, snapshotState);
  await storage.exportRoleSave(snapshot);
  return snapshot;
}

export async function importRoleSaveIntoStorage(storage) {
  return storage.importRoleSave();
}
