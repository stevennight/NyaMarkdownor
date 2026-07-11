import { describe, expect, it, vi } from "vitest";
import { createMarkdownOutlineCache } from "./markdownOutlineCache";

describe("Markdown outline cache", () => {
  it("reuses headings while the outline Markdown is unchanged", () => {
    const extract = vi.fn((markdown: string) => [{ level: 1, text: markdown, line: 0, id: markdown }]);
    const cache = createMarkdownOutlineCache(extract);

    const first = cache.headingsFor("# Notes");
    const repeated = cache.headingsFor("# Notes");

    expect(extract).toHaveBeenCalledOnce();
    expect(repeated).toBe(first);
  });

  it("refreshes headings when the outline Markdown changes", () => {
    const extract = vi.fn((markdown: string) => [{ level: 1, text: markdown, line: 0, id: markdown }]);
    const cache = createMarkdownOutlineCache(extract);

    cache.headingsFor("# First");
    const changed = cache.headingsFor("# Second");

    expect(extract).toHaveBeenCalledTimes(2);
    expect(changed).toEqual([{ level: 1, text: "# Second", line: 0, id: "# Second" }]);
  });
});
