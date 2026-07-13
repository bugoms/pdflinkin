/** 문자열이 http(s) URL 이면 정규화해서 돌려주고, 아니면 null. */
export function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;

  const candidate = /^https?:\/\//i.test(text)
    ? text
    : /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)
      ? `https://${text}`
      : null;

  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** 붙여넣은 텍스트 덩어리에서 URL들만 뽑는다. */
export function extractUrls(text: string): string[] {
  return text
    .split(/[\s\n]+/)
    .map(normalizeUrl)
    .filter((u): u is string => Boolean(u));
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconFallback(url: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname(url))}`;
}
