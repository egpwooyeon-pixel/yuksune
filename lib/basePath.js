// GitHub Pages serves this site from /yuksune/ instead of the domain root.
// The GitHub Actions workflow sets NEXT_PUBLIC_BASE_PATH at build time;
// Vercel (and local dev) leave it unset, so paths resolve from "/" as usual.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function withBasePath(path) {
  return `${basePath}${path}`;
}
