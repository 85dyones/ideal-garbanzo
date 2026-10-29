/**
 * Logo da EntrePátios (kit v0.3, `docs/marca.md`). O nome está em contornos
 * no SVG, sem depender de fonte. Horizontal com no mínimo 140 px de largura;
 * `negativo` só sobre fundo escuro (marinho).
 */
import Image from "next/image";

/** Proporção do SVG horizontal (viewBox 877 × 136). */
const PROPORCAO_HORIZONTAL = 877 / 136;
/** Proporção do SVG empilhado (viewBox 625 × 334). */
const PROPORCAO_EMPILHADA = 625 / 334;

export function Logo({
  variante = "cor",
  forma = "horizontal",
  altura,
}: {
  readonly variante?: "cor" | "negativo";
  readonly forma?: "horizontal" | "empilhado";
  readonly altura: number;
}) {
  const proporcao =
    forma === "horizontal" ? PROPORCAO_HORIZONTAL : PROPORCAO_EMPILHADA;
  return (
    <Image
      src={`/marca/${forma}-${variante}.svg`}
      alt="EntrePátios"
      width={Math.round(altura * proporcao)}
      height={altura}
      unoptimized
      priority
    />
  );
}
