# Tarefa atual

**Etapa:** Inc. 2 (oferta) em andamento. O Inc. 1 foi concluído em 28/10, com o gate cumprido, o ADR-0002 aceito e a I1.8 fechada; a R6 fica para este incremento, e a R7 para a I6.9.  
**Próxima subtarefa:**
- **I2.9 (T1):** telas administrativas das ofertas: lista, revisão (com a D10 ligada), devolução com motivo, suspensão com categoria e motivo e reativação, sobre as operações da I2.6. Depois, a revisão independente (I2.10, T3).

**Painéis do Auth:** configurados em 28/10 (veja a entrada "configuração do Auth nos painéis"). O captcha fica para o Inc. 6.

> **Repositório público:** este registro não traz segredos, dados pessoais nem detalhes internos ou de segurança de outros negócios. O registro completo fica em `notas-privadas/`, fora do Git.

## Registro

- Perfil/modelo principal:
- Subagentes e perfis utilizados:
- Fallback informado pelo gateway (com evidência):
- Testes executados e resultados:
- Critérios ainda pendentes:
- Escalonamentos e motivo:

## Histórico

<!-- Uma entrada por subtarefa concluída: data, ID, resultado, evidência. -->

### 2026-10-22 · P1 · concluída

- Repositório local na `main`, commit inicial com os documentos, `.gitignore` testado com `git check-ignore` (`.env*` ignorados; `.env.example` versionável). Remoto `origin` configurado. Identidade do Git configurada só neste repositório.

### 2026-10-26 · Missão 001 · diagnóstico

- T2 com um subagente T0 (leitura) e um de pesquisa web. Amostras do T0 conferidas pelo T2.
- Entrega: `docs/diagnostico/2026-10-26-missao-001.md` (versão pública).
- Direção da pessoa responsável: o repasse é uma operação separada; produto único, à parte.

### 2026-10-26 · Especificação v1.1 e plano v2

- D1 a D4 aprovadas. `docs/especificacao/especificacao-v1.1.md` escrita e aprovada; plano orquestrado v2 com incrementos 0 a 6.
- Conferido: os 6 estados documentais, as 5 origens da informação, a ciência versionada, os 16 itens do MVP e os 13 critérios de aceite do briefing estão cobertos; os 13 testes negativos da §7.4 têm incremento responsável.

### 2026-10-26 · I0.1 e I0.2

- I0.1 executada pelo T2 (o T0 não roda comandos): Node 24.22.1, npm 11.19.1, Git 2.55; sem Supabase CLI, Docker, `psql`, Vercel CLI e `gh`.
- I0.2: `docs/adr/0001-fundacao.md`.

### 2026-10-26 · I0.4 · concluída e integrada

- `builder` (T1) em worktree isolado.
  - Primeira tentativa: handoff correto, porque o ESLint 10 não fecha com os plugins do `eslint-config-next`. O T2 decidiu pelo ESLint 9.39.5.
  - Segunda tentativa: esqueleto Next 16, TypeScript 6.0.3, Tailwind 4, Vitest 5 e teste de linguagem proibida.
- Verificação do T2 a partir de `npm ci` limpo:
  - 0 `ERESOLVE`; `npm ls`, `lint`, `typecheck`, `test` (44), `format:check` e `build` com saída 0;
  - prova de falha do teste de linguagem proibida refeita.
- Integração por fast-forward. Risco aceito no ADR: ESLint 9 marcado como sem suporte.

### 2026-10-26 a 27 · D1 · infraestrutura

- 26/10: revista para servidor próprio com Easypanel. 27/10: **decisão final**, Supabase Cloud e Vercel, sem Docker local; a `main` gera previews e a produção sai da branch `producao`. As subtarefas I0.12 e I0.13 foram canceladas.
- Limites da automação nesta sessão: a integração da Vercel não cria projetos (403) nem lê a branch de produção; push exige ação ou liberação da pessoa responsável.

### 2026-10-27 · I0.9 · concluída (exceto variáveis do Supabase)

- Projeto `ideal-garbanzo` na Vercel, criado pela pessoa responsável; Next.js, Node 24.x.
- Primeiro deploy saiu como produção: a branch de produção ainda era a `main`. Com a proteção "Standard", o domínio de produção `.vercel.app` ficou público por alguns minutos (só a página de construção, sem dados). O T2 ligou a autenticação da Vercel em todos os deploys (`ssoProtection: all`) e trocou a região das funções para `gru1`.
- A pessoa responsável criou a branch `producao` e a definiu como branch de produção.
- Resultado verificado: push na `main` gera preview (`target: null`), em `gru1`; produção só a partir da `producao`. Endereços testados sem login: todos redirecionam para o login da Vercel.

### 2026-10-27 · I0.3, I0.7 e I0.8

- **I0.3 (pessoa responsável):** um único projeto Supabase, `gtbncxvaghjfmzcypgul`, no plano gratuito, para `dev` e homologação. A integração desta sessão não tem acesso a ele; região e status não conferidos.
- **I0.7 (T2):** `.env.example` (cinco nomes, sem valores) e `docs/ambiente.md`. Produção sem variáveis do Supabase até o Inc. 6.
- **I0.8 (T2, parcial):** `.github/workflows/ci.yml` com os jobs `qualidade` e `build`; comandos verdes localmente; YAML validado pelo Prettier.

### 2026-10-27 · Primeiro CI no GitHub

- Push da `main` feito pela pessoa responsável.
- **CI:** os jobs "Lint, tipos, testes e formatação" e "Build do Next" terminaram com `success`.
- **Vercel:** o deploy da `main` saiu como preview; a produção continua na `producao`.
- **Repositório:** `ideal-garbanzo` é público, por decisão da pessoa responsável. Por isso, os documentos foram revisados em 27/10 para tirar detalhes internos e de segurança de outros negócios. Um achado de segurança fora do escopo do repasse foi registrado em `notas-privadas/` e tratado com a pessoa responsável.

### 2026-10-27 · I0.11 · bloqueada: credenciais do projeto errado

- A pessoa responsável colocou um `.env` na raiz, ignorado pelo Git.
- **Conferência sem exibir valores:** as cinco variáveis estão preenchidas e as chaves são do formato novo. Mas a URL, a conexão do banco e o identificador apontam para **um projeto Supabase de outro negócio, em produção**, não para o `gtbncxvaghjfmzcypgul`. Detalhes em `notas-privadas/`.
- **O T2 parou antes de qualquer conexão:** nenhuma chamada à API, nenhuma conexão ao banco, nenhum reset.
- **Outros problemas do arquivo:**
  - nome da variável repetido na linha da URL;
  - conexão direta em vez do pooler;
  - senha com caracteres que precisam de codificação na URL.
- **Pendente (H):** substituir os valores pelos do `gtbncxvaghjfmzcypgul`, seguindo `docs/ambiente.md`.
- **Segunda conferência (27/10), depois da troca:**
  - URL pública e `SUPABASE_PROJECT_REF`: corretas (`gtbncxvaghjfmzcypgul`);
  - API: `/auth/v1/health` deu 401 sem chave e **200 com a chave publicável**, então URL e chave publicável são válidas. `/rest/v1/` deu 401 com a chave publicável, o que é esperado para a raiz da API com chave publicável;
  - **ainda com problema:** a `SUPABASE_SECRET_KEY` é idêntica à chave publicável, e a `SUPABASE_DB_URL` usa a conexão direta, com senha não codificada (URL inválida);
  - **DNS:** o host direto `db.gtbncxvaghjfmzcypgul.supabase.co` só resolve em IPv6. O pooler é obrigatório, inclusive para o CI.
  - Nenhuma conexão ao banco foi feita.
- **Terceira conferência (27/10):**
  - `SUPABASE_DB_URL` válida (senha codificada), mas ainda na conexão direta, com usuário `postgres` e sem `sslmode`. A `SUPABASE_SECRET_KEY` continua idêntica à chave publicável.
  - TCP por IPv6 até a porta 5432 do host direto: conecta, a partir desta máquina.
  - Consulta de leitura com `pg` 8.23.1 instalado numa pasta temporária, fora do projeto, com TLS verificado: falhou com `SELF_SIGNED_CERT_IN_CHAIN`. O certificado do banco é assinado pela CA própria do Supabase.
  - Uma segunda tentativa, sem verificar o certificado, foi barrada pelo classificador de permissões e não foi feita. Decisão: nunca desligar a verificação; usar o certificado de CA do Supabase.
- **Pendente (H):**
  - colocar a chave `sb_secret_…` na `SUPABASE_SECRET_KEY`;
  - trocar a `SUPABASE_DB_URL` pela do pooler (Session pooler, com `?sslmode=require`), necessária para IPv4 e para o CI;
  - baixar o certificado de CA do projeto (Project Settings → Database → SSL Configuration → Download certificate).

### 2026-10-27 · I0.11 · concluída

- **Certificado:** a pessoa responsável colocou `prod-ca-2021.crt` na raiz. Conferido com `X509Certificate`: "Supabase Root 2021 CA", autoassinado, CA, válido até 26/04/2031. Ainda não versionado; o lugar definitivo é decidido na I0.5.
- **`.env`:**
  - URL e `SUPABASE_PROJECT_REF` em `gtbncxvaghjfmzcypgul`;
  - chave publicável `sb_publishable_` e chave secreta `sb_secret_`, diferentes entre si;
  - `SUPABASE_DB_URL` no pooler (Session, porta 5432), usuário `postgres.gtbncxvaghjfmzcypgul`, sem `sslmode` na URL (o TLS é configurado pelo cliente, com a CA).
