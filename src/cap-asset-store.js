import { META_KEYS } from "./config.js";

export const CAP_ASSET_RELATIVE_DIR = "assets/caps";

export function getCapAvatarFilename(code) {
  return `${code}-avatar.png`;
}

export function getCapPhotoFilename(code) {
  return `${code}-photo.png`;
}

export function getCapAvatarPath(code) {
  return `${CAP_ASSET_RELATIVE_DIR}/${getCapAvatarFilename(code)}`;
}

export function getCapPhotoPath(code) {
  return `${CAP_ASSET_RELATIVE_DIR}/${getCapPhotoFilename(code)}`;
}

export function getBaseAvatarSrc(base) {
  return base?.avatarPath || base?.avatarDataUrl || "";
}

export function getBasePhotoSrc(base) {
  return base?.photoPath || base?.photoDataUrl || getBaseAvatarSrc(base);
}

export function stripEmbeddedBaseImages(base) {
  const avatarPath = base?.avatarPath || (base?.code ? getCapAvatarPath(base.code) : "");
  const photoPath = base?.photoPath || (base?.code ? getCapPhotoPath(base.code) : "");
  return {
    ...base,
    imageId: base?.imageId || base?.code || "",
    avatarPath,
    photoPath,
    avatarDataUrl: avatarPath,
    photoDataUrl: photoPath
  };
}

export async function ensureCapAssetDirectory(storage, { interactive = false } = {}) {
  const storedHandle = await storage.getMeta(META_KEYS.CAP_ASSET_DIR_HANDLE);
  const activeStoredHandle = await ensureDirectoryPermission(storedHandle);
  if (activeStoredHandle) return activeStoredHandle;
  if (storedHandle) {
    await storage.saveMeta(META_KEYS.CAP_ASSET_DIR_HANDLE, null);
  }
  if (!interactive) return null;
  if (!window.showDirectoryPicker) {
    throw new Error("当前浏览器不支持目录写入，请使用支持文件系统访问的浏览器。");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error("没有获得图片资源目录的读写权限。");
  }
  await storage.saveMeta(META_KEYS.CAP_ASSET_DIR_HANDLE, handle);
  return handle;
}

export async function persistBaseImageAssets(storage, base, { interactive = false } = {}) {
  if (!base?.code) return base;
  const avatarPath = getCapAvatarPath(base.code);
  const photoPath = getCapPhotoPath(base.code);
  const nextBase = {
    ...base,
    imageId: base.imageId || base.code,
    avatarPath,
    photoPath
  };

  const needsWrite = isDataUrl(base.avatarDataUrl) || isDataUrl(base.photoDataUrl);
  if (!needsWrite) {
    return stripEmbeddedBaseImages(nextBase);
  }

  let directoryHandle = await ensureCapAssetDirectory(storage, { interactive });
  if (!directoryHandle) {
    throw new Error("请先选择用于保存瓶盖图片的 assets/caps 目录。");
  }

  try {
    await writeAssetFile(directoryHandle, getCapAvatarFilename(base.code), base.avatarDataUrl || base.photoDataUrl);
    await writeAssetFile(directoryHandle, getCapPhotoFilename(base.code), base.photoDataUrl || base.avatarDataUrl);
  } catch (error) {
    if (!isStaleHandleError(error)) throw error;
    await storage.saveMeta(META_KEYS.CAP_ASSET_DIR_HANDLE, null);
    directoryHandle = await ensureCapAssetDirectory(storage, { interactive: true });
    if (!directoryHandle) {
      throw new Error("图片资源目录句柄已失效，请重新选择 assets/caps 目录。");
    }
    await writeAssetFile(directoryHandle, getCapAvatarFilename(base.code), base.avatarDataUrl || base.photoDataUrl);
    await writeAssetFile(directoryHandle, getCapPhotoFilename(base.code), base.photoDataUrl || base.avatarDataUrl);
  }
  return stripEmbeddedBaseImages(nextBase);
}

async function ensureDirectoryPermission(handle) {
  if (!handle) return null;
  try {
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      permission = await handle.requestPermission({ mode: "readwrite" });
    }
    return permission === "granted" ? handle : null;
  } catch (_error) {
    return null;
  }
}

async function writeAssetFile(directoryHandle, fileName, dataUrl) {
  if (!isDataUrl(dataUrl)) {
    throw new Error(`图片资源 ${fileName} 缺少可写入的数据。`);
  }
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  await writable.write(blob);
  await writable.close();
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function isStaleHandleError(error) {
  const message = String(error?.message || "");
  return message.includes("state cached in an interface object") || message.includes("state had changed since it was read from disk");
}
