import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Info,
  PenLine,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  X,
  type LucideIcon
} from "lucide-react";
import type { BackupPreferences, EditorDensity, LanguagePreference, TableHeightMode, ThemeMode, ViewMode } from "../types";
import type { BuildInfo } from "../lib/buildInfo";
import type { ApplicationUpdateState } from "../lib/appUpdates";
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
  tableHeightMode: TableHeightMode;
  tableMaxHeightVh: number;
  backupPreferences: BackupPreferences;
  backupDirectoryAvailable: boolean;
  buildInfo: BuildInfo;
  applicationUpdate: ApplicationUpdateState;
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
  onTableHeightModeChange: (value: TableHeightMode) => void;
  onTableMaxHeightVhChange: (value: number) => void;
  onChooseBackupDirectory: () => void;
  onResetBackupDirectory: () => void;
  onBackupPreferencesChange: (value: BackupPreferences) => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: (version: string) => void;
  onOpenReleasePage: () => void;
};

type SettingsCategoryId = "general" | "editor" | "files" | "backups" | "about";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  icon: LucideIcon;
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
  tableHeightMode,
  tableMaxHeightVh,
  backupPreferences,
  backupDirectoryAvailable,
  buildInfo,
  applicationUpdate,
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
  onEditorDensityChange,
  onTableHeightModeChange,
  onTableMaxHeightVhChange,
  onChooseBackupDirectory,
  onResetBackupDirectory,
  onBackupPreferencesChange,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenReleasePage
}: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>("general");
  const settingsContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const categories: SettingsCategory[] = [
    { id: "general", label: t("General"), icon: SlidersHorizontal },
    { id: "editor", label: t("Editor"), icon: PenLine },
    ...(autoSaveAvailable || fileAssociationsAvailable
      ? [{ id: "files" as const, label: t("Files"), icon: FileText }]
      : []),
    ...(backupDirectoryAvailable
      ? [{ id: "backups" as const, label: t("Backups"), icon: History }]
      : []),
    { id: "about", label: t("About"), icon: Info }
  ];
  const selectedCategory = categories.find((category) => category.id === activeCategory) ?? categories[0];

  function selectCategory(category: SettingsCategoryId) {
    setActiveCategory(category);
    settingsContentRef.current?.scrollTo({ top: 0 });
  }

  function updateBackupPreference<Key extends keyof BackupPreferences>(key: Key, value: BackupPreferences[Key]) {
    onBackupPreferencesChange({
      ...backupPreferences,
      [key]: value
    });
  }

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label={t("Settings")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-header">
          <div>
            <div className="settings-title">{t("Settings")}</div>
            <div className="settings-subtitle">{selectedCategory.label}</div>
          </div>
          <button className="icon-only" type="button" aria-label={t("Close settings")} title={t("Close settings")} onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label={t("Settings categories")}>
            {categories.map((category) => {
              const CategoryIcon = category.icon;
              const active = category.id === selectedCategory.id;
              return (
                <button
                  key={category.id}
                  className={`settings-nav-item${active ? " active" : ""}`}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  title={category.label}
                  onClick={() => selectCategory(category.id)}
                >
                  <CategoryIcon size={17} />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="settings-content" ref={settingsContentRef}>
            {selectedCategory.id === "general" && (
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
              </section>
            )}

            {selectedCategory.id === "editor" && (
              <>
                <section className="settings-section">
                  <div className="settings-section-title">{t("Display")}</div>
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
                  <ToggleRow
                    label={t("Scroll long tables")}
                    checked={tableHeightMode === "scroll"}
                    onChange={(enabled) => onTableHeightModeChange(enabled ? "scroll" : "full")}
                  />
                  {tableHeightMode === "scroll" && (
                    <SliderRow
                      label={t("Maximum table height (window)")}
                      value={tableMaxHeightVh}
                      min={30}
                      max={80}
                      step={5}
                      suffix="%"
                      onChange={onTableMaxHeightVhChange}
                    />
                  )}
                </section>
                <section className="settings-section">
                  <div className="settings-section-title">{t("Editing")}</div>
                  <ToggleRow label={t("Smart copy")} checked={smartCopy} onChange={onSmartCopyChange} />
                  <ToggleRow label={t("Soft syntax")} checked={softSyntax} onChange={onSoftSyntaxChange} />
                </section>
              </>
            )}

            {selectedCategory.id === "files" && (
              <section className="settings-section">
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
            )}

            {selectedCategory.id === "backups" && backupDirectoryAvailable && (
              <>
                <section className="settings-section">
                  <div className="settings-section-title">{t("Storage")}</div>
                  <div className="settings-row settings-location-row">
                    <span>{t("Backup location")}</span>
                    <div className="settings-location-control">
                      <output
                        className="settings-path"
                        title={backupPreferences.directory ?? t("System local data")}
                      >
                        {backupPreferences.directory ?? t("System local data")}
                      </output>
                      <div className="settings-actions">
                        <button className="settings-action" type="button" onClick={onChooseBackupDirectory}>
                          <FolderOpen size={14} />
                          {t("Choose folder")}
                        </button>
                        <button
                          className="settings-action"
                          type="button"
                          disabled={backupPreferences.directory === null}
                          onClick={onResetBackupDirectory}
                        >
                          <RotateCcw size={14} />
                          {t("Use system location")}
                        </button>
                      </div>
                    </div>
                  </div>
                  <NumberSettingRow
                    label={t("Maximum total backup files")}
                    value={backupPreferences.maxTotalFiles}
                    min={128}
                    max={20000}
                    onChange={(value) => updateBackupPreference("maxTotalFiles", value)}
                  />
                  <NumberSettingRow
                    label={t("Maximum total backup size")}
                    suffix="MB"
                    value={backupPreferences.maxTotalSizeMb}
                    min={256}
                    max={32768}
                    onChange={(value) => updateBackupPreference("maxTotalSizeMb", value)}
                  />
                  <NumberSettingRow
                    label={t("Maximum backup file size")}
                    suffix="MB"
                    value={backupPreferences.maxBackupFileSizeMb}
                    min={16}
                    max={4096}
                    onChange={(value) => updateBackupPreference("maxBackupFileSizeMb", value)}
                  />
                </section>
                <section className="settings-section">
                  <div className="settings-section-title">{t("Version history")}</div>
                  <NumberSettingRow
                    label={t("Checkpoint interval")}
                    suffix={t("minutes")}
                    value={backupPreferences.checkpointIntervalMinutes}
                    min={1}
                    max={120}
                    onChange={(value) => updateBackupPreference("checkpointIntervalMinutes", value)}
                  />
                  <NumberSettingRow
                    label={t("Automatic versions per file")}
                    value={backupPreferences.automaticVersionsPerFile}
                    min={1}
                    max={256}
                    onChange={(value) => updateBackupPreference("automaticVersionsPerFile", value)}
                  />
                  <NumberSettingRow
                    label={t("Safety versions per file")}
                    value={backupPreferences.safetyVersionsPerFile}
                    min={1}
                    max={256}
                    onChange={(value) => updateBackupPreference("safetyVersionsPerFile", value)}
                  />
                  <NumberSettingRow
                    label={t("Manual versions per file")}
                    value={backupPreferences.manualVersionsPerFile}
                    min={1}
                    max={256}
                    onChange={(value) => updateBackupPreference("manualVersionsPerFile", value)}
                  />
                  <NumberSettingRow
                    label={t("Automatic retention")}
                    suffix={t("days")}
                    value={backupPreferences.automaticRetentionDays}
                    min={7}
                    max={3650}
                    onChange={(value) => updateBackupPreference("automaticRetentionDays", value)}
                  />
                  <NumberSettingRow
                    label={t("Safety retention")}
                    suffix={t("days")}
                    value={backupPreferences.safetyRetentionDays}
                    min={7}
                    max={3650}
                    onChange={(value) => updateBackupPreference("safetyRetentionDays", value)}
                  />
                  <NumberSettingRow
                    label={t("Manual retention")}
                    suffix={t("days (0 = never)")}
                    value={backupPreferences.manualRetentionDays}
                    min={0}
                    max={3650}
                    onChange={(value) => updateBackupPreference("manualRetentionDays", value)}
                  />
                  <NumberSettingRow
                    label={t("Orphaned history retention")}
                    suffix={t("days")}
                    value={backupPreferences.orphanRetentionDays}
                    min={7}
                    max={3650}
                    onChange={(value) => updateBackupPreference("orphanRetentionDays", value)}
                  />
                </section>
              </>
            )}

            {selectedCategory.id === "about" && (
              <>
                <section className="settings-section">
                  <div className="settings-section-title">NyaMarkdownor</div>
                  <div className="settings-row">
                    <span>{t("Version")}</span>
                    <output className="settings-build-value">v{buildInfo.version}</output>
                  </div>
                  <div className="settings-row">
                    <span>{t("Commit")}</span>
                    <output className="settings-build-value">{buildInfo.commit || t("Development build")}</output>
                  </div>
                  <div className="settings-row">
                    <span>{t("Build date")}</span>
                    <output className="settings-build-value">{buildInfo.buildDate || t("Development build")}</output>
                  </div>
                </section>
                <section className="settings-section">
                  <div className="settings-row">
                    <span>{t("Updates")}</span>
                    <div className="settings-update-control">
                      <output className="settings-build-value">{applicationUpdateLabel(applicationUpdate, t)}</output>
                      {applicationUpdate.status === "available" ? (
                        <button
                          className="settings-action"
                          type="button"
                          onClick={() => onInstallUpdate(applicationUpdate.version)}
                        >
                          <Download size={14} />
                          {t("Download and install")}
                        </button>
                      ) : applicationUpdate.status === "unsupported" ? (
                        <button className="settings-action" type="button" onClick={onOpenReleasePage}>
                          <ExternalLink size={14} />
                          {t("View GitHub Releases")}
                        </button>
                      ) : applicationUpdate.status !== "checking" && applicationUpdate.status !== "installing" ? (
                        <button className="settings-action" type="button" onClick={onCheckForUpdates}>
                          <RefreshCw size={14} />
                          {t("Check for updates")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="settings-row">
                    <span>{t("Release repository")}</span>
                    <output className="settings-build-value">{buildInfo.updateRepository}</output>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function applicationUpdateLabel(state: ApplicationUpdateState, t: Translator): string {
  if (state.status === "idle") return t("Not checked");
  if (state.status === "checking") return t("Checking for updates...");
  if (state.status === "upToDate") return t("Up to date");
  if (state.status === "available") return t("Version {version} is available", { version: state.version });
  if (state.status === "installing") return t("Downloading version {version}...", { version: state.version });
  if (state.status === "error") return t("Update check failed");
  if (state.reason === "developmentBuild") return t("Unavailable in development builds");
  if (state.reason === "notInstalled") return t("Unavailable for portable copies");
  return t("Unavailable on this platform");
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

type NumberSettingRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
};

function NumberSettingRow({ label, value, min, max, suffix, onChange }: NumberSettingRowProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commitDraft() {
    const parsed = draft.trim() ? Number(draft) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const next = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(next));
    onChange(next);
  }

  return (
    <label className="settings-row settings-number-row">
      <span>{label}</span>
      <span className="settings-number-control">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitDraft();
            event.currentTarget.blur();
          }}
        />
        {suffix && <span>{suffix}</span>}
      </span>
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
