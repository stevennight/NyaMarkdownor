export type ViewMode = "focus" | "split" | "preview" | "wysiwyg";

export type ThemeMode = "light" | "dark";

export type LanguagePreference = "system" | "zh-CN" | "en";

export type AppLocale = Exclude<LanguagePreference, "system">;

export type MarkdownLineEnding = "lf" | "crlf";

export type EditorDensity = "compact" | "comfortable" | "spacious";

export type CopyMode = "markdown" | "smart" | "plain";

export type TableHeightMode = "full" | "scroll";

export type SidebarPage = "outline" | "files" | "recovery";

export type PaneLayout = {
  editorRatio: number;
  tableWidth: number;
};

export type BackupPreferences = {
  directory: string | null;
  previousDirectories: string[];
  checkpointIntervalMinutes: number;
  automaticVersionsPerFile: number;
  safetyVersionsPerFile: number;
  manualVersionsPerFile: number;
  maxTotalFiles: number;
  maxTotalSizeMb: number;
  maxBackupFileSizeMb: number;
  automaticRetentionDays: number;
  safetyRetentionDays: number;
  manualRetentionDays: number;
  orphanRetentionDays: number;
};

export type AppPreferences = {
  viewMode: ViewMode;
  theme: ThemeMode;
  language: LanguagePreference;
  sidebarVisible: boolean;
  sidebarPage: SidebarPage;
  autoSave: boolean;
  copyMode: CopyMode;
  softSyntax: boolean;
  editorFontSize: number;
  editorContentWidth: number;
  editorDensity: EditorDensity;
  tableHeightMode: TableHeightMode;
  tableMaxHeightVh: number;
  paneLayout: PaneLayout;
  backup: BackupPreferences;
};

export type MarkdownDocument = {
  fileName: string;
  filePath: string | null;
  markdown: string;
  lastSavedMarkdown: string;
  lineEnding: MarkdownLineEnding;
  lastBackupPath?: string | null;
  fileStats?: MarkdownFileStats | null;
};

export type MarkdownFileStats = {
  modifiedMs: number;
  size: number;
};

export type WorkspaceFile = {
  path: string;
  name: string;
  relativePath: string;
  depth: number;
  modifiedMs: number;
  size: number;
};

export type WorkspaceListing = {
  rootPath: string;
  rootName: string;
  files: WorkspaceFile[];
  truncated: boolean;
};

export type RecentFile = {
  path: string;
  name: string;
  updatedAt: number;
};

export type Heading = {
  level: number;
  text: string;
  line: number;
  id: string;
};

export type TableAlignment = "none" | "left" | "center" | "right";

export type MarkdownTable = {
  headers: string[];
  aligns: TableAlignment[];
  rows: string[][];
};

export type TableBlock = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  table: MarkdownTable;
  position: {
    row: number;
    col: number;
  };
};

export type RenderedMarkdown = {
  html: string;
  headings: Heading[];
};
