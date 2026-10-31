# ADR-0002: Identidade, empresas e adesão

**Status:** **aceito em 28/10/2026**, depois da revisão independente da I1.7: relatório externo e complemento T3, ambos sem achado crítico nem alto. As ressalvas estão na seção 8. As perguntas da seção 6 foram respondidas pela pessoa responsável em 28/10.  
**Data:** 2026-10-28  
**Subtarefa:** I1.2 do plano orquestrado v2  
**Base:** especificação v1.1 (§1.4, §3, §5.1, §5.6, §6.1, §7.1, §7.4, §8, §9, §13), tabela de decisão da I1.1 (anexo A), ADR-0001, migração `20261027224325_base_auditoria`

---

## 1. Contexto

O Inc. 1 cria as empresas, os perfis, os vínculos, os papéis da plataforma e o pedido de adesão. O aceite são os testes negativos 1, 2 (parte de empresa), 4, 5 e 13 da §7.4, cada um com verificação de mutação (gate 3).

Já existe no banco (I0.6): `audit_logs`, `field_history` e `restricted_access_logs`, só de inclusão, e `platform_settings`, vazia. Todas têm RLS ligado e nenhum acesso de `anon` ou `authenticated`. Os campos de ator ainda não têm chave estrangeira.

Três exigências da especificação pesam mais neste ADR:
- a autorização final fica no servidor e nas políticas do banco (§1.4.6, §3.3, §7.1);
- empresa ou usuário suspenso perde o acesso na operação seguinte, não no vencimento do token (§6.1);
- papel de plataforma nunca nasce de alteração do próprio usuário (§3.1, teste 4).

A I1.1 levantou 35 ambiguidades (A1 a A35). A seção 7 responde a cada uma.

---

## 2. Decisões

### 2.1. A autorização vem do banco, consultado a cada requisição

- O único dado do token usado para autorizar é `auth.uid()`. Papel, status e vínculo são lidos das tabelas em toda consulta.
- `user_metadata` nunca entra em decisão de acesso: o próprio usuário pode alterá-lo pela API do Auth. `app_metadata` também não, porque só muda no token depois da renovação e deixaria o suspenso operar até lá.
- Consequência para os testes 4 e 5: não há claim de papel a forjar, e suspender muda a resposta da consulta seguinte, com ou sem sessão antiga.

### 2.2. Funções auxiliares no schema `private`

As políticas chamam funções auxiliares. Elas ficam no schema `private`, que a API de dados do Supabase não expõe, como a documentação do Supabase recomenda para funções `security definer`.

- Todas são `security definer`, `stable`, com `set search_path = ''` e nomes qualificados.
- `execute` só para `authenticated` e `service_role`; revogado de `public` e `anon`.
- As políticas chamam as funções dentro de `(select ...)`, para o Postgres avaliar uma vez por consulta, e não por linha.
- O reset passa a limpar o `private`: `config/banco-dev.json` ganha `"private"` em `esquemasDaAplicacao`.

| Função | Verdadeira quando |
|---|---|
| `private.perfil_ativo()` | existe perfil para `auth.uid()` com `status = 'active'` |
| `private.tem_papel_na_plataforma(papeis text[])` | perfil ativo e linha `active` em `platform_staff` com papel na lista |
| `private.pode_ler_auditoria()` | administrador ativo, ou operador ativo com `can_read_audit` |
| `private.membro_ativo(empresa uuid, papeis text[] default null)` | perfil ativo, vínculo `active` e empresa `active`; se informado, papel do vínculo na lista |
| `private.empresas_do_usuario(papeis text[] default null)` (`setof uuid`) | empresas em que `membro_ativo` vale; usada em `organization_id in (select ...)` |
| `private.empresas_com_vinculo()` (`setof uuid`) | perfil ativo e vínculo `active` ou `pending`, qualquer que seja o status da empresa; é a leitura da linha da empresa |
| `private.colegas_do_usuario()` (`setof uuid`) | perfis com vínculo `active` ou `suspended` numa empresa de `empresas_do_usuario()` |
| `private.pode_ver_catalogo()` | membro ativo de ao menos uma empresa ativa com `kind` em (`buyer`, `both`) |
| `private.pode_enviar_evidencia(caminho text)` | administrador, caminho `<id do pedido>/<arquivo>`, pedido aberto e de outra pessoa (política do Storage) |

As funções de conjunto substituem a `vinculo_ativo(empresa)` do rascunho: dentro de `in (select ...)`, rodam uma vez por consulta, e não uma por linha.

O teste 1 se apoia em `pode_ver_catalogo()`. O catálogo só existe no Inc. 4; aqui o teste cobre a função e a proteção das rotas (seção 2.15), e é completado com a tabela de ofertas.

### 2.3. Suspensão: três camadas, com o banco como fonte da verdade

1. **Banco:** as funções da seção 2.2 conferem o status do perfil, do vínculo e da empresa. A consulta seguinte de um suspenso já volta vazia ou recusada, mesmo com token válido.
2. **Servidor:** toda operação de servidor valida a sessão junto ao Auth e carrega do banco o contexto do usuário (status do perfil, papel na plataforma, vínculos ativos) antes de agir. Nenhuma decisão usa contexto guardado em cookie ou cache.
3. **Auth:** suspender um perfil também bloqueia o usuário no Supabase Auth (`ban_duration` pela API administrativa, só no servidor), para impedir novo login. Reativar remove o bloqueio. Essa camada é complementar: o efeito exato sobre sessões já abertas é conferido no teste de integração, e a proteção não depende dele.

A ordem é: muda o status no banco, depois o bloqueio no Auth. Se o bloqueio falhar, a operação devolve erro previsível e pode ser repetida; o banco já está bloqueando.

Conferido em 28/10 no projeto de desenvolvimento (I1.5): com o bloqueio, `getUser` e um novo login respondem `user_banned`, mas o token anterior continua aceito pelo PostgREST até vencer. Quem barra esse token é o banco (camada 1), o que confirma a escolha de não depender do Auth.

**Empresa suspensa:** os membros perdem o acesso àquela empresa, calculado na hora pelas funções. O status dos vínculos não muda em cascata, então reativar a empresa devolve o estado anterior. Quem tem vínculo ativo com outra empresa ativa continua operando nela.

Suspender e reativar são do administrador da plataforma, com motivo obrigatório no servidor, gravado na auditoria (por analogia com a suspensão de oferta, §6.10).

### 2.4. Bloqueio de autopromoção e invariantes (teste 4)

Os gatilhos são funções em `private` e valem para qualquer caminho: operação de servidor, chamada direta à API ou SQL.

- **`platform_staff`:**
  - só administrador ativo insere ou altera, e nunca a própria linha;
  - `granted_by` e `granted_at` vêm do gatilho (`auth.uid()` e `now()`), não do payload;
  - não há DELETE: revogar é mudar o status para `revoked`;
  - a plataforma mantém ao menos um administrador ativo depois do primeiro (seção 2.13);
  - o `service_role` não escreve nessa tabela.
- **`profiles`:**
  - o usuário altera só `full_name` e `phone` do próprio perfil (`grant update (full_name, phone)`);
  - `email` muda só pela sincronização da seção 2.8;
  - `status` muda só por administrador da plataforma, e nunca no próprio perfil.
- **`organization_members`:** regras na seção 2.6. Ninguém altera o próprio vínculo.
- **`membership_applications`:**
  - o requerente insere só as colunas de dados enviados (`grant insert (...)` por coluna);
  - o gatilho exige `status = 'submitted'`, `applicant_profile_id = auth.uid()` e campos de revisão vazios;
  - o revisor nunca é o requerente.
- **`organizations`:**
  - nasce só pela aprovação (seção 2.5), sem INSERT para `authenticated`;
  - o `org_admin` altera só `name`, `contact_email` e `contact_phone` da própria empresa ativa;
  - `legal_name`, `cnpj`, `kind`, `status` e `is_test` só mudam por administrador da plataforma. Desde a §9, a compradora passa a fornecer só pelo aceite do convite, e nem o administrador abre esse lado direto.
- **Servidor:** os esquemas Zod das operações são estritos (`.strict()`). Campo a mais no payload é erro, não é ignorado.

### 2.5. Adesão aprovada cria empresa e vínculo de uma vez

- O pedido exige conta com e-mail confirmado (seção 2.8). Não há pedido anônimo.
- Os dados da empresa ficam no pedido até a aprovação (§5.1, "dados da empresa enviados"). A empresa só é criada na aprovação.
- Aprovar é uma única alteração em `membership_applications`, feita por administrador da plataforma: `status = 'approved'`, com a conferência de CNPJ, a evidência e o que foi conferido.
- Um gatilho `before update` (função em `private`) valida a transição e, na aprovação:
  - cria a empresa em `organizations`, com `status = 'active'`, `kind = requested_kind`, `is_test` do pedido e os demais dados do pedido;
  - cria o vínculo do requerente como `org_admin` `active`;
  - preenche `organization_id`, `reviewed_by = auth.uid()` e `reviewed_at = now()` no pedido.
- Tudo acontece na mesma transação. Se qualquer passo falha (CNPJ já cadastrado, evidência de outro pedido, campo obrigatório vazio), nada fica gravado. O caminho da alteração não importa: a garantia está no banco.
- Um CHECK reforça: pedido aprovado tem revisor, data, `cnpj_checked_at`, `cnpj_check_source`, `cnpj_check_evidence_id` e empresa; pedido rejeitado tem `decision_reason`.

**Transições do pedido** (validadas no banco, como a §6.2 exige para as ofertas):

| De | Para | Quem |
|---|---|---|
| (novo) | `submitted` | o próprio requerente, com perfil ativo |
| `submitted` | `under_review` | administrador ou operador da plataforma, que não seja o requerente (Q2) |
| `submitted` ou `under_review` | `approved` ou `rejected` | administrador da plataforma, que não seja o requerente |
| `approved` ou `rejected` | (nenhuma) | estados finais; novo pedido é nova linha |

O operador só muda o status de `submitted` para `under_review`; o gatilho recusa qualquer outra coluna alterada por ele.

**Conferência sem lista fixa (C5):** a lista do que foi conferido fica em `membership_application_reviews`, uma linha por pedido, com `checklist` (jsonb, lista de itens com nome, resultado e observação em texto livre). Nenhum item é exigido pelo código até a decisão C5.
- A tabela é separada porque a RLS filtra linhas, não colunas: o requerente lê o próprio pedido inteiro, e a conferência, que pode ter observação interna, fica numa tabela que só o staff lê.
- Só o administrador grava a conferência, e só enquanto o pedido está `submitted` ou `under_review`; depois da decisão, ela não muda.
- `cnpj_check_source` é texto livre; conferência automática de CNPJ só com contrato próprio de provedor (plano, seção 4).

