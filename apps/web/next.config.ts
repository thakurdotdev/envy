import type { NextConfig } from "next";

// The dashboard is plain static files: all decryption happens in the browser,
// so there is no server rendering, no API routes and no image optimizer.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Workspace packages are TypeScript source, so Next compiles them too.
  transpilePackages: ["@envy/crypto", "@envy/shared"],
  // Type checking is done once for the whole repo by `bun check`.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
