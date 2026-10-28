/**
 * Reset reproduzível do banco de desenvolvimento (I0.5; ADR-0001 §3.3), sem
 * Docker local. Numa única transação: remove os objetos da aplicação, apaga
 * os usuários de teste, zera o histórico de migrações, reaplica todas as
 * migrações de `supabase/migrations/` e o `supabase/seed.sql`, se houver.
 *
 * Só roda no projeto de desenvolvimento ou num banco local (gate 12). Os
 * grants e privilégios padrão do schema `public` são preservados, porque o
 * schema não é recriado: só os objetos dentro dele são removidos. Os demais
 * schemas da aplicação (`private`) são recriados pelas migrações.
 *
 * Antes da transação, esvazia os buckets da aplicação pela API do Storage
 * (ADR-0002 §2.14): apagar `storage.objects` por SQL deixaria o arquivo
 * órfão, e o Supabase recusa. O bucket fica; a migração o atualiza.
 *
 * Convenção: migrações não abrem nem fecham transação (sem BEGIN/COMMIT).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { RAIZ, exigirVariaveis } from "./lib/ambiente.mjs";
import { comTrava, conectar, mensagemSegura } from "./lib/banco.mjs";
import { carregarConfiguracao, verificarApiDoDestino } from "./lib/destino.mjs";

const PASTA_DE_MIGRACOES = path.join(RAIZ, "supabase", "migrations");
const ARQUIVO_DE_SEED = path.join(RAIZ, "supabase", "seed.sql");

function listarMigracoes() {
  if (!existsSync(PASTA_DE_MIGRACOES)) return [];
  return readdirSync(PASTA_DE_MIGRACOES)
    .filter((nome) => nome.endsWith(".sql"))
    .sort()
    .map((nome) => {
      const casamento = /^(\d+)_(.+)\.sql$/.exec(nome);
      if (!casamento) {
        throw new Error(
          `Migração com nome fora do padrão <versão>_<nome>.sql: ${nome}`,
        );
      }
      return {
        arquivo: nome,
        versao: casamento[1],
        nome: casamento[2],
        sql: readFileSync(path.join(PASTA_DE_MIGRACOES, nome), "utf8"),
      };
    });
}

/** Remove views, tabelas, sequências, funções e tipos do schema, exceto os de extensões. */
function sqlDeLimpeza(esquema) {
  return `
do $limpeza$
declare
  r record;
begin
  for r in
    select n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${esquema}' and c.relkind in ('v', 'm')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop %s if exists %I.%I cascade',
      case r.relkind when 'v' then 'view' else 'materialized view' end, r.nspname, r.relname);
  end loop;

  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${esquema}' and c.relkind in ('r', 'p') and not c.relispartition
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop table if exists %I.%I cascade', r.nspname, r.relname);
  end loop;

  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '${esquema}' and c.relkind = 'S'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop sequence if exists %I.%I cascade', r.nspname, r.relname);
  end loop;

  for r in
    select n.nspname, p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) as argumentos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = '${esquema}'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop %s if exists %I.%I(%s) cascade',
      case r.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
      r.nspname, r.proname, r.argumentos);
  end loop;

  for r in
    select n.nspname, t.typname, t.typtype
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = '${esquema}' and t.typtype in ('e', 'd', 'r', 'c')
      and (t.typtype <> 'c' or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop %s if exists %I.%I cascade',
      case r.typtype when 'd' then 'domain' else 'type' end, r.nspname, r.typname);
  end loop;
end
$limpeza$;`;
}

/**
 * Apaga pela API do Storage os arquivos dos buckets da aplicação. Só chama a
 * API se houver arquivo, e só no mesmo destino do banco.
 * @param {import("pg").Client} cliente
 * @param {string[]} buckets
 * @param {{ local: boolean, ref: string | null }} destinoDoBanco
 * @param {import("./lib/destino.mjs").ConfiguracaoDoBanco} configuracao
 * @returns {Promise<number>} quantos arquivos foram apagados
 */
