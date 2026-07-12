import { forwardRef, useEffect, useImperativeHandle, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { type Editor } from "@tiptap/core";
import { Trash2 } from "lucide-react";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { MarkdownBlockCommand, MarkdownListIndentDirection, MarkdownTextCommand } from "../lib/editorCommands";
import type { TableDocumentCommand } from "../lib/tableDocumentCommands";
import { findTextMatches, type SearchMatch, type SearchOptions } from "../lib/search";
import type { TextRange } from "../lib/editorCommands";
import { createRichMarkdownSyncScheduler, richMarkdownSyncDelayFor, type RichMarkdownSyncSource } from "../lib/richMarkdownSync";
import { richTableClipboardFormats, type RichTableClipboardFormats } from "../lib/richTableClipboard";
import { writeClipboardEventData } from "../lib/clipboard";
import { clipboardTableRowsFromData, type ClipboardTableSource } from "../lib/clipboardTableRows";
import type { RichDocumentHistoryAction } from "../lib/richDocumentHistory";
import { richTableSelectionFor, richTableSelectionSummary, type RichTableSelectionCommand, type RichTableSelectionSummary } from "../lib/richTableSelection";
import { richTableColumnAlignmentTransaction, type RichTableColumnAlignment } from "../lib/richTableAlignment";
import { richTableSortTransaction } from "../lib/richTableSort";
import { richTablePasteCapacity, richTablePasteTransaction, type RichTablePasteCapacity } from "../lib/richTablePaste";
import type { TableSortDirection } from "../lib/tables";
import { getScrollProgress, setScrollProgress } from "../lib/scrollSync";
import { activeRichHeadingIndexAtPosition, richHeadingPositionAtIndex } from "../lib/richOutlineNavigation";
import { uniqueRichTextSelectionForText } from "../lib/richSelectionText";
import { markdownFrontMatterEditor, promoteMarkdownFrontMatter, splitMarkdownFrontMatter, updateMarkdownFrontMatterContent, withMarkdownFrontMatter } from "../lib/markdownFrontMatter";
import { shouldHandleSmartCopy } from "../lib/selectionCopy";
import { richTableStructureTransaction, type RichTableStructureCommand } from "../lib/richTableStructure";
import { createRichMarkdownExtensions } from "../lib/richMarkdownExtensions";
import { withoutGeneratedTrailingParagraph } from "../lib/richMarkdownDocument";
import { shouldOpenRichLinkOnClick } from "../lib/richLinks";

type RichTableCommand = Extract<
  TableDocumentCommand,
  "add-row" | "add-row-before" | "add-column" | "add-column-before" | "delete-row" | "delete-column" | "delete-table" | RichTableStructureCommand
>;

export type RichMarkdownEditorHandle = {
  focus: () => void;
  scrollToHeading: (headingIndex: number) => boolean;
  flushMarkdownSync: () => boolean;
  getScrollProgress: () => number | null;
  runHistoryAction: (action: RichDocumentHistoryAction) => boolean;
  runTextCommand: (command: MarkdownTextCommand) => boolean;
  getLinkState: () => { href: string; active: boolean } | null;
  setLink: (href: string) => boolean;
  unsetLink: () => boolean;
  getSelectionRange: () => TextRange | null;
  getSelectedText: () => string;
  findTextMatches: (query: string, options: SearchOptions) => SearchMatch[];
  selectTextRange: (range: TextRange) => boolean;
  replaceTextRange: (range: TextRange, replacement: string) => boolean;
  replaceAllTextMatches: (query: string, replacement: string, options: SearchOptions) => number;
  runBlockCommand: (command: MarkdownBlockCommand) => boolean;
  runListIndentation: (direction: MarkdownListIndentDirection) => boolean;
  insertTable: (options: { columns: number; bodyRows: number }) => boolean;
  insertMarkdown: (markdown: string) => boolean;
  runTableCommand: (command: RichTableCommand) => boolean;
  alignCurrentTableColumn: (alignment: RichTableColumnAlignment) => boolean;
  sortCurrentTableColumn: (direction: TableSortDirection) => boolean;
  runTableSelectionCommand: (command: RichTableSelectionCommand) => boolean;
  getSelectionClipboardContent: () => RichMarkdownClipboardContent | null;
  getTableClipboardContent: () => RichTableClipboardContent | null;
};

export type RichMarkdownClipboardContent = {
  markdown: string;
  plainText: string;
  html: string;
  selected: boolean;
};

export type RichTableClipboardContent = RichTableClipboardFormats & {
  selected: boolean;
};

type RichMarkdownEditorProps = {
  documentFilePath: string | null;
  markdown: string;
  smartCopy: boolean;
  onChange: (markdown: string, source: RichMarkdownSyncSource) => void;
  onHistoryAction: (action: RichDocumentHistoryAction) => boolean;
  onTableContextChange: (active: boolean) => void;
  onTableSelectionChange: (summary: RichTableSelectionSummary | null) => void;
  onSelectionChange: (selection: TextRange) => void;
  onActiveHeadingIndexChange: (index: number | null) => void;
  onOpenLink: (href: string) => void;
  onToast: (message: string) => void;
  scrollProgress?: number;
  onScrollProgress?: (progress: number) => void;
  selection?: TextRange;
  selectionText?: string;
};

export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle | null, RichMarkdownEditorProps>(function RichMarkdownEditor(
  { documentFilePath, markdown, smartCopy, onChange, onHistoryAction, onTableContextChange, onTableSelectionChange, onSelectionChange, onActiveHeadingIndexChange, onOpenLink, onToast, scrollProgress = 0, onScrollProgress, selection, selectionText },
  forwardedRef
) {
  const onChangeRef = useRef(onChange);
  const onHistoryActionRef = useRef(onHistoryAction);
  const onTableContextChangeRef = useRef(onTableContextChange);
  const onTableSelectionChangeRef = useRef(onTableSelectionChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onActiveHeadingIndexChangeRef = useRef(onActiveHeadingIndexChange);
  const onOpenLinkRef = useRef(onOpenLink);
  const onToastRef = useRef(onToast);
  const smartCopyRef = useRef(smartCopy);
  const onScrollProgressRef = useRef(onScrollProgress);
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const tableActiveRef = useRef<boolean | null>(null);
  const tableSelectionRef = useRef<RichTableSelectionSummary | null | undefined>(undefined);
  const headingPositionsRef = useRef<number[]>([]);
  const activeHeadingIndexRef = useRef<number | null | undefined>(undefined);
  const synchronizedMarkdownRef = useRef(markdown);
  const frontMatterRef = useRef(splitMarkdownFrontMatter(markdown).frontMatter);
  const lastEditSurfaceRef = useRef<"body" | "front-matter">("body");
  const pendingHistoryActionRef = useRef<RichMarkdownSyncSource>("input");
  const markdownSyncRef = useRef<ReturnType<typeof createRichMarkdownSyncScheduler> | null>(null);
  onChangeRef.current = onChange;
  onHistoryActionRef.current = onHistoryAction;
  onTableContextChangeRef.current = onTableContextChange;
  onTableSelectionChangeRef.current = onTableSelectionChange;
  onSelectionChangeRef.current = onSelectionChange;
  onActiveHeadingIndexChangeRef.current = onActiveHeadingIndexChange;
  onOpenLinkRef.current = onOpenLink;
  onToastRef.current = onToast;
  smartCopyRef.current = smartCopy;
  onScrollProgressRef.current = onScrollProgress;
  if (!markdownSyncRef.current) {
    markdownSyncRef.current = createRichMarkdownSyncScheduler((nextMarkdown, source) => {
      const promotion = promoteMarkdownFrontMatter(frontMatterRef.current, nextMarkdown);
      if (promotion.promoted) {
        frontMatterRef.current = promotion.frontMatter;
        lastEditSurfaceRef.current = "body";
        const currentEditor = editorRef.current;
        const editorWasFocused = Boolean(
          currentEditor
          && !currentEditor.isDestroyed
          && document.activeElement === currentEditor.view.dom
        );
        if (currentEditor && !currentEditor.isDestroyed) {
          currentEditor.commands.setContent(promotion.body, { contentType: "markdown", emitUpdate: false });
          reportTableContext(currentEditor, tableActiveRef, onTableContextChangeRef);
          reportTableSelection(currentEditor, tableSelectionRef, onTableSelectionChangeRef);
          headingPositionsRef.current = richHeadingPositions(currentEditor);
          reportActiveRichHeading(currentEditor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);

          if (editorWasFocused) {
            window.requestAnimationFrame(() => {
              if (!currentEditor.isDestroyed) currentEditor.commands.focus("end");
            });
          }
        }
      }

      const fullMarkdown = withMarkdownFrontMatter(promotion.frontMatter, promotion.body);
      synchronizedMarkdownRef.current = fullMarkdown;
      onChangeRef.current(fullMarkdown, source);

    });
  }

  const editor = useEditor({
    immediatelyRender: true,
    extensions: createRichMarkdownExtensions(documentFilePath),
    content: splitMarkdownFrontMatter(markdown).body,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "tiptap-markdown-editor",
        spellcheck: "true"
      },
      handleKeyDown: (_view, event) => {
        const action = richHistoryActionForKeyEvent(event);
        if (!action) return false;
        if (lastEditSurfaceRef.current === "front-matter") {
          markdownSyncRef.current?.flush();
          return onHistoryActionRef.current(action);
        }
        return runRichHistoryAction(
          editorRef.current,
          action,
          markdownSyncRef.current,
          pendingHistoryActionRef,
          onHistoryActionRef
        );
      },
      handleDOMEvents: {
        click: (view, event) => {
          if (!shouldOpenRichLinkOnClick(event)) return false;

          const target = event.target;
          if (!(target instanceof Element)) return false;
          const link = target.closest<HTMLAnchorElement>("a[href]");
          if (!link || !view.dom.contains(link)) return false;

          const href = link.getAttribute("href")?.trim();
          if (!href) return false;

          event.preventDefault();
          onOpenLinkRef.current(href);
          return true;
        },
        copy: (_view, event) => {
          const currentEditor = editorRef.current;
          if (!currentEditor || currentEditor.isDestroyed || !shouldHandleSmartCopy(smartCopyRef.current, !currentEditor.state.selection.empty)) return false;

          const payload = richSelectionClipboardContent(currentEditor);
          const copied = payload ? writeClipboardEventData(event, payload) : null;
          if (!copied) return false;

          event.preventDefault();
          onToastRef.current(copied === "rich" ? "Copied rich selection" : "Copied selection");
          return true;
        },
        paste: (_view, event) => {
          const currentEditor = editorRef.current;
          if (!currentEditor || currentEditor.isDestroyed) return false;

          const table = clipboardTableRowsFromData({
            text: event.clipboardData?.getData("text/plain"),
            html: event.clipboardData?.getData("text/html"),
            markdown: event.clipboardData?.getData("text/markdown")
          });
          if (!table?.markdownTable) return false;

          const capacity = richTablePasteCapacity(currentEditor.state, table.rows);
          if (capacity && (capacity.additionalRows > 0 || capacity.additionalColumns > 0)) {
            if (!expandRichTableForPaste(currentEditor, capacity)) return false;
          }

          const tableTransaction = richTablePasteTransaction(currentEditor.state, table.rows);
          if (tableTransaction) {
            currentEditor.view.dispatch(tableTransaction);
            currentEditor.commands.focus();
            event.preventDefault();
            onToastRef.current(`Filled table from ${clipboardTableSourceLabel(table.source)}`);
            return true;
          }

          if (richTableContext(currentEditor, currentEditor.state.selection instanceof CellSelection)) return false;

          const parsed = currentEditor.markdown?.parse(table.markdownTable);
          if (!parsed?.content?.length) return false;

          const inserted = currentEditor.chain().focus().insertContent(parsed.content).run();
          if (!inserted) return false;

          event.preventDefault();
          onToastRef.current(`Pasted ${clipboardTableSourceLabel(table.source)} as table`);
          return true;
        }
      }
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (currentEditor.isDestroyed) return;
      lastEditSurfaceRef.current = "body";
      const source = pendingHistoryActionRef.current;
      pendingHistoryActionRef.current = "input";
      markdownSyncRef.current?.schedule(
        () => serializeRichMarkdown(currentEditor, splitMarkdownFrontMatter(synchronizedMarkdownRef.current).body),
        source,
        richMarkdownSyncDelayFor(currentEditor.state.doc.content.size)
      );
      reportTableContext(currentEditor, tableActiveRef, onTableContextChangeRef);
      reportTableSelection(currentEditor, tableSelectionRef, onTableSelectionChangeRef);
      headingPositionsRef.current = richHeadingPositions(currentEditor);
      reportActiveRichHeading(currentEditor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);
    },
    onCreate: ({ editor: currentEditor }) => {
      editorRef.current = currentEditor;
      if (!restoreRichTextSelection(currentEditor, selectionText)) restoreRichSelection(currentEditor, selection);
      reportTableContext(currentEditor, tableActiveRef, onTableContextChangeRef);
      reportTableSelection(currentEditor, tableSelectionRef, onTableSelectionChangeRef);
      reportSelection(currentEditor, onSelectionChangeRef);
      headingPositionsRef.current = richHeadingPositions(currentEditor);
      reportActiveRichHeading(currentEditor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      reportTableContext(currentEditor, tableActiveRef, onTableContextChangeRef);
      reportTableSelection(currentEditor, tableSelectionRef, onTableSelectionChangeRef);
      reportSelection(currentEditor, onSelectionChangeRef);
      reportActiveRichHeading(currentEditor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);
    }
  });

  // Keep the instance available even during the short window before Tiptap's
  // onCreate callback runs. Input can arrive as soon as the editor is painted.
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (synchronizedMarkdownRef.current === markdown) return;
    const next = splitMarkdownFrontMatter(markdown);
    markdownSyncRef.current?.cancel();
    editor.commands.setContent(next.body, { contentType: "markdown", emitUpdate: false });
    frontMatterRef.current = next.frontMatter;
    synchronizedMarkdownRef.current = markdown;
    headingPositionsRef.current = richHeadingPositions(editor);
    reportActiveRichHeading(editor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);
  }, [editor, markdown]);

  useEffect(() => {
    const host = scrollHostRef.current;
    if (!host) return undefined;

    let scrollFrame: number | null = null;
    let restoreFrame: number | null = window.requestAnimationFrame(() => {
      restoreFrame = null;
      setScrollProgress(host, scrollProgress);
    });
    const reportScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        onScrollProgressRef.current?.(getScrollProgress(host));
      });
    };

    host.addEventListener("scroll", reportScroll, { passive: true });
    return () => {
      onScrollProgressRef.current?.(getScrollProgress(host));
      host.removeEventListener("scroll", reportScroll);
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
    };
  }, []);

  useEffect(() => () => {
    markdownSyncRef.current?.flush();
    editorRef.current = null;
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    focus: () => editor?.commands.focus(),
    scrollToHeading: (headingIndex) => scrollToRichHeading(editor, headingPositionsRef.current, headingIndex),
    flushMarkdownSync: () => markdownSyncRef.current?.flush() ?? false,
    getScrollProgress: () => scrollHostRef.current ? getScrollProgress(scrollHostRef.current) : null,
    runHistoryAction: (action) => {
      if (lastEditSurfaceRef.current === "front-matter") {
        markdownSyncRef.current?.flush();
        return onHistoryActionRef.current(action);
      }
      return runRichHistoryAction(editor, action, markdownSyncRef.current, pendingHistoryActionRef, onHistoryActionRef);
    },
    runTextCommand: (command) => runRichTextCommand(editor, command),
    getLinkState: () => richLinkState(editor),
    setLink: (href) => setRichLink(editor, href),
    unsetLink: () => unsetRichLink(editor),
    getSelectionRange: () => richSelectionRange(editor),
    getSelectedText: () => richSelectedText(editor),
    findTextMatches: (query, options) => richTextMatches(editor, query, options),
    selectTextRange: (range) => selectRichTextRange(editor, range),
    replaceTextRange: (range, replacement) => replaceRichTextRange(editor, range, replacement),
    replaceAllTextMatches: (query, replacement, options) => replaceAllRichTextMatches(editor, query, replacement, options),
    runBlockCommand: (command) => runRichBlockCommand(editor, command),
    runListIndentation: (direction) => runRichListIndentation(editor, direction),
    insertTable: ({ columns, bodyRows }) => Boolean(editor?.chain().focus().insertTable({
      rows: Math.max(1, bodyRows + 1),
      cols: Math.max(1, columns),
      withHeaderRow: true
    }).run()),
    insertMarkdown: (nextMarkdown) => insertRichMarkdown(editor, nextMarkdown),
    runTableCommand: (command) => runRichTableCommand(editor, command),
    alignCurrentTableColumn: (alignment) => alignRichTableColumn(editor, alignment),
    sortCurrentTableColumn: (direction) => sortRichTableColumn(editor, direction),
    runTableSelectionCommand: (command) => runRichTableSelectionCommand(editor, command),
    getSelectionClipboardContent: () => richSelectionClipboardContent(editor),
    getTableClipboardContent: () => richTableClipboardContent(editor)
  }), [editor]);

  const frontMatterEditor = markdownFrontMatterEditor(splitMarkdownFrontMatter(markdown).frontMatter);

  function updateFrontMatter(event: ChangeEvent<HTMLTextAreaElement>) {
    markdownSyncRef.current?.flush();
    const nextFrontMatter = updateMarkdownFrontMatterContent(frontMatterRef.current, event.target.value);
    if (nextFrontMatter === frontMatterRef.current) return;

    const current = splitMarkdownFrontMatter(synchronizedMarkdownRef.current);
    const nextMarkdown = withMarkdownFrontMatter(nextFrontMatter, current.body);
    lastEditSurfaceRef.current = "front-matter";
    frontMatterRef.current = nextFrontMatter;
    synchronizedMarkdownRef.current = nextMarkdown;
    onChangeRef.current(nextMarkdown, "input");
  }

  function handleFrontMatterKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.key === "Backspace" || event.key === "Delete") && event.currentTarget.value.length === 0) {
      event.preventDefault();
      removeFrontMatter();
      return;
    }

    const action = richHistoryActionForKeyEvent(event);
    if (!action) return;

    event.preventDefault();
    markdownSyncRef.current?.flush();
    onHistoryActionRef.current(action);
  }

  function removeFrontMatter() {
    markdownSyncRef.current?.flush();
    const current = splitMarkdownFrontMatter(synchronizedMarkdownRef.current);
    if (!current.frontMatter && !frontMatterRef.current) return;

    let body = current.body;
    const duplicate = splitMarkdownFrontMatter(body);
    if (duplicate.frontMatter && duplicate.frontMatter === current.frontMatter) {
      body = duplicate.body;
    }

    lastEditSurfaceRef.current = "front-matter";
    frontMatterRef.current = "";
    synchronizedMarkdownRef.current = body;

    const currentEditor = editorRef.current;
    if (currentEditor && !currentEditor.isDestroyed) {
      currentEditor.commands.setContent(body, { contentType: "markdown", emitUpdate: false });
      reportTableContext(currentEditor, tableActiveRef, onTableContextChangeRef);
      reportTableSelection(currentEditor, tableSelectionRef, onTableSelectionChangeRef);
      headingPositionsRef.current = richHeadingPositions(currentEditor);
      reportActiveRichHeading(currentEditor, headingPositionsRef, activeHeadingIndexRef, onActiveHeadingIndexChangeRef);
    }

    onChangeRef.current(body, "input");
    window.requestAnimationFrame(() => {
      const nextEditor = editorRef.current;
      if (nextEditor && !nextEditor.isDestroyed) nextEditor.commands.focus("start");
    });
  }

  return (
    <div ref={scrollHostRef} className="wysiwyg-editor markdown-body">
      {frontMatterEditor && (
        <section
          className="wysiwyg-front-matter"
          data-format={frontMatterEditor.format.toLowerCase()}
          aria-label={`Document properties (${frontMatterEditor.format})`}
        >
          <div className="wysiwyg-front-matter-header">
            <label htmlFor="wysiwyg-front-matter-content">{frontMatterEditor.format}</label>
            <button
              className="wysiwyg-front-matter-delete"
              type="button"
              aria-label="Delete document properties"
              title="Delete document properties"
              onClick={removeFrontMatter}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            id="wysiwyg-front-matter-content"
            className="wysiwyg-front-matter-content"
            value={frontMatterEditor.content}
            aria-label={`${frontMatterEditor.format} document properties`}
            onChange={updateFrontMatter}
            onKeyDown={handleFrontMatterKeyDown}
            rows={Math.max(1, frontMatterEditor.content.split(/\r?\n/).length)}
            spellCheck={false}
          />
        </section>
      )}
      <EditorContent editor={editor} />
    </div>
  );
});

