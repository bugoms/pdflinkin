import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "pdflinkin",
  description: "링크와 PDF를 캔버스에 펼쳐두는 개인 아카이브",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full">
      <body className="h-full overscroll-none bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
