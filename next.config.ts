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
  // A página de confirmação tem o token na URL: o endereço não vai como
  // referência para outro site. `same-origin`, e não `no-referrer`, porque com
  // `no-referrer` o navegador manda `Origin: null` no POST e o Next recusa a
  // ação do botão (ADR-0002 §8, R1).
  headers() {
    return Promise.resolve([
      {
        source: "/auth/confirmar",
        headers: [{ key: "Referrer-Policy", value: "same-origin" }],
      },
    ]);
  },
};

export default nextConfig;
