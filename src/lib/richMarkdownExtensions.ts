import { Extension, mergeAttributes, Node, type AnyExtension, type JSONContent, type MarkdownToken } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import CodeBlock from "@tiptap/extension-code-block";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Table, TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList, getListMarker } from "@tiptap/extension-list";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "@tiptap/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { decodeHTMLStrict } from "entities";
import { codeHighlightClasses } from "./codeHighlight";
import { localImageSourceForRender } from "./previewAssets";
import { normalizeRichLinkHref } from "./richLinks";
import { createRichMarkdownLinkInputRule } from "./richMarkdownLinkInput";

type ProtectedMarkdownKind = "footnote" | "html";

type ProtectedMarkdownToken = MarkdownToken & {
  protectedKind?: ProtectedMarkdownKind;
  protectedLabel?: string;
  protectedRaw?: string;
};

type ProtectedMatch = {
  consumed: string;
  kind: ProtectedMarkdownKind;
  label?: string;
  raw: string;
};

type HeadingMarkdownToken = MarkdownToken & {
  depth?: number;
  tokens?: MarkdownToken[];
};

type LinkMarkdownToken = MarkdownToken & {
  href?: string;
  text?: string;
  title?: string | null;
  tokens?: MarkdownToken[];
};

type MarkdownRenderHelpers = {
  renderChildren: (nodes: JSONContent[]) => string;
  renderChild?: (node: JSONContent, index: number) => string;
  indent: (text: string) => string;
};

type ReferenceDefinitionToken = MarkdownToken & {
  href?: string;
  tag?: string;
  title?: string | null;
};

type MarkdownEntityToken = MarkdownToken & {
  entityRaw?: string;
  entityText?: string;
};

const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center",
  "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4",
  "h5", "h6", "head", "header", "hr", "html", "iframe", "legend", "li", "link", "main",
  "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param", "search",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track",
  "ul", "script", "style", "pre"
]);

const VOID_HTML_TAGS = new Set(["base", "basefont", "col", "frame", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const MAX_PRESERVED_TABLE_SOURCE_LENGTH = 256 * 1024;
const richCodeHighlightPluginKey = new PluginKey<DecorationSet>("richCodeHighlight");

const RichCodeHighlight = Extension.create({
  name: "richCodeHighlight",

  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: richCodeHighlightPluginKey,
      state: {
        init: (_config, state) => richCodeHighlightDecorations(state.doc),
        apply: (transaction, decorations, _oldState, newState) => (
          transaction.docChanged ? richCodeHighlightDecorations(newState.doc) : decorations
        )
      },
      props: {
        decorations: (state) => richCodeHighlightPluginKey.getState(state) ?? DecorationSet.empty
      }
    })];
  }
});

function richCodeHighlightDecorations(document: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  document.descendants((node, position) => {
    if (node.type.name !== "codeBlock" || !node.textContent) return;

    const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
    const contentStart = position + 1;
    for (const range of codeHighlightClasses(node.textContent, language)) {
      decorations.push(Decoration.inline(
        contentStart + range.from,
        contentStart + range.to,
        { class: range.className }
      ));
    }
  });
  return DecorationSet.create(document, decorations);
}

const RichBold = Bold.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownDelimiter: delimiterAttribute("**")
    };
  },

  parseMarkdown: (token, helpers) => helpers.applyMark(
    "bold",
    helpers.parseInline(token.tokens ?? []),
    { markdownDelimiter: strongDelimiterFromRaw(token.raw ?? "") }
  ),

  renderMarkdown: (node, helpers) => {
    const delimiter = safeStrongDelimiter(node.attrs?.markdownDelimiter);
    return `${delimiter}${helpers.renderChildren(node)}${delimiter}`;
  }
});

const RichItalic = Italic.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownDelimiter: delimiterAttribute("*")
    };
  },

  parseMarkdown: (token, helpers) => helpers.applyMark(
    "italic",
    helpers.parseInline(token.tokens ?? []),
    { markdownDelimiter: emphasisDelimiterFromRaw(token.raw ?? "") }
  ),

  renderMarkdown: (node, helpers) => {
    const delimiter = safeEmphasisDelimiter(node.attrs?.markdownDelimiter);
    return `${delimiter}${helpers.renderChildren(node)}${delimiter}`;
  }
});

const RichInlineCode = Code.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownOpen: delimiterAttribute("`"),
      markdownClose: delimiterAttribute("`")
    };
  },

  parseMarkdown: (token, helpers) => {
    const affixes = codeSpanAffixes(token.raw ?? "");
    return helpers.applyMark(
      "code",
      [{ type: "text", text: token.text ?? "" }],
      { markdownOpen: affixes.open, markdownClose: affixes.close }
    );
  },

  renderMarkdown: (node, helpers) => {
    const open = safeCodeSpanAffix(node.attrs?.markdownOpen, "`");
    const close = safeCodeSpanAffix(node.attrs?.markdownClose, "`");
    return `${open}${helpers.renderChildren(node)}${close}`;
  }
});

const RichCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownStyle: {
        default: "fenced",
        rendered: false
      },
      markdownFence: delimiterAttribute("```"),
      markdownClosingFence: delimiterAttribute("```"),
      markdownInfoSuffix: referenceAttribute(),
      markdownInfoLanguage: referenceAttribute()
    };
  },

  parseMarkdown: (token, helpers) => {
    const raw = token.raw ?? "";
    const fences = codeBlockFences(raw);
    const indented = token.codeBlockStyle === "indented" || (!fences && /^(?: {4}|\t)/.test(raw));
    if (!fences && !indented) return [];
    return helpers.createNode(
      "codeBlock",
      {
        language: token.lang || null,
        markdownStyle: indented ? "indented" : "fenced",
        markdownFence: fences?.open ?? "```",
        markdownClosingFence: fences?.close ?? fences?.open ?? "```",
        markdownInfoSuffix: fences?.infoSuffix ?? null,
        markdownInfoLanguage: fences ? token.lang || "" : null
      },
      token.text ? [helpers.createTextNode(token.text)] : []
    );
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
    const languageClass = language && this.options.languageClassPrefix
      ? `${this.options.languageClassPrefix}${language}`
      : null;

    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, language ? { "data-language": language } : {}),
      ["code", { class: languageClass }, 0]
    ];
  },

  renderMarkdown: (node, helpers) => {
    const content = node.content ? helpers.renderChildren(node.content) : "";
    const language = stringAttribute(node.attrs?.language);
    if (node.attrs?.markdownStyle === "indented" && !language) {
      return content.split("\n").map((line) => `    ${line}`).join("\n");
    }

    const fences = safeCodeBlockFences(
      node.attrs?.markdownFence,
      node.attrs?.markdownClosingFence,
      content
    );
    const infoSuffix = codeBlockInfoSuffix(node.attrs, language);
    return `${fences.open}${infoSuffix}\n${content}\n${fences.close}`;
  }
});

