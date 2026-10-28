import { describe, expect, it } from "vitest";
import { ipDoVisitante } from "./visitante";

describe("IP do visitante", () => {
  it("usa o primeiro item de x-forwarded-for", () => {
    expect(
      ipDoVisitante(
        new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }),
      ),
    ).toBe("203.0.113.7");
    expect(
      ipDoVisitante(new Headers({ "x-forwarded-for": "2001:db8::1" })),
    ).toBe("2001:db8::1");
  });

  it("sem o cabeçalho, vazio ou longo demais, devolve null", () => {
    expect(ipDoVisitante(new Headers())).toBeNull();
    expect(ipDoVisitante(new Headers({ "x-forwarded-for": " , x" }))).toBe(
      null,
    );
    expect(
      ipDoVisitante(new Headers({ "x-forwarded-for": "a".repeat(100) })),
    ).toBeNull();
  });
});
