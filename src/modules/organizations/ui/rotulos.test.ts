import { describe, expect, it } from "vitest";
import { PAPEIS_NA_EMPRESA, TIPOS_DE_EMPRESA } from "../tipos";
import {
  ROTULO_DO_PAPEL,
  ROTULO_DO_STATUS_DA_EMPRESA,
  ROTULO_DO_STATUS_DO_VINCULO,
  ROTULO_DO_TIPO,
  rotulo,
} from "./rotulos";

describe("rótulos de empresa e vínculo", () => {
  it("todo valor do domínio tem rótulo", () => {
    for (const tipo of TIPOS_DE_EMPRESA) {
      expect(ROTULO_DO_TIPO[tipo]).toBeTruthy();
    }
    for (const papel of PAPEIS_NA_EMPRESA) {
      expect(ROTULO_DO_PAPEL[papel]).toBeTruthy();
    }
    expect(Object.keys(ROTULO_DO_STATUS_DA_EMPRESA)).toEqual([
      "pending",
      "active",
      "suspended",
      "closed",
    ]);
    expect(Object.keys(ROTULO_DO_STATUS_DO_VINCULO)).toEqual([
      "pending",
      "active",
      "suspended",
      "removed",
    ]);
  });

  it("valor fora do domínio aparece como veio", () => {
    expect(rotulo(ROTULO_DO_STATUS_DA_EMPRESA, "suspended")).toBe("Suspensa");
    expect(rotulo(ROTULO_DO_STATUS_DA_EMPRESA, "outro")).toBe("outro");
  });
});
