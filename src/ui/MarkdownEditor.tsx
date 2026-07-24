import { forwardRef, useEffect, useRef, type ForwardedRef, type MutableRefObject } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { applyMarkdownBlockquoteBackspace, applyMarkdownLineContinuation, applyMarkdownListBackspace, applyMarkdownListIndentation, applyMarkdownListItemLineBreak, applyMarkdownTextCommand, applyTextChange, type MarkdownTextCommand, type TextEdit } from "../lib/editorCommands";
import { markdownRangesToClipboardPayload } from "../lib/markdown";
import { applySelectedTableCellsClear, applySelectedTableCellsPaste, applyTableCellLineBreak, applyTableCellNavigation, applyTableCsvPaste, applyTableDocumentCommand, applyTableRowsPaste, applyTableTsvPaste, type TableDocumentCommand } from "../lib/tableDocumentCommands";
import { clipboardRowsForTablePaste, type ClipboardTableSource } from "../lib/clipboardTableRows";
import { clipboardPayloadForCopyMode, explicitMarkdownFromClipboard, writeClipboardEventData } from "../lib/clipboard";
import { deleteSelectionRanges } from "../lib/selectionDelete";
import { shouldHandleDefaultCopy } from "../lib/selectionCopy";
import { getScrollProgress, setScrollProgress } from "../lib/scrollSync";
import type { TextRange } from "../lib/editorCommands";
import type { CopyMode } from "../types";
import { createEditorStateFromSnapshot, createEditorStateSnapshot, createExternalDocumentSyncTransaction, type EditorStateSnapshot } from "../lib/editorStateSnapshots";
import type { DocumentCursorPosition } from "../lib/documentMetrics";
import { uniqueSourceSelectionForText } from "../lib/sourceSelectionText";
import { markdownFrontMatterMarks } from "./markdownFrontMatterPlugin";
import { markdownSyntaxMarks } from "./markdownSyntaxPlugin";
import { searchHighlightField, setSearchHighlights } from "./searchHighlightPlugin";
import {
  createSourceEditorSyncScheduler,
  sourceEditorSyncDelayFor,
  type SourceEditorSyncScheduler
} from "../lib/sourceEditorSync";

type EditorSelectionPayload = TextRange & {
  ranges: TextRange[];
  cursorPosition: DocumentCursorPosition;
};

type MarkdownEditorProps = {
  editorSessionKey: string;
  editorStateSnapshot?: EditorStateSnapshot;
  markdown: string;
  placeholderText: string;
  copyMode: CopyMode;
  onChange: (markdown: string) => void;
  onSelectionChange: (selection: EditorSelectionPayload) => void;
  onEditorViewChange?: (sessionKey: string, view: EditorView | null) => void;
  onEditorStateSnapshotChange?: (sessionKey: string, snapshot: EditorStateSnapshot) => void;
  onScrollProgress?: (progress: number) => void;
  initialScrollProgress?: number;
  initialSelectionText?: string;
  onInitialSelectionTextResolved?: () => void;
  searchMatches?: TextRange[];
  activeSearchRange?: TextRange | null;
  onInsertTableRequest?: () => void;
  onToast: (message: string) => void;
};