**Dados de teste (§4.4):** o pedido ganha `is_test`, que só o administrador marca na revisão, e a empresa herda o valor. Empresas de teste ficam identificadas também no piloto.

**`kind`:** a empresa nasce com o tipo pedido. Mudar depois é só do administrador da plataforma, porque passar a comprador abre o catálogo. A exceção vem da §9: a compradora passa a fornecer só pelo aceite do convite de fornecedora.

**CNPJ:**
- Guardado normalizado, sem pontuação e em maiúsculas, com validação dos dígitos verificadores no servidor e no banco.
- A validação aceita o CNPJ alfanumérico (IN RFB 2.229/2024), com inscrições a partir de julho de 2026: 12 posições com números de 0 a 9 ou letras maiúsculas de A a Z, dois dígitos verificadores numéricos, módulo 11 com pesos de 2 a 9 da direita para a esquerda e cada caractere valendo o código ASCII menos 48; resto 0 ou 1 dá dígito 0. Os CNPJs numéricos continuam válidos. Conferido na I1.3 nas perguntas e respostas da Receita sobre o CNPJ alfanumérico e no manual de cálculo do DV publicado pela Receita; o teste usa o exemplo oficial `12.ABC.345/01DE-35` e um CNPJ numérico.
- Único entre as empresas não encerradas (índice único parcial, `status <> 'closed'`). Filiais têm CNPJ próprio e são empresas separadas; `cnpj_root` (raiz de 8 posições, coluna gerada) ajuda o administrador a ver o grupo na revisão.
- O envio de pedido com CNPJ já cadastrado é aceito e responde igual a qualquer outro, para não revelar quem já está na plataforma. O administrador vê o conflito na revisão; a aprovação é recusada pelo banco, e o caminho é rejeitar com motivo (por exemplo, pedir ao `org_admin` da empresa o convite).
- Um requerente tem no máximo um pedido aberto (`submitted` ou `under_review`), por índice único parcial. Dois requerentes podem pedir o mesmo CNPJ; só um pedido pode ser aprovado.

**Evidência da conferência:**
- Bucket privado `membership-evidence` e tabela `membership_evidence_files`, só de inclusão: pedido, caminho, `sha256`, tipo, tamanho, descrição, quem enviou e quando.
- A evidência é obrigatória para aprovar: a §6.1 manda a aprovação registrar "qual evidência". A C5 trata dos documentos da empresa, não desta evidência.
- `cnpj_check_evidence_id` aponta para essa tabela, e o gatilho confere que a evidência é do mesmo pedido.
- No Storage, só administrador da plataforma envia e lê, e o caminho começa pelo id do pedido. Ninguém altera nem apaga.
- Toda URL temporária emitida é registrada em `restricted_access_logs` pelo servidor antes de ser devolvida. Se o registro falhar, a URL não é devolvida.

### 2.6. Membros da empresa

- **Entrada:** o `org_admin` da empresa ativa convida pelo e-mail, sem aprovação da plataforma (resposta à Q1: a empresa já foi aprovada e responde por quem convida). O vínculo nasce `pending` e fica `active` quando o convidado aceita.
- **Aceite do convidado:** é a única mudança que alguém faz no próprio vínculo. O convidado com perfil ativo aceita (`pending` → `active`) ou recusa (`pending` → `removed`), sem mudar o papel. O aceite protege o convidado: ninguém é posto numa empresa sem saber, e o nome e o e-mail dele só ficam visíveis aos colegas depois do aceite (seção 2.9).
- **Convite sem revelar cadastro:** o servidor responde igual exista ou não conta com aquele e-mail. Quem não tem conta recebe o convite do Auth (seção 2.12).
- **Conta existente só recebe convite se for confiável** (R1 da I1.7, 28/10). Vale a conta com e-mail confirmado ou a que nasceu de um convite do Auth, cuja senha é definida por quem abre o link.
  - A conta de cadastro ainda sem confirmação pode ser de outra pessoa, que usou o e-mail alheio com a própria senha.
  - Ela recebe a mesma recusa genérica da conta suspensa ("Não foi possível convidar este e-mail.").
- **Gestão pelo `org_admin` da própria empresa ativa**, sem passar pela plataforma:
  - suspender, reativar e remover membros, e cancelar convite pendente;
  - trocar o papel entre `member` e `org_admin`;
  - reconvidar quem foi removido: a mesma linha volta a `pending`, porque o vínculo é único por empresa e perfil (§5.1).
- **Nunca na própria linha**, fora o aceite: ninguém muda o próprio papel ou status. O `org_admin` que quer sair pede a outro `org_admin` ou ao administrador da plataforma.
- **Ao menos um `org_admin` ativo** por empresa ativa (gatilho).
- **Administrador da plataforma:** faz tudo isso em qualquer empresa, menos aceitar convite no lugar do convidado.
- **`member`:** não gerencia ninguém.

| De | Para | Quem |
|---|---|---|
| (novo) | `pending` | `org_admin` da empresa ativa; administrador da plataforma |
| `pending` | `active` | só o convidado |
| `pending` | `removed` | o convidado (recusa); `org_admin`; administrador (cancelamento) |
| `active` | `suspended` | `org_admin`, nunca na própria linha; administrador |
| `suspended` | `active` | idem |
| `active` ou `suspended` | `removed` | idem |
| `removed` | `pending` | `org_admin`; administrador (reconvite) |
| troca de papel, em qualquer status menos `removed` | — | `org_admin`, nunca na própria linha; administrador |

O vínculo do requerente, criado na aprovação da adesão (seção 2.5), já nasce `active`.
- **Várias empresas por perfil:** permitido, como a unicidade por par da §5.1 sugere. Toda operação de servidor recebe a empresa explícita e confere o vínculo com ela; a interface mostra seletor só quando houver mais de uma.

### 2.7. Configuração crítica (teste 13)

- `platform_settings` ganha `is_critical boolean not null default true`. Toda configuração nasce crítica; o incremento que cria cada uma decide, com registro, se ela deixa de ser.
- **Administrador:** lê e altera todas.
- **Operador:** lê só as não críticas e não altera nenhuma. A §7.4 ("não acessa") é mais restrita que a §3.1 ("não altera"); vale a mais restrita para as críticas.
- **Membros ativos de empresa ativa:** leem só as não críticas, como categorias documentais e campos materiais, de que os formulários precisam.
- `updated_by` e `updated_at` vêm do gatilho. Toda mudança gera linha em `field_history` (entidade `platform_settings`, campo = chave, valor anterior e novo) e em `audit_logs`.

### 2.8. Conta, perfil e e-mail

- **Cadastro:** cadastro aberto no Supabase Auth com confirmação de e-mail e Turnstile do próprio Auth. As telas ficaram prontas na I1.6, e o captcha liga no Inc. 6 (§2.16). Ter conta não dá acesso ao produto.
  - Desde a I1.8 (R8, seção 8), o cadastro pede só nome e e-mail, e a senha é criada depois da confirmação. Assim, quem cadastrar antes o e-mail de outra pessoa não fica com uma senha que valha.
- **Pedido:** a tela pública leva ao cadastro e depois ao formulário do pedido.
- **Sem vínculo ativo em empresa ativa**, o usuário só lê o próprio perfil e envia e acompanha os próprios pedidos.
- **Perfil:** nasce por gatilho na inclusão em `auth.users` (função em `private`), com `status = 'active'`. `full_name` vem do metadado do cadastro só como texto de exibição.
- **E-mail:** `profiles.email` acompanha `auth.users.email` por gatilho na alteração. A troca segue o fluxo de confirmação do Supabase Auth; o usuário não altera `profiles.email` direto.
- **Escrita interna:** os gatilhos `proteger_*` liberam a escrita feita por outro gatilho nosso (`pg_trigger_depth() > 1`): o cadastro e a sincronização de e-mail no perfil, e a empresa e o vínculo criados pela aprovação. Nenhuma chave estrangeira de identidade tem ação em cascata, então o usuário não dispara escrita interna fora desses caminhos.
- **Exclusão:** usuários não são apagados. `audit_logs` aponta para `profiles` com chave estrangeira restritiva, então apagar um usuário com histórico falha. `ON DELETE SET NULL` ou `CASCADE` não servem, porque virariam UPDATE ou DELETE na tabela só de inclusão, que o gatilho recusa. Pedido de eliminação de dados (LGPD) vira anonimização do perfil, definida com o jurídico (§7.2).
- **E-mails no Inc. 1:** só os do próprio Auth (confirmação, recuperação, convite). O aviso de aprovação da empresa (§6.13) entra com a outbox, no Inc. 5; até lá, o requerente vê o status no painel. O SMTP padrão do Supabase é só para teste, segundo a documentação do Supabase; o provedor de e-mail do repasse é a Hostinger (resposta da pessoa responsável em 28/10), sem nada compartilhado com a Motors. Por enquanto, a caixa remetente é provisória e pertence a outro negócio da pessoa responsável; os detalhes ficam em `notas-privadas/`.
  - **Exceção à §4.5 da especificação**, que proíbe conta de provedor de outro negócio. Ela foi aprovada pela pessoa responsável em 28/10 e vale só para `dev` e homologação, até o Inc. 6.
  - Até lá, os e-mails do Auth saem com o endereço provisório, e a senha dessa caixa fica nas configurações de SMTP do projeto Supabase do repasse.
  - Antes da produção, o repasse passa a ter caixa própria, e a senha da caixa provisória é trocada. Esse item entra na lista de go/no-go do Inc. 6. O SMTP dela entra no Auth do Supabase na I1.6. Os dados de conexão são os publicados no painel de e-mail da Hostinger, e a senha é cadastrada pela pessoa responsável direto no painel do Supabase, sem passar pelo repositório nem pelo chat.

### 2.9. Quem lê o quê no Inc. 1 (teste 2, parte de empresa)