const RichHorizontalRule = HorizontalRule.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownMarker: delimiterAttribute("---")
    };
  },

  parseMarkdown: (token, helpers) => helpers.createNode("horizontalRule", {
    markdownMarker: horizontalRuleMarkerFromRaw(token.raw ?? "")
  }),

  renderMarkdown: (node) => safeHorizontalRuleMarker(node.attrs?.markdownMarker)
});

const RichBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownMarker: delimiterAttribute("-"),
      markdownLoose: booleanMarkdownAttribute(false)
    };
  },

  parseMarkdown: (token, helpers) => {
    if (token.type !== "list" || token.ordered) return [];
    return helpers.createNode(
      "bulletList",
      {
        markdownMarker: bulletListMarkerFromRaw(token.raw ?? ""),
        markdownLoose: markdownListIsLoose(token)
      },
      token.items ? helpers.parseChildren(token.items) : []
    );
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-markdown-loose": node.attrs.markdownLoose ? "true" : "false"
      }),
      0
    ];
  },

  renderMarkdown: (node, helpers) => {
    if (!node.content) return "";
    return helpers.renderChildren(node.content, markdownListSeparator(node.attrs));
  }
});

const RichOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownDelimiter: delimiterAttribute("."),
      markdownLoose: booleanMarkdownAttribute(false)
    };
  },

  parseMarkdown: (token, helpers) => {
    const parsed = OrderedList.config.parseMarkdown?.(token, helpers);
    if (!parsed || Array.isArray(parsed) || "mark" in parsed) return parsed ?? [];
    return {
      ...parsed,
      attrs: {
        ...parsed.attrs,
        markdownDelimiter: orderedListDelimiterFromRaw(token.raw ?? ""),
        markdownLoose: markdownListIsLoose(token)
      }
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { start, type, ...attributes } = HTMLAttributes;
    const merged = mergeAttributes(this.options.HTMLAttributes, attributes, {
      "data-markdown-loose": node.attrs.markdownLoose ? "true" : "false"
    });
    if (start !== 1) merged.start = start;
    if (type && type !== "1") merged.type = type;
    return ["ol", merged, 0];
  },

  renderMarkdown: (node, helpers) => {
    if (!node.content) return "";
    return helpers.renderChildren(node.content, markdownListSeparator(node.attrs));
  }
});

const RichListItem = ListItem.extend({
  renderMarkdown: (node, helpers, context) => {
    const prefix = ((itemContext: any) => {
      if (itemContext.parentType === "bulletList") {
        return `${safeBulletListMarker(itemContext.meta?.parentAttrs?.markdownMarker)} `;
      }
      if (itemContext.parentType === "orderedList") {
        const start = itemContext.meta?.parentAttrs?.start || 1;
        const type = itemContext.meta?.parentAttrs?.type as string | undefined;
        const index = start - 1 + (itemContext.index || 0);
        const delimiter = safeOrderedListDelimiter(itemContext.meta?.parentAttrs?.markdownDelimiter);
        return getListMarker(type, index, `${delimiter} `);
      }
      return "- ";
    })(context);
    // Tiptap retains one marker-relative space on parsed ordered-list soft breaks.
    return renderListItemMarkdown(
      node,
      helpers,
      prefix,
      context.parentType === "orderedList" ? 1 : 0
    );
  }
});

function renderListItemMarkdown(
  node: JSONContent,
  helpers: MarkdownRenderHelpers,
  prefix: string,
  parsedContinuationIndent = 0
): string {
  if (!Array.isArray(node.content)) return "";

  const [content, ...children] = node.content;
  const mainContent = content ? helpers.renderChildren([content]) : "";
  const continuationIndent = " ".repeat(prefix.length);
  const indentedMainContent = mainContent
    .split("\n")
    .map((line, index) => {
      if (index === 0) return line;
      const removableIndent = Math.min(parsedContinuationIndent, line.search(/\S|$/));
      return `${continuationIndent}${line.slice(removableIndent)}`;
    })
    .join("\n");
  let output = `${prefix}${indentedMainContent}`;

  children.forEach((child, index) => {
    const childContent = helpers.renderChild?.(child, index + 1) ?? helpers.renderChildren([child]);
    if (childContent == null) return;

    const indentedChild = childContent
      .split("\n")
      .map((line) => helpers.indent(line))
      .join("\n");
    output += child.type === "paragraph" ? `\n\n${indentedChild}` : `\n${indentedChild}`;
  });

  return output;
}

const RichTaskList = TaskList.extend({
  parseMarkdown: (token, helpers) => {
    const parsed = TaskList.config.parseMarkdown?.(token, helpers);
    if (!parsed || Array.isArray(parsed) || "mark" in parsed) return parsed ?? [];

    const styles = taskItemStylesFromRaw(token.raw ?? "");
    let styleIndex = 0;
    return {
      ...parsed,
      content: parsed.content?.map((item) => {
        if (item.type !== "taskItem") return item;
        const style = styles[styleIndex] ?? styles[0];
        styleIndex += 1;
        if (!style) return item;
        return {
          ...item,
          attrs: {
            ...item.attrs,
            markdownMarker: style.marker,
            markdownCheckedMarker: style.checkedMarker
          }
        };
      })
    };
  }
});

const RichTaskItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownMarker: persistentMarkdownAttribute("-"),
      markdownCheckedMarker: persistentMarkdownAttribute("x")
    };
  },

  renderMarkdown: (node, helpers) => {
    const marker = safeTaskListMarker(node.attrs?.markdownMarker);
    const checked = node.attrs?.checked ? safeTaskCheckedMarker(node.attrs?.markdownCheckedMarker) : " ";
    return renderListItemMarkdown(node, helpers, `${marker} [${checked}] `);
  }
});

const RichTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownRaw: referenceAttribute(),
      markdownFingerprint: referenceAttribute()
    };
  },

  parseMarkdown: (token, helpers) => {
    const parsed = Table.config.parseMarkdown?.(token, helpers);
    if (!parsed || Array.isArray(parsed) || "mark" in parsed) return parsed ?? [];

    const raw = stripTrailingLineBreaks(token.raw ?? "");
    if (!raw || raw.length > MAX_PRESERVED_TABLE_SOURCE_LENGTH) return parsed;
    return {
      ...parsed,
      attrs: {
        ...parsed.attrs,
        markdownRaw: raw,
        markdownFingerprint: tableMarkdownFingerprint(parsed)
      }
    };
  },

  renderMarkdown: (node, helpers, context) => {
    const raw = stringAttribute(node.attrs?.markdownRaw);
    const fingerprint = stringAttribute(node.attrs?.markdownFingerprint);
    if (raw && fingerprint && fingerprint === tableMarkdownFingerprint(node)) return raw;
    return Table.config.renderMarkdown?.(node, helpers, context) ?? "";
  }
});

const RichHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownStyle: {
        default: "atx",
        rendered: false
      },
      markdownMarker: {
        default: null,
        rendered: false
      },
      markdownClosingMarker: {
        default: null,
        rendered: false
      }
    };
  },

  parseMarkdown: (token, helpers) => {
    const heading = token as HeadingMarkdownToken;
    const marker = setextMarkerFromRaw(token.raw ?? "");
    return helpers.createNode(
      "heading",
      {
        level: heading.depth || 1,
        markdownStyle: marker ? "setext" : "atx",
        markdownMarker: marker,
        markdownClosingMarker: marker ? null : atxHeadingClosingMarker(token.raw ?? "")
      },
      helpers.parseInline(heading.tokens ?? [])
    );
  },

  renderMarkdown: (node, helpers) => {
    if (!node.content) return "";

    const level = markdownHeadingLevel(node.attrs?.level);
    const content = helpers.renderChildren(node.content);
    if (node.attrs?.markdownStyle === "setext" && level <= 2) {
      return `${content}\n${setextMarkerFor(level, node.attrs?.markdownMarker, content)}`;
    }

    return `${"#".repeat(level)} ${content}${safeAtxHeadingClosingMarker(node.attrs?.markdownClosingMarker)}`;
  }
});

const RichHardBreak = HardBreak.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownMarker: {
        default: "  ",
        rendered: false
      }
    };
  },

  parseMarkdown: (token) => ({
    type: "hardBreak",
    attrs: { markdownMarker: hardBreakMarkerFromRaw(token.raw ?? "") }
  }),

  renderMarkdown: (node) => `${safeHardBreakMarker(node.attrs?.markdownMarker)}\n`
});

const RichLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markdownInlineSuffix: referenceAttribute(),
      markdownInlineHref: referenceAttribute(),
      markdownInlineTitle: referenceAttribute(),
      markdownReferenceSuffix: referenceAttribute(),
      markdownReferenceHref: referenceAttribute(),
      markdownReferenceTitle: referenceAttribute()
    };
  },

  addInputRules() {
    return [
      createRichMarkdownLinkInputRule(
        this.type,
        (source) => this.editor.markdown?.parse(source) ?? null
      )
    ];
  },

  parseMarkdown: (token, helpers) => {
    const link = token as LinkMarkdownToken;
    const raw = token.raw ?? "";
    const referenceStyle = referenceLinkStyle(raw);
    if (referenceStyle === "collapsed" || referenceStyle === "shortcut") {
      return helpers.createNode("protectedReferenceLink", {
        raw,
        label: link.text ?? "",
        href: link.href ?? "",
        title: link.title ?? ""
      });
    }

    const autolink = autolinkRaw(raw);
    if (autolink) {
      return helpers.createNode(
        "markdownAutolink",
        {
          raw: autolink,
          text: link.text ?? "",
          href: link.href ?? "",
          title: link.title || null
        },
        [helpers.createTextNode(link.text ?? "")]
      );
    }

    const referenceSuffix = fullReferenceSuffix(raw);
    const inlineSuffix = referenceSuffix ? null : inlineResourceSuffix(raw);
    return helpers.applyMark("link", helpers.parseInline(link.tokens ?? []), {
      href: link.href ?? "",
      title: link.title || null,
      markdownInlineSuffix: inlineSuffix,
      markdownInlineHref: inlineSuffix ? link.href ?? "" : null,
      markdownInlineTitle: inlineSuffix ? link.title || null : null,
      markdownReferenceSuffix: referenceSuffix,
      markdownReferenceHref: referenceSuffix ? link.href ?? "" : null,
      markdownReferenceTitle: referenceSuffix ? link.title || null : null
    });
  },

  renderMarkdown: (node, helpers) => {
    const text = helpers.renderChildren(node);
    return renderRichLinkMarkdown(text, node.attrs);
  }
});

const MarkdownAutolink = Node.create({
  name: "markdownAutolink",
  priority: 1200,
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  selectable: true,

  addAttributes() {
    return {
      raw: textAttribute("raw", "data-markdown-autolink"),
      text: textAttribute("text", "data-markdown-autolink-text"),
      href: textAttribute("href", "data-markdown-autolink-href"),
      title: textAttribute("title", "data-markdown-autolink-title")
    };
  },

  parseHTML() {
    return [{ tag: "a[data-markdown-autolink]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const href = normalizeRichLinkHref(stringAttribute(node.attrs.href));
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "markdown-autolink",
        href: href ?? "",
        rel: "noopener noreferrer nofollow"
      }),
      0
    ];
  },

  renderMarkdown(node, helpers) {
    const raw = stringAttribute(node.attrs?.raw);
    const text = helpers.renderChildren(node);
    const href = stringAttribute(node.attrs?.href);
    const title = stringAttribute(node.attrs?.title);
    const contentMarks = uniformMarkdownContentMarks(node);
    if (raw
      && markdownNodePlainText(node) === stringAttribute(node.attrs?.text)
      && autolinkMatches(raw, stringAttribute(node.attrs?.text), href)
      && title === ""
      && contentMarks) {
      return renderMarkdownNodeMarks(raw, contentMarks);
    }
    return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
  }
});

