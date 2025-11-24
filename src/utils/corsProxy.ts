const DEFAULT_PROXY_BASE =
  import.meta.env.VITE_STORAGE_PROXY_URL ??
  'https://us-central1-curvetops-configurator.cloudfunctions.net/storageProxy';

export const buildCorsProxiedUrl = (imageUrl?: string | null): string | null => {
  const trimmedUrl = imageUrl?.trim();
  if (!trimmedUrl) return null;

  // Leave data URLs alone so inline placeholders still work.
  if (trimmedUrl.startsWith('data:')) return trimmedUrl;

  // Avoid double-wrapping proxy URLs.
  if (trimmedUrl.startsWith(DEFAULT_PROXY_BASE)) return trimmedUrl;

  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return trimmedUrl;
    }
  } catch {
    return trimmedUrl;
  }

  return `${DEFAULT_PROXY_BASE}?target=${encodeURIComponent(trimmedUrl)}`;
};
