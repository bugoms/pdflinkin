import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

/**
 * SF Pro 는 애플 전용 폰트다. macOS/iOS 에서는 -apple-system 이 진짜 SF Pro 로 해석되고,
 * 그 외 플랫폼에서는 가장 가까운 오픈소스 대체인 Inter 로 떨어진다. (DESIGN-apple.md)
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "pdflinkin",
  description: "링크와 PDF를 캔버스에 펼쳐두는 개인 아카이브",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: 브라우저 확장이 <html>/<body> 에 속성을 끼워 넣어
    // 생기는 가짜 hydration 경고만 막는다. 자식 요소의 진짜 불일치는 여전히 잡힌다.
    <html lang="ko" className={`h-full ${inter.variable}`} suppressHydrationWarning>
      <body
        className="h-full overscroll-none bg-canvas text-ink antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
