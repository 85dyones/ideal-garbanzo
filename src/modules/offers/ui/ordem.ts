/**
 * Ordem das fotos na tela (I2.8; ADR-0003 §2.13). A posição é
 * `offer_media.display_order`; mover uma foto renumera a lista de 0 em diante
 * e devolve só as fotos cuja posição muda, para o servidor gravar uma a uma.
 */

export interface FotoNaOrdem {
  readonly id: string;
  readonly ordem: number;
}

export interface MudancaDeOrdem {
  readonly fotoId: string;
  readonly ordem: number;
}

/** Maior posição aceita pelo banco (`display_order between 0 and 999`). */
export const ULTIMA_POSICAO = 999;

/** Mudanças para levar a foto do índice `de` ao índice `para`, na lista já ordenada. */
export function mudancasDaOrdem(
  fotos: readonly FotoNaOrdem[],
  de: number,
  para: number,
): MudancaDeOrdem[] {
  const foto = fotos[de];
  if (foto === undefined || para < 0 || para >= fotos.length || de === para) {
    return [];
  }
  const lista = fotos.filter((_, indice) => indice !== de);
  lista.splice(para, 0, foto);
  return lista.flatMap((item, indice) =>
    item.ordem === indice ? [] : [{ fotoId: item.id, ordem: indice }],
  );
}

/** Posição da próxima foto: depois da última. */
export function posicaoDaProximaFoto(fotos: readonly FotoNaOrdem[]): number {
  if (fotos.length === 0) return 0;
  return Math.min(
    ULTIMA_POSICAO,
    Math.max(...fotos.map((foto) => foto.ordem)) + 1,
  );
}
