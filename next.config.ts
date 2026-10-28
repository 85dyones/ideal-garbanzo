import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Evidência da adesão até 10 MB (bucket `membership-evidence`), mais a
      // folga do multipart. O padrão do Next é 1 MB (I1.6).
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
