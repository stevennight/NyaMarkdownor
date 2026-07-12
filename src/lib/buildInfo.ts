import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./fileIo";

export type BuildInfo = {
  name: string;
  version: string;
  commit: string;
  buildDate: string;
  updateRepository: string;
};

declare const __APP_INFO__: Partial<BuildInfo>;

const developmentBuildInfo: BuildInfo = {
  name: "NyaMarkdownor",
  version: "0.1.0-dev",
  commit: "",
  buildDate: "",
  updateRepository: "stevennight/NyaMarkdownor"
};

function valueOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeBuildInfo(value: Partial<BuildInfo>, fallback: BuildInfo = developmentBuildInfo): BuildInfo {
  return {
    name: valueOrFallback(value.name, fallback.name),
    version: valueOrFallback(value.version, fallback.version),
    commit: valueOrFallback(value.commit, fallback.commit),
    buildDate: valueOrFallback(value.buildDate, fallback.buildDate),
    updateRepository: valueOrFallback(value.updateRepository, fallback.updateRepository)
  };
}

const injectedBuildInfo = typeof __APP_INFO__ === "undefined" ? {} : __APP_INFO__;

export const bundledBuildInfo = normalizeBuildInfo(injectedBuildInfo);

export async function resolveBuildInfo(): Promise<BuildInfo> {
  if (!isTauriRuntime()) return bundledBuildInfo;

  try {
    return normalizeBuildInfo(await invoke<Partial<BuildInfo>>("get_build_info"), bundledBuildInfo);
  } catch (error) {
    console.warn("Could not read desktop build information", error);
    return bundledBuildInfo;
  }
}
