# Testes de banco e reset

**Base:** I0.5 do plano orquestrado; ADR-0001 §3.3 e §4.

## Comandos

| Comando                    | O que faz                                                                                                                            | Onde roda                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `npm run db:reset`         | remove os objetos da aplicação, apaga os usuários de teste, zera o histórico e reaplica `supabase/migrations/` e `supabase/seed.sql` | projeto de desenvolvimento ou banco local do CI |
| `npm run test:db`          | roda os `supabase/tests/database/*.test.sql` (pgTAP) e falha se algum não passar ou se não houver teste                              | idem                                            |
| `npm run test:integration` | testes de `tests/integration/` contra a API e o banco                                                                                | idem                                            |

Os três leem `.env` ou `.env.local` (ver `docs/ambiente.md`).

## Trava de destino

Antes de conectar, `scripts/lib/destino.mjs` confere o destino:

- só aceita banco local ou o projeto listado em `config/banco-dev.json`;
- exige que `SUPABASE_PROJECT_REF` bata com a `SUPABASE_DB_URL`;
- recusa `sslmode` na URL, porque ele anularia a verificação do certificado.

Destino recusado sai com código 2. Nenhum outro projeto é tocado, em hipótese alguma.

## Uma execução por vez

O projeto de desenvolvimento é um só para todos os agentes. Reset e testes pegam o mesmo advisory lock; uma segunda execução espera até 60 s e depois falha com mensagem clara. Só o T2 roda testes de banco no projeto de desenvolvimento. O `test:integration` ainda não pega a trava: hoje ele só lê. Quando os testes de integração passarem a gravar dados (Inc. 1), a preparação global deles passa a pegar a mesma trava.

## Convenções

- **Migrações** não abrem nem fecham transação (sem `BEGIN`/`COMMIT`): o reset aplica todas numa transação só e desfaz tudo se uma falhar.
- **Nome de migração:** `<versão>_<nome>.sql`, versão numérica (`npx supabase migration new <nome>`).
- **Teste pgTAP:** `begin; select plan(n); ...; select * from finish(); rollback;`. Sem plano, plano não cumprido ou erro de SQL contam como falha.
- **Objetos fora do `public`** que o reset não remove (políticas em `storage.objects`, buckets, jobs do `pg_cron`): a migração que os cria precisa ser reaplicável (`drop policy if exists`, `on conflict do nothing`, `cron.unschedule`) ou o reset passa a removê-los. Decidir na I2.4, antes do primeiro bucket.

## Verificação de mutação (gate 3)

Todo teste negativo de política (RLS, Storage) precisa falhar quando a política é removida. Procedimento, só no projeto de desenvolvimento:

1. Rodar `npm run test:db` e confirmar que o teste passa.
2. Numa migração temporária, ou direto numa sessão de teste dentro de transação, remover ou afrouxar a política correspondente (`drop policy ...`).
3. Rodar `npm run db:reset` e `npm run test:db` e confirmar que **o teste falha**.
4. Desfazer a mudança, rodar o reset de novo e confirmar que o teste volta a passar.
5. Registrar a verificação no `docs/workflow/current-task.md` (teste, política, resultado nos dois sentidos).

Teste que passa com e sem a política não conta como evidência.
