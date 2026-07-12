import { describe, expect, it } from "vitest";
import { normalizeBuildInfo } from "./buildInfo";

describe("normalizeBuildInfo", () => {
  it("uses trimmed build metadata when present", () => {
    expect(normalizeBuildInfo({
      name: " NyaMarkdownor ",
      version: " 1.2.3 ",
      commit: " abc123 ",
      buildDate: " 2026-07-12T00:00:00Z ",
      updateRepository: " stevennight/NyaMarkdownor "
    })).toEqual({
      name: "NyaMarkdownor",
      version: "1.2.3",
      commit: "abc123",
      buildDate: "2026-07-12T00:00:00Z",
      updateRepository: "stevennight/NyaMarkdownor"
    });
  });

  it("preserves fallback metadata for empty desktop values", () => {
    const fallback = {
      name: "NyaMarkdownor",
      version: "2.0.0-dev",
      commit: "local",
      buildDate: "2026-07-12T00:00:00Z",
      updateRepository: "stevennight/NyaMarkdownor"
    };

    expect(normalizeBuildInfo({ version: "" }, fallback)).toEqual(fallback);
  });
});
