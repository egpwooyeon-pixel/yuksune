const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = "yuksune";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isGithubPages && {
    output: "export",
    basePath: `/${repoName}`,
    env: { NEXT_PUBLIC_BASE_PATH: `/${repoName}` },
    images: { unoptimized: true },
  }),
};

module.exports = nextConfig;
