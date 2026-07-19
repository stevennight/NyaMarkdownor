import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { filterCommands, firstEnabledCommandIndex, lastEnabledCommandIndex, nextEnabledCommandIndex, type CommandItem } from "../lib/commands";
import { translateUiText } from "../lib/i18n";
import type { AppLocale } from "../types";

const MAX_VISIBLE_COMMANDS = 80;

type CommandPaletteProps = {
  open: boolean;
  commands: CommandItem[];
  locale: AppLocale;
  placeholder?: string;
  onClose: () => void;
};

export function CommandPalette({ open, commands, locale, placeholder = "Run command...", onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const localizedCommands = useMemo(() => commands.map((command) => {
    const title = translateUiText(locale, command.title);
    const group = translateUiText(locale, command.group);
    const detail = command.detail ? translateUiText(locale, command.detail) : undefined;
    return {
      ...command,
      title,
      group,
      detail,
      searchText: [command.searchText, title, group, detail].filter(Boolean).join(" ")
    };
  }), [commands, locale]);
  const filteredCommands = useMemo(() => filterCommands(localizedCommands, query, MAX_VISIBLE_COMMANDS), [localizedCommands, query]);
  const firstEnabledIndex = useMemo(() => firstEnabledCommandIndex(filteredCommands), [filteredCommands]);
  const lastEnabledIndex = useMemo(() => lastEnabledCommandIndex(filteredCommands), [filteredCommands]);
  const activeCommand = activeIndex >= 0 ? filteredCommands[activeIndex] : undefined;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
      return undefined;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(firstEnabledIndex);
  }, [firstEnabledIndex, query]);

  useEffect(() => {
    if (activeIndex < 0) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  async function runCommand(command: CommandItem) {
    if (command.disabled) return;
    await command.run();
    onClose();
  }

  return (
    <div className="command-overlay" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label={translateUiText(locale, "Command palette dialog")} onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder={translateUiText(locale, placeholder)}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => nextEnabledCommandIndex(filteredCommands, current, 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => nextEnabledCommandIndex(filteredCommands, current, -1));
              }
              if (event.key === "Home") {
                event.preventDefault();
                setActiveIndex(firstEnabledIndex);
              }
              if (event.key === "End") {
                event.preventDefault();
                setActiveIndex(lastEnabledIndex);
              }
              if (event.key === "Enter" && activeCommand && !activeCommand.disabled) {
                event.preventDefault();
                void runCommand(activeCommand);
              }
            }}
          />
        </div>

        <div className="command-list" role="listbox">
          {filteredCommands.length === 0 ? (
            <div className="command-empty">{translateUiText(locale, "No commands")}</div>
          ) : filteredCommands.map((command, index) => (
            <button
              key={command.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              className={index === activeIndex ? "command-item active" : "command-item"}
              disabled={command.disabled}
              aria-selected={index === activeIndex}
              role="option"
              onClick={() => void runCommand(command)}
            >
              <span>
                <strong>{command.title}</strong>
                <small>{command.detail ?? command.group}</small>
              </span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
