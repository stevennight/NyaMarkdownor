import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { BackupPreferences } from "../types";
import { defaultBackupPreferences } from "./preferences";
import { createMarkdownFile, deleteMarkdownBackup, deleteMarkdownBackupHistory, ensureHtmlName, ensureHtmlPath, ensureMarkdownName, ensureMarkdownPath, existingMarkdownFileStats, importMarkdownFilesAsDrafts, isTauriRuntime, listMarkdownBackupHistories, listMarkdownBackups, manageFileAssociation, markdownBackupStorageUsage, openedFileHasLocalBinding, openMarkdownFiles, openMarkdownFilesToast, openMarkdownFilesToastWithFailures, pickMarkdownBackupDirectory, readMarkdownBackup, readMarkdownPath, revealMarkdownFile, saveMarkdownFile, supportsBrowserFileAccess, uniqueOpenPaths } from "./fileIo";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri)
}));

const invokeMock = vi.mocked(invoke);
const backupSettings: BackupPreferences = {
  ...defaultBackupPreferences,
  directory: "D:/Nya Backups",
  previousDirectories: ["C:/Old Nya Backups"],
};

afterEach(() => {
  invokeMock.mockReset();
  vi.unstubAllGlobals();
});

describe("file IO path helpers", () => {
  it("keeps supported Markdown names and appends Markdown to extensionless names", () => {
    expect(ensureMarkdownName("Notes.md")).toBe("Notes.md");
    expect(ensureMarkdownName("Notes.markdown")).toBe("Notes.markdown");
    expect(ensureMarkdownName("Notes.mdown")).toBe("Notes.mdown");
    expect(ensureMarkdownName("Notes.mkdn")).toBe("Notes.mkdn");
    expect(ensureMarkdownName("Notes.mdwn")).toBe("Notes.mdwn");
    expect(ensureMarkdownName("Notes.txt")).toBe("Notes.txt");
    expect(ensureMarkdownName("Notes")).toBe("Notes.md");
  });

  it("does not create extension-only Markdown names from blank suggestions", () => {
    expect(ensureMarkdownName("")).toBe("Untitled.md");
    expect(ensureMarkdownName("   ")).toBe("Untitled.md");
    expect(ensureMarkdownName(".md")).toBe("Untitled.md");
    expect(ensureMarkdownName("  Notes.md  ")).toBe("Notes.md");
  });

  it("keeps supported Markdown paths and appends Markdown to extensionless save paths", () => {
    expect(ensureMarkdownPath("D:/notes/Notes.md")).toBe("D:/notes/Notes.md");
    expect(ensureMarkdownPath("D:/notes/Notes.markdown")).toBe("D:/notes/Notes.markdown");
    expect(ensureMarkdownPath("D:/notes/Notes.mkdn")).toBe("D:/notes/Notes.mkdn");
    expect(ensureMarkdownPath("D:/notes/Notes.txt")).toBe("D:/notes/Notes.txt");
    expect(ensureMarkdownPath("D:/notes/Notes")).toBe("D:/notes/Notes.md");
  });

  it("does not create extension-only Markdown paths from blank or extension-only save paths", () => {
    expect(ensureMarkdownPath("")).toBe("Untitled.md");
    expect(ensureMarkdownPath("   ")).toBe("Untitled.md");
    expect(ensureMarkdownPath(".md")).toBe("Untitled.md");
    expect(ensureMarkdownPath("D:/notes/.md")).toBe("D:/notes/Untitled.md");
    expect(ensureMarkdownPath("D:\\notes\\.txt")).toBe("D:\\notes\\Untitled.txt");
    expect(ensureMarkdownPath("D:/notes/")).toBe("D:/notes/Untitled.md");
  });

  it("derives HTML export names from Markdown names", () => {
    expect(ensureHtmlName("Notes.md")).toBe("Notes.html");
    expect(ensureHtmlName("Notes.markdown")).toBe("Notes.html");
    expect(ensureHtmlName("Notes.mdown")).toBe("Notes.html");
    expect(ensureHtmlName("Notes.mkdn")).toBe("Notes.html");
    expect(ensureHtmlName("Notes.html")).toBe("Notes.html");
    expect(ensureHtmlName(".html")).toBe("Untitled.html");
    expect(ensureHtmlName(".htm")).toBe("Untitled.htm");
    expect(ensureHtmlName("   ")).toBe("Untitled.html");
  });

  it("derives safe HTML export paths from Markdown or extensionless save paths", () => {
    expect(ensureHtmlPath("D:/notes/Notes.md")).toBe("D:/notes/Notes.html");
    expect(ensureHtmlPath("D:/notes/Notes")).toBe("D:/notes/Notes.html");
    expect(ensureHtmlPath("D:/notes/Notes.htm")).toBe("D:/notes/Notes.htm");
    expect(ensureHtmlPath("D:/notes/.html")).toBe("D:/notes/Untitled.html");
    expect(ensureHtmlPath("D:\\notes\\.htm")).toBe("D:\\notes\\Untitled.htm");
    expect(ensureHtmlPath("D:/notes/")).toBe("D:/notes/Untitled.html");
    expect(ensureHtmlPath("   ")).toBe("Untitled.html");
  });

  it("summarizes multi-file open results", () => {
    expect(openMarkdownFilesToast(0, 0)).toBe("No files selected");
    expect(openMarkdownFilesToast(0, 1)).toBe("1 file could not be opened");
    expect(openMarkdownFilesToast(2, 0)).toBe("Opened 2 files");
    expect(openMarkdownFilesToast(2, 1)).toBe("Opened 2 files - 1 failed");
    expect(openMarkdownFilesToast(1, 3)).toBe("Opened 1 file - 3 failed");
  });

  it("includes the first failure reason when open partially fails", () => {
    expect(openMarkdownFilesToastWithFailures(0, 1, ["Failed to decode file"])).toBe("1 file could not be opened: Failed to decode file");
    expect(openMarkdownFilesToastWithFailures(2, 1, ["Unsupported encoding"])).toBe("Opened 2 files - 1 failed: Unsupported encoding");
  });

  it("deduplicates selected open paths while preserving order", () => {
    expect(uniqueOpenPaths([" D:/notes/a.md ", "", "D:/notes/b.md", "D:/notes/a.md", "d:\\notes\\A.md"])).toEqual([
      "D:/notes/a.md",
      "D:/notes/b.md"
    ]);
  });

  it("detects the official Tauri runtime flag", () => {
    vi.stubGlobal("isTauri", true);

    expect(isTauriRuntime()).toBe(true);
  });

  it("keeps compatibility with Tauri internals runtime markers", () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    expect(isTauriRuntime()).toBe(true);
  });

  it("checks whether a Markdown source still exists in the desktop runtime", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockResolvedValue({ modifiedMs: 42, size: 128 });

    await expect(existingMarkdownFileStats("D:/notes/History.md")).resolves.toEqual({ modifiedMs: 42, size: 128 });
    expect(invokeMock).toHaveBeenCalledWith("existing_markdown_file_stats", { path: "D:/notes/History.md" });
  });

  it("skips source existence checks outside the desktop runtime", async () => {
    await expect(existingMarkdownFileStats("D:/notes/History.md")).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not pretend unsupported browser mode can create a bound local file", async () => {
    await expect(createMarkdownFile("", "Untitled.md")).rejects.toThrow("desktop app");
  });

  it("does not pretend unsupported browser mode can open a bound local file", async () => {
    await expect(openMarkdownFiles()).rejects.toThrow("real local file");
  });

  it("does not pretend browser mode can reveal local files", async () => {
    await expect(revealMarkdownFile("D:/notes/Draft.md")).rejects.toThrow("desktop app");
  });

  it("routes explicit file association choices through the desktop command", async () => {
    vi.stubGlobal("isTauri", true);

    await manageFileAssociation("markdown");
    await manageFileAssociation("plain-text");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "manage_file_association", { scope: "markdown" });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "manage_file_association", { scope: "plain-text" });
  });

  it("opens desktop-selected files as path-backed local files", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "pick_markdown_files") return ["D:/notes/A.md", "d:\\notes\\A.md", "D:/notes/B.txt"];
      if (command === "read_markdown_file") return `# ${(args as { path: string }).path}`;
      if (command === "stat_markdown_file") return { modifiedMs: 10, size: 7 };
      throw new Error(`Unexpected command ${command}`);
    });

    const result = await openMarkdownFiles();

    expect(result.failedCount).toBe(0);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      path: "D:/notes/A.md",
      name: "A.md",
      markdown: "# D:/notes/A.md",
      fileStats: { modifiedMs: 10, size: 7 }
    });
    expect(openedFileHasLocalBinding(result.files[0])).toBe(true);
  });

  it("normalizes CRLF files for editing while retaining their disk line ending", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command) => {
      if (command === "read_markdown_file") return "alpha\r\nbeta\r\n";
      if (command === "stat_markdown_file") return { modifiedMs: 10, size: 13 };
      throw new Error(`Unexpected command ${command}`);
    });

    await expect(readMarkdownPath("D:/notes/Windows.md")).resolves.toEqual({
      path: "D:/notes/Windows.md",
      name: "Windows.md",
      markdown: "alpha\nbeta\n",
      lineEnding: "crlf",
      fileStats: { modifiedMs: 10, size: 13 }
    });
  });

  it("simplifies safe Windows verbatim paths before opening and binding files", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      expect(args).toEqual({ path: "C:\\Users\\Steve\\Desktop\\Draft.md" });
      if (command === "read_markdown_file") return "# Draft";
      if (command === "stat_markdown_file") return { modifiedMs: 10, size: 7 };
      throw new Error(`Unexpected command ${command}`);
    });

    await expect(readMarkdownPath("\\\\?\\C:\\Users\\Steve\\Desktop\\Draft.md")).resolves.toMatchObject({
      path: "C:\\Users\\Steve\\Desktop\\Draft.md",
      name: "Draft.md",
      markdown: "# Draft"
    });
  });

  it("creates desktop new files with a real path binding", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "pick_markdown_save_path") {
        expect(args).toEqual({ suggestedPath: "Untitled.md" });
        return "D:/notes/Untitled";
      }
      if (command === "create_markdown_file") {
        expect(args).toEqual({ path: "D:/notes/Untitled.md", content: "" });
        return { backupPath: null, stats: { modifiedMs: 20, size: 0 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    const created = await createMarkdownFile("", "Untitled");

    expect(created).toEqual({
      path: "D:/notes/Untitled.md",
      name: "Untitled.md",
      markdown: "",
      lineEnding: "lf",
      backupPath: null,
      fileStats: { modifiedMs: 20, size: 0 }
    });
    expect(openedFileHasLocalBinding(created!)).toBe(true);
  });

  it("passes a verified disk version into desktop saves", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Draft.md",
          content: "# Updated",
          expectedStats: { modifiedMs: 20, size: 7 },
          expectedMissing: false,
            backupKind: "automatic",
            skipBackup: false
        });
        return { backupPath: "C:/AppData/NyaMarkdownor/backups-v1/hash/Draft.md.1.manual.bak", stats: { modifiedMs: 30, size: 9 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    const saved = await saveMarkdownFile("D:/notes/Draft.md", "# Updated", "Draft.md", { modifiedMs: 20, size: 7 });

    expect(saved).toMatchObject({
      path: "D:/notes/Draft.md",
      markdown: "# Updated",
      fileStats: { modifiedMs: 30, size: 9 }
    });
  });

  it("marks automatic saves so native backup checkpoints can be throttled", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Draft.md",
          content: "# Automatic",
          expectedStats: { modifiedMs: 30, size: 9 },
          expectedMissing: false,
            backupKind: "automatic",
            skipBackup: false
        });
        return { backupPath: "C:/AppData/NyaMarkdownor/backups-v1/hash/Draft.md.2.automatic.bak", stats: { modifiedMs: 40, size: 11 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    await saveMarkdownFile(
      "D:/notes/Draft.md",
      "# Automatic",
      "Draft.md",
      { modifiedMs: 30, size: 9 },
      "lf",
      "automatic"
    );
  });

  it("passes the complete backup settings into desktop saves", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Draft.md",
          content: "# Configured",
          expectedStats: { modifiedMs: 40, size: 11 },
            expectedMissing: false,
            backupKind: "automatic",
            skipBackup: false,
            backupSettings
        });
        return { backupPath: "D:/Nya Backups/hash/Draft.md.3.automatic.bak", stats: { modifiedMs: 50, size: 12 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    await saveMarkdownFile(
      "D:/notes/Draft.md",
      "# Configured",
      "Draft.md",
      { modifiedMs: 40, size: 11 },
      "lf",
      "automatic",
      backupSettings
    );
  });

  it("passes backup settings into backup and history listings", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock
      .mockResolvedValueOnce([{
        path: "D:/Nya Backups/hash/Draft.md.3.automatic.bak",
        name: "Draft.md.3.automatic.bak",
        modifiedMs: 30,
        size: 12,
        kind: "automatic"
      }])
      .mockResolvedValueOnce([{
        sourcePath: "D:/notes/Draft.md",
        fileName: "Draft.md",
        latestMs: 30,
        backupCount: 1,
        totalSize: 12,
        sourceExists: true,
        latestBackupPath: "D:/Nya Backups/hash/Draft.md.3.automatic.bak"
      }]);

    await expect(listMarkdownBackups("D:/notes/Draft.md", backupSettings)).resolves.toHaveLength(1);
    await expect(listMarkdownBackupHistories(backupSettings, ["D:/notes/Draft.md"])).resolves.toHaveLength(1);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_markdown_backups", {
      path: "D:/notes/Draft.md",
      backupSettings
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "list_markdown_backup_histories", {
      sourcePaths: ["D:/notes/Draft.md"],
      backupSettings
    });
  });

  it("reads global backup storage usage with the active limits", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockResolvedValue({
      backupCount: 1_640,
      totalSize: 1_800_000_000,
      maxBackupCount: 2_048,
      maxTotalSize: 2_147_483_648,
      warningThresholdPercent: 80,
      warning: true
    });

    await expect(markdownBackupStorageUsage(backupSettings)).resolves.toMatchObject({
      backupCount: 1_640,
      warning: true
    });
    expect(invokeMock).toHaveBeenCalledWith("markdown_backup_storage_usage", { backupSettings });
  });

  it("does not inspect backup usage outside the desktop runtime", async () => {
    await expect(markdownBackupStorageUsage(backupSettings)).resolves.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("reads an orphaned backup when the source stat fails", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command) => {
      if (command === "read_markdown_backup") return "alpha\r\nbeta\r\n";
      if (command === "stat_markdown_file") throw new Error("Source file no longer exists");
      throw new Error(`Unexpected command ${command}`);
    });

    await expect(readMarkdownBackup(
      "D:/missing/Orphan.md",
      "D:/Nya Backups/hash/Orphan.md.1.manual.bak",
      backupSettings
    )).resolves.toEqual({
      path: "D:/missing/Orphan.md",
      name: "Orphan.md",
      markdown: "alpha\nbeta\n",
      lineEnding: "crlf",
      backupPath: "D:/Nya Backups/hash/Orphan.md.1.manual.bak",
      fileStats: null
    });
    expect(invokeMock).toHaveBeenCalledWith("read_markdown_backup", {
      sourcePath: "D:/missing/Orphan.md",
      backupPath: "D:/Nya Backups/hash/Orphan.md.1.manual.bak",
      backupSettings
    });
    expect(invokeMock).toHaveBeenCalledWith("stat_markdown_file", {
      path: "D:/missing/Orphan.md"
    });
  });

  it("deletes all backup history for a source with the configured backup roots", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockResolvedValue(undefined);

    await expect(deleteMarkdownBackupHistory("D:/missing/Orphan.md", backupSettings)).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("delete_markdown_backup_history", {
      sourcePath: "D:/missing/Orphan.md",
      backupSettings
    });
  });

  it("deletes one backup for a source with the configured backup roots", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockResolvedValue(undefined);

    await expect(deleteMarkdownBackup(
      "D:/notes/Draft.md",
      "D:/Nya Backups/hash/Draft.md.3.automatic.bak",
      backupSettings
    )).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("delete_markdown_backup", {
      sourcePath: "D:/notes/Draft.md",
      backupPath: "D:/Nya Backups/hash/Draft.md.3.automatic.bak",
      backupSettings
    });
  });

  it("rejects single backup deletion outside the desktop runtime", async () => {
    await expect(deleteMarkdownBackup(
      "D:/notes/Draft.md",
      "D:/Nya Backups/hash/Draft.md.3.automatic.bak",
      backupSettings
    )).rejects.toThrow("Deleting backups requires the desktop app.");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("rejects backup history deletion outside the desktop runtime", async () => {
    await expect(deleteMarkdownBackupHistory("D:/missing/Orphan.md", backupSettings))
      .rejects.toThrow("Deleting backup history requires the desktop app.");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("routes backup directory selection through the desktop command", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockResolvedValue("E:/Nya Backups");

    await expect(pickMarkdownBackupDirectory()).resolves.toBe("E:/Nya Backups");
    expect(invokeMock).toHaveBeenCalledWith("pick_markdown_backup_directory");
  });

  it("restores CRLF only for the disk write and keeps returned editor text normalized", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Windows.md",
          content: "alpha\r\nbeta\r\n",
          expectedStats: { modifiedMs: 20, size: 13 },
          expectedMissing: false,
            backupKind: "automatic",
            skipBackup: false
        });
        return { backupPath: null, stats: { modifiedMs: 30, size: 13 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    const saved = await saveMarkdownFile(
      "D:/notes/Windows.md",
      "alpha\nbeta\n",
      "Windows.md",
      { modifiedMs: 20, size: 13 },
      "crlf"
    );

    expect(saved).toMatchObject({
      markdown: "alpha\nbeta\n",
      lineEnding: "crlf",
      fileStats: { modifiedMs: 30, size: 13 }
    });
  });

  it("protects a newly selected Save As target from a concurrent create", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "pick_markdown_save_path") return "D:/notes/Archive.md";
      if (command === "existing_markdown_file_stats") {
        expect(args).toEqual({ path: "D:/notes/Archive.md" });
        return null;
      }
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Archive.md",
          content: "# Archive",
          expectedStats: null,
          expectedMissing: true,
            backupKind: "automatic",
            skipBackup: false
        });
        return { backupPath: null, stats: { modifiedMs: 40, size: 9 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    const saved = await saveMarkdownFile(null, "# Archive", "Archive.md");

    expect(saved).toMatchObject({
      path: "D:/notes/Archive.md",
      markdown: "# Archive",
      fileStats: { modifiedMs: 40, size: 9 }
    });
  });

  it("passes the selected existing Save As target version into the write precondition", async () => {
    vi.stubGlobal("isTauri", true);
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "pick_markdown_save_path") return "D:/notes/Archive.md";
      if (command === "existing_markdown_file_stats") {
        expect(args).toEqual({ path: "D:/notes/Archive.md" });
        return { modifiedMs: 45, size: 13 };
      }
      if (command === "write_markdown_file") {
        expect(args).toEqual({
          path: "D:/notes/Archive.md",
          content: "# Updated archive",
          expectedStats: { modifiedMs: 45, size: 13 },
          expectedMissing: false,
            backupKind: "automatic",
            skipBackup: false
        });
        return { backupPath: "C:/AppData/NyaMarkdownor/backups-v1/hash/Archive.md.1.manual.bak", stats: { modifiedMs: 50, size: 17 } };
      }
      throw new Error(`Unexpected command ${command}`);
    });

    const saved = await saveMarkdownFile(null, "# Updated archive", "Archive.md");

    expect(saved).toMatchObject({
      path: "D:/notes/Archive.md",
      backupPath: "C:/AppData/NyaMarkdownor/backups-v1/hash/Archive.md.1.manual.bak",
      fileStats: { modifiedMs: 50, size: 17 }
    });
  });

  it("does not treat browser File System Access as a real local file binding", async () => {
    const savePicker = vi.fn().mockResolvedValue(createBrowserFileHandle("Picked.md"));
    const downloadDocument = createBrowserDownloadDocument();
    const createObjectURL = vi.fn().mockReturnValue("blob:nmd-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("window", {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: savePicker,
      setTimeout: vi.fn()
    });
    vi.stubGlobal("document", downloadDocument.document);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    expect(supportsBrowserFileAccess()).toBe(true);

    await expect(createMarkdownFile("# Hello", "Notes")).rejects.toThrow("desktop app");

    const saved = await saveMarkdownFile(null, "# Updated", "Notes.md");
    expect(savePicker).not.toHaveBeenCalled();
    expect(openedFileHasLocalBinding(saved!)).toBe(false);
    expect(downloadDocument.anchor.download).toBe("Notes.md");
  });

  it("can force browser preview saves to download without creating a file binding", async () => {
    const savePicker = vi.fn().mockResolvedValue(createBrowserFileHandle("Picked.md"));
    const downloadDocument = createBrowserDownloadDocument();
    const createObjectURL = vi.fn().mockReturnValue("blob:nmd-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("window", {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: savePicker,
      setTimeout: vi.fn()
    });
    vi.stubGlobal("document", downloadDocument.document);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const saved = await saveMarkdownFile(null, "# Draft", "Draft");

    expect(savePicker).not.toHaveBeenCalled();
    expect(saved).toMatchObject({
      path: null,
      name: "Draft.md",
      markdown: "# Draft",
      backupPath: null,
      fileStats: null
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(downloadDocument.anchor.href).toBe("blob:nmd-test");
    expect(downloadDocument.anchor.download).toBe("Draft.md");
    expect(downloadDocument.anchor.click).toHaveBeenCalledOnce();
  });

  it("does not open browser file handles as local bindings", async () => {
    const handle = createBrowserFileHandle("Picked.md", "# Picked");
    const openPicker = vi.fn().mockResolvedValue([handle]);
    vi.stubGlobal("window", {
      showOpenFilePicker: openPicker,
      showSaveFilePicker: vi.fn()
    });

    await expect(openMarkdownFiles()).rejects.toThrow("desktop app");
    expect(openPicker).not.toHaveBeenCalled();
  });

  it("imports browser files as unbound drafts even when File System Access is available", async () => {
    const openPicker = vi.fn().mockResolvedValue([createBrowserFileHandle("Picked.md", "# Picked")]);
    const { document } = createBrowserInputDocument([createBrowserFile("Imported.md", "# Imported")]);
    vi.stubGlobal("window", {
      showOpenFilePicker: openPicker,
      showSaveFilePicker: vi.fn()
    });
    vi.stubGlobal("document", document);

    const result = await importMarkdownFilesAsDrafts();

    expect(result.failedCount).toBe(0);
    expect(openPicker).not.toHaveBeenCalled();
    expect(result.files[0]).toMatchObject({
      path: null,
      name: "Imported.md",
      markdown: "# Imported"
    });
    expect(openedFileHasLocalBinding(result.files[0])).toBe(false);
  });

  it("decodes browser-opened legacy Chinese text files", async () => {
    const { document } = createBrowserInputDocument([createBrowserFile("Chinese.txt", "", new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]))]);
    vi.stubGlobal("window", {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn()
    });
    vi.stubGlobal("document", document);

    const result = await importMarkdownFilesAsDrafts();

    expect(result.files[0].markdown).toBe("中文");
  });
});