function reportTableContext(
  editor: Editor,
  previousActive: MutableRefObject<boolean | null>,
  onChange: MutableRefObject<(active: boolean) => void>
) {
  const active = editor.isActive("table");
  if (previousActive.current === active) return;
  previousActive.current = active;
  onChange.current(active);
}

function reportTableSelection(
  editor: Editor,
  previous: MutableRefObject<RichTableSelectionSummary | null | undefined>,
  onChange: MutableRefObject<(summary: RichTableSelectionSummary | null) => void>
) {
  const next = richTableSelectionSummary(editor.state);
  if (sameRichTableSelectionSummary(previous.current, next)) return;
  previous.current = next;
  onChange.current(next);
}

function sameRichTableSelectionSummary(
  left: RichTableSelectionSummary | null | undefined,
  right: RichTableSelectionSummary | null
): boolean {
  return left === right || Boolean(left && right
    && left.kind === right.kind
    && left.rowCount === right.rowCount
    && left.columnCount === right.columnCount
    && left.cellCount === right.cellCount);
}

function reportSelection(editor: Editor, onChange: MutableRefObject<(selection: TextRange) => void>) {
  const selection = richSelectionRange(editor);
  if (selection) onChange.current(selection);
}

function richHeadingPositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "heading") positions.push(position);
  });
  return positions;
}

