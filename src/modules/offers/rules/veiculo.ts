/**
 * Identificação do veículo (ADR-0003 §2.11). Repete os CHECKs de `vehicles`
 * (migração `20261029120000_ofertas`), para o erro sair por campo no servidor
 * antes de chegar ao banco. Só formato: nenhuma consulta externa.
 */

/** Placa no formato antigo (`AAA9999`) ou Mercosul (`AAA9A99`). */
export const FORMATO_DA_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Chassi com 17 caracteres, sem I, O e Q. */
export const FORMATO_DO_CHASSI = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Maiúsculas, sem hífen nem espaço: "abc-1d23" vira "ABC1D23". */
export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[\s-]/g, "");
}

export function normalizarChassi(valor: string): string {
  return valor.toUpperCase().replace(/\s/g, "");
}

/** O código antigo, de 9 dígitos, é completado com zeros à esquerda. */
export function normalizarRenavam(valor: string): string {
  const digitos = valor.replace(/[\s.-]/g, "");
  return /^\d{9}$/.test(digitos) ? digitos.padStart(11, "0") : digitos;
}

const PESOS_DO_RENAVAM = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/**
 * Dígito verificador do RENAVAM, como `private.renavam_valido`: "10 dígitos
 * e um dígito verificador, calculado através do módulo 11, peso 9" (Portaria
 * DENATRAN 27/2013, art. 1º, § 1º). A ordem dos pesos é conferida com
 * RENAVAMs reais antes do piloto (ADR-0003 §2.11).
 */
export function renavamValido(valor: string): boolean {
  if (!/^\d{11}$/.test(valor)) return false;
  let soma = 0;
  PESOS_DO_RENAVAM.forEach((peso, i) => {
    soma += Number(valor[i]) * peso;
  });
  const resto = 11 - (soma % 11);
  const digito = resto >= 10 ? 0 : resto;
  return digito === Number(valor[10]);
}

/** Ano do modelo igual ao de fabricação ou ao seguinte (`vehicles_ano_do_modelo`). */
export function anosCoerentes(
  anoDeFabricacao: number,
  anoDoModelo: number,
): boolean {
  return anoDoModelo === anoDeFabricacao || anoDoModelo === anoDeFabricacao + 1;
}
