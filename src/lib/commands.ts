import { fuzzyScoreFields, tokenizeQuery, type FuzzyField } from "./fuzzySearch";

export type CommandItem = {
  id: string;
  title: string;
  group: string;
  detail?: string;
  searchText?: string;
  shortcut?: string;
  disabled?: boolean;
  hiddenWhenQueryEmpty?: boolean;
  run: () => void | Promise<void>;
};

export function filterCommands(commands: CommandItem[], query: string, limit = Number.POSITIVE_INFINITY): CommandItem[] {
  const terms = tokenizeQuery(query);
  const maxResults = normalizeResultLimit(limit);

  if (maxResults === 0) return [];

  if (!terms.length) return commands.filter((command) => !command.hiddenWhenQueryEmpty).slice(0, maxResults);

  if (terms.some(isShortcutModifier)) {
    return commands
      .filter((command) => shortcutMatches(command.shortcut, terms))
      .sort(compareCommandAvailability)
      .slice(0, maxResults);
  }

  return commands
    .map((command, index) => ({
      command,
      index,
      score: fuzzyScoreFields(commandSearchFields(command), query)
    }))
    .filter((entry): entry is { command: CommandItem; index: number; score: number } => entry.score !== null)
    .sort((left, right) => compareCommandAvailability(left.command, right.command) || right.score - left.score || left.index - right.index)
    .slice(0, maxResults)
    .map((entry) => entry.command);
}

export function firstEnabledCommandIndex(commands: readonly CommandItem[]): number {
  return commands.findIndex((command) => !command.disabled);
}

export function lastEnabledCommandIndex(commands: readonly CommandItem[]): number {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    if (!commands[index].disabled) return index;
  }

  return -1;
}

export function nextEnabledCommandIndex(commands: readonly CommandItem[], currentIndex: number, direction: -1 | 1): number {
  if (!commands.length) return -1;
  if (currentIndex < 0 || currentIndex >= commands.length) {
    return direction > 0 ? firstEnabledCommandIndex(commands) : lastEnabledCommandIndex(commands);
  }

  for (let offset = 1; offset <= commands.length; offset += 1) {
    const index = (currentIndex + offset * direction + commands.length) % commands.length;
    if (!commands[index].disabled) return index;
  }

  return -1;
}

function isShortcutModifier(term: string): boolean {
  return term === "ctrl" || term === "control" || term === "cmd" || term === "meta" || term === "alt" || term === "shift";
}

function shortcutMatches(shortcut: string | undefined, terms: string[]): boolean {
  const shortcutTokens = (shortcut ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(normalizeShortcutTerm);
  return terms.map(normalizeShortcutTerm).every((term) => shortcutTokens.includes(term));
}

function commandSearchFields(command: CommandItem): FuzzyField[] {
  return [
    { text: command.title, weight: 1.6 },
    { text: command.detail ?? "", weight: 1.2 },
    { text: command.searchText ?? "", weight: 1 },
    { text: command.group, weight: 0.9 },
    { text: command.shortcut ?? "", weight: 0.7 }
  ];
}

function compareCommandAvailability(left: CommandItem, right: CommandItem): number {
  if (Boolean(left.disabled) === Boolean(right.disabled)) return 0;
  return left.disabled ? 1 : -1;
}

function normalizeShortcutTerm(term: string): string {
  if (term === "control" || term === "cmd" || term === "meta") return "ctrl";
  return term;
}

function normalizeResultLimit(limit: number): number {
  if (!Number.isFinite(limit)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.trunc(limit));
}