- **API:** a raiz REST deu 401 com a chave publicável e 200 com a secreta.
- **Banco:** conexão pelo pooler com TLS verificado pela CA do Supabase (`pg` 8.23.1, numa pasta temporária fora do projeto), dentro de `begin read only`:
  - Postgres 17.11;
  - 0 tabelas no `public`;
  - schemas `auth` e `storage` presentes;
  - `pgtap` e `pg_cron` disponíveis, não instaladas.
- **Achado:** o host do pooler é de `us-east-1`. O projeto foi criado nos EUA, e não em `sa-east-1` como previa o ADR-0001, enquanto as funções da Vercel estão em `gru1`.
  - Opções: recriar o projeto em `sa-east-1` agora, enquanto está vazio, ou mover as funções para `iad1`, perto do banco.
  - A decisão é da pessoa responsável.

### 2026-10-27 · Projeto Supabase recriado em `sa-east-1`

- A pessoa responsável recriou o projeto em `sa-east-1` e atualizou o `.env`. O projeto novo é `ralmlmuewullugeqtgoz`.
- **Conferência sem exibir valores:**
  - URL e chaves do projeto novo (`sb_publishable_` e `sb_secret_`, diferentes entre si);
  - `SUPABASE_DB_URL` no pooler `aws-1-sa-east-1.pooler.supabase.com`, porta 5432, usuário `postgres.ralmlmuewullugeqtgoz`.
  - O `SUPABASE_PROJECT_REF` ainda tinha o identificador antigo. O T2 corrigiu só essa linha, que não é segredo, com `sed`, sem ler o arquivo.
- **API:** `auth` deu 401 sem chave e 200 com a publicável; a raiz REST deu 401 com a publicável e 200 com a secreta.
- **Banco:** conexão pelo pooler com TLS verificado pela mesma CA (`prod-ca-2021.crt`), dentro de `begin read only`, em 276 ms (contra 1.487 ms no projeto de `us-east-1`). Postgres 17.11, `public` vazio, `auth` e `storage` presentes, `pgtap` e `pg_cron` disponíveis.
- O identificador antigo foi trocado pelo novo em `CLAUDE.md`, ADR-0001, `docs/ambiente.md` e plano. No histórico acima, o antigo fica como registro.
- `docs/ambiente.md`: a `SUPABASE_DB_URL` vai **sem** `sslmode`, porque o parâmetro na URL se sobrepõe à configuração de TLS do cliente e descarta a CA.
- O projeto antigo (`us-east-1`) fica a critério da pessoa responsável (pausar ou excluir); não tem dados do repasse.

### 2026-10-27 · I0.5 · concluída (job de banco no CI aguarda a primeira execução)

- **Perfil/modelo:** T2, Claude Opus 5.5. Sem subagentes, porque o banco de desenvolvimento é compartilhado.
- **Dependências** (versão exata): `supabase` 2.122.0 (CLI; binário em pacotes opcionais, sem script de instalação e sem `allowScripts`), `pg` 8.23.1, `@types/pg` 8.23.1. `npm install` sem `ERESOLVE`.
- **`npx supabase init`:** `supabase/config.toml` com `project_id = "repasse"` e Postgres 17. O certificado de CA foi para `supabase/certs/prod-ca-2021.crt`, versionado por ser público.
- **Entregas:**
  - `config/banco-dev.json` lista os destinos permitidos;
  - `scripts/lib/` contém ambiente, trava de destino, conexão com TLS e advisory lock, e leitor TAP;
  - `scripts/db-reset.mjs`, `scripts/testes-de-banco.mjs` e `scripts/ci-ambiente-supabase.mjs`;
  - `supabase/tests/database/000-fundacao.test.sql` e `supabase/tests/README.md`;
  - `vitest.integration.config.mts` e `tests/integration/`;
  - testes unitários `tests/banco-destino.test.ts` e `tests/tap.test.ts`;
  - scripts `db:reset`, `test:db` e `test:integration`;
  - job `banco` no `ci.yml`.
- **Verificação no projeto de desenvolvimento:**
  - lint, typecheck, `npm test` (60 testes) e `format:check`: saída 0;
  - trava de destino com URL falsa de outro projeto e com host qualquer: recusado, saída 2, sem conectar;
  - `db:reset` e `test:db`: ok (6 testes);
  - migração temporária (tabela, enum, função, view): aplicada e registrada; depois de removida, o reset tirou tudo e zerou o histórico, e os grants do `public` se mantiveram. A migração temporária não foi versionada;
  - runner contra testes ruins: `not ok`, plano não cumprido e erro de SQL deram FALHA (saída 1); pasta sem testes: saída 1;
  - `test:integration`: 3 testes ok. Sem a URL ou com destino estranho, a suíte **falha** com a mensagem explícita ("Variáveis ausentes" ou "Destino recusado");
  - advisory lock: com outro processo segurando a trava por 12 s, o `test:db` esperou e terminou depois da liberação;
  - `ci-ambiente-supabase.mjs` testado com status falso de nomes novos e antigos (ok) e incompleto (saída 1).
- **Não verificado:** o job `banco` no GitHub Actions (sem Docker local). Depende do push.

### 2026-10-27 · I0.8 · concluída; I0.5 confirmada no CI

- Push do `3139113` feito pela pessoa responsável.
- **CI** (execução 40596166065): os jobs "Lint, tipos, testes e formatação", "Build do Next" e **"Banco (Supabase efêmero, pgTAP e integração)"** terminaram com `success`.
- **Passos do job `banco`, todos `success`:**
  - `supabase start` (111 s);
  - exportação das variáveis;
  - `db:reset`, `test:db` e `test:integration`;
  - `supabase stop`.
- O log detalhado do job exige login no GitHub (HTTP 403 sem autenticação); o resultado vem das conclusões dos passos. Os scripts saem com erro quando há falha ou quando falta teste.
- **Vercel:** preview do `3139113` `READY` (`target: null`).

### 2026-10-27 · I0.6 · concluída

- **Perfil/modelo:** T2, Claude Opus 5.5. Em paralelo, a I0.10 com o `builder`.
- **Migração `supabase/migrations/20261027224325_base_auditoria.sql`**, criada com `npx supabase migration new`:
  - `audit_logs`, `field_history` e `restricted_access_logs` só de inclusão, com o gatilho genérico `impedir_alteracao_de_registro()` (UPDATE e DELETE por linha, TRUNCATE por comando);
  - `platform_settings` **vazia**, sem valor comercial inventado (gate 7);
  - RLS ligado nas quatro;
  - todos os privilégios de `anon` e `authenticated` revogados (as políticas de leitura entram no Inc. 1). O `service_role` só lê e insere nas tabelas só de inclusão;
  - campos de ator sem chave estrangeira até a `profiles` existir (I1.3).
- **Testes:** `supabase/tests/database/010-base-auditoria.test.sql`, com 29 asserções. `db:reset` aplicou a migração, e `test:db` passou (6 + 29).
- **Verificação de mutação (gate 3)**, com a migração alterada só temporariamente:
  - M1, sem o gatilho em `audit_logs`: "UPDATE recusado" e "DELETE recusado" falharam;
  - M2, sem revogar `anon` e `authenticated`: as 7 checagens de acesso falharam;
  - M3, sem RLS em `audit_logs`: "RLS ligado em audit_logs" falhou.
  - A migração foi restaurada (`cmp` idêntico), e o reset seguido dos testes voltou a passar.
- Lint, typecheck, `npm test` e `format:check`: saída 0.

### 2026-10-27 · I0.10 · concluída

- `builder` (T1) em worktree isolado, criado a partir do `98fb330`. Entregou o `README.md` (commit `a1a75f9`, integrado na `main` por cherry-pick como `175ac60`). O builder conferiu links, comandos, linguagem proibida e ausência de valores com um script próprio.
- **Verificação do T2:**
  - leitura completa;
  - varredura de dados sensíveis: nada;
  - **seguindo o README num clone limpo:** `npm ci` (0 `ERESOLVE`), `.env.local` a partir do modelo, `lint`, `typecheck`, `test`, `format:check` e `build` com saída 0;
  - `npm run dev` pelo painel de pré-visualização (`.claude/launch.json`): página "Repasse de veículos / Plataforma em construção." e `GET / 200`.
- **Achado do builder, procedente:** o `test:integration` não pega o advisory lock. Hoje ele só lê. Registrado em `supabase/tests/README.md` para o Inc. 1, quando os testes passarem a gravar dados.
- **Gate do Inc. 0:**
  - app local e em homologação (preview protegido): ok;
  - CI verde: ok, no `3139113`;
  - teste de banco executando migração: ok no projeto de desenvolvimento, e o CI com a migração da I0.6 depende do push;
  - nenhum deploy público: ok.

### 2026-10-27 · Inc. 0 · concluído

- Push do `100575f` feito pela pessoa responsável.
- **CI** (execução 40598516010): "Lint, tipos, testes e formatação", "Build do Next" e "Banco (Supabase efêmero, pgTAP e integração)" com `success`. No job `banco`, todos os passos deram `success`: `supabase start` (100 s) já aplica a migração da I0.6, depois `db:reset`, `test:db` e `test:integration`.
- **Vercel:** preview do `100575f` `READY` (`target: null`). Sem login, preview, alias da `main` e domínio de produção respondem 302.
- **Gate do Inc. 0 cumprido:**
  - app local e em homologação;
  - CI verde;
  - teste de banco executando migração, no projeto de desenvolvimento e no CI;
  - nenhum deploy público.

### 2026-10-28 · I1.1 · concluída

