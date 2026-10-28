import { describe, expect, it } from "vitest";
import { ehAreaLogada } from "./areas";

describe("áreas que exigem login", () => {
  it("cobre a raiz de cada área e o que vem abaixo dela", () => {
    for (const caminho of [
      "/inicio",
      "/adesao",
      "/empresa/7d1f0a4e-0000-4000-8000-000000000000",
      "/comprador",
      "/comprador/ofertas/qualquer",
      "/admin",
      "/admin/adesoes",
    ]) {
      expect(ehAreaLogada(caminho), caminho).toBe(true);
    }
  });

  it("não cobre as telas públicas nem prefixos parecidos", () => {
    for (const caminho of [
      "/",
      "/entrar",
      "/cadastro",
      "/recuperar",
      "/nova-senha",
      "/auth/confirmar",
      "/inicios",
      "/administracao",
    ]) {
      expect(ehAreaLogada(caminho), caminho).toBe(false);
    }
  });
});
