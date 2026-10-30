import { describe, expect, it } from "vitest";
import {
  AVISOS,
  AVISO_DO_IMPEDIMENTO,
  avisoDoEstado,
  avisosDosEstados,
} from "./avisos";
import { ESTADOS_DOCUMENTAIS } from "./estados";

describe("catálogo das ressalvas", () => {
  it("todo código tem versão do texto", () => {
    for (const codigo of Object.keys(AVISOS)) {
      expect(codigo).toMatch(/^[a-z_]+\.v[0-9]+$/);
    }
  });

  it("todo estado tem ressalva (desde a I3.3), e o impedimento tem a sua", () => {
    expect(avisoDoEstado("not_checked")).toBe("categoria_nao_consultada.v1");
    expect(avisoDoEstado("declared_unverified")).toBe(
      "declaracao_sem_comprovacao.v1",
    );
    expect(avisoDoEstado("with_findings")).toBe(
      "categoria_com_apontamentos.v1",
    );
    expect(avisoDoEstado("pending")).toBe("categoria_pendente.v1");
    expect(avisoDoEstado("under_review")).toBe("categoria_em_analise.v1");
    expect(avisoDoEstado("no_findings_in_sources")).toBe(
      "sem_apontamentos_nas_fontes_consultadas.v1",
    );
    expect(
      ESTADOS_DOCUMENTAIS.filter(
        (estado) => avisoDoEstado(estado) === undefined,
      ),
    ).toEqual([]);
    expect(AVISOS[AVISO_DO_IMPEDIMENTO]).toBeTruthy();
  });

  it("as ressalvas de vários estados saem sem repetição e em ordem de código", () => {
    expect(
      avisosDosEstados(["with_findings", "not_checked", "not_checked"]),
    ).toEqual(["categoria_com_apontamentos.v1", "categoria_nao_consultada.v1"]);
  });
});
