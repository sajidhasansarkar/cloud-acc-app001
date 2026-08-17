/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  // This project is intentionally isolated from any other app/domain.
  // Do not add rewrites/redirects/proxies to external company sites here.
};

export default nextConfig;