function createBrowserFileHandle(name: string, initialContent = "", initialBytes?: Uint8Array) {
  let contentBytes = initialBytes ?? new TextEncoder().encode(initialContent);
  const writes: string[] = [];
  return {
    kind: "file" as const,
    name,
    writes,
    async getFile() {
      return {
        name,
        size: contentBytes.byteLength,
        lastModified: 1234,
        async arrayBuffer() {
          return contentBytes.buffer.slice(contentBytes.byteOffset, contentBytes.byteOffset + contentBytes.byteLength);
        },
        async text() {
          return new TextDecoder().decode(contentBytes);
        }
      } as File;
    },
    async createWritable() {
      return {
        async write(nextContent: BlobPart) {
          const content = String(nextContent);
          contentBytes = new TextEncoder().encode(content);
          writes.push(content);
        },
        async close() {
          return undefined;
        }
      };
    }
  };
}

function createBrowserFile(name: string, initialContent = "", initialBytes?: Uint8Array): File {
  const contentBytes = initialBytes ?? new TextEncoder().encode(initialContent);
  return {
    name,
    size: contentBytes.byteLength,
    lastModified: 1234,
    async arrayBuffer() {
      return contentBytes.buffer.slice(contentBytes.byteOffset, contentBytes.byteOffset + contentBytes.byteLength);
    },
    async text() {
      return new TextDecoder().decode(contentBytes);
    }
  } as File;
}

function createBrowserInputDocument(files: File[]) {
  const listeners = new Map<string, Array<() => void>>();
  const input = {
    type: "",
    multiple: false,
    accept: "",
    style: { display: "" },
    files,
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    click() {
      queueMicrotask(() => {
        for (const listener of listeners.get("change") ?? []) listener();
      });
    },
    remove: vi.fn()
  };

  return {
    input,
    document: {
      createElement: vi.fn(() => input),
      body: {
        append: vi.fn()
      }
    }
  };
}

function createBrowserDownloadDocument() {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn()
  };

  return {
    anchor,
    document: {
      createElement: vi.fn(() => anchor),
      body: {
        append: vi.fn()
      }
    }
  };
}