async function esvaziarBuckets(cliente, buckets, destinoDoBanco, configuracao) {
  if (buckets.length === 0) return 0;
  const { rows } = await cliente.query(
    "select bucket_id, name from storage.objects where bucket_id = any($1) order by bucket_id, name",
    [buckets],
  );
  if (rows.length === 0) return 0;

  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = exigirVariaveis([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
  ]);
  const origem = verificarApiDoDestino(
    NEXT_PUBLIC_SUPABASE_URL ?? "",
    destinoDoBanco,
    configuracao,
  );
  /** @type {Map<string, string[]>} */
  const porBucket = new Map();
  for (const { bucket_id: bucket, name } of rows) {
    porBucket.set(bucket, [...(porBucket.get(bucket) ?? []), name]);
  }
  for (const [bucket, nomes] of porBucket) {
    for (let inicio = 0; inicio < nomes.length; inicio += 1000) {
      const resposta = await fetch(
        `${origem}/storage/v1/object/${encodeURIComponent(bucket)}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_SECRET_KEY ?? "",
            Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefixes: nomes.slice(inicio, inicio + 1000),
          }),
        },
      );
      if (!resposta.ok) {
        throw new Error(
          `A API do Storage recusou esvaziar o bucket ${bucket} (HTTP ${resposta.status}).`,
        );
      }
    }
  }
  const { rows: restantes } = await cliente.query(
    "select count(*)::int as total from storage.objects where bucket_id = any($1)",
    [buckets],
  );
  if (restantes[0].total > 0) {
    throw new Error(
      `Ainda há ${restantes[0].total} arquivo(s) nos buckets da aplicação depois de esvaziar.`,
    );
  }
  return rows.length;
}

const SQL_DO_HISTORICO = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
truncate supabase_migrations.schema_migrations;`;

async function principal() {
  const configuracao = carregarConfiguracao();
  const esquemas = configuracao.esquemasDaAplicacao;
  for (const esquema of esquemas) {
    if (!/^[a-z_][a-z0-9_]*$/.test(esquema)) {
      throw new Error(
        `Nome de schema inválido em config/banco-dev.json: ${esquema}`,
      );
    }
  }
  const buckets = configuracao.bucketsDaAplicacao ?? [];
  for (const bucket of buckets) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(bucket)) {
      throw new Error(
        `Nome de bucket inválido em config/banco-dev.json: ${bucket}`,
      );
    }
  }
  const migracoes = listarMigracoes();
  const { cliente, descricao, local, ref } = await conectar();
  console.log(`Destino: ${descricao}`);
  try {
    await comTrava(cliente, async () => {
      const arquivos = await esvaziarBuckets(
        cliente,
        buckets,
        { local, ref },
        configuracao,
      );
      console.log(`Arquivos removidos dos buckets: ${arquivos}`);
      await cliente.query("begin");
      try {
        const { rows: antes } = await cliente.query(
          `select count(*)::int as total from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm')`,
          [esquemas],
        );
        for (const esquema of esquemas) {
          if (esquema === "public") await cliente.query(sqlDeLimpeza(esquema));
          else await cliente.query(`drop schema if exists ${esquema} cascade`);
        }
        const usuarios = await cliente.query("delete from auth.users");
        await cliente.query(SQL_DO_HISTORICO);
        for (const migracao of migracoes) {
          await cliente.query(migracao.sql);
          await cliente.query(
            "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, array[$3])",
            [migracao.versao, migracao.nome, migracao.sql],
          );
        }
        const temSeed = existsSync(ARQUIVO_DE_SEED);
        if (temSeed) await cliente.query(readFileSync(ARQUIVO_DE_SEED, "utf8"));
        await cliente.query("commit");
        console.log(`Tabelas e views removidas: ${antes[0].total}`);
        console.log(`Usuários de teste removidos: ${usuarios.rowCount}`);
        console.log(
          `Migrações aplicadas (${migracoes.length}): ${migracoes.map((m) => m.arquivo).join(", ") || "nenhuma"}`,
        );
        console.log(`Seed: ${temSeed ? "aplicado" : "sem seed.sql"}`);
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      }
    });
    console.log("Reset concluído.");
  } finally {
    await cliente.end();
  }
}

principal().catch((erro) => {
  console.error(`Reset falhou: ${mensagemSegura(erro)}`);
  process.exitCode = /Destino recusado|Tire o sslmode/.test(String(erro))
    ? 2
    : 1;
});
