/**
 * Gate 5 do plano (especificação v1.1, §6.6): varre os textos do repositório
 * atrás de linguagem proibida sem a qualificação exigida.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  carregarListaPadrao,
  criarVarredor,
} from "../src/lib/linguagem-proibida";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTAS = ["src", "config"];
const EXTENSOES = new Set([".ts", ".tsx", ".md", ".json"]);
/** A própria lista e os testes do varredor contêm os termos de propósito. */
const EXCLUIDOS = new Set([
  "config/linguagem-proibida.json",
  "src/lib/linguagem-proibida.test.ts",
]);

function caminhoRelativo(caminho: string): string {
  return path.relative(RAIZ, caminho).split(path.sep).join("/");
}

function listarArquivos(): string[] {
  return PASTAS.flatMap((pasta) =>
    readdirSync(path.join(RAIZ, pasta), {
      recursive: true,
      withFileTypes: true,
    })
      .filter(
        (entrada) =>
          entrada.isFile() && EXTENSOES.has(path.extname(entrada.name)),
      )
      .map((entrada) =>
        caminhoRelativo(path.join(entrada.parentPath, entrada.name)),
      ),
  )
    .filter((arquivo) => !EXCLUIDOS.has(arquivo))
    .sort();
}

describe("linguagem proibida no repositório", () => {
  const arquivos = listarArquivos();

  it("encontra os arquivos a varrer", () => {
    expect(arquivos).toContain("src/app/page.tsx");
    expect(arquivos).toContain("src/lib/linguagem-proibida.ts");
    expect(arquivos).not.toContain("config/linguagem-proibida.json");
    expect(arquivos).not.toContain("src/lib/linguagem-proibida.test.ts");
  });

  it("nenhum texto de src/ e config/ usa termo proibido sem a qualificação", () => {
    const varrer = criarVarredor(carregarListaPadrao());
    const encontradas = arquivos.flatMap((arquivo) =>
      varrer(readFileSync(path.join(RAIZ, arquivo), "utf8")).map(
        (o) =>
          `${arquivo}:${String(o.linha)}:${String(o.coluna)} "${o.trecho}" (termo: ${o.termo})`,
      ),
    );
    expect(
      encontradas,
      'Use a qualificação "nas fontes consultadas, em [data]" ou, se o uso for legítimo, ' +
        'o marcador "linguagem-permitida: <motivo>" na mesma linha.',
    ).toEqual([]);
  });
});
