/**
 * Interpreta a saída TAP do pgTAP. Um arquivo só passa com plano declarado,
 * todos os testes do plano executados e nenhum "not ok" (exceto TODO).
 */
export function analisarTap(linhas) {
  let planejados = null;
  let executados = 0;
  const falhas = [];
  for (const bruta of linhas) {
    const linha = bruta.trim();
    const plano = /^1\.\.(\d+)/.exec(linha);
    if (plano) {
      planejados = Number(plano[1]);
      continue;
    }
    const teste = /^(not )?ok\b\s*(\d+)?(.*)$/.exec(linha);
    if (!teste) continue;
    executados += 1;
    const todo = /#\s*TODO\b/i.test(teste[3] ?? "");
    if (teste[1] && !todo) falhas.push(linha);
  }
  const problemas = [];
  if (planejados === null) problemas.push("sem plano (falta select plan(n))");
  else if (executados !== planejados)
    problemas.push(`plano de ${planejados} testes, ${executados} executados`);
  if (falhas.length > 0) problemas.push(`${falhas.length} falha(s)`);
  return {
    planejados,
    executados,
    falhas,
    problemas,
    ok: problemas.length === 0,
  };
}

/** Extrai as linhas de texto das linhas de resultado devolvidas pelo `pg`. */
export function linhasDosResultados(resultados) {
  const lista = Array.isArray(resultados) ? resultados : [resultados];
  return lista.flatMap((resultado) =>
    (resultado.rows ?? []).flatMap((linha) => {
      const valor = Object.values(linha)[0];
      return typeof valor === "string" ? valor.split("\n") : [];
    }),
  );
}