export const MarkdownEditor = forwardRef<EditorView | null, MarkdownEditorProps>(function MarkdownEditor(
  {
    editorSessionKey,
    editorStateSnapshot,
    markdown: value,
    placeholderText,
    copyMode,
    onChange,
    onSelectionChange,
    onEditorViewChange,
    onEditorStateSnapshotChange,
    onScrollProgress,
    initialScrollProgress,
    initialSelectionText,
    onInitialSelectionTextResolved,
    searchMatches = [],
    activeSearchRange = null,
    onInsertTableRequest,
    onToast
  },
  forwardedRef
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editorSessionKeyRef = useRef(editorSessionKey);
  const valueRef = useRef(value);
  const synchronizedMarkdownRef = useRef(value);
  const copyModeRef = useRef(copyMode);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onEditorViewChangeRef = useRef(onEditorViewChange);
  const onEditorStateSnapshotChangeRef = useRef(onEditorStateSnapshotChange);
  const onScrollProgressRef = useRef(onScrollProgress);
  const onInitialSelectionTextResolvedRef = useRef(onInitialSelectionTextResolved);
  const onInsertTableRequestRef = useRef(onInsertTableRequest);
  const onToastRef = useRef(onToast);
  const placeholderCompartmentRef = useRef(new Compartment());
  const sourceEditorSyncRef = useRef<SourceEditorSyncScheduler<EditorState> | null>(null);

  editorSessionKeyRef.current = editorSessionKey;
  valueRef.current = value;
  copyModeRef.current = copyMode;
  onChangeRef.current = onChange;
  onSelectionChangeRef.current = onSelectionChange;
  onEditorViewChangeRef.current = onEditorViewChange;
  onEditorStateSnapshotChangeRef.current = onEditorStateSnapshotChange;
  onScrollProgressRef.current = onScrollProgress;
  onInitialSelectionTextResolvedRef.current = onInitialSelectionTextResolved;
  onInsertTableRequestRef.current = onInsertTableRequest;
  onToastRef.current = onToast;
  if (!sourceEditorSyncRef.current) {
    sourceEditorSyncRef.current = createSourceEditorSyncScheduler(
      (state) => state.doc.toString(),
      (nextMarkdown) => {
        if (nextMarkdown === synchronizedMarkdownRef.current) return;
        synchronizedMarkdownRef.current = nextMarkdown;
        onChangeRef.current(nextMarkdown);
      },
      (state) => reportSelection(state, onSelectionChangeRef.current)
    );
  }

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const extensions = createEditorExtensions({
      onInsertTableRequestRef,
      onToastRef,
      copyModeRef,
      placeholderCompartment: placeholderCompartmentRef.current,
      placeholderText,
      sourceEditorSync: sourceEditorSyncRef.current!
    });
    const initialState = createEditorStateFromSnapshot(valueRef.current, extensions, editorStateSnapshot);
    const initialSelection = initialSelectionText
      ? uniqueSourceSelectionForText(valueRef.current, initialSelectionText)
      : null;
    const view = new EditorView({
      parent: hostRef.current,
      state: initialSelection
        ? initialState.update({ selection: { anchor: initialSelection.from, head: initialSelection.to } }).state
        : initialState
    });

    if (initialSelectionText) onInitialSelectionTextResolvedRef.current?.();

    synchronizedMarkdownRef.current = valueRef.current;
    viewRef.current = view;
    assignRef(forwardedRef, view);
    onEditorViewChangeRef.current?.(editorSessionKeyRef.current, view);
    reportSelection(view.state, onSelectionChangeRef.current);

    let scrollFrame: number | null = null;
    let restoreScrollFrame: number | null = null;
    const reportScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        onScrollProgressRef.current?.(getScrollProgress(view.scrollDOM));
      });
    };

    view.scrollDOM.addEventListener("scroll", reportScroll, { passive: true });
    const restoredScrollProgress = initialScrollProgress ?? editorStateSnapshot?.scrollProgress;
    if (typeof restoredScrollProgress === "number" && Number.isFinite(restoredScrollProgress)) {
      restoreScrollFrame = window.requestAnimationFrame(() => {
        restoreScrollFrame = null;
        setScrollProgress(view.scrollDOM, restoredScrollProgress);
      });
    }

    return () => {
      sourceEditorSyncRef.current?.flush({ reportSelection: false });
      onEditorStateSnapshotChangeRef.current?.(
        editorSessionKeyRef.current,
        createEditorStateSnapshot(view.state, getScrollProgress(view.scrollDOM))
      );
      onEditorViewChangeRef.current?.(editorSessionKeyRef.current, null);
      view.scrollDOM.removeEventListener("scroll", reportScroll);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      if (restoreScrollFrame !== null) window.cancelAnimationFrame(restoreScrollFrame);
      view.destroy();
      viewRef.current = null;
      assignRef(forwardedRef, null);
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (synchronizedMarkdownRef.current === value) return;

    sourceEditorSyncRef.current?.cancel();
    synchronizedMarkdownRef.current = value;
    if (view.state.doc.length === value.length && view.state.doc.toString() === value) return;
    view.dispatch(createExternalDocumentSyncTransaction(view.state, value));
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartmentRef.current.reconfigure(placeholder(placeholderText))
    });
  }, [placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setSearchHighlights.of({
        matches: searchMatches,
        active: activeSearchRange
      })
    });
  }, [activeSearchRange, searchMatches]);

  return <div className="codemirror-host" ref={hostRef} />;
});

type EditorExtensionRefs = {
  copyModeRef: MutableRefObject<CopyMode>;
  onInsertTableRequestRef: MutableRefObject<(() => void) | undefined>;
  onToastRef: MutableRefObject<(message: string) => void>;
  sourceEditorSync: SourceEditorSyncScheduler<EditorState>;
  placeholderCompartment: Compartment;
  placeholderText: string;
};

