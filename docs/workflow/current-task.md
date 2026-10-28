# Tarefa atual

**Etapa:** Inc. 1, Identidade e adesão (plano v2). A I1.1 a I1.6 foram entregues; a I1.6 está sem commit.  
**Próxima subtarefa:**
- **I1.7 (T3):** revisão independente do diff, das políticas e do ADR-0002. A pessoa responsável vai solicitar. O gate do Inc. 1 depende dela.

**Configurações pendentes nos painéis (pessoa responsável):** veja a entrada da I1.6.

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
- **Configurações pendentes da pessoa responsável:**
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
