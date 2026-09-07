import "./globals.css";
import { seo } from "@/data/site";

export const metadata = {
  metadataBase: new URL("https://yuksune.example.com"), // TODO: 실제 배포 도메인으로 교체
  title: seo.title,
  description: seo.description || undefined,
  authors: seo.author ? [{ name: seo.author }] : undefined,
  keywords: seo.keywords || undefined,
  robots: seo.indexable ? "index,follow" : "noindex,nofollow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
