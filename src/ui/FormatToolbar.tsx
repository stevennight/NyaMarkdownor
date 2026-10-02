import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  ChevronDown,
  Code2,
  Command,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  PanelLeft,
  Redo2,
  SquareCode,
  Strikethrough,
  Table2,
  TextQuote,
  Undo2
} from "lucide-react";
import type { MarkdownBlockCommand, MarkdownListIndentDirection, MarkdownTextCommand } from "../lib/editorCommands";
import type { BlockStyle, FormatState } from "../lib/formatState";
import type { Translator } from "../lib/i18n";
import type { ViewMode } from "../types";

type FormatToolbarProps = {
  t: Translator;
  formatState: FormatState;
  viewMode: ViewMode;
  sidebarVisible: boolean;
  formattingAvailable: boolean;
  onToggleSidebar: () => void;
  onHistory: (action: "undo" | "redo") => void;
  onTextCommand: (command: MarkdownTextCommand) => void;
  onBlockCommand: (command: MarkdownBlockCommand) => void;
  onListIndentation: (direction: MarkdownListIndentDirection) => void;
  onInsertTable: () => void;
  onInsertImage: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenCommandPalette: () => void;
};

const BLOCK_STYLES: Array<{ style: BlockStyle; label: string }> = [
  { style: "paragraph", label: "Paragraph" },
  { style: "heading-1", label: "Heading 1" },
  { style: "heading-2", label: "Heading 2" },
  { style: "heading-3", label: "Heading 3" },
  { style: "heading-4", label: "Heading 4" },
  { style: "heading-5", label: "Heading 5" },
  { style: "heading-6", label: "Heading 6" },
  { style: "code-block", label: "Code block" }
];

const VIEW_MODES: Array<{ mode: ViewMode; label: string; shortcut: string }> = [
  { mode: "focus", label: "Source", shortcut: "Ctrl+1" },
  { mode: "split", label: "Split", shortcut: "Ctrl+2" },
  { mode: "wysiwyg", label: "Visual", shortcut: "Ctrl+4" },
  { mode: "preview", label: "Preview", shortcut: "Ctrl+3" }
];

