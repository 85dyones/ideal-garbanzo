/**
 * Dado pessoal ou restrito digitado no texto livre (ADR-0004 §9, R-AG-07;
 * decisão da pessoa responsável em 04/11). Repete
 * `private.dado_pessoal_no_texto` no banco: CPF, número de 11 dígitos (CPF,
 * RENAVAM ou telefone sem pontuação), telefone, placa e chassi. Esses textos
 * vão para o snapshot, que não se apaga, e o comprador os lê na ficha.
 */
const SEM_LETRA_OU_DIGITO_ANTES = "(?<![\\p{L}\\p{N}])";
const SEM_LETRA_OU_DIGITO_DEPOIS = "(?![\\p{L}\\p{N}])";

const PADROES: readonly (readonly [RegExp, string])[] = [
  [/(?<![0-9])[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}(?![0-9])/u, "um CPF"],
  [
    /(?<![0-9])[0-9]{11}(?![0-9])/u,
    "um número de 11 dígitos (CPF, RENAVAM ou telefone)",
  ],
  [/\([0-9]{2}\) ?9?[0-9]{4}-?[0-9]{4}(?![0-9])/u, "um telefone"],
  [/(?<![0-9])9[0-9]{4}-[0-9]{4}(?![0-9])/u, "um telefone"],
  [
    new RegExp(
      `${SEM_LETRA_OU_DIGITO_ANTES}[A-Za-z]{3}-?[0-9]{4}${SEM_LETRA_OU_DIGITO_DEPOIS}`,
      "u",
    ),
    "uma placa",
  ],
  [
    new RegExp(
      `${SEM_LETRA_OU_DIGITO_ANTES}[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}${SEM_LETRA_OU_DIGITO_DEPOIS}`,
      "u",
    ),
    "uma placa",
  ],
  [
    new RegExp(
      `${SEM_LETRA_OU_DIGITO_ANTES}[A-HJ-NPR-Za-hj-npr-z0-9]{17}${SEM_LETRA_OU_DIGITO_DEPOIS}`,
      "u",
    ),
    "um chassi",
  ],
];

/** O que o texto parece ter de dado pessoal ou restrito; `null` se nada. */
export function dadoPessoalNoTexto(texto: string): string | null {
  for (const [padrao, achado] of PADROES) {
    if (padrao.test(texto)) return achado;
  }
  return null;
}

/** Mensagem da recusa, com o que tirar. */
export function mensagemDoDadoPessoal(achado: string): string {
  return `O texto parece ter ${achado}. Tire do texto: dado pessoal ou restrito não vai para a ficha.`;
}
