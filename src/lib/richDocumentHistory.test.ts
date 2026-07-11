import { describe, expect, it } from "vitest";
import {
  EMPTY_RICH_DOCUMENT_HISTORY,
  applyRichDocumentHistoryAction,
  recordRichDocumentChange
} from "./richDocumentHistory";

describe("rich document history", () => {
  it("restores and reapplies snapshots after a visual editor remount", () => {
    const afterFirst = recordRichDocumentChange(EMPTY_RICH_DOCUMENT_HISTORY, "A", "AB", "input");
    const afterSecond = recordRichDocumentChange(afterFirst, "AB", "ABC", "input");

    const undone = applyRichDocumentHistoryAction(afterSecond, "ABC", "undo");
    expect(undone).toEqual({ markdown: "AB", history: { past: ["A"], future: ["ABC"] } });

    const redone = applyRichDocumentHistoryAction(undone!.history, undone!.markdown, "redo");
    expect(redone).toEqual({ markdown: "ABC", history: { past: ["A", "AB"], future: [] } });
  });

  it("keeps the fallback history coherent when native undo groups multiple edits", () => {
    let history = recordRichDocumentChange(EMPTY_RICH_DOCUMENT_HISTORY, "A", "AB", "input");
    history = recordRichDocumentChange(history, "AB", "ABC", "input");
    history = recordRichDocumentChange(history, "ABC", "ABCD", "input");

    const afterUndo = recordRichDocumentChange(history, "ABCD", "A", "undo");
    expect(afterUndo).toEqual({ past: [], future: ["ABCD"] });

    const afterRedo = recordRichDocumentChange(afterUndo, "A", "ABCD", "redo");
    expect(afterRedo).toEqual({ past: ["A"], future: [] });
  });

  it("clears redo snapshots when a new visual edit follows an undo", () => {
    const history = { past: ["A"], future: ["ABC"] };
    expect(recordRichDocumentChange(history, "AB", "ABX", "input")).toEqual({
      past: ["A", "AB"],
      future: []
    });
  });
});