- `fast-helper` (T0), só leitura: tabela de decisão com 64 regras (D01 a D64), casos de teste em texto para os testes 1, 2 (parte de empresa), 4, 5 e 13, e 35 ambiguidades (A1 a A35).
- Conferência do T2:
  - citações da especificação conferidas por amostra (§1.4, §3, §5.1, §6.1, §6.2, §6.12, §6.13, §7.4, §9, §12): batem;
  - três afirmações técnicas confirmadas (`service_role` ignora a RLS; o usuário edita o próprio `user_metadata`; a ação referencial de chave estrangeira dispara os gatilhos de linha da tabela que referencia).
- **Achado procedente do T0 (A31):** com a RLS negando por padrão, remover a política não derruba o teste negativo. A verificação de mutação passa a afrouxar a política, com caso de contraste em todo teste (ADR-0002 §3).

### 2026-10-28 · I1.2 · entregue (aceite na I1.7)

- `docs/adr/0002-identidade.md`, com a tabela da I1.1 resolvida no anexo A. Decisões principais:
  - autorização lida do banco a cada consulta, nunca de claim do token;
  - funções auxiliares `security definer` no schema `private`, fora da API;
  - suspensão em três camadas (banco, servidor, bloqueio no Auth), com o banco como fonte da verdade;
  - adesão aprovada cria empresa e vínculo num gatilho, na mesma transação;
  - escrita pelo servidor com a sessão do usuário; `service_role` só para a API administrativa do Auth, o registro de acesso restrito e os testes;
  - configuração crítica por padrão; operador lê só as não críticas;
  - CNPJ alfanumérico aceito (IN RFB 2.229/2024, nas fontes consultadas), a conferir na documentação oficial na I1.3.
- O ADR antecipa a decisão de Storage e reset da I2.4 para a I1.3, porque o primeiro bucket (evidência da adesão) entra no Inc. 1.
- Plano ajustado: escopo e arquivos da I1.3; caminho dos testes da I1.4 (`supabase/tests/database/1*.test.sql`, porque o runner não lê subpastas); I2.4 segue a convenção do ADR-0002.
- Perguntas à pessoa responsável: Q1 e Q2 (ADR-0002 §6).
- **Respostas em 28/10:** Q1, o convite do administrador da empresa basta, sem aprovação da plataforma (o vínculo fica ativo com o aceite do convidado); Q2, o operador prepara a revisão (lê pedidos e move para `under_review`), e o administrador decide. ADR atualizado (§2.5, §2.6, §2.9, §2.12, §5, §6, §7 e anexo A, com D26d e CT4.10).

### 2026-10-28 · I1.3 · entregue (revisão na I1.7)

- Três migrações:
  - `20261028140000_identidade`: schema `private`, CNPJ, 7 tabelas, funções de autorização, gatilhos de proteção, adesão atômica, perfil pelo Auth, RLS e grants por coluna;
  - `20261028140100_auditoria_da_identidade`: auditoria por gatilho, chaves estrangeiras de ator nas tabelas da I0.6, `platform_settings` com `is_critical`, histórico e leitura por papel;
  - `20261028140200_evidencia_da_adesao`: bucket privado `membership-evidence` e políticas do Storage, reaplicáveis.
- Decisões de implementação, registradas no ADR:
  - a conferência da adesão fica em `membership_application_reviews`, porque a RLS filtra linhas e não colunas;
  - a evidência é do mesmo pedido por chave estrangeira composta;
  - as funções de conjunto substituem a `vinculo_ativo`;
  - a escrita interna é liberada por `pg_trigger_depth() > 1`, sem chave estrangeira em cascata;
  - o primeiro administrador entra por SQL sem sessão, só sem administrador ativo;
  - o `service_role` só lê as tabelas de identidade e perdeu a escrita em `platform_settings`.
- CNPJ alfanumérico conferido nas perguntas e respostas da Receita e no manual de cálculo do DV; o teste usa o exemplo oficial `12ABC34501DE35`.
- Reset: `private` em `esquemasDaAplicacao`; `bucketsDaAplicacao` esvaziado pela API do Storage, com trava de destino também na URL da API (`verificarApiDoDestino`, com teste unitário).
- Teste de contraste (T2, transação desfeita no projeto de desenvolvimento): 47 casos negativos e de acesso legítimo, todos como esperados. A I1.4 transforma esses casos em pgTAP com mutação.
- Evidência:
  - `db:reset` aplicou as 4 migrações duas vezes, a segunda com o bucket já criado e um arquivo enviado pela API ("Arquivos removidos dos buckets: 1");
  - `test:db`: 000 (6), 010 (29, com as quatro leituras de `authenticated` trocadas de "sem permissão" para "0 linhas") e 100 (34) passaram;
  - `lint`, `typecheck`, `npm test` (62), `format:check` e `test:integration` (3) passaram.
- Não conferido: os avisos de segurança do Supabase (o conector recusou acesso ao projeto) e o job de banco do CI, que roda no próximo push.

### 2026-10-28 · I1.4 · entregue (revisão na I1.7)

- Despachada ao `builder` (T1) em worktree a partir do commit das dependências, com escopo sem operações de servidor (essas ficaram com a I1.5) e sem acesso ao banco. A entrega veio em commit local na branch do worktree e foi trazida para a árvore de trabalho sem commit.
- Entrega:
  - nove arquivos pgTAP: `110-adesao`, `120-revisao`, `130-papeis-da-plataforma`, `140-membros`, `150-perfil-e-empresa`, `160-suspensao`, `170-isolamento-e-catalogo`, `180-configuracao` e `190-auditoria`, com 380 asserções. Cada recusa confere o errcode e a mensagem da camada que recusa; cada negativo tem contraste;
  - três arquivos de integração contra a API real: `identidade-metadado` (CT4.6, papel em `user_metadata`), `identidade-suspensao` (CT5.1, CT5.4, D40b e `request_id`) e `identidade-evidencia` (políticas do Storage);
  - a preparação global da integração passa a segurar a trava do reset durante a suíte (`adquirirTrava` e `liberarTrava` em `scripts/lib/banco.mjs`, sem mudar o comportamento do `comTrava`).
- O builder validou fora do projeto, num Postgres embutido com stubs do Supabase, e rodou 113 mutações.
- Validação pelo T2 no projeto de desenvolvimento:
  - `test:db` passou nos três estados: com os dados da integração, depois do `db:reset` (caminho do primeiro administrador) e depois de duas rodadas de integração. São 12 arquivos e 449 asserções;
  - `test:integration` passou: 47 testes em 5 arquivos;
  - lint, tipos, formatação e testes unitários passaram.
- Verificação de mutação da camada de banco (gate 3):
  - Como foi feita: o T2 reaplicou no dev as 113 mutações do builder. Cada mutação entrou na transação do próprio arquivo de teste, e o `rollback` do arquivo a desfez, então o banco nunca ficou afrouxado. O `test:db` depois confirmou o banco intacto.
  - Resultado: 110 mutações foram detectadas, com as mesmas asserções que no harness. As 4 divergências não mudam o resultado: três são só o texto da asserção, reescrito depois do harness; uma é uma asserção a mais em cascata, porque o dev já tinha outros administradores.
  - As 3 não detectadas, também no harness: o WITH CHECK do UPDATE de `platform_staff` e de `organization_members`, que repete o USING, e a política de INSERT do pedido, que repete o gatilho. O ADR registra as três no anexo A, com a mutação que conta.
- Achados registrados no ADR-0002:
  - CT4.7: pela API, o GRANT recusa antes; o gatilho é testado contornando o GRANT;
  - mutações literais do anexo A que não derrubam o teste;
  - leitura da própria situação pelo suspenso (§2.9);
  - claims sempre definidas no pgTAP (§3).
- Pendentes da I1.6: CT1.1 e CT1.4 pela página e D47 pela URL.

### 2026-10-28 · I1.5 · entregue (revisão na I1.7)

