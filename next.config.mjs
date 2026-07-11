/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-simple-maps (and its d3 deps) ship ESM; transpile for the bundler.
  transpilePackages: ["react-simple-maps", "d3-geo", "d3-array", "d3-scale"],
  // SheetJS (xlsx) is CommonJS; keep it external to avoid bundling issues in server components.
  experimental: {
    // Keep heavy/native server-only deps external so the bundler doesn't try to
    // trace them into route bundles (xlsx=CJS, playwright=native, pptxgenjs=large).
    serverComponentsExternalPackages: ["xlsx", "playwright", "pptxgenjs"],
    // Monthly workbooks can be a few hundred KB; allow generous upload bodies.
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
