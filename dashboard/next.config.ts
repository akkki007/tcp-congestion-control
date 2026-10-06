import type { NextConfig } from "next";

const backend = process.env.ACCC_BACKEND ?? "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  agentRules: false,
  // One origin for the browser: /api/* is proxied to the Python backend (demo/server.py).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
