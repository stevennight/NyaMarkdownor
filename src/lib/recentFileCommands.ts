import type { RecentFile } from "../types";
import type { CommandItem } from "./commands";

export function recentFileCommands(
  files: readonly RecentFile[],
  openFile: (path: string) => void | Promise<void>
): CommandItem[] {
  return files.map((file) => ({
    id: `recent-file:${file.path}`,
    title: file.name,
    group: "Recent",
    detail: file.path,
    searchText: `${file.name} ${file.path}`,
    hiddenWhenQueryEmpty: true,
    run: () => openFile(file.path)
  }));
}
