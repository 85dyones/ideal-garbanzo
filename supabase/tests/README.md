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

O projeto de desenvolvimento é um só para todos os agentes. Reset, testes de banco e testes de integração pegam o mesmo advisory lock; uma segunda execução espera até 60 s e depois falha com mensagem clara. Só o T2 roda testes de banco no projeto de desenvolvimento. Desde o Inc. 1 o `test:integration` grava dados: a preparação global (`tests/integration/preparacao-global.ts`) pega a trava numa conexão própria antes do primeiro teste e a solta no encerramento da suíte. Os dados da integração ficam no banco até o próximo reset (usuários com auditoria não podem ser apagados; ADR-0002 §2.8), com e-mails `@repasse-teste.invalid` e um sufixo por execução.

## Convenções

- **Migrações** não abrem nem fecham transação (sem `BEGIN`/`COMMIT`): o reset aplica todas numa transação só e desfaz tudo se uma falhar.
- **Nome de migração:** `<versão>_<nome>.sql`, versão numérica (`npx supabase migration new <nome>`).
- **Teste pgTAP:** `begin; select plan(n); ...; select * from finish(); rollback;`. Sem plano, plano não cumprido ou erro de SQL contam como falha.
- **Schemas da aplicação:** `config/banco-dev.json` → `esquemasDaAplicacao`. O `public` tem os objetos removidos (os grants padrão ficam); os demais (`private`) são removidos com `drop schema ... cascade`, o que leva junto as políticas do Storage e os gatilhos em `auth.users` que dependem deles.
- **Objetos fora desses schemas** (buckets, políticas em `storage.objects` sem dependência do `private`, jobs do `pg_cron`): a migração que os cria precisa ser reaplicável (`insert ... on conflict (id) do update`, `drop policy if exists`, `cron.unschedule`). Decidido na I1.3 (ADR-0002 §2.14).
- **Buckets da aplicação:** `config/banco-dev.json` → `bucketsDaAplicacao`. O reset apaga os arquivos pela API do Storage antes de limpar o banco, com `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` do mesmo destino do banco (a trava recusa outro projeto). Apagar `storage.objects` por SQL deixaria o arquivo órfão, e o Supabase recusa.
- **Atuar como usuário:** o papel `postgres` ignora a RLS. Asserção de acesso roda com `set local role authenticated` e `request.jwt.claims` com o `sub`; a fixture de administrador está no `100-identidade-estrutura.test.sql` (ADR-0002 §3).
- **Gatilho de proteção desligado dentro do teste (exceção):** sempre com `alter table ... disable trigger`, só dentro da transação do arquivo e desfeito no rollback. O `ALTER TABLE` trava a tabela até o fim da transação, por isso esses testes rodam um de cada vez, como os demais (ACH-I2.10-10). Há dois usos, e só eles:
  - **chegar a um estado que só existe pelo banco** (validade vencida antes da rodada da expiração, `sold` no Inc. 2): o `310`, o `380` e o teste de integração `ofertas-transicoes` desligam `offers_proteger`, gravam o estado como `postgres` e religam o gatilho **antes** das asserções;
  - **isolar uma camada**, para que a política ou o CHECK tenha negativo próprio, sem o gatilho recusar antes: o `120`, o `130`, o `140`, o `320`, o `380`, o `400`, o `410` e o `420` fazem as asserções com o gatilho desligado e o religam logo depois. O caso de contraste continua com a camada ligada.

  Fora desses usos, nenhum teste desliga gatilho de proteção, e uma mutação que desliga gatilho é afrouxamento, não preparação.

- **Claims sempre definidas:** toda asserção com papel trocado (`anon`, `authenticated`, `service_role`) roda com `request.jwt.claims` definidas, como o PostgREST faz, e as claims são limpas ao voltar a `postgres`. O `tests/pgtap-claims.test.ts`, no `npm test`, recusa o arquivo que quebrar essa regra e documenta as convenções de linha que ele entende (R4 da I1.7).

## Verificação de mutação (gate 3)

Todo teste negativo de política (RLS, Storage, gatilho de proteção) precisa falhar quando a regra é afrouxada. Com a RLS ligada, **remover** uma política permissiva faz o banco negar tudo: o teste negativo continua passando e não prova nada. Por isso a mutação **afrouxa** (ADR-0002 §3):

- predicado `true` na política, condição tirada da função auxiliar do `private`, GRANT ampliado ou gatilho de proteção desligado;
- todo teste negativo tem um caso de contraste, o acesso legítimo que precisa continuar funcionando;
- uma camada de cada vez (servidor ou banco).

Procedimento, só no projeto de desenvolvimento:

1. Rodar `npm run test:db` e confirmar que o teste passa.
2. Numa migração temporária, afrouxar a regra correspondente.
3. Rodar `npm run db:reset` e `npm run test:db` e confirmar que **o teste negativo falha** e o de contraste continua passando.
4. Desfazer a mudança, rodar o reset de novo e confirmar que o teste volta a passar.
5. Registrar a verificação no `docs/workflow/current-task.md` (teste, regra afrouxada, resultado nos dois sentidos).
6. Desde o Inc. 2, a lista de cada ciclo fica versionada em `supabase/tests/mutacoes/`, com o SQL de cada mutação (R6 do ADR-0002). Nesse ciclo, a mutação entra logo depois do `set constraints all immediate;` de uma cópia do arquivo de teste e é desfeita no rollback do próprio teste, sem migração temporária nem reset.

Teste que passa com e sem a regra não conta como evidência.
