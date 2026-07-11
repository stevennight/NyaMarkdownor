import { describe, expect, it } from "vitest";
import { tableCellBoundaryRange, tableCellContentRange, unescapedPipeIndexes } from "./tableSourceRanges";

describe("table source ranges", () => {
  it("finds cells in pipe-light rows without leading or trailing delimiters", () => {
    const line = "Alpha | ends with pipe\\|";

    expect(tableCellContentRange(line, 0, 0)).toEqual({ from: 0, to: 5 });
    expect(tableCellContentRange(line, 0, 1)).toEqual({ from: 8, to: line.length });
  });

  it("keeps escaped trailing pipes as cell content", () => {
    const line = "| Alpha | ends with pipe\\|";

    expect(tableCellBoundaryRange(line, 0, 1)).toEqual({ from: 9, to: line.length });
    expect(line.slice(tableCellContentRange(line, 0, 1)!.from, tableCellContentRange(line, 0, 1)!.to)).toBe("ends with pipe\\|");
  });

  it("treats pipes after even numbers of backslashes as delimiters", () => {
    expect(unescapedPipeIndexes("Path\\\\| Value")).toEqual([6]);
    expect(unescapedPipeIndexes("Path\\| Value")).toEqual([]);
  });
});
