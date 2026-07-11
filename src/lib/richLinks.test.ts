import { describe, expect, it } from "vitest";
import { normalizeRichLinkHref } from "./richLinks";

describe("rich links", () => {
  it("keeps safe external, anchor, and local Markdown targets", () => {
    expect(normalizeRichLinkHref(" https://example.com/docs ")).toBe("https://example.com/docs");
    expect(normalizeRichLinkHref("mailto:notes@example.com")).toBe("mailto:notes@example.com");
    expect(normalizeRichLinkHref("#current-section")).toBe("#current-section");
    expect(normalizeRichLinkHref("../notes/plan.md#next")).toBe("../notes/plan.md#next");
  });

  it("rejects empty, control-character, protocol-relative, and unsafe protocol targets", () => {
    expect(normalizeRichLinkHref("")).toBeNull();
    expect(normalizeRichLinkHref(" javascript:alert(1)")).toBeNull();
    expect(normalizeRichLinkHref("data:text/html,hello")).toBeNull();
    expect(normalizeRichLinkHref("ftp://example.com/archive")).toBeNull();
    expect(normalizeRichLinkHref("tel:+10000000000")).toBeNull();
    expect(normalizeRichLinkHref("//example.com")).toBeNull();
    expect(normalizeRichLinkHref("notes\n.md")).toBeNull();
  });
});
