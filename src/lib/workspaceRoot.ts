import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { simplifyLocalPath } from "./localPathKeys";

const WORKSPACE_ROOT_KEY = "nya-markdownor-workspace-root-v1";

export type WorkspaceRootRecord = {
  version: 1;
  savedAt: number;
  rootPath: string | null;
};

export function loadWorkspaceRoot(): string | null {
  return loadWorkspaceRootRecord()?.rootPath ?? null;
}

export function loadWorkspaceRootRecord(): WorkspaceRootRecord | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_ROOT_KEY);
    if (!raw) return null;
    return parseWorkspaceRootRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function saveWorkspaceRoot(rootPath: string | null): boolean {
  const record = createWorkspaceRootRecord(rootPath);
  const serialized = JSON.stringify(record);
  void queueDesktopStoreTextWrite("workspace-root", serialized);

  try {
    localStorage.setItem(WORKSPACE_ROOT_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

export async function loadDesktopWorkspaceRootRecord(): Promise<WorkspaceRootRecord | null> {
  const raw = await readDesktopStoreText("workspace-root");
  return raw ? parseWorkspaceRootRecord(raw) : null;
}

export function createWorkspaceRootRecord(rootPath: string | null, savedAt = Date.now()): WorkspaceRootRecord {
  return {
    version: 1,
    savedAt,
    rootPath: typeof rootPath === "string" && rootPath ? simplifyLocalPath(rootPath) : null
  };
}

export function parseWorkspaceRootRecord(raw: string): WorkspaceRootRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = normalizeWorkspaceRootRecord(parsed);
    if (record) return record;
    if (typeof parsed === "string") return createWorkspaceRootRecord(parsed, 0);
    return null;
  } catch {
    return raw ? createWorkspaceRootRecord(raw, 0) : null;
  }
}

function normalizeWorkspaceRootRecord(value: unknown): WorkspaceRootRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<WorkspaceRootRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (typeof record.rootPath !== "string" && record.rootPath !== null) return null;

  return createWorkspaceRootRecord(record.rootPath ?? null, record.savedAt);
}
