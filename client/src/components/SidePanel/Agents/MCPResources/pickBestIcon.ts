import type { MCPResourceIcon } from 'librechat-data-provider';

const ALLOWED_SCHEMES = ['https:', 'data:'];

const isImageMime = (mime: string | undefined): boolean =>
  !mime || mime.toLowerCase().startsWith('image/');

const isAllowedSrc = (src: string): boolean => {
  try {
    if (src.startsWith('data:image/')) return true;
    const url = new URL(src);
    return ALLOWED_SCHEMES.includes(url.protocol);
  } catch {
    return false;
  }
};

const parseSize = (token: string): number | null => {
  if (token === 'any') return Number.POSITIVE_INFINITY;
  const [w] = token.split('x');
  const n = parseInt(w ?? '', 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Picks the best icon URL for display from an MCP resource's `icons[]` array.
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
 *
 * Filters out icons whose `src` is not `https:` or `data:image/*`, then prefers
 * the entry whose `sizes` token is closest to `targetPx`. Returns undefined
 * when no suitable icon is found (caller falls back to a built-in icon).
 */
export function pickBestIcon(
  icons: MCPResourceIcon[] | undefined,
  targetPx: number,
): string | undefined {
  if (!icons?.length) return undefined;
  const candidates = icons.filter(
    (i) => isImageMime(i.mimeType) && isAllowedSrc(i.src),
  );
  if (!candidates.length) return undefined;

  let best = candidates[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (!c.sizes?.length) continue;
    for (const token of c.sizes) {
      const px = parseSize(token);
      if (px == null) continue;
      const delta = Math.abs(px - targetPx);
      if (delta < bestDelta) {
        best = c;
        bestDelta = delta;
      }
    }
  }
  return best.src;
}
