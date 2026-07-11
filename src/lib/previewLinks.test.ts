import { describe, expect, it } from "vitest";
import {
  classifyPreviewLinkHref,
  previewAnchorIdCandidatesFromHref,
  previewAnchorIdFromHref,
  shouldOpenPreviewLinkWithModifier
} from "./previewLinks";

describe("preview links", () => {
  it("classifies preview hrefs by editor-safe behavior", () => {
    expect(classifyPreviewLinkHref("")).toBe("empty");
    expect(classifyPreviewLinkHref("#intro")).toBe("anchor");
    expect(classifyPreviewLinkHref("next.md")).toBe("local-markdown");
    expect(classifyPreviewLinkHref("../notes/next.markdown#intro")).toBe("local-markdown");
    expect(classifyPreviewLinkHref("https://example.com")).toBe("external");
    expect(classifyPreviewLinkHref("//example.com/path")).toBe("external");
    expect(classifyPreviewLinkHref("assets/report.pdf")).toBe("local-other");
    expect(classifyPreviewLinkHref("obsidian://open?vault=notes")).toBe("blocked-protocol");
    expect(classifyPreviewLinkHref("javascript:alert(1)")).toBe("blocked-protocol");
  });

  it("requires a desktop-style modifier for opening external preview links", () => {
    expect(shouldOpenPreviewLinkWithModifier({ ctrlKey: true })).toBe(true);
    expect(shouldOpenPreviewLinkWithModifier({ metaKey: true })).toBe(true);
    expect(shouldOpenPreviewLinkWithModifier({})).toBe(false);
  });

  it("decodes in-document anchor ids", () => {
    expect(previewAnchorIdFromHref("#Heading%201")).toBe("Heading 1");
    expect(previewAnchorIdFromHref("#")).toBeNull();
    expect(previewAnchorIdFromHref("intro")).toBeNull();
  });

  it("offers generated heading slug fallbacks for author-friendly anchors", () => {
    expect(previewAnchorIdCandidatesFromHref("#Heading%201")).toEqual(["Heading 1", "heading-1"]);
    expect(previewAnchorIdCandidatesFromHref("#中文%20标题")).toEqual(["中文 标题", "中文-标题"]);
    expect(previewAnchorIdCandidatesFromHref("#already-slugged")).toEqual(["already-slugged"]);
    expect(previewAnchorIdCandidatesFromHref("#")).toEqual([]);
  });
});
