import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

export type AppMenuItem =
  | {
    type: "item";
    id: string;
    label: string;
    icon?: ReactNode;
    shortcut?: string;
    disabled?: boolean;
    /** Rendered as a check mark; the item is a menuitemcheckbox. */
    checked?: boolean;
    danger?: boolean;
    run: () => void | Promise<void>;
  }
  | { type: "separator"; id: string }
  | { type: "label"; id: string; label: string };

export type AppMenu = {
  id: string;
  label: string;
};

type AppMenuBarProps = {
  menus: readonly AppMenu[];
  /** Built on demand so the items reflect the state when the menu opens. */
  getItems: (menuId: string) => AppMenuItem[];
  ariaLabel: string;
  trailing?: ReactNode;
};

export function AppMenuBar({ menus, getItems, ariaLabel, trailing }: AppMenuBarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && barRef.current?.contains(event.target)) return;
      setOpenMenuId(null);
    };
    const closeOnBlur = () => setOpenMenuId(null);
    // A menu opened with the mouse leaves focus in the editor; one opened from
    // the keyboard returns focus to its trigger.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const focusInMenu = Boolean(barRef.current?.contains(document.activeElement));
      setOpenMenuId(null);
      if (focusInMenu) triggerRefs.current.get(openMenuId)?.focus();
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [openMenuId]);

  const items = openMenuId ? getItems(openMenuId) : [];

  function openAdjacentMenu(offset: number) {
    const index = menus.findIndex((menu) => menu.id === openMenuId);
    const next = menus[(index + offset + menus.length) % menus.length];
    if (!next) return;
    setOpenMenuId(next.id);
    focusFirstItemSoon();
  }

  function focusFirstItemSoon() {
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  }

  function runItem(item: Extract<AppMenuItem, { type: "item" }>) {
    if (item.disabled) return;
    setOpenMenuId(null);
    void item.run();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, menuId: string) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpenMenuId(menuId);
      focusFirstItemSoon();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const index = menus.findIndex((menu) => menu.id === menuId);
      const next = menus[(index + (event.key === "ArrowRight" ? 1 : -1) + menus.length) % menus.length];
      if (next) triggerRefs.current.get(next.id)?.focus();
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        buttons[(index + 1) % buttons.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        buttons.at(-1)?.focus();
        break;
      case "ArrowRight":
        event.preventDefault();
        openAdjacentMenu(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        openAdjacentMenu(-1);
        break;
      case "Tab":
        setOpenMenuId(null);
        break;
    }
  }

  return (
    <div className="app-menubar" ref={barRef}>
      <div className="app-menubar-menus" role="menubar" aria-label={ariaLabel}>
        {menus.map((menu) => {
          const open = menu.id === openMenuId;
          return (
            <div className="app-menu" key={menu.id}>
              <button
                ref={(element) => {
                  if (element) triggerRefs.current.set(menu.id, element);
                  else triggerRefs.current.delete(menu.id);
                }}
                className={open ? "app-menu-trigger open" : "app-menu-trigger"}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                // Keep the editor selection while a menu is used.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpenMenuId(open ? null : menu.id)}
                onPointerEnter={() => {
                  if (openMenuId && !open) setOpenMenuId(menu.id);
                }}
                onKeyDown={(event) => handleTriggerKeyDown(event, menu.id)}
              >
                {menu.label}
              </button>
              {open && (
                <div
                  ref={menuRef}
                  className="app-menu-popup"
                  role="menu"
                  aria-label={menu.label}
                  onKeyDown={handleMenuKeyDown}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {items.map((item) => {
                    if (item.type === "separator") return <div key={item.id} className="app-menu-separator" role="separator" />;
                    if (item.type === "label") return <div key={item.id} className="app-menu-label" role="presentation">{item.label}</div>;

                    const checkable = item.checked !== undefined;
                    return (
                      <button
                        key={item.id}
                        className={item.danger ? "app-menu-item danger" : "app-menu-item"}
                        type="button"
                        role={checkable ? "menuitemcheckbox" : "menuitem"}
                        aria-checked={checkable ? item.checked : undefined}
                        disabled={item.disabled}
                        onClick={() => runItem(item)}
                      >
                        <span className="app-menu-item-icon" aria-hidden="true">
                          {checkable ? (item.checked ? <Check /> : null) : item.icon}
                        </span>
                        <span className="app-menu-item-label">{item.label}</span>
                        {item.shortcut && <kbd className="app-menu-item-shortcut">{item.shortcut}</kbd>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {trailing && <div className="app-menubar-trailing">{trailing}</div>}
    </div>
  );
}
