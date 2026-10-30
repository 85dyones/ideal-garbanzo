# Mutações do Inc. 3

Lista versionada da verificação de mutação (gate 3; ADR-0002 §3; ressalva R6 do ADR-0002 §8), no mesmo procedimento do `inc-2.md`: cada mutação afrouxa uma camada logo depois do `set constraints all immediate;` de uma cópia do arquivo de teste e é desfeita no rollback do próprio teste, no projeto de desenvolvimento. O negativo precisa cair, e o contraste precisa continuar passando.

## I3.3: migração do domínio documental (30/10/2026)

Resultado: 26 mutações no `400-documental`. 24 derrubaram os casos esperados sem derrubar o contraste; a D06 derruba o arquivo já na preparação; a D01 é equivalente. "Caíram" conta todas as asserções que falharam, inclusive as que dependem do estado deixado pela mutação.

| ID  | Camada             | Mudança                                                                                            | Casos que devem cair                                                                                                                                                                                                                                                                                        | Contraste                                                               | Caíram  | Resultado                   |
| --- | ------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- | --------------------------- |
| D01 | função do private  | estado_documental(): sem apontamentos nas fontes mesmo com revisão aberta                          | —                                                                                                                                                                                                                                                                                                           | contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos | 0       | equivalente: nada caiu      |
| D02 | função do private  | consultas_vigentes() conta também as substituídas                                                  | CT10.6 (inverso): o resultado que chega substitui a consulta pendente                                                                                                                                                                                                                                       | contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos | 2       | caiu; contraste passou      |
| D03 | função do private  | estado_documental() sem a divergência                                                              | linha 17: sem ocorrência conhecida e consulta com ocorrência                                                                                                                                                                                                                                                | contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos | 1       | caiu; contraste passou      |
| D04 | função do private  | estado_documental(): ocorrência declarada × consulta sem ocorrência vira divergência (contra a P1) | CT10.8 (P1)                                                                                                                                                                                                                                                                                                 | contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos | 1       | caiu; contraste passou      |
| D05 | função do private  | estado_documental() sem a revisão aberta                                                           | CT10.7: com revisão aberta                                                                                                                                                                                                                                                                                  | contraste CT10: consulta vigente sem ocorrência leva a sem apontamentos | 1       | caiu; contraste passou      |
| D06 | gatilho            | proteger_consulta() sem copiar a marca de teste da oferta                                          | CT7.1: como postgres, a consulta com a marca de teste enviada entra                                                                                                                                                                                                                                         | CT7.4: a consulta copia a marca de teste                                | arquivo | o arquivo cai na preparação |
| D07 | chave estrangeira  | sem a chave composta (oferta, is_test)                                                             | CT7.1 (chave composta)                                                                                                                                                                                                                                                                                      | CT7.4: a consulta copia a marca de teste                                | 2       | caiu; contraste passou      |
| D08 | chave estrangeira  | substituição sem a chave composta (oferta, categoria, is_test)                                     | CT7.5                                                                                                                                                                                                                                                                                                       | CT10.6: a consulta substituída deixa de contar                          | 2       | caiu; contraste passou      |
| D09 | chave estrangeira  | evidência sem a chave composta (evidência, oferta)                                                 | CT7.7                                                                                                                                                                                                                                                                                                       | CT7.5                                                                   | 2       | caiu; contraste passou      |
| D10 | CHECK              | sem vehicle_checks_sem_dado_pessoal                                                                | dado pessoal recusado: chave no primeiro nível; dado pessoal recusado: aninhada em objeto; dado pessoal recusado: dentro de lista; dado pessoal recusado: com maiúscula e acento; dado pessoal recusado: placa (E30); dado pessoal recusado: composta conhecida; dado pessoal recusado também como postgres | contraste: details com chaves neutras é aceito                          | 8       | caiu; contraste passou      |
| D11 | função da trava    | chave_de_dado_pessoal() sem tirar os acentos                                                       | dado pessoal recusado: com maiúscula e acento                                                                                                                                                                                                                                                               | dado pessoal recusado: chave no primeiro nível                          | 2       | caiu; contraste passou      |
| D12 | gatilho            | proteger_consulta() sem conferir o lado na oferta                                                  | CT10.10: outra empresa não registra consulta; o comprador não registra consulta                                                                                                                                                                                                                             | o org_admin registra consulta na publicada                              | 2       | caiu; contraste passou      |
| D13 | gatilho            | proteger_consulta(): o fornecedor substitui consulta da plataforma                                 | E3: o fornecedor não substitui consulta da plataforma                                                                                                                                                                                                                                                       | o org_admin registra consulta na publicada                              | 2       | caiu; contraste passou      |
| D14 | função de política | pode_registrar_consulta(): o member registra na publicada                                          | o member não registra consulta na publicada                                                                                                                                                                                                                                                                 | o org_admin registra consulta na publicada                              | 1       | caiu; contraste passou      |
| D15 | gatilho            | impedimento automático desligado (declaração e consulta)                                           | P3: a ocorrência declarada em transfer_conditions gera o impedimento; D9: o impedimento entra nas pendências; P4: a publicada com impedimento ativo sai do catálogo                                                                                                                                         | contraste P4: a publicada sem impedimento continua aberta               | 10      | caiu; contraste passou      |
| D16 | função do private  | tem_impedimento_ativo() sempre falso (como no Inc. 2)                                              | D9: o impedimento entra nas pendências; D9: com impedimento ativo, a oferta não vai para revisão; P4: a publicada com impedimento ativo sai do catálogo; P4: a oferta com impedimento ativo não é reservada                                                                                                 | P3: a ocorrência declarada em transfer_conditions gera o impedimento    | 5       | caiu; contraste passou      |
| D17 | função do private  | oferta_aberta() sem o impedimento                                                                  | P4: a publicada com impedimento ativo sai do catálogo                                                                                                                                                                                                                                                       | contraste P4: a publicada sem impedimento continua aberta               | 1       | caiu; contraste passou      |
| D18 | gatilho            | proteger_oferta(): reserva com impedimento ativo                                                   | P4: a oferta com impedimento ativo não é reservada (T08)                                                                                                                                                                                                                                                    | contraste P4: a publicada sem impedimento continua aberta               | 1       | caiu; contraste passou      |
| D19 | RLS                | política transfer_impediments_resolucao com USING e WITH CHECK true                                | E21: o operador não resolve impedimento                                                                                                                                                                                                                                                                     | E21: o administrador resolve com motivo e evidência                     | 1       | caiu; contraste passou      |
| D20 | RLS e gatilho      | política aberta e gatilho sem conferir o administrador                                             | E21: o operador não resolve impedimento                                                                                                                                                                                                                                                                     | P3: a ocorrência declarada em transfer_conditions gera o impedimento    | 2       | caiu; contraste passou      |
| D21 | gatilho            | proteger_impedimento() aceita inclusão direta                                                      | P3: o impedimento não entra por inclusão direta                                                                                                                                                                                                                                                             | P3: a ocorrência declarada em transfer_conditions gera o impedimento    | 1       | caiu; contraste passou      |
| D22 | gatilho            | proteger_impedimento(): o resolvido volta a identificado                                           | E22: o impedimento resolvido não volta                                                                                                                                                                                                                                                                      | E21: o administrador resolve com motivo e evidência                     | 1       | caiu; contraste passou      |
| D23 | gatilho            | só inclusão desligado em vehicle_checks                                                            | CT11.8: a consulta não se altera; CT11.9: a consulta não se apaga                                                                                                                                                                                                                                           | CT11.13: as consultas substituídas continuam no registro                | 2       | caiu; contraste passou      |
| D24 | gatilho            | proteger_revisao_documental() sem conferir a equipe                                                | E19: o fornecedor não abre revisão documental                                                                                                                                                                                                                                                               | contraste E8: o operador abre a revisão com motivo                      | 1       | caiu; contraste passou      |
| D25 | gatilho            | proteger_revisao_documental() sem o pareamento                                                     | E8: não se abre uma revisão já aberta                                                                                                                                                                                                                                                                       | contraste E8: o operador abre a revisão com motivo                      | 1       | caiu; contraste passou      |
| D26 | função de política | pode_registrar_consulta() aceita qualquer empresa                                                  | outra empresa não envia evidência à oferta alheia                                                                                                                                                                                                                                                           | o fornecedor envia evidência à própria oferta                           | 2       | caiu; contraste passou      |

