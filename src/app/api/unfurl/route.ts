import dns from "node:dns/promises";
import net from "node:net";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { UnfurlResult } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BYTES = 512 * 1024; // head 만 필요하므로 512KB 면 충분
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const UA =
  "Mozilla/5.0 (compatible; pdflinkin/1.0; +https://github.com/bugoms/pdflinkin)";

/* ---------------------------------------------------------------------------
 * SSRF 방어: 사설/루프백/링크로컬 대역으로는 절대 요청하지 않는다.
 * 리다이렉트를 따라갈 때마다 다시 검사한다 (검사 후 리다이렉트로 우회 방지).
 * ------------------------------------------------------------------------- */

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // 링크로컬 (클라우드 메타데이터 포함)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // 멀티캐스트/예약
    return false;
  }

  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:10.0.0.1 등)
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }

  return true;
}

async function assertSafeUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http(s) 주소만 지원합니다");
  }
  const host = url.hostname;

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("접근할 수 없는 주소입니다");
    return;
  }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("접근할 수 없는 주소입니다");
  }

  const records = await dns.lookup(host, { all: true });
  if (records.length === 0) throw new Error("주소를 찾을 수 없습니다");
  for (const { address } of records) {
    if (isBlockedIp(address)) throw new Error("접근할 수 없는 주소입니다");
  }
}

/* ---------------------------------------------------------------------------
 * HTML 파싱 (의존성 없이 <head> 만 정규식으로)
 * ------------------------------------------------------------------------- */

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .trim();
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*\\scontent\\s*=\\s*["']([^"']*)["']`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
        "i",
      ),
    ];
    for (const re of patterns) {
      const match = html.match(re);
      if (match?.[1]) {
        const value = decodeEntities(match[1]);
        if (value) return value;
      }
    }
  }
  return null;
}

function linkHref(html: string, rels: string[]): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!rel) continue;
    const parts = rel.split(/\s+/);
    if (!rels.some((r) => parts.includes(r))) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href);
  }
  return null;
}

function absolute(href: string | null, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * 가져오기 (리다이렉트 수동 처리)
 * ------------------------------------------------------------------------- */

async function fetchHtml(start: URL): Promise<{ html: string; finalUrl: URL }> {
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "ko,en;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("리다이렉트 주소가 없습니다");
        current = new URL(location, current);
        continue;
      }

      if (!res.ok) throw new Error(`응답 오류 ${res.status}`);

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("html")) {
        return { html: "", finalUrl: current };
      }

      const html = await readCapped(res);
      return { html, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("리다이렉트가 너무 많습니다");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => {});

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk.subarray(0, Math.min(chunk.length, total - offset)), offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8").decode(buffer);
}

/* ---------------------------------------------------------------------------
 * 핸들러
 * ------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url 파라미터가 없습니다" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "올바른 주소가 아닙니다" }, { status: 400 });
  }

  const domain = target.hostname.replace(/^www\./, "");
  const fallbackFavicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;

  // 캐시 확인
  const { data: cached } = await supabase
    .from("link_meta_cache")
    .select("*")
    .eq("url", target.toString())
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      url: target.toString(),
      title: cached.title,
      description: cached.description,
      faviconUrl: cached.favicon_url ?? fallbackFavicon,
      ogImageUrl: cached.og_image_url,
      domain,
    } satisfies UnfurlResult);
  }

  let result: UnfurlResult = {
    url: target.toString(),
    title: null,
    description: null,
    faviconUrl: fallbackFavicon,
    ogImageUrl: null,
    domain,
  };

  try {
    const { html, finalUrl } = await fetchHtml(target);

    if (html) {
      const title =
        metaContent(html, ["og:title", "twitter:title"]) ??
        decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ??
        null;

      const description = metaContent(html, [
        "og:description",
        "twitter:description",
        "description",
      ]);

      const ogImage = absolute(
        metaContent(html, ["og:image:secure_url", "og:image", "twitter:image"]),
        finalUrl,
      );

      const favicon =
        absolute(
          linkHref(html, ["icon", "shortcut", "apple-touch-icon"]),
          finalUrl,
        ) ?? fallbackFavicon;

      result = {
        url: target.toString(),
        title: title?.slice(0, 300) || null,
        description: description?.slice(0, 600) || null,
        faviconUrl: favicon,
        ogImageUrl: ogImage,
        domain,
      };
    }
  } catch (err) {
    // 봇 차단·타임아웃 등은 흔한 일이다. 도메인 정보만이라도 돌려준다.
    console.warn("[unfurl] 실패:", domain, (err as Error).message);
  }

  // 실패해도 캐시에 넣는다 (같은 링크로 매번 재시도하지 않도록)
  await supabase.from("link_meta_cache").insert({
    url: target.toString(),
    title: result.title,
    description: result.description,
    favicon_url: result.faviconUrl,
    og_image_url: result.ogImageUrl,
  });

  return NextResponse.json(result);
}