export function FormatToolbar({
  t,
  formatState,
  viewMode,
  sidebarVisible,
  formattingAvailable,
  onToggleSidebar,
  onHistory,
  onTextCommand,
  onBlockCommand,
  onListIndentation,
  onInsertTable,
  onInsertImage,
  onViewModeChange,
  onOpenCommandPalette
}: FormatToolbarProps) {
  const disabled = !formattingAvailable;
  const currentStyle = BLOCK_STYLES.find((entry) => entry.style === formatState.block) ?? BLOCK_STYLES[0];

  return (
    <div className="format-toolbar" role="toolbar" aria-label={t("Formatting")}>
      {/* Formatting tools scroll in narrow windows; the view switch stays visible. */}
      <div className="format-toolbar-tools">
        <ToolButton label={t(sidebarVisible ? "Hide sidebar" : "Show sidebar")} shortcut={"Ctrl+Shift+\\"} active={sidebarVisible} onClick={onToggleSidebar}>
          <PanelLeft />
        </ToolButton>
        <Divider />
        <ToolButton label={t("Undo")} shortcut="Ctrl+Z" disabled={disabled} onClick={() => onHistory("undo")}><Undo2 /></ToolButton>
        <ToolButton label={t("Redo")} shortcut="Ctrl+Y" disabled={disabled} onClick={() => onHistory("redo")}><Redo2 /></ToolButton>
        <Divider />
        <BlockStylePicker
          t={t}
          disabled={disabled}
          current={currentStyle}
          onSelect={(style) => {
            if (style === "code-block") {
              if (formatState.block !== "code-block") onBlockCommand("code-block");
              return;
            }
            if (formatState.block === "code-block") onBlockCommand("code-block");
            onBlockCommand(style);
          }}
        />
        <Divider />
        <ToolButton label={t("Bold")} shortcut="Ctrl+B" disabled={disabled} active={formatState.bold} onClick={() => onTextCommand("bold")}><Bold /></ToolButton>
        <ToolButton label={t("Italic")} shortcut="Ctrl+I" disabled={disabled} active={formatState.italic} onClick={() => onTextCommand("italic")}><Italic /></ToolButton>
        <ToolButton label={t("Strikethrough")} disabled={disabled} active={formatState.strike} onClick={() => onTextCommand("strike")}><Strikethrough /></ToolButton>
        <ToolButton label={t("Inline code")} shortcut="Ctrl+`" disabled={disabled} active={formatState.code} onClick={() => onTextCommand("code")}><Code2 /></ToolButton>
        <ToolButton label={t("Link")} shortcut="Ctrl+K" disabled={disabled} active={formatState.link} onClick={() => onTextCommand("link")}><Link2 /></ToolButton>
        <Divider />
        <ToolButton label={t("Bullet list")} disabled={disabled} active={formatState.bulletList} onClick={() => onBlockCommand("bullet-list")}><List /></ToolButton>
        <ToolButton label={t("Ordered list")} disabled={disabled} active={formatState.orderedList} onClick={() => onBlockCommand("ordered-list")}><ListOrdered /></ToolButton>
        <ToolButton label={t("Task list")} disabled={disabled} active={formatState.taskList} onClick={() => onBlockCommand("task-list")}><ListChecks /></ToolButton>
        <ToolButton label={t("Outdent List Item")} shortcut="Shift+Tab" disabled={disabled} onClick={() => onListIndentation("outdent")}><IndentDecrease /></ToolButton>
        <ToolButton label={t("Indent List Item")} shortcut="Tab" disabled={disabled} onClick={() => onListIndentation("indent")}><IndentIncrease /></ToolButton>
        <ToolButton label={t("Blockquote")} disabled={disabled} active={formatState.blockquote} onClick={() => onBlockCommand("blockquote")}><TextQuote /></ToolButton>
        <Divider />
        <ToolButton label={t("Insert table")} shortcut="Ctrl+Alt+T" disabled={disabled} onClick={onInsertTable}><Table2 /></ToolButton>
        <ToolButton label={t("Image")} shortcut="Ctrl+Alt+I" disabled={disabled} onClick={onInsertImage}><ImagePlus /></ToolButton>
        <ToolButton label={t("Code block")} disabled={disabled} active={formatState.block === "code-block"} onClick={() => onBlockCommand("code-block")}><SquareCode /></ToolButton>
        <ToolButton label={t("Horizontal rule")} disabled={disabled} onClick={() => onBlockCommand("horizontal-rule")}><Minus /></ToolButton>
      </div>

      <div className="view-switch" role="radiogroup" aria-label={t("Choose view")}>
        {VIEW_MODES.map((entry) => (
          <button
            key={entry.mode}
            type="button"
            role="radio"
            aria-checked={viewMode === entry.mode}
            className={viewMode === entry.mode ? "active" : undefined}
            title={`${t(entry.label)} (${entry.shortcut})`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onViewModeChange(entry.mode)}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>
      <ToolButton label={t("Command palette")} shortcut="Ctrl+Shift+P" onClick={onOpenCommandPalette}><Command /></ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={active ? "format-tool active" : "format-tool"}
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the editor's selection: formatting applies to it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="format-toolbar-divider" aria-hidden="true" />;
}

function BlockStylePicker({
  t,
  disabled,
  current,
  onSelect
}: {
  t: Translator;
  disabled: boolean;
  current: { style: BlockStyle; label: string };
  onSelect: (style: BlockStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="block-style-picker" ref={wrapRef}>
      <button
        className="block-style-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("Paragraph style")}
        title={t("Paragraph style")}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{t(current.label)}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="block-style-menu" role="listbox" aria-label={t("Paragraph style")}>
          {BLOCK_STYLES.map((entry) => (
            <button
              key={entry.style}
              type="button"
              role="option"
              aria-selected={entry.style === current.style}
              className={`block-style-option ${entry.style}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                if (entry.style !== current.style) onSelect(entry.style);
              }}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
