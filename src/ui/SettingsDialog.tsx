import { useEffect } from "react";
import { X } from "lucide-react";
import type { EditorDensity, LanguagePreference, ThemeMode, ViewMode } from "../types";
import type { FileAssociationScope } from "../lib/fileIo";
import type { Translator } from "../lib/i18n";

type SettingsDialogProps = {
  open: boolean;
  viewMode: ViewMode;
  theme: ThemeMode;
  language: LanguagePreference;
  sidebarVisible: boolean;
  autoSave: boolean;
  autoSaveAvailable: boolean;
  fileAssociationsAvailable: boolean;
  smartCopy: boolean;
  softSyntax: boolean;
  editorFontSize: number;
  editorLineWidth: number;
  editorDensity: EditorDensity;
  t: Translator;
  onClose: () => void;
  onViewModeChange: (value: ViewMode) => void;
  onThemeChange: (value: ThemeMode) => void;
  onLanguageChange: (value: LanguagePreference) => void;
  onSidebarVisibleChange: (value: boolean) => void;
  onAutoSaveChange: (value: boolean) => void;
  onManageFileAssociation: (scope: FileAssociationScope) => void;
  onSmartCopyChange: (value: boolean) => void;
  onSoftSyntaxChange: (value: boolean) => void;
  onEditorFontSizeChange: (value: number) => void;
  onEditorLineWidthChange: (value: number) => void;
  onEditorDensityChange: (value: EditorDensity) => void;
};

export function SettingsDialog({
  open,
  viewMode,
  theme,
  language,
  sidebarVisible,
  autoSave,
  autoSaveAvailable,
  fileAssociationsAvailable,
  smartCopy,
  softSyntax,
  editorFontSize,
  editorLineWidth,
  editorDensity,
  t,
  onClose,
  onViewModeChange,
  onThemeChange,
  onLanguageChange,
  onSidebarVisibleChange,
  onAutoSaveChange,
  onManageFileAssociation,
  onSmartCopyChange,
  onSoftSyntaxChange,
  onEditorFontSizeChange,
  onEditorLineWidthChange,
  onEditorDensityChange
}: SettingsDialogProps) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label={t("Settings")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <div>
            <div className="settings-title">{t("Settings")}</div>
            <div className="settings-subtitle">{t("Editor")}</div>
          </div>
          <button className="icon-only" type="button" aria-label={t("Close settings")} title={t("Close settings")} onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-row">
              <span>{t("Theme")}</span>
              <SegmentedControl
                value={theme}
                options={[
                  ["light", t("Light")],
                  ["dark", t("Dark")]
                ]}
                onChange={(value) => onThemeChange(value as ThemeMode)}
              />
            </div>
            <div className="settings-row">
              <span id="settings-language-label">{t("Language")}</span>
              <select
                className="settings-select"
                aria-labelledby="settings-language-label"
                value={language}
                onChange={(event) => onLanguageChange(event.target.value as LanguagePreference)}
              >
                <option value="system">{t("System")}</option>
                <option value="zh-CN">{t("Simplified Chinese")}</option>
                <option value="en">{t("English")}</option>
              </select>
            </div>
            <div className="settings-row">
              <span>{t("Default view")}</span>
              <SegmentedControl
                value={viewMode}
                options={[
                  ["focus", t("Focus")],
                  ["split", t("Split")],
                  ["preview", t("Preview")],
                  ["wysiwyg", t("Visual")]
                ]}
                onChange={(value) => onViewModeChange(value as ViewMode)}
              />
            </div>
            <ToggleRow label={t("Sidebar")} checked={sidebarVisible} onChange={onSidebarVisibleChange} />
            {autoSaveAvailable && <ToggleRow label={t("Auto-save local files")} checked={autoSave} onChange={onAutoSaveChange} />}
            {fileAssociationsAvailable && (
              <>
                <div className="settings-row">
                  <span>{t("Markdown files")}</span>
                  <button
                    className="settings-action"
                    type="button"
                    title={t("Choose NyaMarkdownor for Markdown file types in your system settings")}
                    onClick={() => onManageFileAssociation("markdown")}
                  >
                    {t("Manage in system")}
                  </button>
                </div>
                <div className="settings-row">
                  <span>{t("Plain text files")}</span>
                  <button
                    className="settings-action"
                    type="button"
                    title={t("Choose NyaMarkdownor for plain text files in your system settings")}
                    onClick={() => onManageFileAssociation("plain-text")}
                  >
                    {t("Manage in system")}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="settings-section">
            <SliderRow
              label={t("Font size")}
              value={editorFontSize}
              min={13}
              max={20}
              step={1}
              suffix="px"
              onChange={onEditorFontSizeChange}
            />
            <SliderRow
              label={t("Line width")}
              value={editorLineWidth}
              min={680}
              max={1160}
              step={20}
              suffix="px"
              onChange={onEditorLineWidthChange}
            />
            <div className="settings-row">
              <span>{t("Density")}</span>
              <SegmentedControl
                value={editorDensity}
                options={[
                  ["compact", t("Compact")],
                  ["comfortable", t("Comfort")],
                  ["spacious", t("Spacious")]
                ]}
                onChange={(value) => onEditorDensityChange(value as EditorDensity)}
              />
            </div>
          </section>

          <section className="settings-section">
            <ToggleRow label={t("Smart copy")} checked={smartCopy} onChange={onSmartCopyChange} />
            <ToggleRow label={t("Soft syntax")} checked={softSyntax} onChange={onSoftSyntaxChange} />
          </section>
        </div>
      </section>
    </div>
  );
}

type SegmentedControlProps = {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
};

function SegmentedControl({ value, options, onChange }: SegmentedControlProps) {
  return (
    <div className="settings-segmented">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={value === optionValue ? "active" : ""}
          type="button"
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type SliderRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
};

function SliderRow({ label, value, min, max, step, suffix, onChange }: SliderRowProps) {
  return (
    <label className="settings-row slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="settings-row toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
