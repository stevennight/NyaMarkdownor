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
    expect(translate("zh-CN", "{count} files", { count: 3 })).toBe("3 files");
    expect(translateUiText("zh-CN", "42 lines")).toBe("42 行");
    expect(translateUiText("zh-CN", "Switch to Notes.md")).toBe("切换到 Notes.md");
    expect(translateUiText("zh-CN", "Table range selected: 2x3 cells")).toBe("已选择 2 x 3 个表格单元格");
    expect(translateUiText("zh-CN", "2 unsaved tabs")).toBe("2 个标签页未保存");
  });
});
