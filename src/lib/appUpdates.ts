import { invoke } from "@tauri-apps/api/core";
import { bundledBuildInfo } from "./buildInfo";
import { isTauriRuntime } from "./fileIo";

export type UpdateSupportReason = "developmentBuild" | "notInstalled" | "unsupportedPlatform";

export type UpdateCheckResult =
  | {
    status: "unsupported";
    currentVersion: string;
    reason: UpdateSupportReason;
  }
  | {
    status: "upToDate";
    currentVersion: string;
  }
  | {
    status: "available";
    currentVersion: string;
    version: string;
    releaseName: string;
    releaseNotes: string;
    publishedAt: string;
  };

export type ApplicationUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | UpdateCheckResult
  | { status: "installing"; version: string }
  | { status: "error"; message: string };

export async function checkForApplicationUpdates(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      status: "unsupported",
      currentVersion: bundledBuildInfo.version,
      reason: "unsupportedPlatform"
    };
  }
  return normalizeUpdateCheckResult(await invoke<unknown>("check_for_updates"));
}

export async function downloadAndInstallApplicationUpdate(version: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("Automatic updates require the installed desktop app.");
  await invoke("download_and_install_update", { version });
}

export function normalizeUpdateCheckResult(value: unknown): UpdateCheckResult {
  if (!isRecord(value)) throw new Error("The desktop updater returned an invalid response.");

  const status = value.status;
  const currentVersion = requiredString(value.currentVersion);
  if (status === "upToDate") return { status, currentVersion };
  if (status === "unsupported") {
    const reason = value.reason;
    if (reason !== "developmentBuild" && reason !== "notInstalled" && reason !== "unsupportedPlatform") {
      throw new Error("The desktop updater returned an invalid support status.");
    }
    return { status, currentVersion, reason };
  }
  if (status === "available") {
    return {
      status,
      currentVersion,
      version: requiredString(value.version),
      releaseName: requiredString(value.releaseName),
      releaseNotes: optionalString(value.releaseNotes),
      publishedAt: optionalString(value.publishedAt)
    };
  }
  throw new Error("The desktop updater returned an unknown status.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The desktop updater returned incomplete version information.");
  }
  return value.trim();
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
