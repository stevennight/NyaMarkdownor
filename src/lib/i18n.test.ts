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
  });
});