| Tabela | Lê |
|---|---|
| `organizations` | quem tem vínculo ativo com a empresa (inclusive com a empresa suspensa, para a tela mostrar a situação) e o convidado com vínculo `pending` (para saber quem convidou); administrador e operador |
| `organization_members` | membros ativos da mesma empresa ativa; administrador e operador |
| `profiles` | o próprio usuário; membros ativos da mesma empresa ativa (nome e e-mail, para a tela de membros); administrador e operador |
| `platform_staff` | a própria linha; administrador |
| `membership_applications` | o requerente lê os próprios pedidos; administrador e operador leem todos |
| `membership_application_reviews` | administrador e operador |
| `membership_evidence_files` | administrador |
| `audit_logs`, `field_history`, `restricted_access_logs` | `private.pode_ler_auditoria()`: administrador; operador só com `platform_staff.can_read_audit = true`, concedido por administrador (§3.3, "conforme autorização") |
| `platform_settings` | seção 2.7 |

- Membro da empresa A não lê empresa, vínculo, perfil nem pedido da empresa B.
- O CNPJ e os contatos são de acesso restrito (§5.1). No Inc. 1 ninguém lê empresa alheia, então quem lê a linha pode lê-los. Quando o catálogo mostrar o fornecedor ao comprador (Inc. 4), a leitura passa por uma visão sem CNPJ e sem contatos.
- O operador lê empresas, vínculos, perfis, pedidos de adesão e conferências, e prepara a revisão movendo o pedido de `submitted` para `under_review` (resposta à Q2). Aprovar, rejeitar, gravar a conferência, suspender e qualquer outra mudança em identidade continuam só com o administrador (§3.1, §3.3).
- Convidado com vínculo `pending` não é colega: a empresa vê o vínculo, mas não o perfil, até o aceite.
- **Leitura da própria situação (esclarecido na I1.4):** o usuário suspenso continua lendo o próprio perfil, e quem tem perfil ativo continua lendo o próprio vínculo, qualquer que seja o status do vínculo ou da empresa. É assim que a tela mostra "acesso suspenso" ou "vínculo removido". A recusa da D43 ("qualquer leitura ou escrita do produto") vale para os dados da empresa, dos colegas e de terceiros, que os testes 160 conferem.
- Quem tem papel na plataforma pode ser membro de empresa. Os conflitos de interesse (por exemplo, o operador revisar oferta da própria empresa) são tratados nos incrementos em que o staff age sobre ofertas.

### 2.10. Status

| Tabela | Valores | Dá acesso | Observação |
|---|---|---|---|
| `organizations` | `pending`, `active`, `suspended`, `closed` | só `active` | `pending` fica no domínio, como na §5.1, mas não é usado: a empresa nasce `active` na aprovação. `closed` é final, só o administrador encerra, e libera o CNPJ para nova adesão |
| `profiles` | `active`, `suspended` | só `active` | §5.1 |
| `organization_members` | `pending`, `active`, `suspended`, `removed` | só `active` | a §5.1 não lista; `pending` vem da seção 2.6 |
| `platform_staff` | `active`, `revoked` | só `active` | a §5.1 não lista; um perfil tem no máximo uma linha |
| `membership_applications` | `submitted`, `under_review`, `approved`, `rejected` | não se aplica | §5.1 |

Nenhuma dessas tabelas tem DELETE para `anon`, `authenticated` ou `service_role`: sair, remover e revogar são mudanças de status, com histórico (§1.4.5).

### 2.11. Auditoria por gatilho

- Gatilhos `after` (funções em `private`) gravam em `audit_logs` as inclusões e as mudanças de status, de papel e de dados em empresas, perfis, vínculos, papéis da plataforma, pedidos e configuração. Não dá para pular o registro mudando o caminho da operação.
- Ator: `auth.uid()`. Empresa: a da linha alterada.
- `request_id`: o servidor envia o cabeçalho `x-request-id`, e o gatilho lê `request.headers`, que o PostgREST preenche. Fora da API (SQL direto), fica nulo.
- O motivo de suspensão, reativação e encerramento vai na auditoria. O servidor envia o motivo pelo cabeçalho `x-audit-reason`, lido do mesmo jeito; o gatilho recusa a mudança de status sem motivo quando ela vem pela API.
- O cabeçalho leva o motivo em bytes UTF-8 (`src/modules/audit/server/rastreio.ts`), porque o `fetch` do Node só aceita um byte por caractere no cabeçalho. Conferido em 28/10 pela API do projeto de desenvolvimento: sem o cabeçalho, a suspensão é recusada; com ele, `x-request-id` e o motivo acentuado chegam íntegros a `audit_logs`.
- `metadata` não leva senha, token nem dado pessoal além do necessário (§5.6). CNPJ, e-mail e telefone não vão para `metadata`; vão só os ids e os campos alterados.
- A I1.3 acrescenta as chaves estrangeiras de ator (`actor_profile_id`, `actor_organization_id`, `changed_by`, `updated_by`) para `profiles` e `organizations`, restritivas (seção 2.8).

### 2.12. Escrita pelo servidor com a sessão do usuário

- As operações de servidor da I1.5 escrevem com o cliente da sessão do usuário (chave publicável e cookie). Assim, toda escrita passa pelas políticas e pelos gatilhos com o ator verdadeiro.
- A chave secreta (`service_role`) fica restrita a cinco usos, todos em código de servidor:
  - contagem do limite de tentativas (seção 2.16), depois da checagem de permissão da operação;
  - API administrativa do Auth (bloqueio, desbloqueio e convite, de membro e de fornecedora; no convite de membro a conta existente, também a leitura da confirmação do e-mail e da origem da conta, seção 2.6);
  - leitura do perfil pelo e-mail no convite de membro, depois de o servidor conferir que quem convida gere a empresa (I1.5): a sessão de quem convida não enxerga perfis fora da empresa, e a resposta é a mesma exista ou não a conta. A gravação do vínculo continua com a sessão de quem convida;
  - inclusão em `restricted_access_logs`;
  - preparação e limpeza dos testes de integração.
- Cada caminho com `service_role` tem teste próprio da checagem do servidor, porque ali a RLS não vale.
- Nas tabelas de identidade, o `service_role` só lê. Na `platform_settings`, a escrita que a I0.6 dava ao servidor foi retirada na I1.3.
- Uma chamada direta à API com o token do usuário tem o mesmo resultado que a operação de servidor, porque quem decide é o banco. O que só o servidor faz (Turnstile, limite de taxa, validação Zod) protege contra abuso, não substitui a política.

| Operação (§8) | Mecanismo no banco |
|---|---|
| `submitMembershipApplication` | INSERT em `membership_applications` com colunas restritas |
| mover pedido para análise (administrador ou operador) | UPDATE do status do pedido para `under_review` |
| `reviewMembershipApplication` | conferência em `membership_application_reviews`; envio da evidência; UPDATE do pedido; o gatilho cria empresa e vínculo |
| suspender, reativar e encerrar empresa | UPDATE de status por administrador, com motivo |
| suspender e reativar perfil | UPDATE de status por administrador, com motivo; depois, bloqueio ou desbloqueio no Auth |
| convidar, suspender, reativar e remover membro; cancelar convite; trocar papel | INSERT e UPDATE em `organization_members` (seção 2.6); para quem não tem conta, antes o convite pela API administrativa do Auth; o reconvite usa `public.reconvidar_membro` (R3) |
| aceitar e recusar o próprio convite | UPDATE do status do próprio vínculo `pending` |
| conceder e revogar papel de plataforma; liberar auditoria ao operador | INSERT e UPDATE em `platform_staff` por administrador |
| alterar configuração | UPDATE em `platform_settings` por administrador |

### 2.13. Primeiro administrador da plataforma

- Não há tela nem operação de servidor para isso. A pessoa responsável executa um SQL documentado no editor do projeto (como `postgres`), registrado em `audit_logs`.
- O gatilho de `platform_staff` aceita inclusão sem `auth.uid()` só enquanto não houver administrador ativo. Depois disso, só administrador pela própria sessão concede papel.
- Ninguém revoga o último administrador ativo, e ninguém mexe na própria linha. A plataforma nunca fica sem administrador por uma ação comum.
- No `dev` e no CI, os administradores de teste nascem nas fixtures dos testes, não no `seed.sql`.

### 2.14. Storage e reset (antecipa a decisão marcada para a I2.4)

O primeiro bucket entra no Inc. 1, então a convenção do `supabase/tests/README.md` passa a valer agora:
- a migração cria o bucket com `insert ... on conflict (id) do update` (mantendo-o privado) e as políticas de `storage.objects` com `drop policy if exists` antes do `create policy`;
- as políticas dependem de funções do `private`; a limpeza do reset as remove em cascata, e a migração as recria;
- o reset esvazia os buckets da aplicação pela API do Storage antes de limpar o banco, porque apagar linhas de `storage.objects` por SQL deixa o arquivo órfão (documentação do Supabase). A lista de buckets fica em `config/banco-dev.json`.

### 2.15. Rotas e telas (teste 1, parte do Inc. 1)

- As áreas de fornecedor, comprador e administração conferem a permissão no servidor antes de buscar qualquer dado: no layout de cada grupo de rotas e, de novo, em cada página, porque o Next não renderiza o layout outra vez quando a navegação fica dentro do mesmo grupo (ajuste da I1.6). A interface nunca é a única barreira (§1.4.6).
- A área do comprador ganha no Inc. 1 uma página provisória, protegida por `pode_ver_catalogo()`, para o teste 1 ter alvo. O catálogo de verdade vem no Inc. 4.
- Quem não tem acesso recebe "sem permissão" para qualquer id, exista o registro ou não. "Registro inexistente" só aparece para quem tem acesso (§9). Assim, a resposta não revela se o registro existe.

### 2.16. Limite de tentativas e Turnstile (I1.6)

- **Onde ficam os contadores:** no Postgres do repasse, por decisão da pessoa responsável em 28/10, sem provedor novo. O projeto interno de onde veio o padrão usava um serviço externo, que exigiria conta nova.
  - Migração `20261028180000_limite_de_tentativas`: tabela `public.limites_de_tentativas` e função `public.consumir_limite_de_tentativas`, com janela fixa por chave.
  - A função é `security invoker` e só o `service_role` executa e acessa a tabela; `anon` e `authenticated` não leem nem consomem, senão zerariam o próprio contador.
  - A chave chega resumida em sha256 pelo servidor (`src/lib/operacao/limite-de-tentativas.ts`), então IP, e-mail e id não ficam gravados em claro (§7.2).
  - Cada chamada apaga as janelas vencidas da própria chave e, de vez em quando, as de qualquer chave com mais de um dia.
