import { useEffect, useRef, useState } from "react";
import { Link2, Unlink, X } from "lucide-react";
import type { Translator } from "../lib/i18n";

type LinkDialogProps = {
  open: boolean;
  initialHref: string;
  canUnlink: boolean;
  t: Translator;
  onClose: () => void;
  onApply: (href: string) => void;
  onUnlink: () => void;
};

export function LinkDialog({ open, initialHref, canUnlink, t, onClose, onApply, onUnlink }: LinkDialogProps) {
  const [href, setHref] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    setHref(initialHref);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => inputRef.current?.select(), 0);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [initialHref, onClose, open]);

  if (!open) return null;

  return (
    <div className="table-size-overlay" role="presentation" onMouseDown={onClose}>
      <section className="table-size-dialog link-dialog" role="dialog" aria-modal="true" aria-label={t("Edit link")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="table-size-header">
          <div className="table-size-title">
            <Link2 />
            <span>{t("Edit Link")}</span>
          </div>
          <button className="icon-only" type="button" aria-label={t("Close link editor")} title={t("Close link editor")} onClick={onClose}>
            <X />
          </button>
        </header>
        <form
          className="table-size-body"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(href);
          }}
        >
          <label className="link-dialog-field">
            <span>{t("Destination")}</span>
            <input
              ref={inputRef}
              type="text"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              placeholder={t("https://example.com or notes.md#heading")}
              spellCheck={false}
            />
          </label>
          <div className="table-size-actions">
            {canUnlink && (
              <button className="confirm-button secondary link-remove" type="button" onClick={onUnlink}>
                <Unlink />
                {t("Remove link")}
              </button>
            )}
            <button className="confirm-button secondary" type="button" onClick={onClose}>{t("Cancel")}</button>
            <button className="confirm-button primary" type="submit">{t("Apply")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
