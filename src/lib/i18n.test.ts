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
