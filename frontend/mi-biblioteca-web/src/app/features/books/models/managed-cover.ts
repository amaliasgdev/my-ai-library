function absoluteCoverUrl(value: string): { url: URL; path: string } | null {
  // URL alone repairs whitespace, backslashes and dot segments; do not classify
  // repaired URLs as backend-owned references.
  if (/[\s\\?#]/.test(value)) return null;
  const match = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(value);
  if (!match || /[@%]/.test(match[1])) return null;
  try {
    const url = new URL(value);
    const authority = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(match[1]);
    if (!authority || authority[1].toLowerCase() !== url.hostname.toLowerCase() || url.port === '0')
      return null;
    if (
      !authority[1].startsWith('[') &&
      authority[1]
        .replace(/\.$/, '')
        .split('.')
        .some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    )
      return null;
    const path = match[2] ?? '';
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== path && !(path === '' && url.pathname === '/'))
    )
      return null;
    return { url, path };
  } catch {
    return null;
  }
}

/** UX classification only. Backend remains the authority for ownership/cleanup. */
export function isManagedCover(
  coverUrl: string | null,
  bookId: number,
  publicBaseUrl: string,
): boolean {
  if (!coverUrl || !Number.isSafeInteger(bookId) || bookId <= 0) return false;
  const base = absoluteCoverUrl(publicBaseUrl);
  const cover = absoluteCoverUrl(coverUrl);
  if (!base || !cover || base.url.origin !== cover.url.origin) return false;
  const prefix = base.path.replace(/\/+$/, '') + '/';
  if (!cover.path.startsWith(prefix)) return false;
  const filename = cover.path.slice(prefix.length);
  return new RegExp(
    `^${bookId}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png)$`,
  ).test(filename);
}