- Dependências fixadas antes de abrir as frentes paralelas (commit próprio): `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7 e `zod` 4.6.7 (tabela do ADR-0001 §1.3), mais `server-only` 0.0.1.
- Operações de servidor, todas com a mesma moldura (`src/modules/auth/server/operacao.ts`): carregam o contexto do usuário do banco a cada chamada (sessão validada no Auth, status do perfil, papel e vínculos), validam o payload com esquema Zod estrito e gravam com a sessão do usuário, com `x-request-id` e, quando há, `x-audit-reason`. O resultado é sempre previsível (`src/lib/operacao/resultado.ts`).
  - `membership`: enviar pedido; mover para análise (administrador ou operador); gravar conferência; enviar evidência (assinatura do arquivo conferida, sha256 no servidor); decidir; URL temporária da evidência com registro em `restricted_access_logs` antes de devolver.
  - `organizations`: suspender, reativar e encerrar empresa; alterar nome e contatos; convidar, aceitar ou recusar convite, suspender, reativar, remover, cancelar convite e trocar papel.
  - `auth`: suspender e reativar perfil (banco primeiro, bloqueio no Auth depois, `falha_parcial` se o Auth falhar); alterar o próprio nome e telefone; conceder e revogar papel; liberar a leitura da auditoria; alterar configuração.
  - `audit`: rastreio por cabeçalho e registro de acesso restrito.
  - `src/lib/supabase/servidor.ts` (`server-only`) monta as dependências a partir dos cookies; as operações recebem as dependências prontas e rodam fora do Next nos testes.
- Sonda na API real do projeto de desenvolvimento, que confirmou:
  - o Auth aceita e-mail `.invalid`;
  - sem `x-audit-reason`, a suspensão é recusada; com ele, `x-request-id` e o motivo acentuado (enviado em bytes UTF-8) chegam íntegros a `audit_logs`;
  - com o bloqueio no Auth, `getUser` e novo login respondem `user_banned`, mas o token anterior continua aceito pelo PostgREST: quem barra é o banco.
- ADR-0002 atualizado: quarto uso da chave secreta (ler o perfil pelo e-mail no convite, depois da checagem do servidor), codificação do motivo e o comportamento do bloqueio no Auth.
- Testes:
  - unitários (`src/**`): CNPJ (exemplo oficial alfanumérico), assinatura de arquivo, esquemas estritos, permissões, tradução de erros e rastreio;
  - integração (`tests/integration/operacoes/`, 24 casos): o fluxo da adesão até a empresa, membros, suspensão com o token antigo (CT5.2, CT5.2b sem o bloqueio do Auth, CT5.4), papel por `user_metadata` (CT4.6), configuração pelo operador (CT13.3) e empresa alheia pelo id (CT2.5). Cada negativo confere que o servidor recusou antes de abrir a tabela-alvo ou a chave secreta, com contraste do acesso legítimo.
- Verificação de mutação da camada de servidor (T2; uma checagem afrouxada por vez, banco intacto; arquivo restaurado depois de cada execução):

  | Mutação | Caso derrubado |
  |---|---|
  | esquema do pedido sem `strict` | CT4.4 (e mais 15 em cascata: o pedido gravado muda o estado do fluxo) |
  | configuração sem checagem de administrador | CT13.3 |
  | convite sem checagem de gestão, antes da chave secreta | CT2.5 |
  | contexto sem o status do perfil no banco | CT5.2b |
  | contexto sem o tratamento do bloqueio do Auth | CT5.2 |
  | decisão sem checagem de administrador | CT4.5 |
  | gestão de membro sem checagem | D28 e CT5.4 |
  | status do perfil sem checagem de administrador | D41 |
  | concessão de papel sem checagem de administrador | CT4.6 |
  | URL da evidência sem checagem de administrador | URL temporária |
  | conferência sem checagem de administrador | D10 |

  Sem mutação, os 24 passam. A camada de banco foi conferida com as mutações da I1.4 (entrada acima).
- Não conferido: os avisos de segurança do Supabase (o conector continua sem acesso ao projeto) e o job de banco do CI, que roda no próximo push. A tela que monta as dependências pelos cookies (`criarDependencias`) só é exercitada na I1.6.

### 2026-10-28 · I1.6 · entregue (revisão na I1.7)

- **Decisões da pessoa responsável (28/10):**
  - e-mail do Auth pela Hostinger, com caixa provisória de outro negócio dela. Isso é exceção registrada à §4.5 da especificação, válida só em `dev` e homologação até o Inc. 6 (ADR-0002 §2.8; plano, I6.1; detalhes em `notas-privadas/`);
  - limite de tentativas com os contadores no próprio Postgres do repasse, sem provedor novo.
- **Telas:** despachadas ao `builder` (T1) em worktree a partir de `9beb1fc`. Inclui:
  - autenticação com `@supabase/ssr`, proxy e `/auth/confirmar`;
  - início, pedido de adesão, empresa e membros;
  - páginas provisórias do comprador para o teste 1;
  - administração de adesões, empresas e usuários;
  - E2E com Playwright.

  Leitura só com a sessão do usuário, escrita só pelas operações da I1.5, checagem em cada página. Turnstile pelo captcha do Supabase Auth.
- **Limite de tentativas (T2, fora do worktree):**
  - migração `20261028180000_limite_de_tentativas` e `src/lib/operacao/limite-de-tentativas.ts`, com o novo código `limite_excedido`;
  - aplicado no convite de membro e no pedido de adesão; nas ações de autenticação entra depois da integração das telas;
  - ADR-0002 §2.16 e quinto uso da chave secreta em §2.12.
- **Evidência:**
  - `db:reset` aplicou as 5 migrações;
  - `test:db` passou: 13 arquivos, com o novo `200-limite-de-tentativas` (17 asserções);
  - mutação de banco no dev, com cada mutação na transação do teste: as 5 foram detectadas (execute e tabela para `authenticated`, contador que nunca estoura, janela vencida mantida, chave em claro aceita);
  - integração das operações: 27 casos, 3 deles novos de limite, com contraste;
  - mutação de servidor: as 3 foram detectadas (sem o limite no convite, sem o limite no pedido, limite falhando aberto).
- **Marca (28/10):** a pessoa responsável definiu a marca da plataforma: EntrePátios, com a assinatura "O repasse que conecta pátios". Ela está registrada em `docs/marca.md`, com grafia, regras de texto e onde aparece. O CLAUDE.md e o README citam a marca. O builder recebeu a marca durante a I1.6 para o título, a apresentação e os cabeçalhos. Os identificadores técnicos não mudam.
- **Entrega do builder:** commit `85e0687` na branch do worktree, trazida para a árvore de trabalho sem commit.
  - Telas públicas: apresentação com a marca, entrar, cadastro, recuperação, nova senha e `/auth/confirmar`.
  - Telas logadas: início (situação, convites, empresas e pedidos), pedido de adesão, empresa e membros.
  - Comprador provisório, para o teste 1.
  - Administração: adesões (conferência, evidência, URL temporária e decisão), empresas e usuários.
  - Proxy do Next 16, que só renova a sessão e manda o anônimo ao login.
  - Checagem de acesso em cada página e layout (`verificarAcesso`), com leitura só pela sessão do usuário e escrita só pelas operações da I1.5.
  - E2E com Playwright 1.64.1, com 6 testes.
- **Revisão do T2:** proxy, retorno do Auth, ações de autenticação, validação do `proximo`, origem da URL de retorno e checagem de acesso. Nenhuma página protegida deixa de chamar a checagem, e a chave secreta não aparece em `src/`.
- **Ajustes do T2:**
  - limite de tentativas nas ações de entrar, cadastro e recuperação, contado por e-mail e, à parte, por IP (ADR-0002 §2.16);
  - `serverActions.bodySizeLimit` de 11 MB no `next.config.ts`, para a evidência de até 10 MB;
  - a data da conferência dentro da tolerância de relógio vira o instante do servidor, para o banco não recusar.
- **Evidência no projeto de desenvolvimento:**
  - lint, tipos, formatação, 148 testes unitários e build passaram;
  - `test:db`: 13 arquivos passaram;
  - `test:integration`: 50 testes em 5 arquivos passaram;
  - `test:e2e`: 6 passaram, entre eles CT1.1 e CT1.4 ("Sem permissão" igual para qualquer id), CT1.3 por amostra, o contraste do comprador e o fluxo completo da adesão pelas telas.
- **Mutação da camada de telas (teste 1):** com a checagem da área do comprador afrouxada no layout e nas páginas, o CT1.1 falhou. Os arquivos foram restaurados.
- **Conferência no navegador** (painel do app, servidor local, usuários de teste criados na sessão):
  - a apresentação mostra a marca;
  - o login cai no início;
  - o painel de adesões lista os pedidos, e a página do pedido mostra dados, conferência, evidência e decisão;
  - "Mover para análise" grava, e o requerente vê "Em análise";
  - id inexistente mostra "Registro inexistente" para a equipe;
  - o requerente vê "Sem permissão" na administração e no comprador;
  - o layout de celular (375 px) não tem rolagem horizontal.
- **Configurações pendentes da pessoa responsável** (feitas em 28/10, menos o captcha; veja a entrada seguinte):
  - **Supabase, Authentication:**
    - Site URL;
    - Redirect URLs: `http://localhost:3000/**` e o padrão dos previews da Vercel;
    - modelos de e-mail apontando para `/auth/confirmar?token_hash={{ .TokenHash }}&type=...` (signup, invite, recovery e email_change);
    - confirmação de e-mail ligada;
    - SMTP da Hostinger;
    - captcha Turnstile.

    Com o captcha ligado no projeto de desenvolvimento, o login dos testes de integração e do E2E falha. Fica para decidir junto com o widget.
  - **Cloudflare:** widget Turnstile próprio do repasse; a chave do site vai em `NEXT_PUBLIC_TURNSTILE_SITE_KEY` na Vercel.
- **Fora desta entrega:** configuração e auditoria (telas), termos e privacidade, edição do próprio perfil na tela, paginação das listas da administração (até 200 itens) e logotipo.

### 2026-10-28 · I1.6 · configuração do Auth nos painéis

- **Feito pelo T2 no navegador do app, com o login e a senha da caixa a cargo da pessoa responsável.** Projeto `ralmlmuewullugeqtgoz`. Valores e motivos estão em `docs/ambiente.md` §5.
- **Site URL:** já estava `http://localhost:3000`; não mudou.
- **Redirect URLs:** `http://localhost:3000/**` e o padrão dos previews do `ideal-garbanzo` na Vercel. O padrão não aceita previews de outros projetos do mesmo time.
- **Confirmação de e-mail:** já estava ligada (`mailer_autoconfirm: false` na API pública de configurações do Auth, antes e depois).
- **SMTP:**
  - SMTP próprio ligado: Hostinger (`smtp.hostinger.com`, porta 465), remetente "EntrePátios";
  - a caixa provisória e a senha foram preenchidas pela pessoa responsável;
  - limite do Supabase: 30 e-mails por hora e 60 segundos entre envios para a mesma pessoa.
- **Modelos:** confirmação de cadastro, convite, recuperação de senha e troca de e-mail.
  - O conteúdo foi copiado de `supabase/templates/` (novo).
  - Depois de recarregar o painel, cada um mostra o assunto em português e o link para `/auth/confirmar`.
  - Magic link e reautenticação ficaram no padrão.
- **Turnstile:** não foi criado.
  - A conta do Cloudflare disponível é de outro negócio, e a exceção à §4.5 cobre só a caixa de e-mail.
  - Decisão da pessoa responsável: criar no Inc. 6, numa conta própria do repasse, e ligar o captcha só no `repasse-prod`. Isso entrou no ADR-0002 §2.16 e na I6.1.
  - Em `dev`, o captcha fica desligado, e o login dos testes continua funcionando.
- **Teste de ponta a ponta:** a pessoa responsável fez um cadastro em `localhost:3000/cadastro`, com um endereço próprio. O e-mail chegou pela caixa provisória, e o link levou ao início, já logado. O banco confirma, sem exibir o endereço:
  - confirmação enviada no mesmo instante do cadastro;
  - e-mail confirmado 42 s depois;
  - entrada registrada;
  - perfil `active`.
  
  A conta é dado de teste de `dev` e sai no próximo reset. Recuperação e convite não foram testados com e-mail real.
- **Ponto para a I1.7:** pré-abertura de links por provedores de e-mail, que consome o token (`docs/ambiente.md` §5).

### 2026-10-28 · I1.7 · revisão independente recebida (integração pelo T2)

- **Relatório:** revisor T3 externo, sobre o commit `b6530dc` (diff desde `59c73b4`).
  - Veredito: "aprovado com ressalvas", sem achado crítico nem alto.
  - Ele rodou tipos, lint, formatação, unitários, `test:db`, integração e build, todos passando. O E2E ficou bloqueado, porque faltava o navegador na máquina do revisor.
- **Conferência do T2:**
  - **Números:** o total de pgTAP do relatório (446) é erro de soma. As linhas do próprio relatório somam 466, igual à soma dos `plan()` dos 13 arquivos.
  - **Código:** entre `2560dbf` e `b6530dc` só mudaram documentos e modelos de e-mail.
  - **E2E:** o T2 rodou o E2E sobre o `b6530dc`, no dev, e os 6 testes passaram, entre eles CT1.1, CT1.3 (amostra), CT1.4 e o fluxo da adesão. Isso cobre o que o revisor não conseguiu rodar.
- **ACH-I1.7-01 (média, IP pelo `x-forwarded-for`): não procede na Vercel.**
  - A documentação da Vercel ("Request headers") diz que ela sobrescreve o `x-forwarded-for` e não repassa IPs externos, para impedir falsificação. Ela também diz que `x-real-ip` e `x-vercel-forwarded-for` são idênticos ao `x-forwarded-for`.
  - Trocar a ordem dos cabeçalhos não acrescenta proteção na Vercel. Fora dela, daria peso a um cabeçalho que o próprio cliente envia.
  - Isso fecha o ponto que o ADR-0002 §2.16 deixou para a I1.7.
  - Resta um caso: se um proxy for posto na frente da Vercel, todos os visitantes passam a contar pelo IP do proxy. Reavaliar se isso acontecer no Inc. 6.
- **ACH-I1.7-02 (baixa, reconvite em dois UPDATEs): procede.**
  - Em `membros.ts`, o reconvite volta o vínculo para `pending` e depois troca o papel.
  - Se a segunda escrita falhar, o convite fica reaberto com o papel anterior, e a operação devolve erro em vez de `falha_parcial`.
  - Fica como pendência; não bloqueia o gate.
- **ACH-I1.7-03 (informativo, redundância entre política e gatilho):** mantida como defesa em profundidade.
- **Pontos pedidos para a I1.7 que o relatório não cobre:**
  - **`private.manutencao()` e claims no pgTAP (ADR-0002 §3):** a validade dos testes de RLS depende de todo bloco definir as claims. A segurança depende de essa saída não ser alcançável pela API.
  - **Mutações não detectáveis do anexo A.**
  - **Pré-abertura dos links de e-mail** (`docs/ambiente.md` §5).
- **Complemento T3:** a pessoa responsável pediu, e o T2 despachou o `reasoning-review`, só leitura, só nesses três pontos e sem acesso ao banco.
  - Resultado: sem achado crítico nem alto.
  - **Média:** a pré-abertura dos links consome o token e confirma o cadastro sem ação humana. Junto com o convite ligado ao perfil existente, isso permite receber convite para um e-mail alheio.
  - **Baixa:**
    - parâmetro repetido no link de confirmação, que permitiria login na conta de quem atacou;
    - blocos pgTAP sem claims em `010` e `110`.
  - **Informativas:**
    - `manutencao()` usa lista de exclusão e vale para escritas da API do Auth, embora hoje nenhum gatilho dessa cadeia a chame;
    - motivos imprecisos no anexo A;
    - cuidados de produção.
- **Conferência do T2:** confirmou no código os usos de `manutencao()`, os blocos sem claims, a primeira ocorrência em `lerConfirmacao` e o convite ligado ao perfil pelo e-mail.
- **Gate do Inc. 1 cumprido**, porque o critério é "T3 sem crítico aberto". Por decisão da pessoa responsável, ele foi fechado depois do complemento.
  - O ADR-0002 foi aceito, e as ressalvas R1 a R7 estão na §8.
  - Os textos do §3 e do anexo A foram corrigidos.
  - A I1.8 entrou no plano para R1 a R5, e a R7 entrou na I6.9.
- **Arquivo do relatório externo:** `relatorio-auditoria-i1.7.md` ficou fora do Git, porque tem links com caminhos locais.

### 2026-10-28 · I1.8 · R2, parâmetro repetido no link de confirmação

- **Correção:** `lerConfirmacao` (`src/app/_apoio/confirmacao.ts`) devolve `invalido` em dois casos:
  - quando `token_hash`, `type`, `code` ou `proximo` aparecem mais de uma vez;
  - quando `code` e `token_hash` vêm juntos.

  Assim, um `token_hash` posto na URL de retorno não passa na frente do token do e-mail. A rota leva o link recusado para `/entrar?aviso=link-invalido`, como os outros links inválidos.
- **Testes:** 4 casos novos em `confirmacao.test.ts`:
  - o contraste: o link montado pelo modelo a partir da URL de retorno continua valendo;
  - o ataque descrito pelo T3;
  - cada parâmetro repetido, inclusive `token%5Fhash`;
  - código e token juntos.
- **Mutação:**
  - sem a recusa, os 3 negativos falham e o contraste passa;
  - sem só a regra de código e token, sem `proximo` na lista ou sem `type` na lista, cai o negativo correspondente;
  - o arquivo foi restaurado depois de cada mutação.
- **Evidência:**
  - lint e tipos passaram;
  - 152 testes unitários em 23 arquivos passaram;
  - a formatação só acusa o relatório externo, que está fora do Git;
  - no navegador do app, o link do ataque caiu em `/entrar?aviso=link-invalido`.

### 2026-10-28 · I1.8 · R1, página com botão na confirmação e convite a conta existente

- **Página com botão:**
  - A rota `src/app/auth/confirmar/route.ts`, que usava o token já no GET, saiu.
  - No lugar dela, entrou a página `src/app/(publico)/auth/confirmar/page.tsx`. Ela só mostra título, texto e botão por tipo de link, com o aviso "nada é confirmado sem o clique no botão".
  - O token é usado pela ação `src/app/_acoes/confirmacao.ts`, que lê e valida de novo o formulário com a mesma regra da R2. Os parâmetros repetidos são preservados por `parametrosDaPagina` e `parametrosDoFormulario`.
- **Cabeçalhos:**
  - `Cache-Control` `no-store`, porque a página é dinâmica;
  - `Referrer-Policy: same-origin`, definido em `next.config.ts`. A T3 sugeriu `no-referrer`, mas com ele o navegador manda `Origin: null` no POST, e o Next recusaria a ação do botão.
- **Convite (reavaliação):** `convidarMembro` só se liga a uma conta existente se o e-mail dela foi confirmado ou se ela nasceu de um convite do Auth.
  - A conta de cadastro sem confirmação recebe a mesma recusa genérica da conta suspensa.
  - O ADR-0002 §2.6 e §2.12 foram atualizados.
- **Testes novos:**
  - 2 unitários em `confirmacao.test.ts`;
  - 1 de integração em `operacoes/identidade.test.ts`, que usa `generateLink` para criar a conta convidada sem mandar e-mail;
  - 2 E2E em `confirmacao.spec.mts`. O link é aberto duas vezes fora do navegador, sem clique, e o botão ainda confirma e leva a `/nova-senha`. O mesmo link, confirmado de novo, dá o aviso fixo. O link com token repetido vai direto para o aviso.
- **Mutação:**
  - com a página usando o token ao abrir, o E2E da R1 caiu em "link inválido";
  - sem a checagem da conta, o teste de integração do convite falhou;
  - os arquivos foram restaurados e conferidos com `cmp`.
- **Evidência no dev:**
  - lint e tipos passaram;
  - 154 testes unitários passaram;
  - o build passou, com `/auth/confirmar` dinâmica;
  - `test:integration`: 51 testes passaram;
  - `test:e2e`: 8 passaram.
- **Nova ressalva R8 (a conferir):** cadastro prévio com e-mail alheio. A hipótese, pelo comportamento conhecido do Auth, é que a senha do primeiro cadastro continua depois de a pessoa dona do e-mail confirmar. Não foi testado, porque o teste manda e-mail e precisa de um endereço controlado pela pessoa responsável. Está registrada no ADR-0002 §8.

### 2026-10-28 · I1.8 · R3, R4 e R5

- **Migração `20261028210000_ressalvas_da_revisao`:**
  - **R5:** `private.manutencao()` passa a usar uma lista permitida de sessões, a nova `private.sessao_de_manutencao`, com `postgres` e `supabase_admin`.
    - Ela também exige `pg_trigger_depth() = 1`, além de continuar exigindo usuário e claims vazios. O comentário foi corrigido.
    - A sessão real dos scripts do T2 no dev foi conferida: `postgres`, sem superusuário. Os outros logins do projeto são `authenticator`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin` e os de replicação, ETL e leitura.
  - **R3:** `public.reconvidar_membro(p_vinculo, p_email, p_papel)`.
    - É `security invoker`, com execução só para `authenticated`.
    - Faz o reconvite e a troca de papel numa chamada só, e recusa com P0001 quando a linha não está removida ou fora do alcance da RLS.
    - `convidarMembro` passou a chamar a função.
- **R4:**
  - claims nos blocos de `010-base-auditoria` (`anon`, um usuário real sem papel e `service_role`) e de `110-adesao` (`anon`), limpas ao voltar a `postgres`;
  - checagem automática `tests/pgtap-claims.test.ts`, no `npm test`. Com as versões antigas dos dois arquivos, ela acusou as mesmas 11 linhas listadas pelo T3; com as novas, nenhuma;
  - convenção registrada em `supabase/tests/README.md`.
- **Testes:**
  - `210-manutencao` (11), com os chamadores fixos, a lista de sessões, o nível de gatilho, as claims e o contraste;
  - 7 casos de R3 no `140-membros`, agora com 69 testes: falha na troca não grava nada, `member` recusado, sucesso com papel novo, linha não removida e `anon`;
  - 1 de integração do reconvite com papel novo.
- **Mutação**, dentro da transação do próprio arquivo, desfeita no rollback:
  - lista de exclusão no lugar da permitida: caem os 3 testes de sessão;
  - sem o nível de gatilho: cai o teste de nível 0;
  - reconvite que engole a falha da troca: caem os 2 de atomicidade e os seguintes;
  - reconvite sem conferir a linha: caem o de `member` e o de linha não removida.

  Os contrastes passaram, e o `test:db` confirmou o banco intacto depois.
- **Evidência no dev**, depois de `db:reset` com as 6 migrações:
  - `test:db`: 14 arquivos e 484 asserções passaram;
  - `test:integration`: 52 passaram;
  - `test:e2e`: 8 passaram;
  - lint, tipos, 156 testes unitários e build passaram.
- O reset apagou os dados de teste do dev, inclusive a conta do teste de cadastro da pessoa responsável.

### 2026-10-28 · I1.8 · R8 confirmada (cadastro prévio com e-mail alheio)

- **Teste no `dev`:** a pessoa responsável fez os cadastros pelas telas, com um endereço próprio. O T2 fotografou a conta no banco sem exibir e-mail, senha nem hash; a impressão digital do hash ficou no scratchpad, e só a comparação foi exibida.
  - O segundo cadastro com o mesmo endereço e outra senha mostrou a mensagem normal, não criou conta e só reenviou a confirmação. A senha e o nome continuaram os do primeiro cadastro.
  - Depois da confirmação pelo dono, a senha 2 foi recusada e a senha 1 entrou, com duas sessões abertas na mesma conta.
  - Detalhes no ADR-0002 §8.
- **Tentativas descartadas:**
  - uma conta foi confirmada por engano antes do segundo cadastro;
  - um segundo cadastro usou outro apelido do mesmo endereço e criou outra conta.

  As fotos dessas tentativas ficaram à parte no scratchpad.
- **Opções de correção** (decisão da pessoa responsável):
  1. **Senha só depois da confirmação** (recomendada).
     - O cadastro pede só nome e e-mail. O servidor cria a conta com uma senha aleatória que ninguém vê.
     - Na confirmação do cadastro, a ação do botão troca a senha da conta por outra aleatória e encerra as outras sessões. Assim, a senha de quem tenha se cadastrado antes pela API deixa de valer naquele instante. Só depois a pessoa vai para `/nova-senha` e escolhe a própria.
     - Custo: o cadastro muda de forma, e a chave secreta passa a ter mais um uso, só no servidor.
  2. **Fechar o cadastro público do Auth.** Nesse caso, as contas nascem pelo servidor, com convite do Auth, e a senha é definida pelo dono do e-mail no link.
     - Fecha também o cadastro direto pela API.
     - Custo: muda mais coisas, porque pede outro modelo de e-mail e o controle de abuso todo no servidor.
  3. **Aceitar o risco até o Inc. 6** e decidir lá.

### 2026-10-28 · I1.8 · R8 corrigida (senha só depois da confirmação)

- **Decisão da pessoa responsável:** opção 1. O cadastro pede só nome e e-mail, a confirmação troca a senha por outra aleatória e encerra as outras sessões, e a senha é criada em `/nova-senha`.
- **Implementação:**
  - `src/modules/auth/server/cadastro.ts`, com `senhaAleatoria` e `concluirConfirmacaoDoCadastro`. A troca é feita com a sessão da confirmação, então a chave secreta não ganhou uso novo;
  - o cadastro deixou de pedir senha, e o retorno vai para `/nova-senha`;
  - a ação do botão conclui a confirmação nos tipos `signup` e `email`. Se falhar, encerra todas as sessões e mostra o aviso `cadastro-incompleto` em `/entrar`;
  - `definirNovaSenhaAcao` encerra as outras sessões;
  - os textos do cadastro e da confirmação foram ajustados.
- **Sondas no `dev`** (domínio `.invalid`, sem e-mail):
  - `generateLink` do tipo `signup` para conta sem confirmação devolve o token e não troca a senha, o que reproduz a R8 pela API;
  - a troca de senha pela própria sessão encerra as outras sessões no Auth (`refresh_token_not_found`), com controle sem troca.
- **Testes:**
  - integração `operacoes/cadastro.test.ts` (2), com o contraste da falha e a correção com a corrida de quem cadastrou antes;
  - 3 E2E em `confirmacao.spec.mts`.
- **Mutação:**
  - detectadas: sem a troca de senha na conclusão, e sem chamar a conclusão na confirmação;
  - equivalentes: sem o encerramento explícito das sessões, porque o Auth já encerra. A chamada fica como segunda camada.

  Os arquivos foram restaurados e conferidos.
- **Evidência no dev:**
  - lint, tipos, 156 unitários e build passaram;
  - `test:integration`: 54 passaram;
  - `test:e2e`: 11 passaram;
  - no navegador do app, `/cadastro` mostra só nome e e-mail.
- **Pendente:** a pessoa responsável sai da conta do teste da R8, que ficou com duas sessões, no outro navegador. As contas de teste do `dev` saem no próximo reset.

### 2026-10-28 · I2.1 · entregue (regras da oferta)

- **Extração:** o `fast-helper` (T0) trabalhou só em leitura, sem abrir segredos.
- **Entrega:** anexo A do `docs/adr/0003-oferta.md`, que é um rascunho; as decisões entram na I2.2. O anexo traz:
  - 17 transições (T01 a T17), com autor, pré-condições, efeitos e base;
  - 15 transições proibidas (X01 a X15);
  - os requisitos de publicação e o que não bloqueia;
  - os campos materiais;
  - as regras de preço, validade, disponibilidade e suspensão;
  - os casos dos testes 2 (CT2.7 a CT2.15), 6 (CT6.1 a CT6.7), 11 (CT11.1 a CT11.7) e 12 (CT12.1 a CT12.9), com contraste e mutação;
  - 32 ambiguidades (B1 a B32), com a sugestão mais conservadora. As que dependem da §13: B1, B2 e B32 (D10); B7 (C2); B20 (C1 a C4); B21 (D5); B27 (D9).
- **Inventário do porte:** em `notas-privadas/i2.1-inventario-privado.md`, com seis padrões e arquivo e linha no projeto interno; no ADR, só o resumo genérico (A.8). O T0 corrigiu o diagnóstico (o CHECK de completude está em outra migração) e achou um gatilho de pares permitidos que o diagnóstico não citava.
- **Conferência do T2:**
  - citações da especificação: §3.3, a tabela e os requisitos da §6.2, a §6.7, a §6.9, a §6.10, a §7.4 e as colunas da §5.2 batem;
  - inventário: três referências conferidas por amostra no projeto interno, todas batendo.
- **Observação do T0:** ao abrir o diagnóstico privado, o ambiente carregou sozinho uma cópia antiga do `CLAUDE.md` guardada em `notas-privadas/originais-2026-10-27/`. O T0 não usou o conteúdo.

### 2026-10-29 · I2.2 · entregue (decisões da oferta)

- **Entrega:** seções 1 a 7 do `docs/adr/0003-oferta.md`, com status "proposto". O ADR traz:
  - os estados, as transições (T01 a T19; T18 e T19 novas) e as proibições X16 a X19;
  - os requisitos de publicação numa função só, para o gatilho e para a tela;
  - a edição por estado;
  - a versão por comparação do snapshot, uma por transação, por gatilho adiado;
  - a estrutura do snapshot e o hash: JSON canônico, um subconjunto do JCS sem números, e SHA-256 no banco, com conferência independente em TS;
  - o histórico e a auditoria por gatilho;
  - a expiração pelo `pg_cron`, com o predicado de oferta aberta entre as rodadas;
  - a suspensão, com categoria fechada, e a reativação só pelo administrador;
  - os buckets e o download de documento só pelo servidor, com registro;
  - quem lê o quê, as operações e as chaves de configuração;
  - as respostas a B1 a B32.
- **Conferido no `dev` em 29/10:** o `pg_cron` 1.6.4 está disponível e ainda não foi ligado (Postgres 17.11), lido em `pg_available_extensions`. A conferência foi feita pelo T2 com um script só de leitura; o conector do Supabase recusou a listagem de extensões por falta de permissão.
- **Perguntas da seção 6, respondidas pela pessoa responsável em 29/10, todas pela sugestão:**
  - Q1: revisão antes de publicar ligada como valor provisório, e a edição de oferta publicada não volta à revisão;
  - Q2: o `member` prepara, e o `org_admin` publica e altera o que o comprador vê;
  - Q3: o staff age só pelas transições;
  - Q4: a identidade do veículo é material, e placa, RENAVAM e chassi ficam fixos depois da primeira publicação;
  - Q5: validade padrão de 15 dias e teto de 30.
- **Antecipado da I2.4:** nomes dos buckets, caminho dos objetos e regra de download dos documentos.
- **Corrigido no plano:** caminho dos testes da I2.7 (`supabase/tests/database/3*`).

### 2026-10-29 · I2.3 · entregue (migrações das ofertas)

- **Migrações:**
  - `20261029120000_ofertas`: `vehicles`, `offers`, `offer_versions`, `supplier_declarations`, `offer_media`, `offer_documents` e `offer_reviews`. Traz os gatilhos de transição (T01 a T19), os CHECKs por estado, a RLS, os GRANTs por coluna, o snapshot e o hash no banco, a versão por gatilho adiado, o histórico, a auditoria, as RPCs `criar_oferta`, `atualizar_oferta` e `pendencias_de_publicacao` e as cinco chaves de configuração;
  - `20261029120100_expiracao_das_ofertas`: `pg_cron` e o job `expirar-ofertas`, a cada 10 minutos.
- **Conferido na I2.3:**
  - **RENAVAM:** a Portaria DENATRAN 27/2013 define "módulo 11, peso 9"; a ordem dos pesos não está escrita e será conferida com RENAVAMs reais antes do piloto;
  - **pg_cron:** a documentação do Supabase manda ligar a extensão em `pg_catalog`;
  - **escape do JSON:** o do Postgres coincide com o `JSON.stringify` e com os hashes de referência calculados em Node.
- **Correções durante a subtarefa:**
  - **GRANTs no cron:** os GRANTs do schema `cron` que a documentação sugere quebravam o reset seguinte ("dependent privileges exist", vindo do gatilho de eventos do Supabase). Saíram da migração, e os GRANTs que o `postgres` tinha feito para ele mesmo foram removidos do `dev`, com o acesso dado pelo `supabase_admin` mantido;
  - **resposta igual:** os gatilhos de declaração, foto e documento passaram a responder "sem permissão" para oferta alheia e inexistente;
  - **lista fechada:** a edição sem mudança de status ganhou uma lista fechada de colunas, que segura um GRANT ampliado.
- **Testes:**
  - `db:reset` com 8 migrações, rodado duas vezes seguidas;
  - `test:db`: 18 arquivos e 711 asserções, todos passando. São novos o 300 (46), o 310 (70), o 320 (79) e o 330 (32); o 210 ganhou `proteger_oferta` entre os chamadores de `manutencao()`;
  - `npm test`: 156; lint e tipos passam;
  - `format:check` só acusa o `relatorio-auditoria-i1.7.md`, que está fora do Git;
  - o verificador de claims conhece os apoios novos (`oferta`, `enviar`, `publicar`, `documento` e `foto`).
- **Mutação (gate 3, R6):**
  - 29 mutações em `supabase/tests/mutacoes/inc-2.md`, com o SQL de cada uma;
  - todas derrubaram os casos esperados sem derrubar o contraste;
  - uma é equivalente: a política de UPDATE de `offers` sozinha, porque o UPDATE com WHERE aplica também a de SELECT;
  - na primeira rodada, duas mutações tiveram efeito em cascata. Dois passos de preparo do 310 viraram asserções, e os contrastes passaram a usar a oferta D.
- **Pendente:**
  - o CI ainda não rodou as migrações novas, que entram no próximo push;
  - o Storage (teste 6) fica para a I2.4;
  - o servidor e a comparação com `transicoes.ts` ficam para a I2.6 e a I2.7.

### 2026-10-29 · I2.4 · entregue (Storage das ofertas)

- **Migração `20261029140000_storage_das_ofertas`:**
  - **buckets:** `offer-photos` e `offer-documents`, privados, até 10 MiB, reaplicáveis e listados em `config/banco-dev.json`;
  - **envio:** só quem pode editar o conteúdo da oferta no estado atual, no caminho `<empresa>/<oferta>/<uuid>.<extensão>`;
  - **leitura:** das fotos, para a empresa dona e o staff. Os documentos não têm política de leitura;
  - **sem UPDATE nem DELETE;**
  - **gatilhos de foto e documento:** passaram a exigir o objeto no bucket, enviado pelo mesmo usuário.
- **Servidor (`src/modules/offers/storage/`):**
  - envio de foto e documento pela sessão, com a assinatura do arquivo conferida e o `sha256` calculado no servidor;
  - URL da foto pela sessão, por 10 minutos;
  - URL do documento só pelo servidor: lê pela sessão, confere de novo (membro ou staff), grava em `restricted_access_logs` e só então gera a URL com a chave secreta, por 60 segundos. Esse é o sexto uso da chave, registrado em `src/lib/operacao/dependencias.ts`.
- **Conferido na I2.4:**
  - **documentação do Supabase:** o envio exige só a política de INSERT, e o upsert exige também SELECT e UPDATE. O teste de integração confirmou que o documento sobe sem política de leitura;
  - **dono do objeto:** o Storage grava o dono em `storage.objects.owner_id`, como texto;
  - **DELETE direto:** o Supabase recusa DELETE direto em `storage.objects`, então a falta de política de DELETE só se prova pela API do Storage.
- **Testes:**
  - `test:db`: 19 arquivos, todos passando. O 340 é novo, com 30 asserções. O 320 e o 330 passaram a gravar o objeto no bucket antes da linha;
  - `test:integration`: 69 em 7 arquivos, com o `ofertas-storage` novo (15);
  - `npm test`: 156; lint, tipos e formatação passam, menos o relatório da I1.7, que está fora do Git.
- **Mutação:** 15, todas derrubando os casos esperados sem derrubar o contraste, registradas em `supabase/tests/mutacoes/inc-2.md`:
  - 10 de banco: S01 a S10;
  - 5 de integração: I01 a I05. Foram aplicadas no `dev` ou no código e desfeitas no fim. O `servidor.ts` voltou idêntico, conferido com `cmp`, e os buckets e as políticas voltaram ao estado da migração.
- **Pendente:**
  - **conferência do `sha256`:** conferir o conteúdo guardado contra o `sha256`, antes do piloto;
  - **CI:** o CI ainda não rodou as migrações do Inc. 2;
  - **comprador:** a leitura das fotos pelo comprador fica para o Inc. 4.

### 2026-10-29 · I2.5 · entregue (estado documental)

- **Migração `20261029160000_estado_documental`:**
  - **função única:** `private.estados_documentais_da_oferta` calcula estado e origem por categoria (§6.4 e §6.5). O snapshot e a RPC `public.estados_documentais` usam a mesma função; a saída do snapshot não mudou, e os hashes gravados continuam conferindo;
  - **precedência:** `private.precedencia_documental` traz a ordem da §6.4, e `private.estado_documental` escolhe o candidato de maior precedência. No Inc. 2, o único candidato é a declaração vigente;
  - **ressalvas:** `private.aviso_do_estado` dá os códigos das ressalvas, com o texto no catálogo do servidor.
- **Servidor (`src/modules/documental/`):**
  - **regras:** estados, rótulos, precedência, origens, rótulos das categorias e resumo proporcional;
  - **catálogo de ressalvas:** textos provisórios até a D5;
  - **operação:** `consultarEstadosDocumentais`.
- **Apoio dos testes:** a criação de empresa aprovada foi para `tests/integration/operacoes/apoio.ts` e é usada pelos testes do Storage e do estado documental.
- **Testes:**
  - `test:db`: 20 arquivos, todos passando; o 350 é novo, com 22 asserções;
  - `test:integration`: 72 em 8 arquivos; o `estado-documental` é novo, com 3 testes;
  - `npm test`: 165, com os 9 novos das regras e do catálogo;
  - lint, tipos e formatação passam, menos o relatório da I1.7, que está fora do Git.
- **Mutação:** 6 mutações (D01 a D06), todas derrubando os casos esperados sem derrubar o contraste, em `supabase/tests/mutacoes/inc-2.md`.
- **Pendente:**
  - **documento e categoria:** a ligação entre documento anexado e categoria não existe no modelo da §5.2 e fica para o Inc. 3;
  - **textos das ressalvas:** precisam de revisão com a D5 antes do piloto.

### 2026-10-29 · I2.6 · entregue (operações de servidor da oferta)

- **Regras (`src/modules/offers/rules/`):**
  - **`transicoes.ts`:** a tabela da ADR-0003 §2.3, com quem faz cada transição, o motivo por ator e as condições da D10 e da validade. `atorDaOferta` classifica a sessão em relação à empresa dona, com o conflito de interesse da B25;
  - **`edicao.ts`:** quem edita o conteúdo e quem confirma a disponibilidade em cada estado (§2.5 e §2.9);
  - **`veiculo.ts` e `oferta.ts`:** placa, RENAVAM e chassi, UFs, preço, categorias da suspensão, validade até 23:59:59 de Brasília e rótulos das pendências;
  - **`snapshot.ts`:** o JSON canônico e o hash da §2.7, fora do banco.
- **Operações:**
  - **`server/ofertas.ts`:** criar, alterar (inclusive a validade), declarar, consultar as pendências e confirmar a disponibilidade;
  - **`server/transicoes.ts`:** publicar ou enviar à revisão conforme a D10, cancelar o envio, revisar (publicar ou devolver com motivo), reservar, liberar, retirar, reabrir, suspender e reativar;
  - **`storage/servidor.ts`:** remover e reordenar foto;
  - **como recusam:** sem papel para a ação, "sem permissão"; com papel, mas no estado errado, regra violada. O servidor confere antes de escrever, e o banco decide de novo;
  - **esquemas estritos:** os textos seguem os CHECKs do banco (`textoDeLinha` e `textoLivre` em `src/lib/operacao/campos.ts`).
- **Defeitos corrigidos na migração da I2.3,** que ainda não saiu do repositório local, com reset do `dev`:
  - **nova suspensão:** a oferta reativada não podia ser suspensa de novo com a mesma categoria, porque o gatilho exigia a categoria entre as colunas alteradas. Agora basta a categoria preenchida. Duas asserções novas no 310;
  - **veículo da publicada:** com o token do `org_admin`, uma chamada direta à API apagava um dado obrigatório do veículo de uma oferta publicada ou reservada, e a oferta continuava publicada (conferido numa transação desfeita). O gatilho `proteger_veiculo` passou a recusar, com a mesma lista das pendências de publicação, agora numa função só (`private.dados_do_veiculo_faltando`). Três asserções novas no 320 e um teste novo na integração.
- **Testes:**
  - `test:db`: 20 arquivos, todos passando; o 310 passou de 70 para 72 asserções, e o 320, de 79 para 82;
  - `test:integration`: 103 em 10 arquivos. São novos o `ofertas-transicoes` (3), que compara o banco e o servidor em 1.792 tentativas de transição e 256 de edição, e o `ofertas-operacoes` (28);
  - `npm test`: 195, com os 30 novos das regras e dos esquemas;
  - lint, tipos e formatação passam, menos o relatório da I1.7, que está fora do Git.
- **Mutação:** 14 (O01 a O14), todas derrubando os casos esperados sem derrubar o contraste, em `supabase/tests/mutacoes/inc-2.md`:
  - 5 no banco do `dev`, com as funções restauradas e conferidas por `pg_get_functiondef`;
  - 7 no código, com os arquivos restaurados e conferidos com `cmp`;
  - 2 no pgTAP, sobre as duas correções.
- **Pendente:**
  - **D10 desligada pelo servidor:** a publicação direta (T06) foi conferida no banco, pela comparação, mas não pela operação, porque mudar a configuração do `dev` afetaria a homologação;
  - **CI:** o CI ainda não rodou as migrações do Inc. 2.

### 2026-10-29 · I2.7 · entregue (testes da oferta)

- **Despacho:** subagente `builder` (T1), em worktree isolado, com o modelo padrão da instalação (os modelos dos subagentes ainda não estão configurados). Nenhum fallback informado. O worktree nasceu num commit antigo (`100575f`), e o builder o alinhou ao `6e4bf01` com `git reset --keep`, sem perda.
- **Divisão:** o builder escreveu os testes e rodou `npm test`, lint, tipos e formatação; o T2 rodou os pgTAP contra o banco, conferiu o conteúdo, fez as mutações e integrou.
- **Entrega:**
  - **`src/modules/offers/rules/transicoes.decisao.test.ts`** (22 testes): a tabela da ADR-0003 §2.3 como dados no próprio teste, comparada com o servidor em 1.536 combinações, mais os proibidos nomeados e as tabelas de edição e disponibilidade;
  - **`360-ofertas-so-inclusao`** (99 asserções): teste 11 sistemático nas quatro tabelas só de inclusão e nas linhas de histórico e auditoria da oferta, para o dono, o administrador, `service_role` e `postgres`;
  - **`370-ofertas-versionamento`** (32 asserções): versão só em campo material, coluna a coluna, e uma versão por transação.
- **Testes:** os dois pgTAP passaram na primeira rodada contra o banco; `npm test` com 217.
- **Mutação:** 11 (V01 a V11), todas derrubando os casos esperados sem derrubar o contraste, em `supabase/tests/mutacoes/inc-2.md`.
- **Pendente:** a asserção do CT11.5 lista as chaves estrangeiras atuais para `offers` e `vehicles` e precisa de atualização no Inc. 3.

### 2026-10-29 · I2.8 · entregue (telas do fornecedor)

- **Despacho:** subagente `builder` (T1), em worktree isolado, com o modelo padrão da instalação; nenhum fallback informado. O worktree também nasceu no `100575f` e foi avançado ao `6e4bf01` (`git merge --ff-only`) antes de qualquer mudança. Revisão visual por um subagente `vision-review` (TV), com 20 capturas.
- **Entrega do builder:**
  - **rotas** em `src/app/(conta)/empresa/[empresaId]/ofertas/`: painel com filtro, nova oferta, resumo e envio, as etapas veículo, fotos, condições, declarações e documentos, e o histórico (versões, revisões e alterações por campo). Cada página com carregamento, sem permissão e registro inexistente;
  - **leituras** pela sessão em `src/modules/offers/queries/`; onde reaproveitam operações, recebem dependências cuja chave secreta lança erro. Só abrir documento usa a chave, pelo caminho da ADR-0003 §2.13;
  - **ações** em `src/app/_acoes/ofertas.ts`, com preço no formato brasileiro e validade em data;
  - **e2e** `tests/e2e/ofertas.spec.mts`, com 4 testes.
- **Feito pelo T2 na integração:**
  - **`declararCategorias`:** gravar as dez declarações gerava dez versões e dez recargas de contexto. A operação nova grava todas numa inclusão só, com uma versão só, e nada se uma for recusada. O fluxo completo do e2e caiu de 45 s para 27 s;
  - **texto da autorização** em forma neutra: "Declaro ter autorização para divulgar esta oferta.";
  - **achados do TV:** nenhum crítico e nenhum termo proibido. Dos 6 importantes, todos corrigidos: o que bloqueia o envio ganhou tom próprio e link para a etapa; a retirada foi para "Outras ações", no fim; a categoria sem declaração aparece destacada, com a declaração vigente legível; o aviso de que documento não se apaga ficou junto do envio, em tom de alerta; o histórico deixou de se contradizer ("Alterações de campos"). Também corrigidos alguns menores ("Todas" no filtro, textos de fotos e retirada, "avisos documentais" no resumo das versões, link de volta no histórico).
- **Testes:**
  - `test:db`: 22 arquivos, todos passando;
  - `test:integration`: 104 em 10 arquivos, com o teste novo da declaração em lote;
  - `npm test`: 248; lint, tipos e build passam;
  - e2e das ofertas: 4 passando, rodado três vezes (entrega, depois da declaração em lote e depois dos ajustes do TV).
- **Mutação:** esconder o aviso documental no resumo derruba o fluxo completo do e2e; com o código restaurado (conferido com `cmp`), ele volta a passar. As telas não decidem permissão: toda checagem fica nas operações e no banco, já cobertos pelas mutações das I2.3 a I2.7.
- **Pendente:**
  - **achados menores do TV não tratados:** cor de link visitado no cabeçalho, título repetido nas etapas veículo e condições, quilometragem gravada sem separador de milhar, "Status" na tela da empresa e "Situação" nas ofertas, alvo de toque dos rádios abaixo de 44 px e o resumo das versões em parágrafo corrido;
  - **capturas:** saíram com o indicador de desenvolvimento do Next, que cobre partes da tela no celular; as próximas devem usar o build de produção;
  - **formatação e lint do repositório:** acusam só a pasta `entrepatios-brand/`, fora do Git, que apareceu durante a sessão e não é desta subtarefa (`tokens/tailwind.colors.js` tem erro de sintaxe). Se ela entrar no Git assim, o CI falha.

### 2026-10-29 · Marca · identidade visual aplicada ao site (kit v0.3)

- **Pedido da pessoa responsável:** alinhar o site à marca definida no kit v0.3 (marinho e âmbar), que está na pasta `entrepatios-brand/`, fora do Git.
- **Feito pelo T2:**
  - cores do kit no tema do Tailwind (`src/app/globals.css`) e Geist pelo `next/font`;
  - estilos comuns em marinho, âmbar e neutros: botão de ação âmbar com texto marinho, link em marinho 600, avisos nos tons da paleta. Cinza, azul e verde do Tailwind saíram de 33 arquivos, sem verde no sistema;
  - logo em `public/marca/`, pelo componente `src/components/logo.tsx`: negativo no cabeçalho marinho e na faixa da apresentação; colorido nas telas públicas. Ícones do site em `src/app/`;
  - lista de dados com rótulo e valor agrupados no celular;
  - `docs/marca.md` com a identidade visual e as pendências do kit.
- **Testes:** `npm test` (248), lint e tipos passam no código do site; build passa; e2e inteiro com 15 testes passando; capturas conferidas no computador e no celular.
- **Pendente:**
  - **pendências do próprio kit:** autoria da silhueta (combinar com o designer da proposta original), busca no INPI, Pantone e testes em impressão. A primeira pesa antes de o site ir a público;
  - **pasta do kit:** decidir se entra no Git. Do jeito que está, `tokens/tailwind.colors.js` tem erro de sintaxe e quebra o lint e a formatação;
  - **frase do painel:** o painel do kit traz "Mais do que veículos em estoque. São oportunidades em movimento." e o conceito "O estoque de um pode ser a oportunidade do outro.", que não estão no `docs/marca.md`; o site manteve os textos aprovados;
  - **modo escuro:** o kit traz os tokens, mas o site ainda não tem tema escuro.
