# Mutações do Inc. 1

Lista versionada da verificação de mutação (gate 3; ADR-0002 §3). As mutações da I1.4 não foram versionadas (ressalva R6 do ADR-0002 §8). Esta lista começa na I1.9.

## I1.9: convite de fornecedora (30/10/2026)

Mudança de escopo de 30/10 (ADR-0002 §9).

**Banco:** 20 mutações, todas detectadas, sem derrubar o contraste.

- Cada mutação entra numa cópia do `195-convite-de-fornecedora`, depois da fixture e antes do primeiro bloco de casos, e é desfeita no rollback do próprio teste, no projeto de desenvolvimento.
- "Caíram" conta todas as asserções que falharam, inclusive as que dependem do estado deixado pela mutação.

| ID  | Camada             | Mudança                                                    | Casos que devem cair            | Contraste                                     | Caíram |
| --- | ------------------ | ---------------------------------------------------------- | ------------------------------- | --------------------------------------------- | ------ |
| C01 | gatilho do pedido  | membership_applications_vincular_convite desligado         | PD01:; PD02:; PD05: com convite | PD03: o pedido de compradora não pede convite | 10     |
| C02 | gatilho do pedido  | o convite de qualquer e-mail serve                         | PD01:                           | CV08:                                         | 9      |
| C03 | gatilho do pedido  | o convite vencido serve                                    | PD06:                           | PD05: com convite                             | 1      |
| C04 | gatilho do pedido  | o convite usado ou revogado serve                          | PD07:; PD10: o convite usado    | PD05: com convite                             | 2      |
| C05 | gatilho do convite | qualquer usuário convida                                   | CV01:; CV02:                    | CV03: o administrador da plataforma convida   | 2      |
| C06 | RLS                | supplier_invitations_convite com WITH CHECK true           | CV10 (política)                 | CV03: o administrador da plataforma convida   | 1      |
| C07 | gatilho do convite | o convite da compradora vai a qualquer membro              | CV06:                           | CV08:                                         | 1      |
| C08 | gatilho do convite | o aceite sem conferir o e-mail                             | AC03b:                          | CV08:                                         | 6      |
| C09 | gatilho do convite | o aceite sem conferir o org_admin                          | AC04: quem deixou               | CV08:                                         | 5      |
| C10 | gatilho do convite | o aceite do convite vencido                                | AC05:                           | CV08:                                         | 2      |
| C11 | gatilho da empresa | proteger_empresa() sem a trava do tipo                     | TP01:; TP02:                    | TP03:                                         | 2      |
| C12 | RLS                | supplier_invitations_alteracao com USING e WITH CHECK true | AC08:; RV02:                    | AC06: o administrador da compradora aceita    | 2      |
| C13 | RLS                | supplier_invitations_leitura com USING true                | LE01:; LE02:                    | LE04:                                         | 3      |
| C14 | função do private  | email_confirmado_do_usuario() sem a confirmação            | LE03:                           | LE01:                                         | 1      |
| C15 | CHECK              | sem membership_applications_convite_da_fornecedora         | CK01 (CHECK)                    | PD03: o pedido de compradora não pede convite | 1      |
| C16 | GRANT              | INSERT de supplier_invitation_id para authenticated        | PD04:                           | PD03: o pedido de compradora não pede convite | 2      |
| C17 | GRANT              | INSERT de status do convite para authenticated             | CV05:                           | CV03: o administrador da plataforma convida   | 1      |
| C18 | gatilho do convite | sem a guarda da validade configurada                       | VA01:                           | AU01:                                         | 1      |
| C19 | gatilho do convite | sem a recusa do pendente repetido                          | CV04:                           | CV03: o administrador da plataforma convida   | 3      |
| C20 | gatilho do convite | o convite de empresa nova aceito por alteração             | AC09:                           | AC06: o administrador da compradora aceita    | 1      |

**Ajustes ao rodar:**

- **C02:** quem não tem convite usa o de outro e-mail e fica com pedido aberto, então o caso do pedido de compradora (PD03) cai em cascata. O contraste passou a ser o CV08.
- **C08 a C10:** o aceite indevido torna a compradora `both`, e o aceite legítimo (AC06) cairia em cascata. O contraste é o CV08.
- **C12:** AC01 e AC02 continuam de pé com a política de alteração aberta, porque a política de leitura também filtra o UPDATE. Quem derruba a mutação são o AC08 e o RV02. Para o membro comum e para quem é de fora, as duas políticas se sobrepõem por construção.
- **C16:** o pedido indevido ocupa o pedido aberto de N1, e o PD05 cairia em cascata. O contraste passou a ser o PD03.
- **C19:** sem a recusa do pendente repetido, a fixture guardava dois ids para o mesmo convite. O ajudante passou a guardar o mais antigo.
- **AC03b:** a mutação do e-mail no aceite (C08) mostrou que o caso faltava. O administrador da plataforma que também administra a compradora passa pela política de alteração; só a checagem do e-mail no gatilho o barra.

