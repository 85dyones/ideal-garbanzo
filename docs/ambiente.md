# Variáveis de ambiente

**Subtarefa:** I0.7 do plano orquestrado.  
**Base:** ADR-0001 §3 e especificação v1.1 §4.4 e §7.1.

Valores reais nunca entram no Git, no chat nem em issue. O `.env.example` lista os nomes; cada ambiente recebe os valores no lugar indicado abaixo.

## 1. Variáveis

| Variável | Visibilidade | O que é | Onde obter |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | URL da API do projeto Supabase | painel do Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | chave publicável (`sb_publishable_…`); em projetos antigos, a chave `anon` | painel do Supabase → Project Settings → API Keys |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | pública, opcional | chave do site (*site key*) do Cloudflare Turnstile. Com ela, `/cadastro`, `/entrar` e `/recuperar` mostram o widget e enviam o token ao Supabase Auth, que o confere com a chave secreta do Turnstile cadastrada no próprio Auth (ADR-0002 §2.8). Sem ela, não há widget nem token: é o caso do `dev` e do E2E. Se o captcha estiver ligado no Auth do projeto, a variável precisa estar definida, senão o login falha. A chave secreta do Turnstile não entra no repasse | painel do Cloudflare → Turnstile → widget do domínio |
| `SUPABASE_SECRET_KEY` | **somente servidor** | chave secreta (`sb_secret_…`), equivalente à antiga `service_role`; ignora o RLS | painel do Supabase → Project Settings → API Keys |
| `SUPABASE_PROJECT_REF` | ferramenta local | identificador do projeto (ex.: `ralmlmuewullugeqtgoz`) | URL do painel do projeto |
| `SUPABASE_DB_URL` | **ferramenta local, secreta** | conexão Postgres para migrações e testes de banco | painel do Supabase → Connect → *Session pooler* (host `aws-<n>-sa-east-1.pooler.supabase.com`), com a senha do banco codificada para URL e **sem** `sslmode`: o TLS é configurado no cliente com o certificado de CA do Supabase (`supabase/certs/prod-ca-2021.crt`) |

## 2. Onde cada ambiente recebe os valores

| Ambiente | Projeto Supabase | Onde os valores ficam | Variáveis |
|---|---|---|---|
| Local (`dev`) | `ralmlmuewullugeqtgoz` | `.env` ou `.env.local` na raiz, ambos ignorados pelo Git | todas |
| Homologação (previews da Vercel, branch `main`) | `ralmlmuewullugeqtgoz` | Vercel → projeto `ideal-garbanzo` → Environment Variables → **Preview** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, quando o código precisar, `SUPABASE_SECRET_KEY` e, com o captcha ligado no Auth, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (entra no build: mudar a chave pede novo deploy) |
| Produção (branch `producao`) | `repasse-prod`, a criar no Inc. 6 | Vercel → **Production** | **nenhuma até o Inc. 6** |
| CI (GitHub Actions) | Supabase efêmero no runner | gerado pelo próprio job | nenhuma cadastrada |

**Produção sem variáveis até o Inc. 6:** assim, o deploy de produção não consegue falar com o banco de desenvolvimento e homologação.

## 3. Regras

- **Prefixo `NEXT_PUBLIC_`:** só para valores que podem ir para o navegador. A chave secreta e a URL do banco nunca levam esse prefixo.
- **`SUPABASE_SECRET_KEY`:** só em módulos que importam `server-only`. Na Vercel, cadastrar como *Sensitive*.
- **`SUPABASE_DB_URL`:** só na máquina de quem roda migrações e testes de banco (T2). Não vai para a Vercel.
- **Novas variáveis:** cada variável nova entra no `.env.example` e nesta página, na mesma mudança que a usa.
- **Vazamento:** se um segredo vazar, gire a chave no painel do Supabase e atualize os lugares acima.

## 4. Projeto único no plano gratuito

Por decisão da pessoa responsável (27/10), `dev` e homologação usam o mesmo projeto, no plano gratuito.

- **Reset e testes de banco** apagam também os dados de homologação. Por isso o projeto só guarda dados de teste identificados.
- **Pausa por inatividade:** projetos gratuitos pausam depois de um período sem uso; reativar pelo painel. Conferir os limites atuais do plano na página de preços do Supabase.
- **Produção:** exige um projeto próprio (`repasse-prod`) no Inc. 6.

