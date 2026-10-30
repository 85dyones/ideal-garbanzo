/**
 * Gate 5 do plano (especificação v1.1, §6.6): varre os textos do repositório
 * atrás de linguagem proibida sem a qualificação exigida.
 *
 * Desde a I3.4 (ADR-0004 §2.12, E27), o alcance inclui o que chega ao usuário
 * fora de `src/`:
 * - os modelos de e-mail do Auth (`supabase/templates/*.html`), inteiros;
 * - as mensagens de `raise exception '...'` das migrações, que a tela mostra.
 *   O resto do SQL não é texto de tela: a migração `20261030150000` grava a
 *   própria lista de termos em JSON, e isso não conta.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  carregarListaPadrao,
  criarVarredor,
  mensagensDoBanco,
  normalizar,
} from "../src/lib/linguagem-proibida";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

interface Alcance {
  readonly pasta: string;
  readonly extensoes: ReadonlySet<string>;
  /** `texto`: o arquivo inteiro; `mensagens do banco`: só as mensagens de `raise exception`. */
  readonly leitura: "texto" | "mensagens do banco";
}

const ALCANCE: readonly Alcance[] = [
  {
    pasta: "src",
    extensoes: new Set([".ts", ".tsx", ".md", ".json"]),
    leitura: "texto",
  },
  {
    pasta: "config",
    extensoes: new Set([".ts", ".tsx", ".md", ".json"]),
    leitura: "texto",
  },
  {
    pasta: "supabase/templates",
    extensoes: new Set([".html"]),
    leitura: "texto",
  },
  {
    pasta: "supabase/migrations",
    extensoes: new Set([".sql"]),
    leitura: "mensagens do banco",
  },
];
/** A própria lista e os testes do varredor contêm os termos de propósito. */
const EXCLUIDOS = new Set([
  "config/linguagem-proibida.json",
  "src/lib/linguagem-proibida.test.ts",
]);
const MIGRACAO_DA_LISTA =
  "supabase/migrations/20261030150000_linguagem_no_texto_livre.sql";

interface Arquivo {
  readonly caminho: string;
  readonly leitura: Alcance["leitura"];
}

function caminhoRelativo(caminho: string): string {
  return path.relative(RAIZ, caminho).split(path.sep).join("/");
}

function listarArquivos(): Arquivo[] {
  return ALCANCE.flatMap(({ pasta, extensoes, leitura }) =>
    readdirSync(path.join(RAIZ, pasta), {
      recursive: true,
      withFileTypes: true,
    })
      .filter(
        (entrada) =>
          entrada.isFile() && extensoes.has(path.extname(entrada.name)),
      )
      .map((entrada) => ({
        caminho: caminhoRelativo(path.join(entrada.parentPath, entrada.name)),
        leitura,
      })),
  )
    .filter((arquivo) => !EXCLUIDOS.has(arquivo.caminho))
    .sort((a, b) => a.caminho.localeCompare(b.caminho));
}

function ler(caminho: string): string {
  return readFileSync(path.join(RAIZ, caminho), "utf8");
}

function textoVarrido({ caminho, leitura }: Arquivo): string {
  const conteudo = ler(caminho);
  return leitura === "texto" ? conteudo : mensagensDoBanco(conteudo);
}

const varrer = criarVarredor(carregarListaPadrao());

function relatar(sql: string): string[] {
  return varrer(mensagensDoBanco(sql)).map(
    (o) => `${String(o.linha)}:${String(o.coluna)} ${o.termo}`,
  );
}