**Código:** 2 mutações no servidor, rodadas contra `tests/integration/operacoes/convite-de-fornecedora.test.ts`. O arquivo é trocado, o teste roda e o original volta, conferido byte a byte.

| ID  | Mudança                                                       | Caiu                                                   |
| --- | ------------------------------------------------------------- | ------------------------------------------------------ |
| S01 | `convidarFornecedora` sem a checagem de administrador         | CV01/CV02 (o servidor deixa de recusar antes do banco) |
| S02 | `revogarConviteDeFornecedora` sem a checagem de administrador | RV01                                                   |

- **Sem mutação de código no aceite:** a pré-checagem do `org_admin` em `aceitarConviteDeFornecedora` é equivalente no resultado. A mesma resposta (`sem_permissao`) vem do banco, pela política de leitura e pelo gatilho.

### Mudança de cada mutação (I1.9)

**C01**

```sql
alter table public.membership_applications disable trigger membership_applications_vincular_convite;
```

**C02**

Troca em `pg_get_functiondef('private.vincular_convite_ao_pedido()'::regprocedure)`:

```sql
regexp_replace(d, ' and c[.]email = lower[(]u[.]email[)]', '')
```

**C03**

Troca em `pg_get_functiondef('private.vincular_convite_ao_pedido()'::regprocedure)`:

```sql
regexp_replace(d, ' and c[.]expires_at > now[(][)]', '')
```

**C04**

Troca em `pg_get_functiondef('private.vincular_convite_ao_pedido()'::regprocedure)`:

```sql
regexp_replace(d, 'c[.]status = ''pending'' and ', '')
```

**C05**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if ator is null or not private[.]tem_papel_na_plataforma[(]array[[]''admin''[]][)] then([[:space:]]+)raise exception ''só um administrador da plataforma convida', 'if false then\1raise exception ''só um administrador da plataforma convida')
```

**C06**

```sql
alter policy supplier_invitations_convite on public.supplier_invitations with check (true);
```

**C07**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'and m[.]role = ''org_admin'' and m[.]status = ''active''', 'and m.status = ''active''')
```

**C08**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, '[[:space:]]+or private[.]email_confirmado_do_usuario[(][)] is distinct from old[.]email', '')
```

**C09**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, '[[:space:]]+or not private[.]membro_ativo[(]old[.]organization_id, array[[]''org_admin''[]][)]', '')
```

**C10**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if old[.]expires_at <= now[(][)] then', 'if false then')
```

**C11**

Troca em `pg_get_functiondef('private.proteger_empresa()'::regprocedure)`:

```sql
regexp_replace(d, 'if old[.]kind = ''buyer'' and new[.]kind in [(]''supplier'', ''both''[)] then', 'if false then')
```

**C12**

```sql
alter policy supplier_invitations_alteracao on public.supplier_invitations using (true) with check (true);
```

**C13**

```sql
alter policy supplier_invitations_leitura on public.supplier_invitations using (true);
```

**C14**

Troca em `pg_get_functiondef('private.email_confirmado_do_usuario()'::regprocedure)`:

```sql
regexp_replace(d, ' and u[.]email_confirmed_at is not null', '')
```

**C15**

```sql
alter table public.membership_applications drop constraint membership_applications_convite_da_fornecedora;
```

**C16**

```sql
grant insert (supplier_invitation_id) on public.membership_applications to authenticated;
```

**C17**

```sql
grant insert (status) on public.supplier_invitations to authenticated;
```

**C18**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if dias is null or dias < 1 then', 'if false then')
```