- **Falha fechado:** se o banco não responder, a tentativa é recusada com `limite_excedido`. O projeto interno deixava passar quando o serviço externo caía; aqui, sem banco, a operação também não aconteceria.
- **Onde vale e com que valor:** os valores são técnicos e provisórios (a especificação não fixa números) e ficam numa tabela no código, por finalidade:

  | Finalidade | Por | Valor |
  |---|---|---|
  | convite de membro | quem convida | 30 por hora |
  | pedido de adesão | requerente | 5 por hora; o banco já impede dois pedidos abertos |
  | entrar | e-mail | 10 em 15 minutos |
  | entrar | IP | 30 em 15 minutos |
  | cadastro | IP | 5 por hora |
  | recuperação de senha | e-mail | 5 por hora |
  | recuperação de senha | IP | 10 por hora |

  - Entrar e recuperar contam por e-mail e, à parte, por IP, porque contar só o par IP e e-mail deixaria um IP testar muitos e-mails.
  - O IP é o primeiro item de `x-forwarded-for`, preenchido pela Vercel. Sem esse cabeçalho, como na máquina local, as tentativas contam juntas.
  - Fechado na I1.7: segundo a documentação da Vercel ("Request headers"), ela sobrescreve o `x-forwarded-for` e não repassa IPs externos, para impedir falsificação. O `x-real-ip` e o `x-vercel-forwarded-for` são idênticos a ele. Se um proxy for posto na frente da Vercel, todos os visitantes passam a contar pelo IP do proxy (seção 8).
  - Esses limites valem nas ações de servidor das telas de autenticação. A API do Auth é pública, então ela também conta com os limites nativos do Supabase Auth.
