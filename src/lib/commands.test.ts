import { describe, expect, it } from "vitest";
import { filterCommands, firstEnabledCommandIndex, lastEnabledCommandIndex, nextEnabledCommandIndex, type CommandItem } from "./commands";

const commands: CommandItem[] = [
  { id: "save", title: "Save", group: "File", shortcut: "Ctrl+S", run: () => undefined },
  { id: "copy-text", title: "Copy Text", group: "Clipboard", shortcut: "Ctrl+Shift+C", run: () => undefined },
  { id: "insert-table", title: "Insert Table", group: "Table", shortcut: "Ctrl+Alt+T", run: () => undefined }
];

describe("command filtering", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommands(commands, "")).toHaveLength(3);
  });

  it("matches title, group, and shortcut text", () => {
    expect(filterCommands(commands, "copy").map((command) => command.id)).toEqual(["copy-text"]);
    expect(filterCommands(commands, "table").map((command) => command.id)).toEqual(["insert-table"]);
    expect(filterCommands(commands, "ctrl s").map((command) => command.id)).toEqual(["save"]);
    expect(filterCommands(commands, "control s").map((command) => command.id)).toEqual(["save"]);
  });

  it("matches detail and search text for quick-open style commands", () => {
    const fileCommand: CommandItem = {
      id: "workspace-file:1",
      title: "Plan.md",
      group: "Folder",
      detail: "work/Project Plan.md",
      searchText: "project planning notes",
      run: () => undefined
    };

    expect(filterCommands([...commands, fileCommand], "work plan").map((command) => command.id)).toEqual(["workspace-file:1"]);
    expect(filterCommands([...commands, fileCommand], "planning").map((command) => command.id)).toEqual(["workspace-file:1"]);
  });

  it("fuzzy matches command names and ranks stronger title matches first", () => {
    const fuzzyCommands: CommandItem[] = [
      { id: "copy-markdown", title: "Copy Markdown", group: "Clipboard", run: () => undefined },
      { id: "copy-text", title: "Copy Text", group: "Clipboard", run: () => undefined },
      { id: "close-tab", title: "Close Tab", group: "Tabs", run: () => undefined }
    ];

    expect(filterCommands(fuzzyCommands, "ct").map((command) => command.id)).toEqual(["copy-text", "close-tab"]);
    expect(filterCommands(fuzzyCommands, "cp md").map((command) => command.id)[0]).toBe("copy-markdown");
  });

  it("keeps unavailable matches discoverable but ranks enabled commands first", () => {
    const mixedCommands: CommandItem[] = [
      { id: "copy-table", title: "Copy Table", group: "Clipboard", disabled: true, shortcut: "Ctrl+Alt+C", run: () => undefined },
      { id: "copy-text", title: "Copy Text", group: "Clipboard", shortcut: "Ctrl+Shift+C", run: () => undefined },
      { id: "copy-markdown", title: "Copy Markdown", group: "Clipboard", disabled: true, shortcut: "Ctrl+Alt+M", run: () => undefined },
      { id: "save-all", title: "Save All", group: "File", shortcut: "Ctrl+Alt+S", run: () => undefined }
    ];

    expect(filterCommands(mixedCommands, "copy").map((command) => command.id)).toEqual([
      "copy-text",
      "copy-table",
      "copy-markdown"
    ]);
    expect(filterCommands(mixedCommands, "ctrl alt").map((command) => command.id)).toEqual([
      "save-all",
      "copy-table",
      "copy-markdown"
    ]);
  });

  it("fuzzy ranks workspace quick-open files by file name and compact path matches", () => {
    const fileCommands: CommandItem[] = [
      {
        id: "workspace-file:log",
        title: "Project Log.md",
        group: "Folder",
        detail: "archive/Project Log.md",
        searchText: "archive/Project Log.md",
        hiddenWhenQueryEmpty: true,
        run: () => undefined
      },
      {
        id: "workspace-file:plan",
        title: "Project Plan.md",
        group: "Folder",
        detail: "work/Project Plan.md",
        searchText: "work/Project Plan.md",
        hiddenWhenQueryEmpty: true,
        run: () => undefined
      }
    ];

    expect(filterCommands(fileCommands, "project plan").map((command) => command.id)).toEqual(["workspace-file:plan"]);
    expect(filterCommands(fileCommands, "pjp").map((command) => command.id)[0]).toBe("workspace-file:plan");
  });

  it("hides quick-open entries until the user types a query", () => {
    const hiddenCommand: CommandItem = {
      id: "workspace-file:hidden",
      title: "Hidden.md",
      group: "Folder",
      hiddenWhenQueryEmpty: true,
      run: () => undefined
    };

    expect(filterCommands([...commands, hiddenCommand], "").map((command) => command.id)).toEqual([
      "save",
      "copy-text",
      "insert-table"
    ]);
    expect(filterCommands([...commands, hiddenCommand], "hidden").map((command) => command.id)).toEqual(["workspace-file:hidden"]);
  });

  it("limits visible results after ranking so large palettes render a bounded list", () => {
    const manyCommands: CommandItem[] = Array.from({ length: 120 }, (_item, index) => ({
      id: `file-${index}`,
      title: `File ${index}.md`,
      group: "Folder",
      searchText: "notes",
      hiddenWhenQueryEmpty: true,
      run: () => undefined
    }));

    expect(filterCommands(manyCommands, "file", 10)).toHaveLength(10);
    expect(filterCommands(manyCommands, "", 5)).toEqual([]);
    expect(filterCommands(commands, "", 2).map((command) => command.id)).toEqual(["save", "copy-text"]);
  });

  it("navigates enabled commands while skipping disabled entries", () => {
    const list: CommandItem[] = [
      { id: "disabled-a", title: "Disabled A", group: "Test", disabled: true, run: () => undefined },
      { id: "one", title: "One", group: "Test", run: () => undefined },
      { id: "disabled-b", title: "Disabled B", group: "Test", disabled: true, run: () => undefined },
      { id: "two", title: "Two", group: "Test", run: () => undefined }
    ];

    expect(firstEnabledCommandIndex(list)).toBe(1);
    expect(lastEnabledCommandIndex(list)).toBe(3);
    expect(nextEnabledCommandIndex(list, 1, 1)).toBe(3);
    expect(nextEnabledCommandIndex(list, 3, 1)).toBe(1);
    expect(nextEnabledCommandIndex(list, 1, -1)).toBe(3);
    expect(nextEnabledCommandIndex(list, -1, -1)).toBe(3);
  });
});
