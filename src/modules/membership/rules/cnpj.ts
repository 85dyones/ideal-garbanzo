/**
 * CNPJ numérico e alfanumérico (ADR-0002 §2.5), igual a `private.cnpj_valido`.
 *
 * Doze posições com 0-9 ou A-Z, mais dois dígitos verificadores numéricos.
 * Cada caractere vale o código ASCII menos 48; pesos de 2 a 9 da direita para
 * a esquerda, recomeçando; resto 0 ou 1 dá dígito 0, senão 11 menos o resto.
 * Conferido nas perguntas e respostas da Receita sobre o CNPJ alfanumérico e
 * no manual de cálculo do DV publicado pela Receita.
 */

/** Sem pontuação e em maiúsculas, como o banco guarda. */
export function normalizarCnpj(valor: string): string {
  return valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function digitoVerificador(valores: readonly number[]): number {
  let soma = 0;
  let peso = 2;
  for (let i = valores.length - 1; i >= 0; i -= 1) {
    soma += (valores[i] ?? 0) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Recebe o CNPJ já normalizado. */
export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (cnpj === cnpj.charAt(0).repeat(14)) return false;
  // A regex acima garante 14 caracteres ASCII.
  const valores = Array.from({ length: 14 }, (_, i) => cnpj.charCodeAt(i) - 48);
  const primeiro = digitoVerificador(valores.slice(0, 12));
  const segundo = digitoVerificador(valores.slice(0, 13));
  return primeiro === valores[12] && segundo === valores[13];
}
