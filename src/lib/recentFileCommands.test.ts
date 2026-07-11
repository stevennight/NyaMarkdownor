import { describe, expect, it } from "vitest";
import { filterCommands } from "./commands";
import { recentFileCommands } from "./recentFileCommands";

describe("recent file commands", () => {
  it("creates hidden quick-open commands for recent local files", () => {
    const commands = recentFileCommands([
      { name: "Project Plan.md", path: "D:/notes/work/Project Plan.md", updatedAt: 1 }
    ], () => undefined);

    expect(commands).toMatchObject([
      {
        id: "recent-file:D:/notes/work/Project Plan.md",
        title: "Project Plan.md",
        group: "Recent",
        detail: "D:/notes/work/Project Plan.md",
        hiddenWhenQueryEmpty: true
      }
    ]);
    expect(filterCommands(commands, "")).toEqual([]);
    expect(filterCommands(commands, "project plan").map((command) => command.id)).toEqual([
      "recent-file:D:/notes/work/Project Plan.md"
    ]);
    expect(filterCommands(commands, "notes work").map((command) => command.id)).toEqual([
      "recent-file:D:/notes/work/Project Plan.md"
    ]);
  });

  it("opens the selected recent file path", () => {
    const opened: string[] = [];
    const [command] = recentFileCommands([
      { name: "Daily.md", path: "D:/notes/Daily.md", updatedAt: 1 }
    ], (path) => {
      opened.push(path);
    });

    command.run();

    expect(opened).toEqual(["D:/notes/Daily.md"]);
  });
});