function scrollToRichHeading(editor: Editor | null, headingPositions: readonly number[], headingIndex: number): boolean {
  if (!editor || editor.isDestroyed) return false;
  const position = richHeadingPositionAtIndex(headingPositions, headingIndex);
  if (position === null) return false;

  const heading = editor.state.doc.nodeAt(position);
  const selectionPosition = Math.min(editor.state.doc.content.size, position + (heading?.isTextblock ? 1 : 0));
  return editor.chain().focus().setTextSelection(selectionPosition).scrollIntoView().run();
}

function reportActiveRichHeading(
  editor: Editor,
  headingPositions: MutableRefObject<number[]>,
  previousActive: MutableRefObject<number | null | undefined>,
  onChange: MutableRefObject<(index: number | null) => void>
) {
  const nextActive = activeRichHeadingIndexAtPosition(headingPositions.current, editor.state.selection.from);
  if (previousActive.current === nextActive) return;
  previousActive.current = nextActive;
  onChange.current(nextActive);
}

function richSelectionClipboardContent(editor: Editor | null): RichMarkdownClipboardContent | null {
  if (!editor || editor.isDestroyed) return null;

  if (editor.state.selection instanceof CellSelection) {
    const table = richTableClipboardContent(editor);
    if (!table) return null;

    return {
      markdown: table.markdown,
      plainText: table.plainText,
      html: table.html,
      selected: true
    };
  }

  const { from, to, empty } = editor.state.selection;
  const fragment = empty ? editor.state.doc.content : editor.state.doc.slice(from, to).content;
  const markdownDocument = { type: "doc", content: fragment.toJSON() };
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment));

  return {
    markdown: editor.markdown?.serialize(markdownDocument) ?? editor.getMarkdown(),
    plainText: fragment.textBetween(0, fragment.size, "\n\n"),
    html: container.innerHTML,
    selected: !empty
  };
}