function createEditorExtensions({
  copyModeRef,
  onInsertTableRequestRef,
  onToastRef,
  placeholderCompartment,
  placeholderText,
  sourceEditorSync
}: EditorExtensionRefs): Extension {
  return [
    lineNumbers(),
    EditorState.allowMultipleSelections.of(true),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([
      { key: "Shift-Enter", run: insertTableCellLineBreak },
      { key: "Shift-Enter", run: insertMarkdownListItemLineBreak },
      { key: "Alt-Enter", run: insertTableCellLineBreak },
      { key: "Tab", run: moveTableCell(false) },
      { key: "Shift-Tab", run: moveTableCell(true) },
      { key: "Tab", run: indentMarkdownList },
      { key: "Shift-Tab", run: outdentMarkdownList },
      { key: "Enter", run: addTableRowFromEnter },
      { key: "Enter", run: continueMarkdownLine },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    markdown({ base: markdownLanguage }),
    markdownFrontMatterMarks,
    markdownSyntaxMarks,
    searchHighlightField,
    placeholderCompartment.of(placeholder(placeholderText)),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        sourceEditorSync.schedule(
          update.state,
          update.docChanged,
          sourceEditorSyncDelayFor(update.state.doc.length)
        );
      }
    }),
    EditorView.domEventHandlers({
      keydown(event, view) {
        if ((event.key === "Backspace" || event.key === "Delete") && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const edit = applySelectedTableCellsClear(view.state.doc.toString(), view.state.selection.ranges);
          if (edit) {
            dispatchTextEdit(view, edit);
            event.preventDefault();
            onToastRef.current("Cleared selected table cells");
            return true;
          }
        }

        if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const range = view.state.selection.main;
          const markdown = view.state.doc.toString();
          const edit = applyMarkdownListBackspace(markdown, { from: range.from, to: range.to })
            ?? applyMarkdownBlockquoteBackspace(markdown, { from: range.from, to: range.to });
          if (edit) {
            dispatchTextEdit(view, edit);
            event.preventDefault();
            return true;
          }
        }

        const tableCommand = tableCommandFromKeyboardEvent(event);
        if (tableCommand) {
          if (tableCommand === "insert" && onInsertTableRequestRef.current) {
            event.preventDefault();
            onInsertTableRequestRef.current();
            return true;
          }

          const range = view.state.selection.main;
          const edit = applyTableDocumentCommand(view.state.doc.toString(), { from: range.from, to: range.to }, tableCommand);
          if (!edit) return false;

          dispatchFullDocumentEdit(view, edit);
          event.preventDefault();
          onToastRef.current(toastForTableCommand(tableCommand));
          return true;
        }

        const command = textCommandFromKeyboardEvent(event);
        if (!command) return false;

        const range = view.state.selection.main;
        const edit = applyMarkdownTextCommand(view.state.doc.toString(), { from: range.from, to: range.to }, command);
        dispatchFullDocumentEdit(view, edit);
        event.preventDefault();
        onToastRef.current(toastForCommand(command));
        return true;
      },
      copy(event, view) {
        const selections = view.state.selection.ranges;
        if (!shouldHandleDefaultCopy(selections.some((selection) => !selection.empty))) return false;

        const copied = writeClipboardEventData(
          event,
          clipboardPayloadForCopyMode(
            markdownRangesToClipboardPayload(view.state.doc.toString(), selections),
            copyModeRef.current
          )
        );
        if (!copied) return false;

        event.preventDefault();
        onToastRef.current(copyModeRef.current === "markdown"
          ? "Copied Markdown selection"
          : copyModeRef.current === "smart"
            ? "Copied clean text, HTML, and Markdown"
            : "Copied clean text selection");
        return true;
      },
      cut(event, view) {
        const selections = view.state.selection.ranges;
        if (selections.every((selection) => selection.empty)) return false;

        const source = view.state.doc.toString();
        const edit = applySelectedTableCellsClear(source, selections);
        if (edit) {
          const copied = writeClipboardEventData(
            event,
            clipboardPayloadForCopyMode(markdownRangesToClipboardPayload(source, selections), copyModeRef.current)
          );
          if (!copied) return false;

          dispatchTextEdit(view, edit);
          event.preventDefault();
          onToastRef.current("Cut table cells");
          return true;
        }

        const deletion = deleteSelectionRanges(source, selections);
        if (!deletion) return false;

        const copied = writeClipboardEventData(
          event,
          clipboardPayloadForCopyMode(markdownRangesToClipboardPayload(source, selections), copyModeRef.current)
        );
        if (!copied) return false;

        view.dispatch({
          changes: deletion.ranges.map((range) => ({ from: range.from, to: range.to, insert: "" })),
          selection: { anchor: deletion.selection.from },
          scrollIntoView: true
        });
        event.preventDefault();
        onToastRef.current(copyModeRef.current === "markdown"
          ? "Cut Markdown"
          : copyModeRef.current === "smart"
            ? "Cut clean text, HTML, and Markdown"
            : "Cut clean text");
        return true;
      },
      paste(event, view) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const html = event.clipboardData?.getData("text/html") ?? "";
        const markdown = event.clipboardData?.getData("text/markdown") ?? "";

        const selection = view.state.selection.main;
        const selections = view.state.selection.ranges;
        const source = view.state.doc.toString();

        const tablePaste = clipboardRowsForTablePaste({ text, html, markdown });
        if (tablePaste) {
          const selectedCellsEdit = applySelectedTableCellsPaste(source, selections, tablePaste.rows);
          if (selectedCellsEdit) {
            dispatchTextEdit(view, selectedCellsEdit);
            event.preventDefault();
            onToastRef.current(`Filled selected table cells from ${clipboardTableSourceLabel(tablePaste.source)}`);
            return true;
          }

          const tableEdit = tablePaste.source === "tsv"
            ? applyTableTsvPaste(source, { from: selection.from, to: selection.to }, text)
            : tablePaste.source === "csv"
              ? applyTableCsvPaste(source, { from: selection.from, to: selection.to }, text)
              : applyTableRowsPaste(source, { from: selection.from, to: selection.to }, tablePaste.rows);
          if (tableEdit) {
            dispatchTextEdit(view, tableEdit);
            event.preventDefault();
            onToastRef.current(`Filled table from ${clipboardTableSourceLabel(tablePaste.source)}`);
            return true;
          }

        }

        const sourceMarkdown = explicitMarkdownFromClipboard({ markdown });
        if (sourceMarkdown !== null) {
          view.dispatch({ ...view.state.replaceSelection(sourceMarkdown), scrollIntoView: true });
          event.preventDefault();
          return true;
        }

        if (tablePaste?.markdownTable) {
          view.dispatch({ ...view.state.replaceSelection(tablePaste.markdownTable), scrollIntoView: true });
          event.preventDefault();
          onToastRef.current(`Pasted ${clipboardTableSourceLabel(tablePaste.source)} as Markdown table`);
          return true;
        }

        if (text && !/[\r\n]/.test(text)) {
          const selectedCellsEdit = applySelectedTableCellsPaste(source, selections, [[text]]);
          if (selectedCellsEdit) {
            dispatchTextEdit(view, selectedCellsEdit);
            event.preventDefault();
            onToastRef.current("Filled selected table cells");
            return true;
          }
        }

        return false;
      }
    }),
    EditorView.theme({
      "&": {
        height: "100%",
        background: "var(--editor-bg)",
        color: "var(--text)"
      },
      ".cm-scroller": {
        fontFamily: "var(--mono)",
        lineHeight: "var(--editor-line-height)",
        fontSize: "var(--editor-font-size)",
        padding: "var(--editor-scroll-padding) 0 90px"
      },
      ".cm-content": {
        maxWidth: "var(--editor-content-width)",
        margin: "0 auto",
        padding: "0 34px",
        caretColor: "var(--accent)"
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        background: "var(--selection)"
      },
      ".cm-activeLine": {
        background: "transparent"
      },
      ".cm-activeLineGutter": {
        background: "transparent"
      },
      ".cm-gutters": {
        background: "var(--editor-bg)",
        color: "var(--muted)",
        border: "0"
      },
      ".cm-focused": {
        outline: "none"
      }
    })
  ];
}

