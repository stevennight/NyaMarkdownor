import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./fileIo";

export type DesktopStoreKey = "document-tabs" | "draft-document" | "draft-snapshots" | "preferences" | "recent-files" | "workspace-root";

const DESKTOP_STORE_FILES: Record<DesktopStoreKey, string> = {
  "document-tabs": "document-tabs-v1.json",
  "draft-document": "draft-document-v1.json",
  "draft-snapshots": "draft-snapshots-v1.json",
  preferences: "preferences-v1.json",
  "recent-files": "recent-files-v1.json",
  "workspace-root": "workspace-root-v1.json"
};

type PendingStoreWrite = {
  content: string;
  scheduled: boolean;
  writing: boolean;
  waiters: Array<(result: boolean) => void>;
};

const pendingWrites = new Map<DesktopStoreKey, PendingStoreWrite>();

export async function readDesktopStoreText(key: DesktopStoreKey): Promise<string | null> {
  if (!isTauriRuntime()) return null;

  try {
    return await invoke<string | null>("read_app_state_file", { name: DESKTOP_STORE_FILES[key] });
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function queueDesktopStoreTextWrite(key: DesktopStoreKey, content: string): Promise<boolean> {
  if (!isTauriRuntime()) return Promise.resolve(false);

  const pending = pendingWrites.get(key) ?? {
    content,
    scheduled: false,
    writing: false,
    waiters: []
  };
  pending.content = content;
  pendingWrites.set(key, pending);

  const result = new Promise<boolean>((resolve) => pending.waiters.push(resolve));
  if (!pending.writing && !pending.scheduled) {
    pending.scheduled = true;
    queueMicrotask(() => {
      pending.scheduled = false;
      pending.writing = true;
      void flushDesktopStoreWrite(key, pending);
    });
  }

  return result;
}

async function flushDesktopStoreWrite(key: DesktopStoreKey, pending: PendingStoreWrite): Promise<void> {
  let result = false;
  let writtenContent = "";

  try {
    do {
      writtenContent = pending.content;
      try {
        await invoke("write_app_state_file", { name: DESKTOP_STORE_FILES[key], content: writtenContent });
        result = true;
      } catch (error) {
        console.warn(error);
        result = false;
      }
    } while (pending.content !== writtenContent);
  } finally {
    pending.writing = false;
    if (pendingWrites.get(key) === pending) pendingWrites.delete(key);
    const waiters = pending.waiters.splice(0);
    for (const resolve of waiters) resolve(result);
  }
}
