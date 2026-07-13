import { describe, expect, it } from "vitest";
import { createTranslator, resolveAppLocale, translate, translateUiText } from "./i18n";

describe("i18n", () => {
  it("resolves explicit and system language preferences", () => {
    expect(resolveAppLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveAppLocale("zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveAppLocale("system", ["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveAppLocale("system", ["en-US", "zh-CN"])).toBe("en");
  });

  it("falls back to English source text for missing messages", () => {
    expect(translate("zh-CN", "Unregistered message")).toBe("Unregistered message");
    expect(translate("en", "Settings")).toBe("Settings");
  });

  it("translates static, interpolated, and common dynamic UI text", () => {
    expect(createTranslator("zh-CN")("Settings")).toBe("设置");
    expect(createTranslator("zh-CN")("General")).toBe("常规");
    expect(createTranslator("zh-CN")("Settings categories")).toBe("设置分类");
    expect(createTranslator("zh-CN")("Version history")).toBe("版本历史");
    expect(createTranslator("zh-CN")("File history management")).toBe("文件历史管理");
    expect(createTranslator("zh-CN")("Orphaned file history")).toBe("孤立文件历史");
    expect(createTranslator("zh-CN")("{count} versions", { count: 7 })).toBe("7 个版本");
    expect(createTranslator("zh-CN")("{count} selected", { count: 3 })).toBe("已选择 3 项");
    expect(createTranslator("zh-CN")("Delete {count} selected versions?", { count: 3 })).toBe("删除所选 3 个历史版本吗？");
    expect(createTranslator("zh-CN")("Open Version History")).toBe("打开版本历史");
    expect(createTranslator("zh-CN")("Save without history")).toBe("无历史版本继续保存");
    expect(createTranslator("zh-CN")("Automatic save paused; version history storage needs attention"))
      .toBe("自动保存已暂停；需要处理版本历史存储空间");
    expect(createTranslator("zh-CN")("Version history storage is over 80% full; open Version History to review it"))
      .toBe("版本历史存储已超过 80%；请打开版本历史进行检查");
    expect(createTranslator("zh-CN")("File changed on disk")).toBe("磁盘文件已变更");
    expect(createTranslator("zh-CN")("Compare versions")).toBe("比较版本");
    expect(createTranslator("zh-CN")("Reload from disk")).toBe("从磁盘重新加载");
    expect(createTranslator("zh-CN")("About")).toBe("关于");
    expect(createTranslator("zh-CN")("Build date")).toBe("构建时间");
    expect(createTranslator("zh-CN")("Scroll long tables")).toBe("长表格内部滚动");
    expect(createTranslator("zh-CN")("Backup location")).toBe("备份位置");
    expect(createTranslator("zh-CN")("System local data")).toBe("系统本地数据目录");
    expect(createTranslator("zh-CN")("Automatic versions per file")).toBe("每个文件的自动版本数");
    expect(createTranslator("zh-CN")("Orphaned history retention")).toBe("孤立历史保留时长");
    expect(createTranslator("zh-CN")("Delete orphaned history")).toBe("删除孤立历史");
    expect(createTranslator("zh-CN")("This permanently deletes every retained backup version for this source file from all backup locations. This cannot be undone."))
      .toBe("这会从所有备份位置永久删除该源文件的全部保留版本，且无法恢复。");
    expect(createTranslator("en")("Orphaned history retention")).toBe("Orphaned history retention");
    expect(createTranslator("en")("Use system location")).toBe("Use system location");
    expect(createTranslator("zh-CN")("Show {count} older versions", { count: 18 })).toBe("显示其余 18 个版本");
    expect(translate("zh-CN", "{count} files", { count: 3 })).toBe("3 files");
    expect(translateUiText("zh-CN", "42 lines")).toBe("42 行");
    expect(translateUiText("zh-CN", "Switch to Notes.md")).toBe("切换到 Notes.md");
    expect(translateUiText("zh-CN", "Table range selected: 2x3 cells")).toBe("已选择 2 x 3 个表格单元格");
    expect(translateUiText("zh-CN", "2 unsaved tabs")).toBe("2 个标签页未保存");
    expect(translateUiText("zh-CN", "One tab has unsaved changes. Its current working state will be restored the next time NyaMarkdownor starts."))
      .toBe("有 1 个标签页存在未保存更改。NyaMarkdownor 下次启动时会恢复其当前工作状态。");
    expect(translateUiText("zh-CN", "2 tabs have unsaved changes. Their current working states will be restored the next time NyaMarkdownor starts."))
      .toBe("有 2 个标签页存在未保存更改。NyaMarkdownor 下次启动时会恢复这些标签页的当前工作状态。");
    expect(translateUiText("zh-CN", "This tab has unsaved changes. NyaMarkdownor will create a safety checkpoint before closing it."))
      .toBe("此标签页有未保存更改。NyaMarkdownor 会在关闭前创建重大变动检查点。");
    expect(translateUiText("zh-CN", "Dirty tabs will get safety checkpoints before closing. 2 dirty tabs will get safety checkpoints."))
      .toBe("关闭前会为有未保存更改的标签页创建重大变动检查点。其中 2 个标签页有未保存更改。");
    expect(translateUiText("zh-CN", "Dirty tabs to the right will get safety checkpoints before closing."))
      .toBe("关闭前会为右侧有未保存更改的标签页创建重大变动检查点。");
    expect(translateUiText("zh-CN", "Dirty tabs will get safety checkpoints before closing. A new blank document will open afterward."))
      .toBe("关闭前会为有未保存更改的标签页创建重大变动检查点，之后会打开新的空白文档。");
    expect(translateUiText("zh-CN", "Reloading will replace the current unsaved editor content with the file currently on disk after creating a safety checkpoint."))
      .toBe("创建重大变动检查点后，将用磁盘上的文件替换当前未保存的编辑内容。");
    expect(translateUiText("zh-CN", "Restoring will replace the current unsaved editor content with this version after creating a safety checkpoint."))
      .toBe("恢复前会先为当前未保存内容创建重大变动检查点，再用此版本替换编辑区内容。");
    expect(translateUiText("zh-CN", "The disk version differs from the editor. Reloading replaces the editor content with the disk version after creating a safety checkpoint for any unsaved content."))
      .toBe("磁盘版本与编辑器内容不同。重新加载会先为未保存内容创建重大变动检查点，再用磁盘版本替换编辑器内容。");
    expect(translateUiText("zh-CN", "Delete this checkpoint?")).toBe("删除这个检查点吗？");
    expect(translateUiText("zh-CN", "This removes the checkpoint from this device. The current editor content will not change."))
      .toBe("这会从本设备删除该检查点，当前编辑内容不会改变。");
    expect(translateUiText("zh-CN", "Manual checkpoint saved")).toBe("已保存手动检查点");
    expect(translateUiText("zh-CN", "Checkpoint kept for this session only")).toBe("检查点仅保留在当前会话");
    expect(translateUiText("zh-CN", "No changes to save")).toBe("没有需要保存的更改");
    expect(translateUiText("zh-CN", "Automatic version (updating)")).toBe("自动版本（持续更新）");
    expect(translateUiText("zh-CN", "Automatic version")).toBe("自动版本");
    expect(createTranslator("zh-CN")("Copy Table as CSV")).toBe("将表格复制为 CSV");
    expect(createTranslator("zh-CN")("Document properties ({format})", { format: "YAML" })).toBe("文档属性（YAML）");
    expect(translateUiText("zh-CN", "Close Notes.md?")).toBe("关闭 Notes.md 吗？");
    expect(translateUiText("zh-CN", "Opened Notes.md - first 12 files")).toBe("已打开文件夹 Notes.md，仅显示前 12 个文件");
    expect(translateUiText("zh-CN", "Opened 2 dropped files - 1 skipped")).toBe("已打开 2 个拖入文件 - 已跳过 1 个");
    expect(translateUiText("zh-CN", "1 file could not be opened")).toBe("有 1 个文件无法打开");
    expect(translateUiText("zh-CN", "Saved 2 tabs; save all stopped")).toBe("已保存 2 个标签页；全部保存已停止");
    expect(translateUiText("zh-CN", "Saved 2 tabs")).toBe("已保存 2 个标签页");
    expect(translateUiText("zh-CN", "Saved Notes.md")).toBe("已保存 Notes.md");
    expect(translateUiText("zh-CN", "Imported Notes.md as draft")).toBe("已将 Notes.md 导入为草稿");
    expect(translateUiText("zh-CN", "Inserted 3 image references - 1 skipped")).toBe("已插入 3 个图片引用 - 已跳过 1 个");
    expect(translateUiText("zh-CN", "Filled table from HTML table")).toBe("已从 HTML 表格 填充表格");
  });
});