## 5. Auth no painel do Supabase (dev e homologação)

Projeto `ralmlmuewullugeqtgoz`, painel → **Authentication**. Valores da I1.6 (ADR-0002 §2.8 e §2.16).

| Onde | Campo | Valor |
|---|---|---|
| URL Configuration | Site URL | `http://localhost:3000`, onde os testes acontecem hoje. Quando a homologação entrar em uso, passa a ser o alias da `main` na Vercel. |
| URL Configuration | Redirect URLs | `http://localhost:3000/**` e `https://ideal-garbanzo-*-<slug-do-time>.vercel.app/**`. O slug do time aparece no endereço dos previews. O padrão cobre só os previews deste projeto, e não os de outros projetos do mesmo time. |
| Sign In / Providers → Email | Confirm email | ligado. Em 28/10, a API pública de configurações do Auth respondia `mailer_autoconfirm: false` |
| Emails → SMTP Settings | servidor | host `smtp.hostinger.com`, porta 465 (SSL), conforme a documentação da Hostinger. Se a porta 465 der erro de criptografia, usar 587 (STARTTLS). Conferir no hPanel → Emails → Connect Apps & Devices. |
| Emails → SMTP Settings | usuário e senha | usuário = endereço completo da caixa. A senha é cadastrada pela pessoa responsável direto no painel, sem passar pelo repositório nem pelo chat. |
| Emails → SMTP Settings | remetente | a caixa provisória (exceção à §4.5 até o Inc. 6; detalhes em `notas-privadas/`); nome do remetente `EntrePátios` |
| Rate Limits | e-mails por hora | 30, o valor que o Supabase impõe ao ligar o SMTP próprio; não aumentar em `dev` |
| Attack Protection | captcha | desligado em `dev` e homologação. Liga no `repasse-prod` no Inc. 6, com widget de uma conta do Cloudflare própria do repasse (ADR-0002 §2.16) |
| Emails → Templates | modelos | tabela abaixo; Magic link e Reauthentication ficam no padrão, porque o repasse não usa esses fluxos |

| Modelo no painel | Arquivo | Assunto | Link |
|---|---|---|---|
| Confirm sign up | `supabase/templates/confirmacao-de-cadastro.html` | Confirme seu e-mail no EntrePátios | `{{ .RedirectTo }}&token_hash=…&type=email` |
| Invite user | `supabase/templates/convite.html` | Você recebeu um convite para o EntrePátios | `{{ .SiteURL }}/auth/confirmar?token_hash=…&type=invite` |
| Reset password | `supabase/templates/recuperacao-de-senha.html` | Redefinição de senha do EntrePátios | `{{ .RedirectTo }}&token_hash=…&type=recovery` |
| Change email address | `supabase/templates/troca-de-email.html` | Confirme o novo e-mail no EntrePátios | `{{ .SiteURL }}/auth/confirmar?token_hash=…&type=email_change` |

**Duas formas de link:**

- **Cadastro e recuperação:** a tela manda a URL de retorno `<origem>/auth/confirmar?proximo=…` (`src/app/_apoio/origem.ts`). O modelo acrescenta só o token. Assim, o link volta para o endereço em que a pessoa estava, seja local ou preview.
  - Se a origem não estiver nas Redirect URLs, o Supabase troca a URL de retorno pela Site URL, e esse link sai quebrado. Por isso, a lista precisa cobrir todo endereço que mostra as telas.
- **Convite e troca de e-mail:** o convite (`inviteUserByEmail`) não manda URL de retorno, e ainda não existe tela de troca de e-mail. Por isso, esses links usam a Site URL, e o destino vem do tipo: convite vai para `/nova-senha`.

**Ponto para a I1.7:** alguns provedores de e-mail abrem os links antes da pessoa, como o Safe Links do Microsoft Defender. A documentação do Supabase ("Email prefetching") avisa que isso consome o token. A rota `/auth/confirmar` confere o token já no GET. Avaliar se vale trocar por uma página com botão de confirmação.

**Testes:** nenhum teste envia e-mail. Os usuários são criados pela API administrativa, já confirmados, e o convite de quem não tem conta é trocado por uma criação sem envio. Por isso, ligar o SMTP não manda mensagens para os endereços `.invalid` dos testes.
