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