**C19**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if exists [(][[:space:]]+select 1 from public[.]supplier_invitations c[[:space:]]+where c[.]email = new[.]email', 'if false and exists (select 1 from public.supplier_invitations c where c.email = new.email')
```

**C20**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if old[.]organization_id is null then([[:space:]]+)raise exception ''o convite para empresa nova', 'if false then\1raise exception ''o convite para empresa nova')
```

## I1.12: correção das ressalvas da I1.11 (31/10/2026)

**Banco:** as 20 mutações da I1.9 rodaram de novo sobre o `195` corrigido (75 asserções), e entraram as C21 a C28. São 28, todas detectadas, sem derrubar o contraste. O executor é o mesmo da I1.9.

| ID  | Camada             | Mudança                                                                        | Casos que devem cair                                       | Contraste                        | Caíram |
| --- | ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------- | ------ |
| C21 | gatilho do pedido  | o pedido de empresa nova usa o convite da compradora (R-I1.11-01)              | PD12: o convite para a compradora                          | CV08:                            | 8      |
| C22 | gatilho do convite | o convite do próprio e-mail (R-I1.11-03)                                       | CV11: ninguém convida; CV11: nem para empresa nova         | CV08:                            | 2      |
| C23 | RLS                | supplier_invitations_leitura sem o perfil ativo (R-I1.11-05)                   | LE06: com o perfil suspenso                                | LE01:                            | 1      |
| C24 | gatilho do pedido  | supplier_invitation_id fora do que não muda (R-I1.11-12)                       | PD13 (gatilho)                                             | PD10: o pedido de N1 é rejeitado | 1      |
| C25 | GRANT              | SELECT de invited_by para authenticated (R-I1.11-11)                           | LE07: o convidado não lê                                   | LE07: lê as colunas              | 1      |
| C26 | gatilho do convite | o aceite confere só o papel, sem vínculo, perfil e empresa ativos (R-I1.11-05) | AC10: com o vínculo suspenso; AC11: com a empresa suspensa | CV08:                            | 2      |
| C27 | gatilho do convite | o aceite sem conferir que a empresa ainda é só compradora (R-I1.11-05)         | AC12:                                                      | CV08:                            | 1      |
| C28 | gatilho do convite | os dados do convite mudam no UPDATE (R-I1.11-05)                               | RV06 (gatilho)                                             | RV01: o administrador revoga     | 1      |

**C01 a C20 de novo:** todas detectadas. Algumas derrubam mais casos do que na I1.9, porque o arquivo tem casos novos depois delas (C01, C02, C09, C13 e C19).

**Código:** S01 e S02 rodaram de novo, com a leitura do perfil já pela sessão (R-I1.11-04). As duas foram detectadas, e o original voltou conferido byte a byte.

**Equivalentes por construção (R-I1.11-05)**, sem mutação própria:

- **No gatilho do pedido:**
  - `u.email_confirmed_at is not null`: o gatilho `_proteger` recusa antes o pedido sem e-mail confirmado (PD08);
  - `lower(u.email)`: o convite guarda o e-mail em minúsculas (CHECK), e o Auth também.
- **No aceite:**
  - `perfil_ativo()` e `o.status = 'active'`: o `membro_ativo` já exige perfil, vínculo e empresa ativos. A C26, que troca o `membro_ativo` por uma conferência só do papel, mostra que essas camadas valem juntas: o AC11 cai pela mensagem da compradora ativa;
  - a política de alteração e a de leitura se sobrepõem para o membro comum e para quem é de fora (C12).
- **No UPDATE do convite:** a imutabilidade dos dados vale pela API só pelo GRANT de UPDATE, que cobre só `status`. O RV06 exercita o gatilho sozinho, como postgres com as claims do administrador, e a C28 o derruba.

### Mudança de cada mutação nova (I1.12)

**C21**

Troca em `pg_get_functiondef('private.vincular_convite_ao_pedido()'::regprocedure)`:

```sql
regexp_replace(d, 'c[.]organization_id is null and ', '')
```

**C22**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if new[.]email = private[.]email_confirmado_do_usuario[(][)] then', 'if false then')
```

**C23**

```sql
alter policy supplier_invitations_leitura on public.supplier_invitations using ((select private.tem_papel_na_plataforma(array['admin', 'operator'])) or (email = (select private.email_confirmado_do_usuario())));
```

**C24**

Troca em `pg_get_functiondef('private.proteger_pedido_de_adesao()'::regprocedure)`:

```sql
regexp_replace(d, '(new|old)[.]supplier_invitation_id, ', '', 'g')
```

**C25**

```sql
grant select (invited_by) on public.supplier_invitations to authenticated;
```

**C26**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'not private[.]membro_ativo[(]old[.]organization_id, array[[]''org_admin''[]][)]', 'not exists (select 1 from public.organization_members m where m.organization_id = old.organization_id and m.profile_id = ator and m.role = ''org_admin'')')
```

**C27**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'where o[.]id = old[.]organization_id and o[.]status = ''active'' and o[.]kind = ''buyer''', 'where o.id = old.organization_id and o.status = ''active''')
```

**C28**

Troca em `pg_get_functiondef('private.proteger_convite_de_fornecedora()'::regprocedure)`:

```sql
regexp_replace(d, 'if [(]new[.]id, new[.]email, new[.]organization_id, new[.]invited_by, new[.]expires_at, new[.]created_at[)]', 'if false and (new.id, new.email, new.organization_id, new.invited_by, new.expires_at, new.created_at)')
```
