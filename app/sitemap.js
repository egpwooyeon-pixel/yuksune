export default function sitemap() {
  const baseUrl = "https://yuksune.example.com"; // TODO: 실제 배포 도메인으로 교체

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