function richTableClipboardContent(editor: Editor | null): RichTableClipboardContent | null {
  if (!editor || editor.isDestroyed) return null;

  const selection = editor.state.selection;
  const tableContext = richTableContext(editor, selection instanceof CellSelection);
  if (!tableContext) return null;

  const { map, rect, tableStart } = tableContext;
  const rows: string[][] = [];
  for (let row = rect.top; row < rect.bottom; row += 1) {
    const cells: string[] = [];
    for (let column = rect.left; column < rect.right; column += 1) {
      const cellPosition = map.map[row * map.width + column];
      const cell = editor.state.doc.nodeAt(tableStart + cellPosition);
      if (!cell || Number(cell.attrs.colspan ?? 1) !== 1 || Number(cell.attrs.rowspan ?? 1) !== 1) return null;
      cells.push(cell.textBetween(0, cell.content.size, "\n"));
    }
    rows.push(cells);
  }

  const formats = richTableClipboardFormats(rows);
  return formats ? { ...formats, selected: selection instanceof CellSelection } : null;
}

function richTableContext(editor: Editor, selectedCells: boolean): {
  map: TableMap;
  rect: { left: number; top: number; right: number; bottom: number };
  tableStart: number;
} | null {
  const selection = editor.state.selection;
  if (selectedCells && selection instanceof CellSelection) {
    const table = selection.$anchorCell.node(-1);
    const tableStart = selection.$anchorCell.start(-1);
    const map = TableMap.get(table);
    const rect = map.rectBetween(selection.$anchorCell.pos - tableStart, selection.$headCell.pos - tableStart);
    return { map, rect, tableStart };
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const table = selection.$from.node(depth);
    if (table.type.spec.tableRole !== "table") continue;
    const map = TableMap.get(table);
    return {
      map,
      rect: { left: 0, top: 0, right: map.width, bottom: map.height },
      tableStart: selection.$from.start(depth)
    };
  }

  return null;
}

