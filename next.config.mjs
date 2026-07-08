/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SheetJS (xlsx) is CommonJS; keep it external to avoid bundling issues in server components.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
  },
};

export default nextConfig;
