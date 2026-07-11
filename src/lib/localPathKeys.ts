export function localPathKey(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  return isWindowsLikePath(normalized) ? normalized.toLocaleLowerCase() : normalized;
}

export function sameLocalPath(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const leftKey = localPathKey(left);
  return Boolean(leftKey) && leftKey === localPathKey(right);
}

function isWindowsLikePath(path: string): boolean {
  return /^[a-z]:\//i.test(path) || path.startsWith("//");
}
