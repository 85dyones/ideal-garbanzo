import { describe, expect, it } from "vitest";
import { PAPEIS_NA_PLATAFORMA } from "../tipos";
import {
  ROTULO_DO_PAPEL_NA_PLATAFORMA,
  ROTULO_DO_STATUS_DO_PAPEL,
  ROTULO_DO_STATUS_DO_PERFIL,
} from "./rotulos";

describe("rótulos do perfil e da plataforma", () => {
  it("todo valor do domínio tem rótulo", () => {
    for (const papel of PAPEIS_NA_PLATAFORMA) {
      expect(ROTULO_DO_PAPEL_NA_PLATAFORMA[papel]).toBeTruthy();
    }
    expect(ROTULO_DO_STATUS_DO_PERFIL.suspended).toBe("Suspenso");
    expect(ROTULO_DO_STATUS_DO_PAPEL.revoked).toBe("Revogado");
  });
});