const MarkdownEntity = Node.create({
  name: "markdownEntity",
  priority: 1200,
  group: "inline",
  inline: true,
  content: "text*",
  marks: "",
  selectable: true,

  addAttributes() {
    return {
      raw: textAttribute("raw", "data-markdown-entity"),
      decoded: textAttribute("decoded", "data-markdown-entity-text")
    };
  },

  parseHTML() {
    return [{ tag: "span[data-markdown-entity]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw = stringAttribute(HTMLAttributes["data-markdown-entity"]);
    return ["span", mergeAttributes(HTMLAttributes, { class: "markdown-entity", title: raw }), 0];
  },

  markdownTokenName: "markdownEntity",

  markdownTokenizer: {
    name: "markdownEntity",
    level: "inline",
    start: markdownEntityStart,
    tokenize(src) {
      const entity = markdownEntityAtStart(src);
      if (!entity) return undefined;
      return {
        type: "markdownEntity",
        raw: entity.raw,
        entityRaw: entity.raw,
        entityText: entity.decoded
      } as MarkdownEntityToken;
    }
  },

  parseMarkdown(token, helpers) {
    const entity = token as MarkdownEntityToken;
    const raw = entity.entityRaw ?? token.raw ?? "";
    const decoded = entity.entityText ?? decodeHTMLStrict(raw);
    return helpers.createNode("markdownEntity", { raw, decoded }, [helpers.createTextNode(decoded)]);
  },

  renderMarkdown(node, helpers) {
    const raw = stringAttribute(node.attrs?.raw);
    const decoded = stringAttribute(node.attrs?.decoded);
    const contentMarks = uniformMarkdownContentMarks(node);
    if (raw
      && markdownNodePlainText(node) === decoded
      && decodeHTMLStrict(raw) === decoded
      && contentMarks) {
      return renderMarkdownNodeMarks(raw, contentMarks);
    }
    return helpers.renderChildren(node);
  }
});

const ProtectedReferenceLink = Node.create({
  name: "protectedReferenceLink",
  priority: 1200,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: requiredRawAttribute("data-raw-markdown"),
      label: textAttribute("label", "data-markdown-reference-label"),
      href: textAttribute("href", "data-markdown-reference-href"),
      title: textAttribute("title", "data-markdown-reference-title")
    };
  },

  parseHTML() {
    return [{ tag: "span[data-protected-reference-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = protectedRaw(node.attrs.raw);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "protected-reference-link",
        contenteditable: "false",
        "data-protected-reference-link": "true",
        title: raw
      }),
      stringAttribute(node.attrs.label)
    ];
  },

  renderMarkdown(node) {
    return protectedRaw(node.attrs?.raw);
  }
});

const ReferenceDefinition = Node.create({
  name: "markdownReferenceDefinition",
  priority: 1200,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: requiredRawAttribute("data-raw-markdown"),
      label: textAttribute("label", "data-markdown-reference-label"),
      href: textAttribute("href", "data-markdown-reference-href"),
      title: textAttribute("title", "data-markdown-reference-title")
    };
  },

  parseHTML() {
    return [{ tag: "div[data-markdown-reference-definition]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = stringAttribute(node.attrs.label);
    const href = stringAttribute(node.attrs.href);
    const title = stringAttribute(node.attrs.title);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "protected-markdown-block reference",
        contenteditable: "false",
        "data-markdown-reference-definition": label,
        title: protectedRaw(node.attrs.raw)
      }),
      ["span", { class: "protected-markdown-badge" }, `[${label}]`],
      ["code", {}, title ? `${href} \"${title}\"` : href]
    ];
  },

  markdownTokenName: "def",

  parseMarkdown(token, helpers) {
    const definition = token as ReferenceDefinitionToken;
    return helpers.createNode("markdownReferenceDefinition", {
      raw: stripTrailingLineBreaks(token.raw ?? ""),
      label: definition.tag ?? "",
      href: definition.href ?? "",
      title: definition.title ?? ""
    });
  },

  renderMarkdown(node) {
    return protectedRaw(node.attrs?.raw);
  }
});

const ProtectedMarkdownBlock = Node.create({
  name: "protectedMarkdownBlock",
  priority: 1200,
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return protectedMarkdownAttributes();
  },

  parseHTML() {
    return [{ tag: "div[data-protected-markdown-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = protectedRaw(node.attrs.raw);
    const kind = protectedKind(node.attrs.kind);
    const label = kind === "footnote" ? `[^${protectedLabel(node.attrs.label)}]` : "HTML";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `protected-markdown-block ${kind}`,
        contenteditable: "false",
        "data-protected-markdown-block": kind,
        title: raw
      }),
      ["span", { class: "protected-markdown-badge" }, label],
      ["code", {}, protectedPreview(raw)]
    ];
  },

  markdownTokenName: "protectedMarkdownBlock",

  markdownTokenizer: {
    name: "protectedMarkdownBlock",
    level: "block",
    start: protectedBlockStart,
    tokenize(src) {
      const match = protectedMarkdownBlockAtStart(src);
      if (!match) return undefined;
      return protectedToken("protectedMarkdownBlock", match);
    }
  },

  parseMarkdown(token, helpers) {
    const protectedToken = token as ProtectedMarkdownToken;
    return helpers.createNode("protectedMarkdownBlock", {
      raw: protectedToken.protectedRaw ?? token.raw ?? "",
      kind: protectedToken.protectedKind ?? "html",
      label: protectedToken.protectedLabel ?? ""
    });
  },

  renderMarkdown(node) {
    return protectedRaw(node.attrs?.raw);
  }
});

