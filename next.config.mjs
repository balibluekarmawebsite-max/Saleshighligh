/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SheetJS (xlsx) is CommonJS; keep it external to avoid bundling issues in server components.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
    // Monthly workbooks can be a few hundred KB; allow generous upload bodies.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