function expandRichTableForPaste(editor: Editor, capacity: RichTablePasteCapacity): boolean {
  for (let index = 0; index < capacity.additionalColumns; index += 1) {
    const context = richTableContext(editor, true);
    if (!context || !selectRichTableCell(editor, capacity.startRow, context.map.width - 1)) return false;
    if (!editor.commands.addColumnAfter()) return false;
  }

  for (let index = 0; index < capacity.additionalRows; index += 1) {
    const context = richTableContext(editor, true);
    if (!context || !selectRichTableCell(editor, context.map.height - 1, capacity.startColumn)) return false;
    if (!editor.commands.addRowAfter()) return false;
  }

  return selectRichTableCell(editor, capacity.startRow, capacity.startColumn);
}

function selectRichTableCell(editor: Editor, row: number, column: number): boolean {
  const context = richTableContext(editor, true);
  if (!context || row < 0 || column < 0 || row >= context.map.height || column >= context.map.width) return false;

  const position = context.tableStart + context.map.map[row * context.map.width + column];
  editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(editor.state.doc.resolve(position))));
  return true;
}

function richHistoryActionForKeyEvent(event: {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}): RichDocumentHistoryAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}

function runRichHistoryAction(
  editor: Editor | null,
  action: RichDocumentHistoryAction,
  scheduler: ReturnType<typeof createRichMarkdownSyncScheduler> | null,
  pendingAction: MutableRefObject<RichMarkdownSyncSource>,
  fallback: MutableRefObject<(action: RichDocumentHistoryAction) => boolean>
): boolean {
  if (!editor || editor.isDestroyed) return false;

  scheduler?.flush();
  pendingAction.current = action;
  const applied = action === "undo"
    ? editor.chain().focus().undo().run()
    : editor.chain().focus().redo().run();
  if (applied) return true;

  pendingAction.current = "input";
  return fallback.current(action);
}

