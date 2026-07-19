import { describe, expect, it } from "vitest";
import { browserTitleLinkFromClipboard } from "./richLinkPaste";

describe("rich link paste", () => {
  it("uses one site link when the page title contains the source hostname", () => {
    expect(browserTitleLinkFromClipboard({
      text: "https://baidu.com/q/1111",
      html: '<a href="https://baidu.com/q/1111">提交 - baidu.com - 标题</a>'
    })).toEqual({
      href: "https://baidu.com",
      text: "提交 - baidu.com - 标题"
    });
  });

  it("keeps the full page URL when its hostname is absent from the title", () => {
    expect(browserTitleLinkFromClipboard({
      text: "https://baidu.com/q/1111",
      html: '<a href="https://baidu.com/q/1111">提交完成</a>'
    })).toEqual({
      href: "https://baidu.com/q/1111",
      text: "提交完成"
    });
  });

  it("does not use a different hostname found in the title", () => {
    expect(browserTitleLinkFromClipboard({
      text: "https://baidu.com/q/1111",
      html: '<a href="https://baidu.com/q/1111">提交 - example.com - 标题</a>'
    })).toEqual({
      href: "https://baidu.com/q/1111",
      text: "提交 - example.com - 标题"
    });
  });

  it("does not reinterpret an explicit Markdown clipboard payload as a browser title link", () => {
    expect(browserTitleLinkFromClipboard({
      text: "https://baidu.com/q/1111",
      html: '<a href="https://baidu.com/q/1111">https://baidu.com/q/1111</a>',
      markdown: "[https://baidu.com/q/1111](https://baidu.com/q/1111)"
    })).toBeNull();
  });

  it("does not intercept ordinary copied linked text or mismatched targets", () => {
    expect(browserTitleLinkFromClipboard({
      text: "提交 - baidu.com - 标题",
      html: '<a href="https://baidu.com/q/1111">提交 - baidu.com - 标题</a>'
    })).toBeNull();
    expect(browserTitleLinkFromClipboard({
      text: "https://baidu.com/q/1111",
      html: '<a href="https://example.com/q/1111">提交 - baidu.com - 标题</a>'
    })).toBeNull();
  });
});