**Notas:**

- **D01:** a revisão aberta também entra como under_review, que tem precedência maior.
- **D02:** no CT10.6 direto, pending vence de qualquer jeito; quem detecta é o caso inverso.
- **D06:** sem a cópia, a chave composta recusa; a consulta da oferta de teste também perde a marca na preparação.
- **D19:** com a política aberta, o operador chega ao gatilho, que recusa com erro em vez de 0 linhas.
- **D20:** o operador resolve; a asserção seguinte (exige evidência) cai em cascata.

## SQL de cada mutação (I3.3)

Inserido logo depois de `set constraints all immediate;`, na cópia de `400-documental.test.sql`.

**D01**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_documental(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not revisao then\s+candidatos := array_append\(candidatos, ''no_findings_in_sources''\);\s+end if;', 'candidatos := array_append(candidatos, ''no_findings_in_sources'');');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_documental(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D02**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.consultas_vigentes(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and not exists \(select 1 from public.vehicle_checks s where s.supersedes_check_id = c.id\)', '');
  if n = d then
    raise exception 'mutação não aplicada em private.consultas_vigentes(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D03**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_documental(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if declarado = ''no_known_occurrence'' and ocorrencia_na_consulta then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_documental(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D04**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_documental(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if declarado = ''no_known_occurrence'' and ocorrencia_na_consulta then', 'if (declarado = ''no_known_occurrence'' and ocorrencia_na_consulta) or (declarado = ''has_occurrence'' and confirmada) then');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_documental(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D05**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_documental(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if revisao then\s+candidatos := array_append\(candidatos, ''under_review''\);\s+end if;', '');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_documental(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D06**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_consulta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'new\.is_test := oferta\.is_test;', '');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_consulta()';
  end if;
  execute n;
end
$m$;
```

**D07**

```sql
alter table public.vehicle_checks drop constraint vehicle_checks_oferta_e_teste_fkey;
```

**D08**

```sql
alter table public.vehicle_checks drop constraint vehicle_checks_substitui_da_mesma_oferta_fkey;
```

**D09**

```sql
alter table public.vehicle_checks drop constraint vehicle_checks_evidencia_da_oferta_fkey;
```

**D10**

```sql
alter table public.vehicle_checks drop constraint vehicle_checks_sem_dado_pessoal;
```

**D11**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.chave_de_dado_pessoal(text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, '''aaaaaeeeeiiiiooooouuuucn''', '''áàâãäéèêëíìîïóòôõöúùûüçñ''');
  if n = d then
    raise exception 'mutação não aplicada em private.chave_de_dado_pessoal(text)';
  end if;
  execute n;
end
$m$;
```

**D12**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_consulta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if lado is null then\s+raise exception ''sem permissão'' using errcode = ''42501'';\s+end if;', '');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_consulta()';
  end if;
  execute n;
end
$m$;
```

**D13**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_consulta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if found and lado = ''supplier'' and anterior\.recorded_as = ''platform'' then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_consulta()';
  end if;
  execute n;
end
$m$;
```

**D14**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pode_registrar_consulta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'private\.membro_ativo\(o\.supplier_organization_id, array\[''org_admin''\]\)', 'private.membro_ativo(o.supplier_organization_id)');
  if n = d then
    raise exception 'mutação não aplicada em private.pode_registrar_consulta(uuid)';
  end if;
  execute n;
end
$m$;
```

**D15**

```sql
alter table public.supplier_declarations disable trigger supplier_declarations_impedimento; alter table public.vehicle_checks disable trigger vehicle_checks_impedimento;
```

**D16**

```sql
create or replace function private.tem_impedimento_ativo(p_oferta uuid) returns boolean language sql stable security definer set search_path = '' as $f$ select false and p_oferta is not null $f$;
```

**D17**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.oferta_aberta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and not private\.tem_impedimento_ativo\(p_oferta\)', '');
  if n = d then
    raise exception 'mutação não aplicada em private.oferta_aberta(uuid)';
  end if;
  execute n;
end
$m$;
```

**D18**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if new\.status = ''reserved'' and private\.tem_impedimento_ativo\(old\.id\) then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**D19**

```sql
alter policy transfer_impediments_resolucao on public.transfer_impediments using (true) with check (true);
```

**D20**

```sql
alter policy transfer_impediments_resolucao on public.transfer_impediments using (true) with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_impedimento()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not private\.equipe_sem_vinculo\(oferta\.supplier_organization_id, array\[''admin''\]\) then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_impedimento()';
  end if;
  execute n;
end
$m$;
```

**D21**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_impedimento()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if pg_trigger_depth\(\) < 2 then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_impedimento()';
  end if;
  execute n;
end
$m$;
```

**D22**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_impedimento()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if old\.status <> ''identified'' or new\.status <> ''resolved'' then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_impedimento()';
  end if;
  execute n;
end
$m$;
```

**D23**

```sql
alter table public.vehicle_checks disable trigger vehicle_checks_so_inclusao;
```

**D24**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_revisao_documental()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not found or not private\.equipe_sem_vinculo\(oferta\.supplier_organization_id\) then', 'if not found then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_revisao_documental()';
  end if;
  execute n;
end
$m$;
```

**D25**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_revisao_documental()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if new\.action = ''open_review'' and aberta then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_revisao_documental()';
  end if;
  execute n;
end
$m$;
```

**D26**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pode_registrar_consulta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and not private\.membro_ativo\(o\.supplier_organization_id\)\s+and private\.equipe_sem_vinculo\(o\.supplier_organization_id\)', '');
  if n = d then
    raise exception 'mutação não aplicada em private.pode_registrar_consulta(uuid)';
  end if;
  execute n;
end
$m$;
```