function serializeRichMarkdown(editor: Editor, fallback: string): string {
  if (editor.isDestroyed) return fallback;

  try {
    return editor.markdown?.serialize(
      withoutGeneratedTrailingParagraph(editor.getJSON())
    ) ?? editor.getMarkdown();
  } catch {
    return fallback;
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

function richLinkState(editor: Editor | null): { href: string; active: boolean } | null {
  if (!editor) return null;
  const autolink = activeRichAutolink(editor);
  if (autolink) {
    return {
      href: typeof autolink.node.attrs.href === "string" ? autolink.node.attrs.href : "",
      active: true
    };
  }
  const href = editor.getAttributes("link").href;
  return {
    href: typeof href === "string" ? href : "",
    active: editor.isActive("link")
  };
}

function setRichLink(editor: Editor | null, href: string): boolean {
  if (!editor) return false;
  const autolink = activeRichAutolink(editor);
  if (!autolink) return editor.chain().focus().extendMarkRange("link").setLink({ href }).run();

  const transaction = editor.state.tr.setNodeMarkup(autolink.position, undefined, {
    ...autolink.node.attrs,
    raw: "",
    href,
    title: ""
  });
  editor.view.dispatch(transaction);
  editor.commands.focus();
  return true;
}

function unsetRichLink(editor: Editor | null): boolean {
  if (!editor) return false;
  const autolink = activeRichAutolink(editor);
  if (!autolink) return editor.chain().focus().unsetLink().run();

  const text = autolink.node.textContent;
  const marks = autolink.node.firstChild?.marks ?? autolink.node.marks;
  const transaction = text
    ? editor.state.tr.replaceWith(
      autolink.position,
      autolink.position + autolink.node.nodeSize,
      editor.schema.text(text, marks)
    )
    : editor.state.tr.delete(autolink.position, autolink.position + autolink.node.nodeSize);
  editor.view.dispatch(transaction);
  editor.commands.focus();
  return true;
}

function activeRichAutolink(editor: Editor): { position: number; node: ProseMirrorNode } | null {
  const { selection, doc } = editor.state;
  const selectedNode = doc.nodeAt(selection.from);
  if (selectedNode?.type.name === "markdownAutolink") {
    return { position: selection.from, node: selectedNode };
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === "markdownAutolink") {
      return { position: selection.$from.before(depth), node };
    }
  }
  return null;
}

function richSelectionRange(editor: Editor | null): TextRange | null {
  if (!editor) return null;
  const { from, to } = editor.state.selection;
  return { from, to };
}

function restoreRichSelection(editor: Editor, selection: TextRange | undefined): void {
  if (!selection) return;
  const maxPosition = editor.state.doc.content.size;
  const from = Math.max(0, Math.min(selection.from, maxPosition));
  const to = Math.max(from, Math.min(selection.to, maxPosition));
  editor.commands.setTextSelection({ from, to });
}

function restoreRichTextSelection(editor: Editor, selectedText: string | undefined): boolean {
  const text = selectedText?.trim();
  if (!text || text.length > 2_000) return false;

  const segments: Array<{ from: number; to: number; text: string }> = [];
  editor.state.doc.descendants((node, position) => {
    if (node.isText && node.text) segments.push({ from: position, to: position + node.text.length, text: node.text });
  });
  const selection = uniqueRichTextSelectionForText(segments, text);
  if (!selection) return false;
  return editor.commands.setTextSelection(selection);
}

function richSelectedText(editor: Editor | null): string {
  if (!editor) return "";
  const { from, to } = editor.state.selection;
  return from === to ? "" : editor.state.doc.textBetween(from, to, "\n");
}

function richTextMatches(editor: Editor | null, query: string, options: SearchOptions): SearchMatch[] {
  if (!editor || !query) return [];

  const matches: SearchMatch[] = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text || matches.length >= 10000) return;
    const remaining = 10000 - matches.length;
    for (const match of findTextMatches(node.text, query, options, remaining)) {
      matches.push({ from: position + match.from, to: position + match.to });
    }
  });
  return matches;
}