- **Turnstile:** fica no captcha do próprio Supabase Auth, nas telas de cadastro, entrada e recuperação.
  - A API do Auth é pública, e só a verificação dentro dele protege de verdade.
  - O token vale uma vez, então o servidor do repasse não o verifica antes.
  - O verificador de servidor do projeto interno, que confere host e ação, fica para quando houver formulário público fora do Auth.
  - Sem `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, as telas não mostram o widget, como no `dev` e no E2E.
  - Em produção, o widget próprio do repasse não deve aceitar `localhost` na lista de domínios (lição do projeto interno).
  - **Quando liga:** só no Inc. 6, no `repasse-prod`, com o widget criado numa conta do Cloudflare própria do repasse (decisões da pessoa responsável em 28/10). A conta do Cloudflare disponível hoje é de outro negócio, e a exceção à §4.5 cobre só a caixa de e-mail.
  - **Até lá:** o captcha fica desligado no projeto de `dev` e homologação, e o login dos testes continua funcionando. Ali, a proteção do Auth fica com três coisas: os limites desta seção, o teto de e-mails por hora do Supabase e a autenticação da Vercel nos previews.

---

## 3. Testes do Inc. 1

- **pgTAP:** em `supabase/tests/database/`, com prefixo numérico, porque o runner não lê subpastas. O `100-identidade-estrutura` é da I1.3 (estrutura, CNPJ e um fluxo de adesão); a I1.4 usa `110-` em diante. Isso corrige o caminho `supabase/tests/identity/**` da I1.4 no plano.
- **Atuar como usuário no pgTAP:** a fixture insere o usuário em `auth.users` dentro da transação do teste (o gatilho cria o perfil) e usa `set local role authenticated` com `request.jwt.claims` contendo o `sub`. O papel `postgres` ignora a RLS, então toda asserção de acesso roda como `authenticated`.
- **Administrador na fixture:** pelo caminho do primeiro administrador (seção 2.13) ou, se o banco já tiver um ativo (dados de integração), concedido por ele, com a sessão dele. O `100-identidade-estrutura` tem o bloco de referência.
- **Chamada pela API no pgTAP:** a fixture preenche `request.headers` (por exemplo, `x-audit-reason`) para simular a requisição do PostgREST.
- **Claims sempre definidas no pgTAP (achado da I1.4):** sob `set local role`, o `session_user` continua `postgres`, então `private.manutencao()` vale para `authenticated` ou `service_role` sem claims. Todo bloco de teste deve definir as claims, inclusive `{"role": "service_role"}` sem `sub`.
  - **Pelo PostgREST**, a sessão é sempre `authenticator`, e `anon`, `authenticated` e `service_role` não fazem login direto no banco.
  - **Correção da I1.7:** a API do Auth escreve em `auth.users` com o papel administrativo dela, sem claims. Com a lista de exclusão antiga, `manutencao()` valia nesse caminho.
    - Desde a I1.8, a função usa uma lista permitida de sessões (`private.sessao_de_manutencao`, com `postgres` e `supabase_admin`) e só vale no primeiro nível de gatilho (R5).
    - O `210-manutencao` fixa os dois gatilhos que chamam a função: a inclusão em `platform_staff` e a escrita em `platform_settings`.
  - **Blocos sem claims:** os de `010-base-auditoria` e `110-adesao` foram corrigidos na I1.8 (R4). O teste `tests/pgtap-claims.test.ts`, que roda no `npm test`, recusa asserção com papel trocado e sem claims.
- **Integração (`tests/integration/`):** usuários reais criados pela API administrativa, login de verdade e chamadas pela API com o token. Casos que só a integração prova:
  - teste 4: o usuário grava `{ "role": "admin" }` no próprio `user_metadata` e continua sem acesso administrativo;
  - teste 5: o usuário entra, é suspenso, e a requisição seguinte com o mesmo token é recusada.
- **Dados de integração no `dev`:** o `globalSetup` pega o advisory lock do reset (fecha a pendência do README). Os e-mails de teste usam o domínio reservado `.invalid` e um sufixo por execução. Usuários com histórico de auditoria não podem ser apagados (seção 2.8), então ficam até o próximo reset.
- **Verificação de mutação (gate 3):** com a RLS ligada, remover uma política permissiva faz o banco negar tudo. O teste negativo continua passando, e quem falha é o caso de contraste. Por isso:
  - a mutação **afrouxa**: predicado `true`, condição tirada da função auxiliar, GRANT ampliado ou gatilho desligado;
  - todo teste negativo tem um caso de contraste, o acesso legítimo que precisa continuar funcionando;
  - camada de servidor e camada de banco são mutadas uma de cada vez;
  - o anexo A diz qual mutação derruba cada caso.

---

## 4. Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| Papel e status em claims do JWT (`app_metadata` ou hook de token) | o suspenso operaria até o token vencer (§6.1); o papel ficaria fora da revalidação do banco |
| Funções de operação `security definer` no `public`, chamadas por RPC | a documentação do Supabase recomenda não deixar `security definer` em schema exposto; a mesma garantia vem das políticas, das permissões por coluna e dos gatilhos |
| Escrita pelo servidor com `service_role` | pula a RLS; um erro no servidor viraria escalada de privilégio. A sessão do usuário mantém o ator verdadeiro |
| Criar a empresa `pending` no envio do pedido | grava dados não conferidos como empresa; a §5.1 guarda os dados no pedido |
| Mudar o status dos vínculos em cascata na suspensão da empresa | reativar exigiria reconstruir o estado anterior; calcular na hora é mais simples e não perde nada |
| Lista fixa de documentos de aprovação | depende de C5 (§13) |

---

## 5. Consequências

- O teste 1 fica parcial no Inc. 1 (função e rotas) e é completado no Inc. 4, sobre a tabela de ofertas.
- Toda política nova dos próximos incrementos usa as funções do `private`. Mudar a regra de quem é "membro ativo" muda num lugar só.
- Gatilhos concentram regras críticas no banco. Em troca, cada gatilho tem teste pgTAP próprio, e a verificação de mutação cobre também o desligamento de gatilhos.
- O reset ganha uma dependência da API do Storage (URL e chave secreta), além da conexão do banco.
- O plano muda em dois pontos: o caminho dos testes da I1.4 (seção 3) e a decisão de Storage, antecipada da I2.4 para a I1.3.
- A entrada de empresas passa pelo administrador da plataforma; a de membros, não (Q1). A empresa aprovada responde por quem convida, e o administrador continua podendo suspender e remover qualquer membro.
- O operador prepara a revisão da adesão (Q2), mas a decisão continua só com o administrador.

---

## 6. Perguntas à pessoa responsável

Respondidas pela pessoa responsável em 28/10.

- **Q1 (seção 2.6):** membro novo convidado pelo `org_admin` precisa da aprovação de um administrador da plataforma? **Resposta:** não, o convite do administrador da empresa basta. O vínculo fica ativo com o aceite do convidado.
- **Q2 (seção 2.9):** o operador fica fora da adesão? **Resposta:** não, ele prepara a revisão (lê pedidos e move para `under_review`), e o administrador decide.

---

## 7. Respostas às ambiguidades da I1.1

| ID | Tema | Decisão | Seção |
|---|---|---|---|
| A1 | o que é "usuário" aprovado | não há aprovação no perfil. O acesso é o vínculo `active` com empresa `active`: o requerente é aprovado junto com a empresa; os demais membros entram pelo convite da empresa aprovada (Q1) | 2.5, 2.6 |
| A2 | entrada de membro novo | convite do `org_admin`, vínculo `pending`, aceite do convidado; sem aprovação da plataforma (Q1) | 2.6 |
| A3 | pedido anônimo ou com conta | conta com e-mail confirmado antes do pedido | 2.5, 2.8 |
| A4 | primeiro administrador | SQL documentado executado pela pessoa responsável, aceito só sem administrador ativo | 2.13 |
| A5 | status de vínculo e de staff | `pending`, `active`, `suspended`, `removed`; `active`, `revoked`. Só `active` dá acesso | 2.10 |
| A6 | revogar e remover | muda o status, com auditoria; reconvite reaproveita a linha | 2.6, 2.10 |
| A7 | perfil em várias empresas | permitido; a operação recebe a empresa explícita | 2.6 |
| A8 | membros de empresa suspensa | perdem o acesso só àquela empresa, calculado na hora, sem cascata | 2.3 |
| A9 | `closed` | final, só o administrador encerra, mesmo efeito de acesso da suspensão; libera o CNPJ | 2.10 |
| A10 | `pending` em `organizations` | no domínio, sem uso; a empresa nasce `active` | 2.10 |
| A11 | CNPJ já cadastrado | único entre empresas não encerradas; filial é empresa separada; envio aceito sem revelar; conflito tratado na revisão | 2.5 |
| A12 | evidência do CNPJ | tabela e bucket próprios da adesão; obrigatória para aprovar; fonte em texto livre | 2.5 |
| A13 | ciclo do pedido | `under_review` pelo administrador ou pelo operador (Q2); decisão só do administrador; motivo obrigatório na rejeição; estados finais; novo pedido é nova linha; transições no banco | 2.5 |
| A14 | resultado da aprovação | requerente vira `org_admin` ativo; `kind` = o pedido; empresa `active`; `kind` muda depois só pelo administrador, menos a compradora que passa a fornecer, que muda só pelo aceite do convite (§9) | 2.5, 9 |
| A15 | configuração crítica | marcação por chave, crítica por padrão | 2.7 |
| A16 | operador lê configuração | só as não críticas; não altera nenhuma | 2.7 |
| A17 | empresas leem configuração | membros ativos leem só as não críticas | 2.7 |
| A18 | auditoria do operador | só com `can_read_audit`, concedido por administrador; vale para as três tabelas de registro | 2.9 |
| A19 | histórico da configuração | `field_history` passa a cobrir `platform_settings`, além de `audit_logs` | 2.7 |
| A20 | "se também for comprador" | depende do `kind` da empresa (`buyer` ou `both`) em ao menos um vínculo ativo | 2.2 |
| A21 | operador e identidade | lê empresas, vínculos, perfis e pedidos; move pedido para `under_review`; não decide nem altera mais nada em identidade (Q2) | 2.9 |
| A22 | reativação | só o administrador, com motivo; o acesso volta na operação seguinte | 2.3 |
| A23 | administrador sobre si mesmo | não altera a própria linha nem o próprio perfil; não revisa o próprio pedido; o último administrador não é revogado | 2.4, 2.13 |
| A24 | último `org_admin` | a empresa ativa mantém ao menos um; ninguém altera o próprio vínculo | 2.6 |
| A25 | alcance do `org_admin` | convida, suspende, reativa, remove e troca papel na própria empresa ativa; altera nome e contatos da empresa | 2.4, 2.6 |
| A26 | perfis | leem o próprio usuário, os colegas de empresa e o staff; o usuário edita `full_name` e `phone`; o administrador só muda o status | 2.4, 2.9 |
| A27 | CNPJ e contatos | no Inc. 1, só a própria empresa e o staff; no Inc. 4, visão sem esses campos | 2.9 |
| A28 | staff que é membro | permitido; conflitos tratados quando o staff agir sobre ofertas | 2.9 |
| A29 | teste 1 no Inc. 1 | função e página provisória protegida agora; catálogo no Inc. 4; mesma resposta para id existente ou não | 2.15 |
| A30 | teste 2, parte de empresa | as tabelas de identidade e os pedidos, em leitura e escrita | anexo A |
| A31 | mutação com negação por padrão | afrouxar, com caso de contraste obrigatório | 3 |
| A32 | chaves estrangeiras de ator | restritivas; anonimização no lugar de exclusão | 2.8, 2.11 |
| A33 | nascimento do perfil | gatilho em `auth.users`; e-mail vem de `auth.users.email` | 2.8 |
| A34 | dados de teste | `is_test` no pedido e na empresa, marcado pelo administrador | 2.5 |
| A35 | e-mail de aprovação | Inc. 5, com a outbox; no Inc. 1 só os e-mails do Auth | 2.8 |

## 8. Revisão independente da I1.7: ressalvas

A revisão aconteceu em 28/10, sobre o commit `b6530dc`, em duas partes:
- **relatório externo:** cobriu o diff, os testes e os testes negativos 1, 2, 4, 5 e 13;
- **complemento T3 (`reasoning-review`):** cobriu três pontos que o relatório não tratou: `manutencao()` e claims no pgTAP, as mutações do anexo A e os links de e-mail.

Nenhuma das duas achou problema crítico ou alto, e o gate do Inc. 1 (crítico bloqueia) foi cumprido. O T2 conferiu cada achado no código antes de registrar.

| ID | Severidade | Ressalva | Ação | Quando |
|---|---|---|---|---|
| R1 | média | **Pré-abertura dos links de e-mail.** `/auth/confirmar` consome o token já no GET, então um filtro de e-mail (como o Safe Links) ou a prévia de link de um aplicativo de mensagens pode usá-lo antes da pessoa. Na recuperação e no convite, a pessoa recebe "link inválido". No cadastro, o e-mail fica confirmado sem ação humana. E como o convite se liga ao perfil que já existe com aquele e-mail (`membros.ts`), quem cadastrou o e-mail alheio pode receber o convite. | O GET passa a só mostrar uma página com botão, com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`. O botão confirma por ação de servidor, com `verifyOtp`. Também reavaliar o convite que se liga a perfil existente sem aviso a quem controla o e-mail. | **corrigida em 28/10 (I1.8):** veja a observação depois da tabela |
| R2 | baixa; média com usuários reais | **Parâmetro repetido no link.** `lerConfirmacao` usa a primeira ocorrência, e o modelo põe `{{ .RedirectTo }}` antes do token. Quem chama a API do Auth escolhe o `redirect_to` dentro da lista permitida, e pode pôr ali um `token_hash` próprio. A vítima entraria logada na conta de quem atacou. | Recusar o link quando `token_hash`, `type`, `code` ou `proximo` vierem repetidos, ou quando `code` e `token_hash` vierem juntos. Cobrir com testes unitários. | **corrigida em 28/10 (I1.8):** `linkAmbiguo` em `src/app/_apoio/confirmacao.ts`, com 4 testes e mutação detectada |
| R3 | baixa | **Reconvite em duas escritas** (ACH-I1.7-02). Se a troca de papel falhar, o convite fica reaberto com o papel anterior, e a operação devolve erro. | Devolver `falha_parcial` ou passar a transição para uma função no `private`. | **corrigida em 28/10 (I1.8):** função `public.reconvidar_membro`, `security invoker` e executável só por `authenticated`. Ela grava status, e-mail e papel numa chamada só, com a RLS e o gatilho valendo para o ator. O servidor chama essa função. |
| R4 | baixa | **Blocos pgTAP sem claims** em `010-base-auditoria` (`anon`, `authenticated` e `service_role`) e `110-adesao` (`anon`). Nenhum passa por causa de `manutencao()`, e o bloco `authenticated` de `010` prova menos do que o nome diz, porque roda sem `sub`. | Definir as claims nesses blocos e pôr no CI uma checagem de asserção sob `set local role` com claims vazias. | **corrigida em 28/10 (I1.8):** claims nos blocos, com um usuário real sem papel no `010`. A checagem fica em `tests/pgtap-claims.test.ts`, no `npm test` do CI. Com as versões antigas dos arquivos, ela acusa as 11 linhas listadas pelo T3. |
| R5 | informativa | **`manutencao()` usa lista de exclusão** (`session_user <> 'authenticator'`). A API do Auth, que escreve com o papel administrativo dela e sem claims, entra no ramo de manutenção. Hoje nenhum gatilho dessa cadeia chama a função, mas um uso futuro em `profiles` abriria esse caminho para dados escolhidos no cadastro. | Usar uma lista permitida de `session_user`, conferida no projeto; exigir `pg_trigger_depth() = 1`; corrigir o comentário da migração; criar um teste pgTAP que fixe as duas funções que chamam `manutencao()`. | **corrigida em 28/10 (I1.8):** a migração `20261028210000_ressalvas_da_revisao` traz a lista permitida (`postgres`, das migrações e dos scripts do T2, conferida no dev; `supabase_admin`, da CLI e do editor do painel), o primeiro nível de gatilho e o comentário corrigido. O `210-manutencao` cobre isso. |
| R6 | informativa | **Registro das mutações.** Os textos do anexo A foram corrigidos nesta revisão, e os WITH CHECK equivalentes por construção foram listados. A lista das 113 mutações da I1.4 não está versionada. | Versionar a lista no próximo ciclo de mutação. | Inc. 2 |
| R7 | informativa | **Produção.** O curinga dos previews na lista de Redirect URLs e um preview gerado por PR de fork, com o repositório público, receberiam links com token. Um proxy na frente da Vercel mudaria o IP usado nos limites (§2.16). | No `repasse-prod`, lista de Redirect URLs sem curinga e proteção de forks da Vercel ligada. Reavaliar os limites por IP se houver proxy. | Inc. 6 (I6.9) |

**Correção da R1 (I1.8, 28/10):**
- **Página com botão:** `/auth/confirmar` virou página do grupo público (`src/app/(publico)/auth/confirmar/page.tsx`). Abrir o link só mostra o botão, e o token é usado pela ação do botão (`src/app/_acoes/confirmacao.ts`), que lê e valida o link de novo.
- **Cabeçalhos:** a página é dinâmica, então sai com `Cache-Control` `no-store`.
  - A referência fica em `Referrer-Policy: same-origin`, e não em `no-referrer`. Com `no-referrer`, o navegador manda `Origin: null` no POST, e o Next recusaria a ação do botão.
  - Com `same-origin`, o endereço com o token não vai para outros sites.
- **Convite:** conta existente só recebe convite com e-mail confirmado ou nascida de convite do Auth (seção 2.6).
- **Testes:**
  - E2E `confirmacao.spec.mts`: o link é aberto duas vezes fora do navegador da pessoa, sem clique, e o botão ainda confirma e leva a `/nova-senha`. O mesmo link, confirmado de novo, dá o aviso fixo;
  - integração: conta de cadastro sem confirmação é recusada, e a conta nascida de convite, como contraste, é aceita.
- **Mutação:** com a página usando o token ao abrir, o clique cai em "link inválido". Sem a checagem da conta, o convite à conta sem confirmação passa. Os dois casos foram detectados.

| ID | Severidade | Ressalva | Ação | Quando |
|---|---|---|---|---|
| R8 | média, com impacto alto | **Cadastro prévio com e-mail alheio, confirmado no `dev` em 28/10.** Quem conhece o e-mail de um lojista e se cadastra antes dele, com a própria senha, entra na conta depois que o dono a confirma. Isso inclui a empresa e o catálogo, se o dono for aprovado, e acontece em paralelo com a sessão do dono. A checagem do convite (R1) reduz o efeito, mas não resolve, porque a conta confirmada passa a valer. Detalhes do teste na observação abaixo. | Opção 1, escolhida pela pessoa responsável: a senha só é criada depois da confirmação. | **corrigida em 28/10 (I1.8):** veja a observação depois do teste |

**Teste da R8 (28/10, projeto de `dev`):**
- **Como foi feito:** a pessoa responsável fez dois cadastros pelas telas, com um endereço próprio e duas senhas diferentes. Depois de cada passo, o T2 fotografou a conta no banco sem exibir e-mail, senha nem hash: guardou a impressão digital do hash fora do repositório e comparou só a igualdade.
- **Resultados:**
  1. O primeiro cadastro, com a senha 1, criou a conta sem confirmação e sem sessão.
  2. O segundo cadastro, com o mesmo endereço e a senha 2, mostrou a mensagem normal na tela. Não criou outra conta e só reenviou a confirmação: a senha e o nome continuaram os do primeiro cadastro.
  3. A pessoa confirmou pelo e-mail mais recente. A conta ficou confirmada, ainda com a senha 1.
  4. Ao entrar, a senha 2 foi recusada e a senha 1 entrou. A conta ficou com duas sessões ao mesmo tempo.
- **Tentativas que não valeram:** uma conta foi confirmada por engano antes do segundo cadastro, e um segundo cadastro usou outro apelido do mesmo endereço, o que criou outra conta.

**Correção da R8 (I1.8, 28/10; opção 1 da pessoa responsável):**
- **Cadastro:** a tela pede só nome e e-mail. A ação manda ao Auth uma senha aleatória, que ninguém conhece (`senhaAleatoria`, em `src/modules/auth/server/cadastro.ts`), e o retorno vai para `/nova-senha`.
- **Confirmação do cadastro** (tipos `signup` e `email`):
  - A ação do botão chama `concluirConfirmacaoDoCadastro`, que troca a senha por outra aleatória com a sessão aberta pela confirmação e encerra as outras sessões. Só depois a pessoa cria a própria senha em `/nova-senha`.
  - Se o Auth recusar, todas as sessões são encerradas, e a pessoa vai para `/entrar` com o aviso de criar a senha pela recuperação.
  - A chave secreta não ganhou uso novo, porque a troca é feita com a sessão.
  - O link PKCE (`code`) não diz o tipo e fica fora; os modelos versionados usam o token.
- **Nova senha:** `definirNovaSenhaAcao` também encerra as outras sessões.
- **Testes:**
  - integração `operacoes/cadastro.test.ts`: o contraste mostra a falha do Auth reproduzida pela API, sem e-mail. Com a conclusão, a senha de quem cadastrou antes deixa de entrar, a sessão aberta por essa pessoa na corrida não renova, e a do dono continua;
  - 3 E2E em `confirmacao.spec.mts`: o cadastro sem campo de senha; a senha de quem cadastrou antes recusada logo depois do clique, e o dono criando a dele; a nova senha encerrando as outras sessões.
- **Mutação:**
  - sem a troca de senha na conclusão, ou sem chamar a conclusão na confirmação, os testes falham;
  - sem o encerramento explícito das sessões, na conclusão ou na nova senha, os testes passam. O motivo foi conferido no `dev`, com controle: o próprio Auth encerra as outras sessões quando a senha muda (`refresh_token_not_found`) e mantém a sessão que trocou. A chamada explícita é a segunda camada, como as mutações equivalentes do anexo A.

Conclusões que não viram ação:
- **ACH-I1.7-01, IP por `x-forwarded-for`:** não procede na Vercel (§2.16).
- **ACH-I1.7-03, redundância entre política e gatilho:** fica como defesa em profundidade.
- **CT4.7 e a política de INSERT do pedido (anexo A):** a justificativa foi confirmada.

---

## 9. Mudança de escopo de 30/10: fornecedora só por convite

**Decisão da pessoa responsável (30/10/2026):** só existe cadastro público de empresa compradora. A empresa fornecedora entra por convite. A especificação já traz a regra (§0, §1.3, §3.1, §5.1, §6.1 e §9).

| Pergunta | Resposta |
|---|---|
| Quem convida? | só o administrador da plataforma; o operador não convida |
| Como a convidada entra? | o convite libera o pedido de adesão como fornecedora ou como fornecedora e compradora; a aprovação, com a conferência de CNPJ e a evidência, continua a da seção 2.5 |
| A empresa pode comprar e fornecer? | sim, por convite; sem convite, o cadastro cria só compradora |
| A compradora que aceita o convite precisa de nova aprovação? (31/10, R-I1.11-02) | não: o aceite de um `org_admin` ativo basta, porque a adesão como compradora já registrou a conferência de CNPJ. Se a C5 exigir documento próprio de fornecedora, a regra volta a ser decidida |

**O que muda no que já existe:**
- **Pedido:**
  - o `requested_kind` livre do pedido (seção 2.5) passa a ser `buyer` para todos;
  - `supplier` e `both` exigem convite;
  - o formulário de adesão deixa de oferecer a escolha sem convite.
- **Testes:** os dados de teste que criam empresa fornecedora pelo pedido passam a criar o convite antes. Isso vale para o pgTAP, a integração e o e2e.
- **Modelo de e-mail do Auth (`convite.html`):** hoje fala em "fazer parte de uma empresa". Passa a servir aos dois convites, de membro e de fornecedora. O texto muda no painel do Auth, pela pessoa responsável, como em 28/10.
- **Página de apresentação (I6.10):** chama só compradores para a adesão; fornecedores, por convite.

**Entregue na I1.9 (30/10):** migração `20261030220000_convite_de_fornecedora`.
- **Convite (`supplier_invitations`):**
  - leva o e-mail normalizado, a empresa (só no convite a uma compradora), o status (`pending`, `used` ou `revoked`), quem convidou, a validade (`expires_at`), quem usou e quando, quem revogou e quando;
  - uma CHECK exige os campos de cada status;
  - não há DELETE nem TRUNCATE, e a auditoria é por gatilho.
- **Validade:**
  - `platform_settings.supplier_invitation_validity_days`, com 14 dias, chave crítica;
  - sem valor válido, o convite não nasce;
  - o vencido continua `pending`, e a tela o mostra como vencido pela data.
- **Gatilho do convite (`proteger_convite_de_fornecedora`):**
  - só o administrador cria e revoga;
  - há um pendente válido por e-mail e empresa, com trava consultiva por e-mail;
  - o convite à compradora só vai ao e-mail de um `org_admin` ativo de compradora ativa;
  - os dados não mudam, e usado e revogado são finais.
- **Pedido:**
  - o gatilho `membership_applications_vincular_convite` roda depois do `_proteger`, que já conferiu sessão e e-mail;
  - o pedido `supplier` ou `both` usa o convite pendente, dentro da validade e sem empresa, do e-mail confirmado do requerente, e o marca como usado na mesma transação;
  - `supplier_invitation_id` é único e fica fora do GRANT;
  - a CHECK `membership_applications_convite_da_fornecedora` repete a regra;
  - pedido rejeitado não devolve o convite: um novo pedido de fornecedora pede convite novo.
- **Aceite pela compradora:**
  - o `org_admin` ativo, com o e-mail convidado confirmado, muda o status para `used`;
  - o gatilho confere a validade e a compradora ativa e torna a empresa `both`. O gatilho da empresa aceita a mudança por ela vir de outro gatilho, como na aprovação;
  - o administrador da plataforma não aceita no lugar da empresa, nem quando também administra a empresa com outro e-mail.
- **Tipo da empresa (`proteger_empresa`):** a mudança de `buyer` para `supplier` ou `both` fora do aceite é recusada, também para o administrador. As outras mudanças de tipo continuam com ele.
- **RLS e GRANT:**
  - leitura pela equipe (administrador e operador) e pelo dono do e-mail confirmado;
  - inclusão só do administrador;
  - alteração pelo administrador ou pelo convidado, no convite com empresa;
  - INSERT só de `email` e `organization_id`, e UPDATE só de `status`.
- **Servidor** (`src/modules/membership/server/convites.ts`):
  - `convidarFornecedora` grava antes de qualquer e-mail, e o banco confere a regra primeiro;
  - o e-mail sem conta recebe o convite do Auth. Se o Auth falhar depois da gravação, a resposta é `falha_parcial`, com o caminho de revogar e convidar de novo;
  - `revogarConviteDeFornecedora` e `aceitarConviteDeFornecedora`;
  - leituras em `queries/convites.ts`; a situação vem de `rules/convites.ts`.
- **Testes:**
  - pgTAP `195-convite-de-fornecedora` (58);
  - os ajudantes de empresa dos 21 arquivos pgTAP, da integração e do e2e convidam antes do pedido de fornecedora;
  - integração `operacoes/convite-de-fornecedora` (13);
  - unitário da situação.
- **Mutações:** 20 de banco e 2 de código, em `supabase/tests/mutacoes/inc-1.md`.
- **I1.10 (31/10):**
  - a adesão sem convite não oferece a escolha de tipo;
  - o início mostra os convites de fornecedora do próprio e-mail confirmado, com o aceite da compradora;
  - `/admin/convites` lista, convida e revoga, e o operador só lê;
  - a equipe lê todos os convites pela RLS, e por isso o início e a adesão filtram pelo e-mail do próprio perfil.
- **Com a pessoa responsável:** o texto do `convite.html`, no painel do Auth.

## 10. Revisão independente da I1.11: ressalvas

A revisão foi feita em 31/10 por um subagente `reasoning-review` (T3), só em leitura, sobre `96b4253..39912a1`.
- **Veredito:** "aprovado com ressalvas". Nenhum achado crítico ou alto; 2 médios, 6 baixos e 6 informativos. Não achou caminho para entrar fornecedora sem convite válido.
- **Corrigido na I1.12,** antes de fechar a mudança de escopo, como no Inc. 2 e no Inc. 3:
  - migração `20261031090000_ressalvas_do_convite`;
  - o `195` passou a 75 asserções;
  - 28 mutações de banco e 2 de código.

| ID | Severidade | Ressalva | Situação |
|---|---|---|---|
| R-I1.11-01 | média | A regra "pedido de empresa nova não usa convite com empresa" não tinha negativo. | **Corrigido:** caso PD12 e mutação C21. |
| R-I1.11-02 | média | A especificação pedia "a mesma aprovação" para a compradora passar a fornecer; o código não aprova. | **Decidido pela pessoa responsável em 31/10:** o aceite basta. A especificação (§0 e §6.1) e a §9 dizem isso. |
| R-I1.11-03 | baixa | Quem administra a plataforma e uma compradora com o mesmo e-mail cumpria o controle sozinho, convidando o próprio e-mail. | **Corrigido:** ninguém convida o próprio e-mail. Caso CV11 e mutação C22. |
| R-I1.11-04 | baixa | A leitura do perfil pelo e-mail usava a chave secreta, sem estar na §2.12. | **Corrigido:** a leitura usa a sessão do administrador; a §2.12 cita o convite de fornecedora do Auth. |
| R-I1.11-05 | baixa | Faltavam casos de perfil, vínculo e empresa suspensos e da compradora que já fornece; havia checagens redundantes sem registro. | **Corrigido:** casos LE06, AC10, AC11, AC12 e RV06 e mutações C23 e C26 a C28. As equivalências estão em `inc-1.md`. |
| R-I1.11-06 | baixa | A `falha_parcial` do convite não tinha teste. | **Corrigido:** caso CV12 na integração. |
| R-I1.11-07 | baixa | O início mostrava "Aceitar" a quem já não podia aceitar. | **Corrigido:** o botão aparece só ao `org_admin` ativo de compradora ativa. O banco decide de novo. |
| R-I1.11-08 | baixa | A leitura dos convites do usuário não filtrava pelo e-mail na consulta. | **Corrigido:** a consulta recebe o e-mail confirmado; o filtro da tela ficou como defesa. |
| R-I1.11-09 | informativa | Trechos antigos deste ADR diziam que o tipo só muda pelo administrador. | **Corrigido:** remissões à §9 na §2.4, na §2.5 e na A14. |
| R-I1.11-10 | informativa | O convite depende da confirmação de e-mail do Auth. | **Registrado** para a I6.9: conferir a confirmação ligada no `repasse-prod`. |
| R-I1.11-11 | informativa | O convidado lia os ids de quem convidou, usou ou revogou. | **Corrigido:** leitura por coluna pela API. Caso LE07 e mutação C25. |
| R-I1.11-12 | informativa | `supplier_invitation_id` ficava fora do que não muda no pedido, protegido só pelo GRANT. | **Corrigido:** entrou na lista. Caso PD13 e mutação C24. |
| R-I1.11-13 | informativa | Contraste fraco em algumas mutações; o limite de tentativas é o mesmo dos dois convites; listas param em 200; auditoria sem empresa. | **Registrado.** As cascatas estão explicadas em `inc-1.md`. |
| R-I1.11-14 | informativa | Nome de empresa com "Motors" num teste; lint local falhava pelo kit de marca. | **Corrigido:** nome neutro no teste; `entrepatios-brand/**` fora do ESLint. |

## Anexo A. Tabela de decisão e casos de teste (I1.1, resolvida)

Base: entrega da I1.1 (T0), com as ambiguidades resolvidas pelas seções acima. "Ambos" = servidor e banco. Os IDs são os da I1.1 e servem de referência para a I1.4.

### A.1. Pedido de adesão

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D01 | anônimo | enviar pedido | recusado; precisa de conta | banco (sem GRANT para `anon`) | §5.1; 2.8 |
| D02 | perfil ativo, sem empresa | enviar pedido válido | permitido; nasce `submitted`, requerente = o próprio perfil | ambos | §5.1, §8; 2.5 |
| D03 | qualquer | enviar com `status`, campos de revisão, papel ou requerente alheio | recusado (Zod estrito; GRANT por coluna; gatilho) | ambos | §3.1, §6.1; 2.4 |
| D04 | qualquer | `requested_kind` fora do domínio ou CNPJ inválido | recusado com erro previsível | ambos | §5.1, §8; 2.5 |
| D05 | perfil suspenso | enviar | recusado | ambos | §7.4.5; 2.3 |
| D06 | membro de empresa ativa | pedir outra empresa | permitido | ambos | §5.1; 2.6 |
| D07 | qualquer | CNPJ já cadastrado ou em outro pedido aberto | envio aceito, resposta igual; aprovação recusada se a empresa existir | ambos | 2.5 |
| D07b | requerente com pedido aberto | enviar outro | recusado | banco | 2.5 |
| D08 | requerente | ler o próprio pedido; ler o de outra pessoa; ler a conferência do próprio pedido | o próprio, sim; o alheio, não; a conferência, não | banco | §1.4.7; 2.5, 2.9 |

### A.2. Revisão

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D09 | administrador, pedido `submitted` ou `under_review` | mover para `under_review`, aprovar ou rejeitar | permitido | ambos | §3.1, §3.3, §6.1 |
| D09b | administrador que é o requerente | revisar o próprio pedido | recusado | banco | 2.4 |
| D10 | operador | ler pedidos e conferências; mover `submitted` para `under_review`; aprovar, rejeitar, gravar conferência ou mudar outra coluna | ler e mover, sim; o resto, recusado | ambos | §3.3; Q2 |
| D11 | membro, `org_admin`, sem empresa, anônimo | revisar | recusado | ambos | §3.3 |
| D12 | administrador | aprovar | grava `reviewed_by` (da sessão), `reviewed_at`, `cnpj_checked_at`, `cnpj_check_source`, `cnpj_check_evidence_id`; sem qualquer um, recusado | banco (CHECK e gatilho) | §6.1; 2.5 |
| D13 | administrador | registrar a conferência | grava `membership_application_reviews.checklist` livre; nenhum item exigido; congelada depois da decisão | banco | §6.1, C5 |
| D14 | administrador | aprovar | cria empresa `active` com o `kind` pedido e vínculo `org_admin` ativo, na mesma transação | banco (gatilho) | 2.5 |
| D14b | administrador | aprovar com evidência de outro pedido | recusado; nada gravado | banco | 2.5 |
| D15 | administrador | rejeitar | grava revisor, data e `decision_reason` obrigatório | banco | §5.1; 2.5 |
| D16 | qualquer | alterar pedido `approved` ou `rejected` | recusado; novo pedido é nova linha | banco | 2.5 |
| D17 | administrador | registrar conferência de CNPJ | exige fonte e evidência; conferência automática só com contrato de provedor | ambos | §1.4.3; plano §4 |
| D18 | sistema | revisão | linha em `audit_logs` por gatilho | banco | §7.1; 2.11 |
| D19 | sistema | aprovação | sem e-mail no Inc. 1; aviso no Inc. 5 | — | §6.13; 2.8 |

### A.3. Papéis de plataforma

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D20 | administrador, alvo com perfil ativo | conceder `admin` ou `operator` | permitido; `granted_by` e `granted_at` do gatilho | ambos | §3.1, §5.1 |
| D21 | operador | conceder, alterar ou revogar | recusado | ambos | §5.1 |
| D22 | não administrador | criar ou alterar a própria linha; papel por payload ou por metadado | recusado | ambos | §3.1, §7.4.4; 2.1 |
| D23 | administrador | revogar outro | permitido; status `revoked` | ambos | §5.1; 2.10 |
| D24 | administrador | alterar a própria linha; revogar o último administrador | recusado | banco | 2.13 |
| D25 | staff revogado, perfil suspenso | exercer o papel com sessão antiga | recusado na operação seguinte | ambos | §6.1, §7.4.5; 2.3 |
| D25b | administrador | liberar auditoria a um operador | permitido (`can_read_audit`) | ambos | §3.3; 2.9 |

### A.4. Membros

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D26 | `org_admin` da própria empresa ativa | convidar | vínculo `pending`, sem aprovação da plataforma | ambos | §3.2; 2.6; Q1 |
| D26b | `org_admin` ou administrador | ativar vínculo `pending` de outra pessoa | recusado; só o convidado aceita | banco | 2.6 |
| D26c | `org_admin` | suspender, reativar, remover, trocar papel de outro membro; cancelar convite | permitido | ambos | §3.2; 2.6 |
| D26d | convidado com perfil ativo | aceitar ou recusar o próprio convite; mudar o papel ao aceitar | aceitar e recusar, sim; mudar o papel, não | banco | 2.6 |
| D27 | `org_admin` de A | gerenciar membros de B (inclusive com o id de B no payload) | recusado | ambos | §1.4.7, §3.2 |
| D28 | `member` | gerenciar membros | recusado | ambos | §3.2 |
| D29 | qualquer | mudar o próprio papel ou status, fora o aceite ou a recusa do próprio convite | recusado | banco | 2.4, 2.6 |
| D30 | administrador | gerenciar membros de qualquer empresa | permitido, menos aceitar no lugar do convidado | ambos | §3.1 |
| D31 | operador | gerenciar membros | recusado | ambos | §3.1; 2.9 |
| D32 | `org_admin` de empresa suspensa | gerenciar membros | recusado | ambos | §6.1 |
| D33 | qualquer | deixar empresa ativa sem `org_admin` ativo | recusado | banco | 2.6 |

### A.5. Perfil e empresa

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D34 | usuário ativo | alterar `full_name` ou `phone` do próprio perfil | permitido | banco | §5.1; 2.4 |
| D35 | usuário | alterar `email` direto | recusado; só a sincronização | banco | §5.1; 2.8 |
| D36 | usuário, inclusive administrador | alterar o próprio `status` | recusado | banco | 2.4 |
| D37 | usuário | alterar perfil alheio | recusado; o administrador só muda o status | banco | §1.4.7; 2.4 |
| D38 | membro de A | ler perfis de membros de B | recusado; colegas da mesma empresa, sim | banco | §1.4.7; 2.9 |
| D38b | `org_admin` | alterar nome e contatos da própria empresa ativa | permitido; `legal_name`, `cnpj`, `kind`, `status`, `is_test`, não | banco | 2.4 |

### A.6. Suspensão e reativação

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D39 | administrador | suspender perfil, com motivo | permitido; depois, bloqueio no Auth | ambos | §3.1; 2.3 |
| D40 | administrador | suspender ou encerrar empresa, com motivo | permitido | ambos | §3.1; 2.3, 2.10 |
| D40b | administrador | suspender sem motivo, pela API | recusado | banco | 2.11 |
| D41 | operador | suspender | recusado | ambos | §3.1; Q2 |
| D42 | administrador | reativar perfil ou empresa suspensa | permitido; empresa `closed` não volta | ambos | 2.3, 2.10 |
| D43 | usuário suspenso com token anterior válido | qualquer leitura ou escrita do produto | recusado na operação seguinte | ambos | §6.1, §7.4.5 |
| D44 | membro de empresa suspensa com token anterior | acessar a empresa | recusado; outra empresa ativa dele continua acessível | ambos | §6.1; 2.3 |
| D45 | membro de empresa `closed` | acessar a empresa | recusado, como na suspensão | ambos | 2.10 |
| D46 | sistema | suspensão e reativação | auditoria por gatilho, com motivo | banco | §7.1; 2.11 |

### A.7. Acesso ao produto e isolamento

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D47 | sem empresa aprovada; anônimo | catálogo ou ficha, inclusive por URL | "sem permissão", para id existente ou não | ambos | §6.1, §7.4.1; 2.15 |
| D48 | membro ativo de empresa ativa `buyer` ou `both` | catálogo | permitido (página provisória no Inc. 1) | ambos | §3.3; 2.15 |
| D49 | membro só de empresa `supplier` | catálogo | recusado | ambos | §3.3; 2.2 |
| D50 | membro de A | ler empresa, vínculos, perfis ou pedido de B | recusado | banco | §1.4.7, §5.1 |
| D51 | quem tem vínculo ativo | ler a própria empresa, inclusive suspensa | permitido | banco | 2.9 |

### A.8. Configuração

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D52 | administrador | ler e alterar qualquer chave | permitido; `field_history` e auditoria | ambos | §3.1; 2.7 |
| D53 | operador | alterar qualquer chave | recusado | ambos | §3.1, §7.4.13 |
| D54 | operador | ler chave crítica | recusado | banco | §7.4.13; 2.7 |
| D55 | operador | ler chave não crítica | permitido | banco | 2.7 |
| D56 | não administrador | inserir, alterar ou apagar | recusado | banco | 2.7 |
| D57 | membro ativo de empresa ativa | ler chave não crítica; ler chave crítica | não crítica, sim; crítica, não | banco | 2.7 |
| D58 | sistema | alteração | valor anterior e novo em `field_history` | banco | §1.4.5; 2.7 |

### A.9. Auditoria

| ID | Ator e condição | Ação | Resultado | Onde | Base |
|---|---|---|---|---|---|
| D59 | administrador | ler as três tabelas de registro | permitido | banco | §3.3 |
| D60 | operador | ler | só com `can_read_audit` | banco | §3.3; 2.9 |
| D61 | membro, `org_admin` | ler | recusado | banco | §3.3 |
| D62 | qualquer, inclusive `service_role` | UPDATE, DELETE ou TRUNCATE | recusado pelo gatilho | banco | §5.6, §7.4.11 |
| D63 | `anon`, `authenticated` | INSERT direto | recusado; só gatilhos e o servidor gravam | banco | 2.11 |
| D64 | sistema | conteúdo | sem senha, token, CNPJ, e-mail ou telefone em `metadata` | banco | §5.6; 2.11 |

### A.10. Casos de teste

Em todos os casos, "recusado" pode ser erro de permissão ou zero linhas afetadas; o teste confere também que nada mudou. Cada teste tem caso de contraste, e cada mutação afrouxa uma camada de cada vez (seção 3).

**Teste 1** (§7.4.1). Preparo: P1, perfil ativo sem vínculo, com pedido `submitted`; P2, membro ativo de empresa ativa `buyer`.

| ID | Dado | Quando | Então |
|---|---|---|---|
| CT1.1 | P1 com sessão válida | abre a página do comprador por URL | "sem permissão", sem dado |
| CT1.2 | P1 | chama `pode_ver_catalogo()` | falso |
| CT1.3 | pedido `under_review` ou `rejected`; empresa `suspended` ou `closed`; vínculo `pending`, `suspended` ou `removed`; empresa só `supplier`; anônimo | as mesmas ações | todas recusadas |
| CT1.4 | P1 | abre um id que existe e um que não existe | a mesma resposta, "sem permissão" |

- Contraste: P2 abre a página, e a função responde verdadeiro.
- Mutação: tirar da função a condição de empresa `active` ou de vínculo `active` derruba CT1.3; tirar a checagem do layout derruba CT1.1.

**Teste 2, parte de empresa** (§7.4.2). Preparo: empresas A e B ativas, `supplier`; a1, `org_admin` de A; a2, `member` de A; b1, `org_admin` de B; X, administrador.

| ID | Dado | Quando | Então |
|---|---|---|---|
| CT2.1 | a2 | lê `organizations` de B | 0 linhas |
| CT2.2 | a2 | lê `organization_members` de B | 0 linhas |
| CT2.3 | a2 | lê `profiles` de b1 | 0 linhas |
| CT2.4 | a2 | lê o pedido que originou B | 0 linhas |
| CT2.5 | a1 | insere vínculo em B, pelo banco ou pelo servidor com o id de B | recusado; nenhuma linha nova |
| CT2.6 | a1 | altera papel ou status de b1 | recusado; b1 inalterado |

- Contraste: a2 lê A e os membros de A; a1 suspende e reativa a2; X lê A e B.
- Mutação: predicado `true` no SELECT de `organizations`, `organization_members` ou `profiles`, ou tirar o filtro de vínculo de `empresas_do_usuario()`, derruba CT2.1 a CT2.4; WITH CHECK `true` no INSERT de `organization_members` derruba CT2.5 (com o gatilho de proteção desligado na transação do teste, porque no caminho normal o gatilho recusa antes da política); USING `true` no UPDATE derruba D28, D31 e CT4.8.
- Achado da I1.4, com o motivo corrigido na I1.7: o WITH CHECK do UPDATE lê `organization_id` e `profile_id`, que não mudam no UPDATE. Duas camadas impedem a mudança, e as duas são testadas em `140-membros`: o GRANT por coluna e o gatilho. Por isso, afrouxar só o WITH CHECK não muda nenhum resultado, e a mutação que conta é a do USING. O CT2.6 em si não cai com ela, porque a política de SELECT também tira as linhas de B do alcance de a1.

**Teste 4** (§7.4.4). Preparo: P, perfil ativo sem papel; O, operador; X1 e X2, administradores; M, `member` de uma empresa ativa.

| ID | Dado | Quando | Então |
|---|---|---|---|
| CT4.1 | P | insere `(P, admin)` em `platform_staff` com o próprio token | recusado; 0 linhas |
| CT4.2 | O | muda a própria linha para `admin` | recusado; O continua `operator` |
| CT4.3 | O | insere linha para outra pessoa ou altera `status` e `granted_by` | recusado |
| CT4.4 | P | envia pedido com `status: approved`, `reviewed_by`, papel ou requerente alheio | recusado; nenhuma linha em `platform_staff` nem vínculo |
| CT4.5 | P | aprova um pedido | recusado; pedido inalterado |
| CT4.6 | P | grava `role: admin` no próprio `user_metadata` e chama operação de administrador | recusado (integração) |
| CT4.7 | X1 | concede papel a P com `granted_by = X2` no payload | pela API, recusado pelo GRANT por coluna; contornando o GRANT, o gatilho grava `granted_by = X1` (as duas camadas são testadas) |
| CT4.8 | M | muda o próprio papel para `org_admin` | recusado |
| CT4.9 | P | altera o próprio `profiles.status` ou `profiles.email` | recusado |
| CT4.10 | C, convidado como `member` | aceita o convite mudando o papel para `org_admin` | recusado; vínculo continua `pending` e `member` |

- Contraste: X1 concede `operator` a P; a linha tem `granted_by = X1`, e P age como operador na operação seguinte. X1 revoga, e P perde o papel na operação seguinte. C aceita o convite sem mudar o papel e passa a ler a empresa.
- Mutação: WITH CHECK `true` no INSERT de `platform_staff` (com o gatilho desligado na transação do teste) ou tirar a exigência de administrador ativo derruba CT4.1 a CT4.3; USING `true` no UPDATE derruba CT4.2; desligar o gatilho de autoalteração derruba CT4.2, CT4.8 e CT4.10; ampliar o GRANT de `profiles` derruba CT4.9; tirar do servidor o esquema estrito derruba CT4.4 pela operação de servidor.
- Achado da I1.4: a política de INSERT de `membership_applications` repete o que o gatilho já exige (requerente = `auth.uid()` e perfil ativo); afrouxá-la sozinha não muda nenhum resultado. Fica como segunda camada, sem teste que a isole.
  - A I1.7 confirmou que só passaria sem aviso a regressão dupla, do gatilho e da política juntos. Isso porque `110-adesao` espera a mensagem do gatilho. Importância baixa.
- Achado da I1.7: o WITH CHECK do UPDATE de `platform_staff` repete o USING e só depende do ator. É uma mutação equivalente pura, porque afrouxá-lo nunca tem efeito.
  - Pelo mesmo motivo, também são equivalentes por construção os WITH CHECK de UPDATE de `profiles`, `organizations`, `membership_applications` (revisão), `membership_application_reviews` e `platform_settings`.
  - A lista das 113 mutações da I1.4 não está versionada (ressalva R6).

**Teste 5** (§7.4.5). Preparo: empresa E ativa; u1, `org_admin` de E; u2, `member` de E. Os tokens são emitidos **antes** da suspensão e continuam válidos; token emitido depois não prova nada.

| ID | Dado | Quando | Então |
|---|---|---|---|
| CT5.1 | X suspende o perfil de u1 | u1 lê E e os membros de E com o token antigo | 0 linhas |
| CT5.2 | u1 suspenso | chama a operação de servidor de membros | recusado, com erro previsível |
| CT5.3 | u1 suspenso | envia pedido de adesão | recusado |
| CT5.4 | X suspende E; o perfil de u2 segue ativo | u2 lê E ou chama operação de servidor com o token antigo | recusado; u2 ainda lê a linha de E com status `suspended` (D51) |
| CT5.5 | operador com perfil suspenso ou papel revogado | lê auditoria ou configuração não crítica | recusado |
| CT5.6 | vínculo de u2 `suspended` ou `removed` | qualquer ação em E | recusado |

- Contraste: u2, com token emitido no mesmo instante que o de u1, continua lendo E depois que u1 é suspenso. Reativado, u1 volta a operar na operação seguinte.
- Mutação: tirar a leitura de `profiles.status` de `perfil_ativo()` derruba CT5.1 e CT5.3; tirar `organizations.status` de `membro_ativo()` derruba CT5.4; tirar a revalidação do servidor derruba CT5.2.

**Teste 13** (§7.4.13). Preparo: o teste insere, na própria transação, a chave crítica K e a não crítica N; O é operador ativo; X é administrador.

| ID | Dado | Quando | Então |
|---|---|---|---|
| CT13.1 | O | altera K ou N | recusado; `value` e `updated_by` inalterados |
| CT13.2 | O | insere chave nova ou apaga K | recusado |
| CT13.3 | O | chama a operação de servidor de configuração | recusado |
| CT13.4 | O | lê K | 0 linhas |
| CT13.5 | O | lê N | 1 linha |

- Contraste: X altera K; `updated_by` passa a X, e há linha nova em `field_history` e em `audit_logs`.
- Mutação: trocar "administrador" por "staff" no UPDATE derruba CT13.1; tirar `not is_critical` do SELECT do operador derruba CT13.4; tirar a checagem do servidor derruba CT13.3.
- Fora do Inc. 1: a outra metade da §3.1, "nem comissões confirmadas".
