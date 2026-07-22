import { describe, expect, it } from "vitest";
import {
  malformedMarkdownTableProjectionAtStart,
  projectMalformedMarkdownTables
} from "./markdownTableProjection";

describe("malformed API table projections", () => {
  it("recovers fixed deeply-indented continuation rows and description pipes", () => {
    const source = [
      "| 参数名称 | 参数说明 | 请求类型 | 是否必须 | 数据类型 | schema |",
      "| --- | --- | --- | --- | --- | --- |",
      "| first | ordinary | body | false | string | |",
      "            | haveInterview | 是否安排面试（true | false） | body | false | boolean | |",
      "            | second | continued | body | false | string | |",
      "",
      "After"
    ].join("\n");

    expect(projectMalformedMarkdownTables(source)).toBe([
      "| 参数名称 | 参数说明 | 请求类型 | 是否必须 | 数据类型 | schema |",
      "| --- | --- | --- | --- | --- | --- |",
      "| first | ordinary | body | false | string | |",
      "| haveInterview | 是否安排面试（true \\| false） | body | false | boolean | |",
      "| second | continued | body | false | string | |",
      "",
      "After"
    ].join("\n"));
  });

  it("leaves intentional four-space pipe code after a table untouched", () => {
    const source = [
      "| Name | Description |",
      "| --- | --- |",
      "| first | row |",
      "    | code | example |"
    ].join("\n");

    expect(projectMalformedMarkdownTables(source)).toBe(source);
  });

  it("leaves fenced table-shaped code untouched", () => {
    const source = [
      "```md",
      "| Name | Description |",
      "| --- | --- |",
      "| first | row | other |",
      "```"
    ].join("\n");

    expect(projectMalformedMarkdownTables(source)).toBe(source);
  });

  it("requires one unambiguous description-like column", () => {
    const noDescription = [
      "| A | B |",
      "| --- | --- |",
      "| left | middle | right |"
    ].join("\n");
    const ambiguous = [
      "| Description | Note | Type |",
      "| --- | --- | --- |",
      "| left | middle | extra | type |"
    ].join("\n");

    expect(projectMalformedMarkdownTables(noDescription)).toBe(noDescription);
    expect(projectMalformedMarkdownTables(ambiguous)).toBe(ambiguous);
  });

  it("repairs a bare description pipe without needing an indented continuation", () => {
    const source = [
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| enabled | true | false | boolean |"
    ].join("\n");

    expect(projectMalformedMarkdownTables(source)).toBe([
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| enabled | true \\| false | boolean |"
    ].join("\n"));
  });

  it("leaves nested tables outside the API-export recovery scope", () => {
    const source = [
      "- Item",
      "",
      "  | Name | Description |",
      "  | --- | --- |",
      "  | first | value | extra |"
    ].join("\n");

    expect(projectMalformedMarkdownTables(source)).toBe(source);
  });

  it("requires all recovered rows to use one prefix of at least eight spaces", () => {
    const source = [
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| first | row | string |",
      "        | second | recoverable | string |",
      "            | third | different prefix | string |"
    ].join("\n");
    const projection = malformedMarkdownTableProjectionAtStart(source);

    expect(projection?.markdown).toContain("| second | recoverable | string |");
    expect(projection?.raw).not.toContain("third");
  });

  it("finds malformed tables after prose and keeps multiple table blocks separate", () => {
    const source = [
      "Intro prose",
      "",
      "```text",
      "| Not | a table |",
      "| --- | --- |",
      "```",
      "",
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| first | row | string |",
      "        | second | recovered | string |",
      "",
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| third | row | string |",
      "        | fourth | recovered | string |"
    ].join("\n");
    const projected = projectMalformedMarkdownTables(source);

    expect(projected).toContain("```text\n| Not | a table |\n| --- | --- |\n```");
    expect(projected.match(/\| second \| recovered \| string \|/g)).toHaveLength(1);
    expect(projected.match(/\| fourth \| recovered \| string \|/g)).toHaveLength(1);
    expect(projected).not.toContain("        | second");
    expect(projected).not.toContain("        | fourth");
  });

  it("preserves CRLF while projecting malformed rows", () => {
    const source = [
      "Intro",
      "",
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| first | row | string |",
      "        | second | true | false | string |"
    ].join("\r\n");
    const projected = projectMalformedMarkdownTables(source);

    expect(projected).toContain("| second | true \\| false | string |");
    expect(projected.replace(/\r\n/g, "")).not.toContain("\n");
    expect(projected.match(/\r\n/g)).toHaveLength(5);
  });
});
