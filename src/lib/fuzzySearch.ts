export type FuzzyField = {
  text: string;
  weight?: number;
};

type FuzzyTermMatch = {
  score: number;
  indexes: number[];
};

export function fuzzyScoreFields(fields: FuzzyField[], query: string): number | null {
  const terms = tokenizeQuery(query);
  if (!terms.length) return 0;

  let total = 0;
  for (const term of terms) {
    let best: number | null = null;

    for (const field of fields) {
      const score = fuzzyScoreText(field.text, term);
      if (score === null) continue;
      const weighted = score * (field.weight ?? 1);
      best = best === null ? weighted : Math.max(best, weighted);
    }

    if (best === null) return null;
    total += best;
  }

  return total;
}

export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function fuzzyScoreText(text: string, term: string): number | null {
  const haystack = text.toLowerCase();
  if (!haystack || !term) return null;

  const exactIndex = haystack.indexOf(term);
  if (exactIndex >= 0) {
    const boundaryBonus = exactIndex === 0 || isBoundary(haystack[exactIndex - 1]) ? 90 : 0;
    const prefixBonus = exactIndex === 0 ? 120 : 0;
    return 700 + prefixBonus + boundaryBonus + Math.min(term.length * 8, 96) - exactIndex;
  }

  const match = fuzzyTermMatch(haystack, term);
  if (!match) return null;

  const first = match.indexes[0] ?? 0;
  const last = match.indexes[match.indexes.length - 1] ?? first;
  const span = last - first + 1;
  const compactness = Math.max(0, 120 - (span - term.length) * 10);
  const earlyBonus = Math.max(0, 80 - first * 3);

  return match.score + compactness + earlyBonus;
}

function fuzzyTermMatch(text: string, term: string): FuzzyTermMatch | null {
  const indexes: number[] = [];
  let cursor = 0;
  let score = 0;

  for (const char of term) {
    const index = text.indexOf(char, cursor);
    if (index < 0) return null;

    const previousIndex = indexes[indexes.length - 1];
    if (previousIndex !== undefined && index === previousIndex + 1) {
      score += 42;
    } else {
      score += 18;
    }

    if (index === 0 || isBoundary(text[index - 1])) score += 36;
    indexes.push(index);
    cursor = index + 1;
  }

  return { score, indexes };
}

function isBoundary(char: string | undefined): boolean {
  return !char || /[\s/\\_.:-]/.test(char);
}