function selectRichTextRange(editor: Editor | null, range: TextRange): boolean {
  if (!editor) return false;
  const from = Math.max(0, Math.min(range.from, editor.state.doc.content.size));
  const to = Math.max(from, Math.min(range.to, editor.state.doc.content.size));
  return editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
}

function replaceRichTextRange(editor: Editor | null, range: TextRange, replacement: string): boolean {
  if (!editor) return false;
  const from = Math.max(0, Math.min(range.from, editor.state.doc.content.size));
  const to = Math.max(from, Math.min(range.to, editor.state.doc.content.size));
  const transaction = editor.state.tr.insertText(replacement, from, to);
  editor.view.dispatch(transaction);
  return editor.chain().focus().setTextSelection({ from, to: from + replacement.length }).scrollIntoView().run();
}

function replaceAllRichTextMatches(editor: Editor | null, query: string, replacement: string, options: SearchOptions): number {
  const matches = richTextMatches(editor, query, options);
  if (!editor || !matches.length) return 0;

  let transaction = editor.state.tr;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    transaction = transaction.insertText(replacement, matches[index].from, matches[index].to);
  }
  editor.view.dispatch(transaction);
  editor.commands.focus();
  return matches.length;
}

function insertRichMarkdown(editor: Editor | null, markdown: string): boolean {
  const parsed = editor?.markdown?.parse(markdown.trim());
  if (!editor || !parsed?.content?.length) return false;

  return editor.chain().focus().insertContent(parsed.content).run();
}

