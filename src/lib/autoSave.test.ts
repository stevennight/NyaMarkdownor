import { describe, expect, it } from "vitest";
import { shouldQueueAutoSave, shouldRetryAutoSave } from "./autoSave";

describe("automatic local saves", () => {
  const savedDocument = {
    filePath: "D:/notes/Plan.md",
    markdown: "# Plan",
    lastSavedMarkdown: "# Plan"
  };

  it("only queues dirty path-backed documents with a safe disk state", () => {
    expect(shouldQueueAutoSave({ ...savedDocument, markdown: "# Changed" }, true, false)).toBe(true);
    expect(shouldQueueAutoSave({ ...savedDocument, markdown: "# Changed" }, false, false)).toBe(false);
    expect(shouldQueueAutoSave({ ...savedDocument, filePath: null, markdown: "# Changed" }, true, false)).toBe(false);
    expect(shouldQueueAutoSave({ ...savedDocument, markdown: "# Changed" }, true, true)).toBe(false);
    expect(shouldQueueAutoSave(savedDocument, true, false)).toBe(false);
  });

  it("retries only after the document changed since its last automatic attempt", () => {
    expect(shouldRetryAutoSave(undefined, "# Plan")).toBe(true);
    expect(shouldRetryAutoSave("# Plan", "# Plan")).toBe(false);
    expect(shouldRetryAutoSave("# Plan", "# Changed")).toBe(true);
  });
});