const ProtectedMarkdownInline = Node.create({
  name: "protectedMarkdownInline",
  priority: 1200,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return protectedMarkdownAttributes();
  },

  parseHTML() {
    return [{ tag: "span[data-protected-markdown-inline]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = protectedRaw(node.attrs.raw);
    const kind = protectedKind(node.attrs.kind);
    const label = protectedLabel(node.attrs.label);
    const display = kind === "footnote" ? `[^${label}]` : raw;
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `protected-markdown-inline ${kind}`,
        contenteditable: "false",
        "data-protected-markdown-inline": kind,
        title: raw
      }),
      display
    ];
  },

  markdownTokenName: "protectedMarkdownInline",

  markdownTokenizer: {
    name: "protectedMarkdownInline",
    level: "inline",
    start: protectedInlineStart,
    tokenize(src) {
      const match = protectedMarkdownInlineAtStart(src);
      if (!match) return undefined;
      return protectedToken("protectedMarkdownInline", match);
    }
  },

  parseMarkdown(token, helpers) {
    const protectedToken = token as ProtectedMarkdownToken;
    return helpers.createNode("protectedMarkdownInline", {
      raw: protectedToken.protectedRaw ?? token.raw ?? "",
      kind: protectedToken.protectedKind ?? "html",
      label: protectedToken.protectedLabel ?? ""
    });
  },

  renderMarkdown(node) {
    return protectedRaw(node.attrs?.raw);
  }
});

export function createRichMarkdownExtensions(documentFilePath: string | null): AnyExtension[] {
  return [
    ReferenceDefinition,
    ProtectedMarkdownBlock,
    ProtectedMarkdownInline,
    ProtectedReferenceLink,
    MarkdownAutolink,
    MarkdownEntity,
    StarterKit.configure({
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      listItem: false,
      link: false,
      orderedList: false
    }),
    RichBold,
    RichItalic,
    RichInlineCode,
    RichHeading,
    RichHardBreak,
    RichHorizontalRule,
    RichLink.configure({
      openOnClick: false,
      isAllowedUri: (href) => normalizeRichLinkHref(href ?? "") !== null
    }),
    RichCodeBlock,
    RichCodeHighlight,
    RichBulletList,
    RichOrderedList,
    RichListItem,
    RichTaskList,
    RichTaskItem.configure({ nested: true }),
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          markdownInlineRaw: referenceAttribute(),
          markdownInlineText: referenceAttribute(),
          markdownInlineHref: referenceAttribute(),
          markdownInlineTitle: referenceAttribute(),
          markdownReferenceRaw: referenceAttribute(),
          markdownReferenceText: referenceAttribute(),
          markdownReferenceHref: referenceAttribute(),
          markdownReferenceTitle: referenceAttribute()
        };
      },

      parseMarkdown: (token, helpers) => {
        const image = token as LinkMarkdownToken;
        const raw = token.raw ?? "";
        const reference = isReferenceResourceRaw(raw);
        const inline = !reference && inlineResourceSuffix(raw) !== null;
        return helpers.createNode("image", {
          src: image.href ?? "",
          title: image.title || null,
          alt: image.text ?? "",
          markdownInlineRaw: inline ? raw : null,
          markdownInlineText: inline ? image.text ?? "" : null,
          markdownInlineHref: inline ? image.href ?? "" : null,
          markdownInlineTitle: inline ? image.title || null : null,
          markdownReferenceRaw: reference ? raw : null,
          markdownReferenceText: reference ? image.text ?? "" : null,
          markdownReferenceHref: reference ? image.href ?? "" : null,
          markdownReferenceTitle: reference ? image.title || null : null
        });
      },

      renderMarkdown: (node) => {
        const src = stringAttribute(node.attrs?.src);
        const alt = stringAttribute(node.attrs?.alt);
        const title = stringAttribute(node.attrs?.title);
        if (unchangedInlineResource(node.attrs, alt, src, title)) {
          return stringAttribute(node.attrs?.markdownInlineRaw);
        }
        if (unchangedReferenceResource(node.attrs, alt, src, title)) {
          return stringAttribute(node.attrs?.markdownReferenceRaw);
        }
        return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
      },

      renderHTML({ HTMLAttributes }) {
        const source = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
        const renderedSource = localImageSourceForRender(source, documentFilePath);
        return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: renderedSource })];
      }
    }).configure({ allowBase64: false, inline: true }),
    TableKit.configure({ table: false }),
    RichTable.configure({
      resizable: true,
      allowTableNodeSelection: true
    }),
    Markdown
  ];
}

export function protectedMarkdownBlockAtStart(src: string): ProtectedMatch | null {
  return footnoteDefinitionAtStart(src) ?? htmlBlockAtStart(src);
}

export function protectedMarkdownInlineAtStart(src: string): ProtectedMatch | null {
  const footnote = src.match(/^\[\^([^\]\r\n]+)\]/);
  if (footnote) {
    return { consumed: footnote[0], kind: "footnote", label: footnote[1], raw: footnote[0] };
  }

  const html = src.match(/^(?:<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>\r\n]*)?\s*\/?>|<![A-Z][^>\r\n]*>|<\?[\s\S]*?\?>)/);
  return html ? { consumed: html[0], kind: "html", raw: html[0] } : null;
}

function footnoteDefinitionAtStart(src: string): ProtectedMatch | null {
  const firstLine = src.match(/^ {0,3}\[\^([^\]\r\n]+)\]:[^\r\n]*(?:\r?\n|$)/);
  if (!firstLine) return null;

  let end = firstLine[0].length;
  while (end < src.length) {
    const remaining = src.slice(end);
    const nextLine = remaining.match(/^([^\r\n]*)(?:\r?\n|$)/);
    if (!nextLine) break;

    const line = nextLine[1];
    if (/^(?: {2,}|\t)\S/.test(line)) {
      end += nextLine[0].length;
      continue;
    }

    if (!line.trim()) {
      const following = remaining.slice(nextLine[0].length).match(/^([^\r\n]*)(?:\r?\n|$)/)?.[1] ?? "";
      if (/^(?: {2,}|\t)\S/.test(following)) {
        end += nextLine[0].length;
        continue;
      }
    }

    break;
  }

  const consumed = src.slice(0, end);
  return {
    consumed,
    kind: "footnote",
    label: firstLine[1],
    raw: stripSingleTrailingLineBreak(consumed)
  };
}

