export function simplifyLocalPath(path: string): string {
  const candidate = windowsVerbatimDiskCandidate(path);
  if (!candidate || !isSafeLegacyWindowsPath(path, candidate)) return path;
  return candidate;
}

export function localPathKey(path: string): string {
  const normalized = simplifyLocalPath(path.trim()).replace(/\\/g, "/");
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

function windowsVerbatimDiskCandidate(path: string): string | null {
  if (path.startsWith("\\\\?\\")) {
    const candidate = path.slice(4);
    return /^[a-z]:\\/i.test(candidate) ? candidate : null;
  }

  if (path.startsWith("//?/")) {
    const candidate = path.slice(4);
    return /^[a-z]:\//i.test(candidate) ? candidate : null;
  }

  return null;
}

function isSafeLegacyWindowsPath(original: string, candidate: string): boolean {
  if (original.length > 260) return false;
  const remainder = candidate.slice(3);
  if (!remainder) return true;
  return remainder.split(/[\\/]/).every(isSafeLegacyWindowsComponent);
}

function isSafeLegacyWindowsComponent(component: string): boolean {
  if (!component || component.length > 255) return false;
  if (/[\u0000-\u001f<>:"/\\|?*]/.test(component) || /[ .]$/.test(component)) return false;
  return !/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:[ .]|$)/i.test(component);
}
