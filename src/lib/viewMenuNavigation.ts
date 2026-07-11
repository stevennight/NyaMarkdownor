export type ViewMenuFocusDirection = "first" | "last" | "next" | "previous";

export function viewMenuFocusIndex(
  itemCount: number,
  activeIndex: number,
  focusedIndex: number,
  direction: ViewMenuFocusDirection
): number | null {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return null;

  const fallbackIndex = normalizeViewMenuIndex(activeIndex, itemCount);
  const currentIndex = focusedIndex >= 0 && focusedIndex < itemCount ? focusedIndex : fallbackIndex;

  switch (direction) {
    case "first":
      return 0;
    case "last":
      return itemCount - 1;
    case "next":
      return (currentIndex + 1) % itemCount;
    case "previous":
      return (currentIndex - 1 + itemCount) % itemCount;
  }
}

function normalizeViewMenuIndex(index: number, itemCount: number): number {
  return index >= 0 && index < itemCount ? index : 0;
}
