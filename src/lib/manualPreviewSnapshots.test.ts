import { describe, expect, it } from "vitest";
import {
  clearManualPreviewSnapshot,
  manualPreviewSnapshotForTab,
  pruneManualPreviewSnapshots,
  setManualPreviewSnapshot,
  type ManualPreviewSnapshots
} from "./manualPreviewSnapshots";

describe("manual preview snapshots", () => {
  it("stores preview snapshots per document tab", () => {
    const snapshots = setManualPreviewSnapshot({}, "tab-a", "# A");
    const next = setManualPreviewSnapshot(snapshots, "tab-b", "# B");

    expect(manualPreviewSnapshotForTab(next, "tab-a")).toBe("# A");
    expect(manualPreviewSnapshotForTab(next, "tab-b")).toBe("# B");
    expect(manualPreviewSnapshotForTab(next, "missing")).toBe("");
  });

  it("clears only the requested tab snapshot", () => {
    const snapshots: ManualPreviewSnapshots = {
      "tab-a": "# A",
      "tab-b": "# B"
    };

    expect(clearManualPreviewSnapshot(snapshots, "tab-a")).toEqual({
      "tab-b": "# B"
    });
  });

  it("treats an empty manual snapshot as cleared", () => {
    const snapshots: ManualPreviewSnapshots = {
      "tab-a": "# A"
    };

    expect(setManualPreviewSnapshot(snapshots, "tab-a", "")).toEqual({});
  });

  it("prunes snapshots for tabs that are no longer open", () => {
    const snapshots: ManualPreviewSnapshots = {
      "tab-a": "# A",
      "tab-b": "# B",
      "tab-c": "# C"
    };

    expect(pruneManualPreviewSnapshots(snapshots, ["tab-a", "tab-c"])).toEqual({
      "tab-a": "# A",
      "tab-c": "# C"
    });
  });
});
