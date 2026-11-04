import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Sem `serverActions.bodySizeLimit`: fica o padrão do Next, 1 MB. Os arquivos
  // vão do navegador direto ao Storage (I3.11; ADR-0004 §10), porque a Vercel
  // recusa corpo acima de 4,5 MB. Arquivo que volte a passar por uma ação falha
  // já no ambiente local.
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
