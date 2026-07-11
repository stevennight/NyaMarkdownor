import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import type { Translator } from "../lib/i18n";

type FindReplacePanelProps = {
  open: boolean;
  query: string;
  replacement: string;
  replaceVisible: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  matchCount: number;
  activeIndex: number;
  t: Translator;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onReplaceVisibleChange: (value: boolean) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onWholeWordChange: (value: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

export function FindReplacePanel({
  open,
  query,
  replacement,
  replaceVisible,
  caseSensitive,
  wholeWord,
  matchCount,
  activeIndex,
  t,
  onQueryChange,
  onReplacementChange,
  onReplaceVisibleChange,
  onCaseSensitiveChange,
  onWholeWordChange,
  onNext,
  onPrevious,
  onReplace,
  onReplaceAll,
  onClose
}: FindReplacePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [open]);

  if (!open) return null;

  const matchLabel = query
    ? matchCount > 0
      ? `${activeIndex >= 0 ? activeIndex + 1 : 0} / ${matchCount}`
      : "0 / 0"
    : "";

  return (
    <section className="find-panel" role="dialog" aria-label={t("Find and replace")}>
      <div className="find-row">
        <Search size={16} />
        <input
          ref={inputRef}
          value={query}
          placeholder={t("Find")}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (event.shiftKey) onPrevious();
              else onNext();
            }
          }}
        />
        <span className="find-count">{matchLabel}</span>
        <button type="button" className="find-button" onClick={onPrevious} disabled={!matchCount}>
          {t("Prev")}
        </button>
        <button type="button" className="find-button" onClick={onNext} disabled={!matchCount}>
          {t("Next")}
        </button>
        <button type="button" className="find-button" onClick={() => onReplaceVisibleChange(!replaceVisible)}>
          {t("Replace")}
        </button>
        <button type="button" className="icon-only" aria-label={t("Close find")} title={t("Close find")} onClick={onClose}>
          <X />
        </button>
      </div>

      {replaceVisible && (
        <div className="find-row replace-row">
          <span className="find-spacer" />
          <input
            value={replacement}
            placeholder={t("Replace")}
            onChange={(event) => onReplacementChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "Enter") {
                event.preventDefault();
                onReplace();
              }
            }}
          />
          <button type="button" className="find-button" onClick={onReplace} disabled={!matchCount}>
            {t("One")}
          </button>
          <button type="button" className="find-button" onClick={onReplaceAll} disabled={!matchCount}>
            {t("All")}
          </button>
        </div>
      )}

      <div className="find-options">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(event) => onCaseSensitiveChange(event.target.checked)} />
          <span>{t("Case")}</span>
        </label>
        <label>
          <input type="checkbox" checked={wholeWord} onChange={(event) => onWholeWordChange(event.target.checked)} />
          <span>{t("Word")}</span>
        </label>
      </div>
    </section>
  );
}