describe("linguagem proibida no repositório", () => {
  const arquivos = listarArquivos();
  const caminhos = arquivos.map((arquivo) => arquivo.caminho);

  it("encontra os arquivos a varrer", () => {
    expect(caminhos).toContain("src/app/page.tsx");
    expect(caminhos).toContain("src/lib/linguagem-proibida.ts");
    expect(caminhos).not.toContain("config/linguagem-proibida.json");
    expect(caminhos).not.toContain("src/lib/linguagem-proibida.test.ts");
  });

  it("E27: lê os quatro modelos de e-mail do Auth, inteiros", () => {
    expect(
      arquivos
        .filter((arquivo) => arquivo.caminho.startsWith("supabase/templates/"))
        .map((arquivo) => `${arquivo.caminho} (${arquivo.leitura})`),
    ).toEqual([
      "supabase/templates/confirmacao-de-cadastro.html (texto)",
      "supabase/templates/convite.html (texto)",
      "supabase/templates/recuperacao-de-senha.html (texto)",
      "supabase/templates/troca-de-email.html (texto)",
    ]);
  });

  it("E27: lê toda migração, e de cada uma só as mensagens de raise exception", () => {
    const migracoes = arquivos.filter((arquivo) =>
      arquivo.caminho.startsWith("supabase/migrations/"),
    );
    expect(migracoes.map((arquivo) => arquivo.caminho)).toEqual(
      readdirSync(path.join(RAIZ, "supabase/migrations"))
        .filter((nome) => nome.endsWith(".sql"))
        .map((nome) => `supabase/migrations/${nome}`)
        .sort((a, b) => a.localeCompare(b)),
    );
    expect(new Set(migracoes.map((arquivo) => arquivo.leitura))).toEqual(
      new Set(["mensagens do banco"]),
    );
    // Toda mensagem é lida: o número de raise exception do SQL é o número de
    // mensagens não vazias que o varredor recebe. Uma forma nova de raise
    // (sem a mensagem como literal) faz este teste falhar e pede ajuste.
    for (const { caminho } of migracoes) {
      const sql = ler(caminho);
      const comandos = sql.match(/\braise\s+exception\b/gi) ?? [];
      const lidas = mensagensDoBanco(sql)
        .split(/\r\n|\r|\n/u)
        .filter((linha) => linha.trim() !== "");
      expect([caminho, lidas.length]).toEqual([caminho, comandos.length]);
    }
    expect(
      mensagensDoBanco(
        ler("supabase/migrations/20261030120000_dominio_documental.sql"),
      ),
    ).toContain(
      "o fornecedor não substitui consulta registrada pela plataforma",
    );
  });

  it("nenhum texto varrido usa termo proibido sem a qualificação", () => {
    const encontradas = arquivos.flatMap((arquivo) =>
      varrer(textoVarrido(arquivo)).map(
        (o) =>
          `${arquivo.caminho}:${String(o.linha)}:${String(o.coluna)} "${o.trecho}" (termo: ${o.termo})`,
      ),
    );
    expect(
      encontradas,
      'Use a qualificação "nas fontes consultadas, em [data]" ou, se o uso for legítimo, ' +
        'o marcador "linguagem-permitida: <motivo>" na mesma linha.',
    ).toEqual([]);
    // Com as migrações e os modelos de e-mail (E27), a varredura passou de 5 s
    // com a suíte inteira rodando em paralelo.
  }, 30_000);
});

describe("varredor das mensagens do banco (E27)", () => {
  it("acha termo proibido sem a qualificação numa mensagem de raise exception, com linha e coluna do arquivo", () => {
    const sql = [
      "create function private.exemplo() returns trigger language plpgsql as $$",
      "begin",
      "  raise exception 'o veículo foi verificado' using errcode = 'P0001';", // linguagem-permitida: exemplo negativo do teste
      "end;",
      "$$;",
    ].join("\n");
    expect(relatar(sql)).toEqual(["3:34 verificado"]);
  });

  it("a mesma mensagem passa com a qualificação ou com o marcador na linha", () => {
    expect(
      relatar(
        "raise exception 'nada consta nas fontes consultadas, em %', data;", // linguagem-permitida: exemplo do teste
      ),
    ).toEqual([]);
    expect(
      relatar(
        "raise exception 'certificado ausente'; -- linguagem-permitida: nome do documento", // linguagem-permitida: exemplo do teste
      ),
    ).toEqual([]);
    expect(
      relatar(
        "raise exception 'certificado ausente'; -- linguagem-permitida:", // linguagem-permitida: exemplo negativo do teste
      ),
    ).toEqual(["1:18 certificado"]);
    // Fora de comentário (num dado gravado pela migração), o marcador não é exceção.
    expect(
      relatar(
        "raise exception 'certificado ausente'; select 'linguagem-permitida: x';", // linguagem-permitida: exemplo negativo do teste
      ),
    ).toEqual(["1:18 certificado"]);
  });

  it("não lê o resto do SQL: comentários, nomes e dados gravados pela migração", () => {
    const sql = [
      "-- O veículo aprovado não entra aqui.", // linguagem-permitida: exemplo do teste
      "insert into public.platform_settings (key, value) values ('x', '[\"garantido\", \"nada consta\"]');", // linguagem-permitida: exemplo do teste
      "create function private.livre_de_problemas() returns void language sql as $$ select 1 $$;",
      "raise exception 'o motivo tem caracteres não permitidos';",
    ].join("\n");
    expect(relatar(sql)).toEqual([]);
    expect(varrer(sql)).not.toEqual([]);
  });

  it("lê mensagens com aspas dobradas, marcadores de formato e várias por linha", () => {
    expect(
      relatar(
        "raise exception 'o ''selo'' %: procedência garantida', x; raise exception 'sem ocorrências';", // linguagem-permitida: exemplo negativo do teste
      ),
    ).toEqual(["1:32 procedência garantida", "1:76 sem ocorrências"]);
  });

  it("a migração que grava a lista em JSON tem os termos no SQL, e nenhum nas mensagens", () => {
    const sql = ler(MIGRACAO_DA_LISTA);
    const noSql = normalizar(sql);
    const nasMensagens = normalizar(mensagensDoBanco(sql));
    const variantes = carregarListaPadrao().termos.flatMap((item) =>
      item.variantes.map(normalizar),
    );
    expect(variantes.filter((v) => !noSql.includes(v))).toEqual([]);
    expect(variantes.filter((v) => nasMensagens.includes(v))).toEqual([]);
    expect(nasMensagens).toContain(
      'o texto usa "%" sem a qualificacao exigida pela §6.6',
    );
    expect(relatar(sql)).toEqual([]);
  });
});
