/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-simple-maps (and its d3 deps) ship ESM; transpile for the bundler.
  transpilePackages: ["react-simple-maps", "d3-geo", "d3-array", "d3-scale"],
  // SheetJS (xlsx) is CommonJS; keep it external to avoid bundling issues in server components.
  experimental: {
    serverComponentsExternalPackages: ["xlsx"],
    // Monthly workbooks can be a few hundred KB; allow generous upload bodies.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