function runRichTextCommand(editor: Editor | null, command: MarkdownTextCommand): boolean {
  if (!editor) return false;

  switch (command) {
    case "bold":
      return editor.chain().focus().toggleBold().run();
    case "italic":
      return editor.chain().focus().toggleItalic().run();
    case "code":
      return editor.chain().focus().toggleCode().run();
    case "link":
      return false;
  }
}

function runRichBlockCommand(editor: Editor | null, command: MarkdownBlockCommand): boolean {
  if (!editor) return false;

  switch (command) {
    case "heading-1":
      return editor.chain().focus().toggleHeading({ level: 1 }).run();
    case "heading-2":
      return editor.chain().focus().toggleHeading({ level: 2 }).run();
    case "heading-3":
      return editor.chain().focus().toggleHeading({ level: 3 }).run();
    case "bullet-list":
      return editor.chain().focus().toggleBulletList().run();
    case "ordered-list":
      return editor.chain().focus().toggleOrderedList().run();
    case "task-list":
      return editor.chain().focus().toggleTaskList().run();
    case "blockquote":
      return editor.chain().focus().toggleBlockquote().run();
    case "code-block":
      return editor.chain().focus().toggleCodeBlock().run();
  }
}

function runRichListIndentation(editor: Editor | null, direction: MarkdownListIndentDirection): boolean {
  if (!editor) return false;
  if (direction === "indent") {
    return editor.chain().focus().sinkListItem("listItem").run()
      || editor.chain().focus().sinkListItem("taskItem").run();
  }

  return editor.chain().focus().liftListItem("listItem").run()
    || editor.chain().focus().liftListItem("taskItem").run();
}

function runRichTableCommand(editor: Editor | null, command: RichTableCommand): boolean {
  if (!editor) return false;

  const chain = editor.chain().focus();
  switch (command) {
    case "add-row":
      return chain.addRowAfter().run();
    case "add-row-before":
      return chain.addRowBefore().run();
    case "add-column":
      return chain.addColumnAfter().run();
    case "add-column-before":
      return chain.addColumnBefore().run();
    case "delete-row":
      return chain.deleteRow().run();
    case "delete-column":
      return chain.deleteColumn().run();
    case "delete-table":
      return chain.deleteTable().run();
    case "duplicate-row":
    case "duplicate-column":
    case "move-row-up":
    case "move-row-down":
    case "move-column-left":
    case "move-column-right": {
      const transaction = richTableStructureTransaction(editor.state, command);
      if (!transaction) return false;
      editor.view.dispatch(transaction);
      editor.commands.focus();
      return true;
    }
  }
}

function runRichTableSelectionCommand(editor: Editor | null, command: RichTableSelectionCommand): boolean {
  if (!editor) return false;
  const nextSelection = richTableSelectionFor(editor.state, command);
  if (!nextSelection) return false;

  editor.view.dispatch(editor.state.tr.setSelection(nextSelection));
  editor.commands.focus();
  return true;
}

function alignRichTableColumn(editor: Editor | null, alignment: RichTableColumnAlignment): boolean {
  if (!editor) return false;
  const transaction = richTableColumnAlignmentTransaction(editor.state, alignment);
  if (!transaction) return false;

  editor.view.dispatch(transaction);
  editor.commands.focus();
  return true;
}

function sortRichTableColumn(editor: Editor | null, direction: TableSortDirection): boolean {
  if (!editor) return false;
  const transaction = richTableSortTransaction(editor.state, direction);
  if (!transaction) return false;

  editor.view.dispatch(transaction);
  editor.commands.focus();
  return true;
}
