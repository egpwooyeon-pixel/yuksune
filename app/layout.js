import "./globals.css";
import { brand } from "@/data/site";

export const metadata = {
  metadataBase: new URL("https://yuksune.example.com"), // TODO: 실제 배포 도메인으로 교체
  title: `${brand.name} | ${brand.tagline}`,
  description: brand.description,
  openGraph: {
    title: brand.name,
    description: brand.description,
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