function htmlBlockAtStart(src: string): ProtectedMatch | null {
  const comment = src.match(/^ {0,3}<!--[\s\S]*?-->(?:[ \t]*\r?\n)?/);
  if (comment) return htmlBlockMatch(comment[0]);

  const declaration = src.match(/^ {0,3}(?:<![A-Z][^>\r\n]*>|<\?[\s\S]*?\?>)(?:[ \t]*\r?\n)?/);
  if (declaration) return htmlBlockMatch(declaration[0]);

  const opening = src.match(/^ {0,3}<([A-Za-z][A-Za-z0-9-]*)(?:\s[^>\r\n]*)?\s*\/?>/);
  if (!opening) return null;

  const tag = opening[1].toLowerCase();
  if (!BLOCK_HTML_TAGS.has(tag)) return null;

  if (VOID_HTML_TAGS.has(tag) || /\/\s*>$/.test(opening[0])) {
    const line = src.match(/^[^\r\n]*(?:\r?\n)?/)?.[0] ?? opening[0];
    return htmlBlockMatch(line);
  }

  const closing = new RegExp(`</${escapeRegExp(tag)}\\s*>`, "i").exec(src.slice(opening[0].length));
  if (closing) {
    const closingEnd = opening[0].length + closing.index + closing[0].length;
    const lineBreak = src.slice(closingEnd).match(/^[ \t]*(?:\r?\n)?/)?.[0] ?? "";
    return htmlBlockMatch(src.slice(0, closingEnd + lineBreak.length));
  }

  const untilBlank = src.search(/\r?\n[ \t]*\r?\n/);
  const consumed = untilBlank >= 0 ? src.slice(0, untilBlank) : (src.match(/^[^\r\n]*(?:\r?\n)?/)?.[0] ?? opening[0]);
  return htmlBlockMatch(consumed);
}

function protectedBlockStart(src: string): number {
  const indexes = [
    src.search(/^ {0,3}\[\^[^\]\r\n]+\]:/m),
    src.search(/^ {0,3}(?:<!--|<![A-Z]|<\?|<[A-Za-z][A-Za-z0-9-]*(?:\s|\/?>))/m)
  ].filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function protectedInlineStart(src: string): number {
  const indexes = [src.search(/\[\^[^\]\r\n]+\]/), src.search(/(?:<!--|<\/?[A-Za-z]|<![A-Z]|<\?)/)].filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function protectedToken(type: string, match: ProtectedMatch): ProtectedMarkdownToken {
  return {
    type,
    raw: match.consumed,
    protectedKind: match.kind,
    protectedLabel: match.label,
    protectedRaw: match.raw
  } as ProtectedMarkdownToken;
}

function protectedMarkdownAttributes() {
  return {
    raw: requiredRawAttribute("data-raw-markdown"),
    kind: {
      default: "html",
      parseHTML: (element: HTMLElement) => protectedKind(element.getAttribute("data-protected-markdown-block") ?? element.getAttribute("data-protected-markdown-inline")),
      renderHTML: () => ({})
    },
    label: {
      default: "",
      parseHTML: (element: HTMLElement) => element.getAttribute("data-protected-markdown-label") ?? "",
      renderHTML: (attributes: Record<string, unknown>) => ({ "data-protected-markdown-label": protectedLabel(attributes.label) })
    }
  };
}

function requiredRawAttribute(htmlAttribute: string) {
  return {
    default: undefined,
    isRequired: true,
    parseHTML: (element: HTMLElement) => element.getAttribute(htmlAttribute) ?? "",
    renderHTML: (attributes: Record<string, unknown>) => ({ [htmlAttribute]: protectedRaw(attributes.raw) })
  };
}

function textAttribute(attributeName: string, htmlAttribute: string) {
  return {
    default: "",
    parseHTML: (element: HTMLElement) => element.getAttribute(htmlAttribute) ?? "",
    renderHTML: (attributes: Record<string, unknown>) => ({ [htmlAttribute]: stringAttribute(attributes[attributeName]) })
  };
}

function referenceAttribute() {
  return { default: null, rendered: false };
}

function delimiterAttribute(defaultValue: string) {
  return { default: defaultValue, rendered: false };
}

function booleanMarkdownAttribute(defaultValue: boolean) {
  return { default: defaultValue, rendered: false };
}

function persistentMarkdownAttribute(defaultValue: string) {
  return { default: defaultValue, rendered: false, keepOnSplit: true };
}

function htmlBlockMatch(consumed: string): ProtectedMatch {
  return { consumed, kind: "html", raw: stripSingleTrailingLineBreak(consumed) };
}

