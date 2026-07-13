import { describe, expect, it } from "vitest";
import { normalizeUpdateCheckResult } from "./appUpdates";

describe("normalizeUpdateCheckResult", () => {
  it("normalizes an available GitHub release", () => {
    expect(normalizeUpdateCheckResult({
      status: "available",
      currentVersion: " 1.0.2 ",
      version: " 1.1.0 ",
      releaseName: " NyaMarkdownor v1.1.0 ",
      releaseNotes: " fixes ",
      publishedAt: " 2026-07-13T00:00:00Z "
    })).toEqual({
      status: "available",
      currentVersion: "1.0.2",
      version: "1.1.0",
      releaseName: "NyaMarkdownor v1.1.0",
      releaseNotes: "fixes",
      publishedAt: "2026-07-13T00:00:00Z"
    });
  });

  it("keeps portable installations explicitly unsupported", () => {
    expect(normalizeUpdateCheckResult({
      status: "unsupported",
      currentVersion: "1.0.2",
      reason: "notInstalled"
    })).toEqual({
      status: "unsupported",
      currentVersion: "1.0.2",
      reason: "notInstalled"
    });
  });

  it("rejects incomplete or unknown updater responses", () => {
    expect(() => normalizeUpdateCheckResult({ status: "available", currentVersion: "1.0.2" })).toThrow();
    expect(() => normalizeUpdateCheckResult({ status: "other", currentVersion: "1.0.2" })).toThrow();
  });
});
