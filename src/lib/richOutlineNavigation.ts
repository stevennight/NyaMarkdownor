export function activeRichHeadingIndexAtPosition(
  headingPositions: readonly number[],
  selectionPosition: number
): number | null {
  if (!headingPositions.length || !Number.isFinite(selectionPosition)) return null;

  let low = 0;
  let high = headingPositions.length - 1;
  let active = -1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    if (headingPositions[middle] <= selectionPosition) {
      active = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return active >= 0 ? active : null;
}

export function richHeadingPositionAtIndex(
  headingPositions: readonly number[],
  headingIndex: number
): number | null {
  if (!Number.isInteger(headingIndex) || headingIndex < 0 || headingIndex >= headingPositions.length) return null;

  const position = headingPositions[headingIndex];
  return Number.isFinite(position) && position >= 0 ? position : null;
}