function reportSelection(
  state: EditorState,
  onSelectionChange: (selection: EditorSelectionPayload) => void
): void {
  const range = state.selection.main;
  const cursorLine = state.doc.lineAt(range.from);
  onSelectionChange({
    from: range.from,
    to: range.to,
    ranges: state.selection.ranges.map((selection) => ({ from: selection.from, to: selection.to })),
    cursorPosition: {
      line: cursorLine.number,
      column: Array.from(state.sliceDoc(cursorLine.from, range.from)).length + 1
    }
  });
}

function moveTableCell(backwards: boolean) {
  return (view: EditorView): boolean => {
    const range = view.state.selection.main;
    const edit = applyTableCellNavigation(view.state.doc.toString(), { from: range.from, to: range.to }, backwards ? "previous" : "next");
    if (!edit) return false;

    dispatchTextEdit(view, edit);
    return true;
  };
}

function insertTableCellLineBreak(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyTableCellLineBreak(view.state.doc.toString(), { from: range.from, to: range.to });
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function addTableRowFromEnter(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyTableDocumentCommand(view.state.doc.toString(), { from: range.from, to: range.to }, "add-row");
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function continueMarkdownLine(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyMarkdownLineContinuation(view.state.doc.toString(), { from: range.from, to: range.to });
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function insertMarkdownListItemLineBreak(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyMarkdownListItemLineBreak(view.state.doc.toString(), { from: range.from, to: range.to });
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function indentMarkdownList(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyMarkdownListIndentation(view.state.doc.toString(), { from: range.from, to: range.to }, "indent");
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function outdentMarkdownList(view: EditorView): boolean {
  const range = view.state.selection.main;
  const edit = applyMarkdownListIndentation(view.state.doc.toString(), { from: range.from, to: range.to }, "outdent");
  if (!edit) return false;

  dispatchTextEdit(view, edit);
  return true;
}

function textCommandFromKeyboardEvent(event: KeyboardEvent): MarkdownTextCommand | null {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return null;

  const key = event.key.toLowerCase();
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "k") return "link";
  if (event.key === "`") return "code";
  return null;
}

function tableCommandFromKeyboardEvent(event: KeyboardEvent): TableDocumentCommand | null {
  if (!(event.ctrlKey || event.metaKey) || !event.altKey) return null;

  if (event.shiftKey) {
    if (event.key === "Enter") return "add-row-before";
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "t") return "insert";
  if (key === "l") return "normalize";
  if (event.key === "Enter") return "add-row";
  if (event.key === "[") return "add-column-before";
  if (event.key === "]") return "add-column";
  if (event.key === "ArrowUp") return "move-row-up";
  if (event.key === "ArrowDown") return "move-row-down";
  if (event.key === "ArrowLeft") return "move-column-left";
  if (event.key === "ArrowRight") return "move-column-right";
  return null;
}

function dispatchFullDocumentEdit(view: EditorView, edit: TextEdit): void {
  dispatchTextEdit(view, edit);
}

function dispatchTextEdit(view: EditorView, edit: TextEdit): void {
  const current = view.state.doc.toString();
  if (edit.markdown === current) {
    view.dispatch({
      selection: { anchor: edit.selection.from, head: edit.selection.to },
      scrollIntoView: true
    });
    return;
  }

  if (edit.change && applyTextChange(current, edit.change) === edit.markdown) {
    view.dispatch({
      changes: edit.change,
      selection: { anchor: edit.selection.from, head: edit.selection.to },
      scrollIntoView: true
    });
    return;
  }

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: edit.markdown },
    selection: { anchor: edit.selection.from, head: edit.selection.to },
    scrollIntoView: true
  });
}

function toastForCommand(command: MarkdownTextCommand): string {
  switch (command) {
    case "bold":
      return "Bold";
    case "italic":
      return "Italic";
    case "code":
      return "Inline code";
    case "link":
      return "Link";
  }
}

function toastForTableCommand(command: TableDocumentCommand): string {
  switch (command) {
    case "insert":
      return "Table inserted";
    case "normalize":
      return "Table aligned";
    case "add-row":
      return "Row added";
    case "add-row-before":
      return "Row added";
    case "add-column":
      return "Column added";
    case "add-column-before":
      return "Column added";
    case "delete-row":
      return "Row deleted";
    case "delete-column":
      return "Column deleted";
    case "delete-table":
      return "Table deleted";
    case "duplicate-row":
      return "Row duplicated";
    case "duplicate-column":
      return "Column duplicated";
    case "move-row-up":
      return "Row moved up";
    case "move-row-down":
      return "Row moved down";
    case "move-column-left":
      return "Column moved left";
    case "move-column-right":
      return "Column moved right";
    case "sort-column-asc":
      return "Column sorted ascending";
    case "sort-column-desc":
      return "Column sorted descending";
    case "align-column-default":
      return "Column alignment cleared";
    case "align-column-left":
      return "Column aligned left";
    case "align-column-center":
      return "Column aligned center";
    case "align-column-right":
      return "Column aligned right";
  }
}

function clipboardTableSourceLabel(source: ClipboardTableSource): string {
  switch (source) {
    case "html":
      return "HTML table";
    case "markdown":
      return "Markdown table";
    case "tsv":
      return "TSV";
    case "csv":
      return "CSV";
    case "space":
      return "space-aligned table";
    case "lines":
      return "lines";
  }
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}
