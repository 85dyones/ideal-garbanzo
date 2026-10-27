/**
 * Trava de destino do banco (gate 12 do plano): reset e testes só rodam no
 * projeto de desenvolvimento listado em `config/banco-dev.json` ou num banco
 * local (CI). Funções puras, sem conexão, para serem testadas sem banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { RAIZ } from "./ambiente.mjs";

/**
 * @typedef {{ projetosPermitidos: string[], hostsLocais: string[], esquemasDaAplicacao: string[] }} ConfiguracaoDoBanco
 * @typedef {{ host: string, porta: string, ref: string | null, temSslmode: boolean }} Destino
 */

/** @returns {ConfiguracaoDoBanco} */
export function carregarConfiguracao(raiz = RAIZ) {
  return JSON.parse(
    readFileSync(path.join(raiz, "config", "banco-dev.json"), "utf8"),
  );
}

/**
 * Lê a URL de conexão e devolve só o que não é segredo.
 * @param {string} urlDoBanco
 * @returns {Destino}
 */
export function lerDestino(urlDoBanco) {
  let url;
  try {
    url = new URL(urlDoBanco);
  } catch {
    throw new Error(
      "SUPABASE_DB_URL não é uma URL válida. Codifique a senha (ex.: % vira %25, # vira %23).",
    );
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error("SUPABASE_DB_URL precisa começar com postgresql://.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const refDoUsuario = (/^postgres\.([a-z0-9]{20})$/.exec(
    decodeURIComponent(url.username),
  ) ?? [])[1];
  const refDoHost = (/^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host) ?? [])[1];
  return {
    host,
    porta: url.port || "5432",
    ref: refDoUsuario ?? refDoHost ?? null,
    temSslmode: url.searchParams.has("sslmode"),
  };
}

/**
 * Recusa qualquer destino que não seja local ou o projeto de desenvolvimento.
 * `refDeclarado` é o SUPABASE_PROJECT_REF, que precisa bater com a URL.
 * @param {Destino} destino
 * @param {ConfiguracaoDoBanco} configuracao
 * @param {string | undefined} refDeclarado
 * @returns {{ local: boolean, descricao: string }}
 */
export function verificarDestinoPermitido(destino, configuracao, refDeclarado) {
  if (configuracao.hostsLocais.includes(destino.host)) {
    return { local: true, descricao: `banco local (${destino.host})` };
  }
  if (!destino.ref || !configuracao.projetosPermitidos.includes(destino.ref)) {
    throw new Error(
      `Destino recusado: o banco ${destino.ref ? `do projeto ${destino.ref}` : `em ${destino.host}`} não está em config/banco-dev.json. Reset e testes só rodam no projeto de desenvolvimento.`,
    );
  }
  if (refDeclarado && refDeclarado !== destino.ref) {
    throw new Error(
      "Destino recusado: SUPABASE_PROJECT_REF não bate com o projeto da SUPABASE_DB_URL.",
    );
  }
  if (destino.temSslmode) {
    throw new Error(
      "Tire o sslmode da SUPABASE_DB_URL: ele anula a verificação do certificado de CA (docs/ambiente.md).",
    );
  }
  return {
    local: false,
    descricao: `projeto ${destino.ref} (${destino.host})`,
  };
}
