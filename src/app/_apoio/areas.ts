/**
 * Áreas que exigem login. O proxy usa esta lista só para mandar o anônimo
 * para `/entrar`; a autorização de verdade fica em cada página e em cada
 * operação de servidor (ADR-0002 §2.15).
 */
export const AREAS_LOGADAS = [
  "/inicio",
  "/adesao",
  "/empresa",
  "/comprador",
  "/admin",
] as const;

export function ehAreaLogada(caminho: string): boolean {
  return AREAS_LOGADAS.some(
    (area) => caminho === area || caminho.startsWith(`${area}/`),
  );
}