function stripSingleTrailingLineBreak(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function stripTrailingLineBreaks(value: string): string {
  return value.replace(/(?:\r?\n)+$/, "");
}

function protectedKind(value: unknown): ProtectedMarkdownKind {
  return value === "footnote" ? "footnote" : "html";
}

function protectedLabel(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function protectedRaw(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function protectedPreview(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function strongDelimiterFromRaw(raw: string): string {
  return raw.startsWith("__") ? "__" : "**";
}

function safeStrongDelimiter(value: unknown): string {
  return value === "__" ? "__" : "**";
}

function emphasisDelimiterFromRaw(raw: string): string {
  return raw.startsWith("_") ? "_" : "*";
}

function safeEmphasisDelimiter(value: unknown): string {
  return value === "_" ? "_" : "*";
}

function codeSpanAffixes(raw: string): { open: string; close: string } {
  const match = raw.match(/^(`+)([\s\S]*?)\1$/);
  if (!match) return { open: "`", close: "`" };

  const delimiter = match[1];
  const inner = match[2].replace(/\r?\n/g, " ");
  const padded = inner.startsWith(" ") && inner.endsWith(" ") && /\S/.test(inner);
  return {
    open: `${delimiter}${padded ? " " : ""}`,
    close: `${padded ? " " : ""}${delimiter}`
  };
}

function safeCodeSpanAffix(value: unknown, fallback: string): string {
  const affix = stringAttribute(value);
  return /^`+ ?$/.test(affix) || /^ ?`+$/.test(affix) ? affix : fallback;
}

function codeBlockFences(raw: string): { open: string; close: string; infoSuffix: string } | null {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const opening = lines[0]?.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!opening) return null;

  const open = opening[1];
  const character = open[0];
  let close = open;
  const closingPattern = new RegExp(`^ {0,3}(${escapeRegExp(character)}{3,})[ \\t]*$`);
  for (let index = lines.length - 1; index > 0; index -= 1) {
    const closing = lines[index].match(closingPattern);
    if (closing) {
      close = closing[1];
      break;
    }
  }
  return { open, close, infoSuffix: opening[2] ?? "" };
}

function codeBlockInfoSuffix(attributes: Record<string, unknown> | undefined, language: string): string {
  const suffix = attributes?.markdownInfoSuffix;
  const originalLanguage = stringAttribute(attributes?.markdownInfoLanguage);
  if (typeof suffix === "string"
    && !/[\r\n]/.test(suffix)
    && suffix.trim() === originalLanguage
    && language === originalLanguage) {
    return suffix;
  }
  return language;
}

function safeCodeBlockFences(
  openingValue: unknown,
  closingValue: unknown,
  content: string
): { open: string; close: string } {
  const requestedOpen = stringAttribute(openingValue);
  const open = /^(?:`{3,}|~{3,})$/.test(requestedOpen) ? requestedOpen : "```";
  const character = open[0];
  const requestedClose = stringAttribute(closingValue);
  const closeLength = new RegExp(`^${escapeRegExp(character)}{3,}$`).test(requestedClose)
    ? requestedClose.length
    : 3;
  const contentRun = content.split("\n").reduce((longest, line) => {
    const run = line.match(new RegExp(`^ {0,3}(${escapeRegExp(character)}+)`))?.[1].length ?? 0;
    return Math.max(longest, run);
  }, 0);
  const openLength = Math.max(3, open.length, contentRun + 1);
  return {
    open: character.repeat(openLength),
    close: character.repeat(Math.max(openLength, closeLength))
  };
}

function horizontalRuleMarkerFromRaw(raw: string): string {
  const marker = raw.trim();
  return isHorizontalRuleMarker(marker) ? marker : "---";
}

function safeHorizontalRuleMarker(value: unknown): string {
  const marker = stringAttribute(value);
  return isHorizontalRuleMarker(marker) ? marker : "---";
}

function isHorizontalRuleMarker(value: string): boolean {
  return /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(value);
}

function bulletListMarkerFromRaw(raw: string): string {
  return raw.match(/^ {0,3}([-+*])[ \t]+/)?.[1] ?? "-";
}

function safeBulletListMarker(value: unknown): string {
  const marker = stringAttribute(value);
  return marker === "*" || marker === "+" ? marker : "-";
}

function orderedListDelimiterFromRaw(raw: string): string {
  return raw.match(/^[ \t]*(?:\d+|[A-Za-z]+)([.)])[ \t]+/)?.[1] === ")" ? ")" : ".";
}

function safeOrderedListDelimiter(value: unknown): string {
  return value === ")" ? ")" : ".";
}

function markdownListIsLoose(token: MarkdownToken): boolean {
  const loose = (token as MarkdownToken & { loose?: boolean }).loose;
  if (typeof loose === "boolean") return loose;
  return /\r?\n[ \t]*\r?\n/.test(stripTrailingLineBreaks(token.raw ?? ""));
}

function markdownListSeparator(attributes: Record<string, unknown> | undefined): string {
  return attributes?.markdownLoose === true ? "\n\n" : "\n";
}

function taskItemStylesFromRaw(raw: string): Array<{ marker: string; checkedMarker: string }> {
  const matches = raw.replace(/\r\n?/g, "\n").split("\n").flatMap((line) => {
    const match = line.match(/^(\s*)([-+*])\s+\[([ xX])\]\s+/);
    return match ? [{ indent: match[1].length, marker: match[2], check: match[3] }] : [];
  });
  if (matches.length === 0) return [];

  const topLevel = matches.filter((match) => match.indent === matches[0].indent);
  const preferredCheckedMarker = topLevel.find((match) => match.check === "x" || match.check === "X")?.check ?? "x";
  return topLevel.map((match) => ({
    marker: safeTaskListMarker(match.marker),
    checkedMarker: match.check === "x" || match.check === "X" ? match.check : preferredCheckedMarker
  }));
}

function safeTaskListMarker(value: unknown): string {
  return value === "*" || value === "+" ? value : "-";
}

function safeTaskCheckedMarker(value: unknown): string {
  return value === "X" ? "X" : "x";
}

function tableMarkdownFingerprint(table: Record<string, unknown>): string {
  const semantic = tableFingerprintValue(table);
  const serialized = JSON.stringify(semantic);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `${serialized.length}:${(first >>> 0).toString(16).padStart(8, "0")}:${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function tableFingerprintValue(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => tableFingerprintValue(item));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))) {
    if (childKey.startsWith("markdown") || childKey === "colwidth" || childKey === "width" || childKey === "height") continue;
    const normalized = tableFingerprintValue(childValue, childKey);
    if (normalized !== undefined) output[childKey] = normalized;
  }
  return key === "attrs" && Object.keys(output).length === 0 ? undefined : output;
}

function setextMarkerFromRaw(raw: string): string | null {
  return raw.match(/\r?\n {0,3}([=-]+)[ \t]*(?:\r?\n|$)/)?.[1] ?? null;
}

function atxHeadingClosingMarker(raw: string): string | null {
  const line = raw.replace(/(?:\r?\n)+$/, "");
  return line.match(/[ \t]+#+[ \t]*$/)?.[0] ?? null;
}

function safeAtxHeadingClosingMarker(value: unknown): string {
  const marker = stringAttribute(value);
  return /^[ \t]+#+[ \t]*$/.test(marker) ? marker : "";
}

function markdownHeadingLevel(value: unknown): number {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
}

function setextMarkerFor(level: number, value: unknown, content: string): string {
  const character = level === 1 ? "=" : "-";
  const marker = stringAttribute(value);
  if (marker.length > 0 && [...marker].every((candidate) => candidate === character)) return marker;
  return character.repeat(Math.max(3, Math.min(80, content.length)));
}

function hardBreakMarkerFromRaw(raw: string): string {
  return raw.match(/^(\\| {2,})/)?.[1] ?? "  ";
}

function safeHardBreakMarker(value: unknown): string {
  const marker = stringAttribute(value);
  return marker === "\\" || /^ {2,}$/.test(marker) ? marker : "  ";
}

function isReferenceResourceRaw(raw: string): boolean {
  return /^!?\[[\s\S]*\](?:\[[\s\S]*\])?$/.test(raw) && !/\]\s*\(/.test(raw);
}

function referenceLinkStyle(raw: string): "full" | "collapsed" | "shortcut" | null {
  if (!isReferenceResourceRaw(raw) || raw.startsWith("![")) return null;
  const suffix = raw.match(/\]\[([^\]]*)\]$/);
  if (!suffix) return "shortcut";
  return suffix[1] ? "full" : "collapsed";
}

function fullReferenceSuffix(raw: string): string | null {
  if (referenceLinkStyle(raw) !== "full") return null;
  return raw.match(/(\[[^\]]+\])$/)?.[1] ?? null;
}

function autolinkRaw(raw: string): string | null {
  return /^<[^<>\s]+>$/.test(raw) ? raw : null;
}

function autolinkMatches(raw: string, text: string, href: string): boolean {
  if (!autolinkRaw(raw)) return false;
  const destination = raw.slice(1, -1);
  return text === destination && (href === destination || href === `mailto:${destination}`);
}

function inlineResourceSuffix(raw: string): string | null {
  const labelStart = raw.startsWith("![") ? 2 : raw.startsWith("[") ? 1 : -1;
  if (labelStart < 0) return null;

  let nestedBrackets = 0;
  for (let index = labelStart; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "`") {
      const run = raw.slice(index).match(/^`+/)?.[0] ?? "`";
      const closingIndex = raw.indexOf(run, index + run.length);
      if (closingIndex >= 0) {
        index = closingIndex + run.length - 1;
        continue;
      }
    }
    if (character === "[") {
      nestedBrackets += 1;
      continue;
    }
    if (character !== "]") continue;
    if (nestedBrackets > 0) {
      nestedBrackets -= 1;
      continue;
    }

    const suffix = raw.slice(index + 1);
    if (suffix.startsWith("(") && suffix.endsWith(")")) return suffix;
    if (!suffix || suffix.startsWith("[")) return null;
  }
  return null;
}

function unchangedInlineResource(
  attributes: Record<string, unknown> | undefined,
  text: string,
  href: string,
  title: string
): boolean {
  const raw = stringAttribute(attributes?.markdownInlineRaw);
  if (!raw) return false;
  return text === stringAttribute(attributes?.markdownInlineText)
    && href === stringAttribute(attributes?.markdownInlineHref)
    && title === stringAttribute(attributes?.markdownInlineTitle);
}

function unchangedReferenceResource(
  attributes: Record<string, unknown> | undefined,
  text: string,
  href: string,
  title: string
): boolean {
  const raw = stringAttribute(attributes?.markdownReferenceRaw);
  if (!raw) return false;
  return text === stringAttribute(attributes?.markdownReferenceText)
    && href === stringAttribute(attributes?.markdownReferenceHref)
    && title === stringAttribute(attributes?.markdownReferenceTitle);
}

function markdownEntityStart(src: string): number {
  const pattern = /&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/g;
  for (const match of src.matchAll(pattern)) {
    if (decodeHTMLStrict(match[0]) !== match[0]) return match.index;
  }
  return -1;
}

function markdownEntityAtStart(src: string): { raw: string; decoded: string } | null {
  const raw = src.match(/^&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/)?.[0];
  if (!raw) return null;
  const decoded = decodeHTMLStrict(raw);
  return decoded === raw ? null : { raw, decoded };
}

function markdownNodePlainText(node: Record<string, any>): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map((child: Record<string, any>) => markdownNodePlainText(child)).join("");
}

function uniformMarkdownContentMarks(node: Record<string, any>): unknown[] | null {
  const markSets: unknown[][] = [];
  const collect = (current: Record<string, any>) => {
    if (typeof current.text === "string") {
      markSets.push(Array.isArray(current.marks) ? current.marks : []);
      return;
    }
    if (Array.isArray(current.content)) current.content.forEach((child: Record<string, any>) => collect(child));
  };
  collect(node);
  if (markSets.length === 0) return [];
  const signature = JSON.stringify(markSets[0]);
  return markSets.every((marks) => JSON.stringify(marks) === signature) ? markSets[0] : null;
}

function renderMarkdownNodeMarks(content: string, marks: unknown): string {
  if (!Array.isArray(marks) || marks.length === 0) return content;
  return [...marks].reverse().reduce((output, mark) => {
    if (!mark || typeof mark !== "object") return output;
    const typedMark = mark as { type?: string; attrs?: Record<string, unknown> };
    switch (typedMark.type) {
      case "bold": {
        const delimiter = safeStrongDelimiter(typedMark.attrs?.markdownDelimiter);
        return `${delimiter}${output}${delimiter}`;
      }
      case "italic": {
        const delimiter = safeEmphasisDelimiter(typedMark.attrs?.markdownDelimiter);
        return `${delimiter}${output}${delimiter}`;
      }
      case "strike":
        return `~~${output}~~`;
      case "code": {
        const open = safeCodeSpanAffix(typedMark.attrs?.markdownOpen, "`");
        const close = safeCodeSpanAffix(typedMark.attrs?.markdownClose, "`");
        return `${open}${output}${close}`;
      }
      case "link":
        return renderRichLinkMarkdown(output, typedMark.attrs);
      default:
        return output;
    }
  }, content);
}

function renderRichLinkMarkdown(text: string, attributes: Record<string, unknown> | undefined): string {
  const href = stringAttribute(attributes?.href);
  const title = stringAttribute(attributes?.title);
  const referenceSuffix = stringAttribute(attributes?.markdownReferenceSuffix);
  if (referenceSuffix
    && href === stringAttribute(attributes?.markdownReferenceHref)
    && title === stringAttribute(attributes?.markdownReferenceTitle)) {
    return `[${text}]${referenceSuffix}`;
  }
  const inlineSuffix = stringAttribute(attributes?.markdownInlineSuffix);
  if (inlineSuffix
    && href === stringAttribute(attributes?.markdownInlineHref)
    && title === stringAttribute(attributes?.markdownInlineTitle)) {
    return `[${text}]${inlineSuffix}`;
  }
  return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
}

function stringAttribute(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
