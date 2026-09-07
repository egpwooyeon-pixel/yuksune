export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://yuksune.example.com/sitemap.xml", // TODO: 실제 배포 도메인으로 교체
  };
}
