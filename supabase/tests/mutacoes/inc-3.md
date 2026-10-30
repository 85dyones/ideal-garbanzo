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

## I3.5: operações de servidor e linguagem no texto livre (30/10/2026)

Resultado: 8 mutações. 7 derrubaram os casos esperados sem derrubar o contraste; a S07 é equivalente. Código: o arquivo é trocado, o teste de integração indicado roda, e o original volta, conferido byte a byte. Banco: o gatilho é desligado no projeto de desenvolvimento e religado depois, conferido no catálogo.

| ID  | Camada                 | Teste                        | Mudança                                                                                      | Casos que devem cair                                           | Caíram | Resultado              |
| --- | ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ---------------------- |
| S01 | `rules/estados.ts`     | `estado-documental-paridade` | estadoDaCategoria() sem a divergência                                                        | as 40 linhas da tabela de decisão                              | 2      | caiu; contraste passou |
| S02 | `rules/estados.ts`     | `estado-documental-paridade` | estadoDaCategoria(): sem apontamentos mesmo com revisão aberta, sem a revisão como candidata | as 40 linhas da tabela de decisão                              | 2      | caiu; contraste passou |
| S03 | `schemas/consultas.ts` | `documental-operacoes`       | esquema da consulta sem a lista de linguagem no resumo                                       | linguagem proibida e data futura são recusadas no servidor     | 1      | caiu; contraste passou |
| S04 | `rules/estados.ts`     | `documental-operacoes`       | origemDaConsulta() sem exigir o registro pela plataforma                                     | o member registra no rascunho                                  | 1      | caiu; contraste passou |
| S05 | `server/estados.ts`    | `documental-operacoes`       | consultarEstadosDocumentais() mostra também as consultas substituídas                        | a equipe registra na publicada                                 | 1      | caiu; contraste passou |
| S06 | `server/estados.ts`    | `documental-operacoes`       | consultarEstadosDocumentais() sem a ressalva do impedimento                                  | nasce da declaração em transfer_conditions                     | 1      | caiu; contraste passou |
| S07 | `server/consultas.ts`  | `documental-operacoes`       | registrarConsulta() sem recusar quem não age na oferta                                       | o member não registra na publicada; outra empresa não registra | 0      | equivalente: nada caiu |
| S08 | gatilho do banco       | `documental-operacoes`       | gatilho vehicle_checks_revisar_linguagem desligado                                           | linguagem proibida e data futura são recusadas no servidor     | 1      | caiu; contraste passou |

- **S07:** para outra empresa, a leitura da oferta pela sessão já responde "sem permissão" antes da checagem do ator. A checagem pesa só no caso da equipe com vínculo pendente ou suspenso com a empresa dona (B25), que lê a oferta pela política da equipe e que o banco recusa em `private.lado_na_oferta`.
- **Contraste:** nas mutações do teste de paridade (S01 e S02), o contraste é o próprio teste dos casos com mais de uma consulta, que só cai quando a mutação toca a regra que ele exercita.

## I3.4: testes do domínio documental (30/10/2026)

Resultado: 23 mutações de pgTAP sugeridas pelo builder, conferidas por ele num Postgres local e rodadas pelo T2 no projeto de desenvolvimento. Todas derrubaram casos do arquivo indicado. Três derrubam também um contraste, em cascata, como o builder descreveu. A troca da própria `private.revisao_aberta` ficou de fora: ela derruba o arquivo inteiro, porque o gatilho da revisão usa a mesma função.

| ID                             | Arquivo                         | Caíram | Contrastes em cascata | Resultado |
| ------------------------------ | ------------------------------- | ------ | --------------------- | --------- |
| `e-divergencia-p1`             | `410-documental-tabela`         | 4      | 0                     | caiu      |
| `e-nko-confirmada-sempre`      | `410-documental-tabela`         | 3      | 0                     | caiu      |
| `e-revisao-qualquer-no-estado` | `410-documental-tabela`         | 2      | 1                     | caiu      |
| `e-sem-divergencia`            | `410-documental-tabela`         | 4      | 0                     | caiu      |
| `e-sem-revisao`                | `410-documental-tabela`         | 23     | 0                     | caiu      |
| `e-sem-substituicao`           | `410-documental-tabela`         | 6      | 0                     | caiu      |
| `e-substituicao-repetida`      | `410-documental-tabela`         | 1      | 0                     | caiu      |
| `e-substituicao-sem-categoria` | `410-documental-tabela`         | 3      | 2                     | caiu      |
| `t10-calculo-exposto`          | `420-documental-testes-7-10-11` | 1      | 0                     | caiu      |
| `t10-documento-conta`          | `420-documental-testes-7-10-11` | 2      | 0                     | caiu      |
| `t10-estado-gravavel`          | `420-documental-testes-7-10-11` | 2      | 0                     | caiu      |
| `t10-sem-fonte`                | `420-documental-testes-7-10-11` | 3      | 0                     | caiu      |
| `t10-sem-limitacoes`           | `420-documental-testes-7-10-11` | 2      | 0                     | caiu      |
| `t11-auditoria`                | `420-documental-testes-7-10-11` | 3      | 0                     | caiu      |
| `t11-cascata`                  | `420-documental-testes-7-10-11` | 1      | 0                     | caiu      |
| `t11-grant-api`                | `420-documental-testes-7-10-11` | 14     | 0                     | caiu      |
| `t11-impedimento-colunas`      | `420-documental-testes-7-10-11` | 4      | 0                     | caiu      |
| `t11-impedimento-gatilho`      | `420-documental-testes-7-10-11` | 5      | 0                     | caiu      |
| `t11-so-inclusao-desligado`    | `420-documental-testes-7-10-11` | 13     | 0                     | caiu      |
| `t7-is-test-da-oferta-livre`   | `420-documental-testes-7-10-11` | 1      | 0                     | caiu      |
| `t7-is-test-no-payload`        | `420-documental-testes-7-10-11` | 6      | 0                     | caiu      |
| `t7-mesma-oferta`              | `420-documental-testes-7-10-11` | 8      | 1                     | caiu      |
| `t7-sem-chave-de-teste`        | `420-documental-testes-7-10-11` | 4      | 0                     | caiu      |

- **`e-revisao-qualquer-no-estado`:** o contraste E3 da mesma categoria cai em cascata, porque a revisão aberta muda o estado de partida.
- **`e-substituicao-sem-categoria`:** a substituição indevida é aceita, e os dois contrastes seguintes, da mesma cadeia, caem em cascata.
- **`t7-mesma-oferta`:** o contraste do CT11.14 cai em cascata, porque o impedimento de PT passa a aceitar a evidência de outra oferta.

**Código (builder, conferido com `cmp`):**

- `estadoDaCategoria` sem a divergência: caem 4 testes da tabela de decisão no servidor;
- sem a revisão como candidata: caem 23;
- com a divergência da P1: caem 4;
- o teste de linguagem sem a pasta das migrações: cai "lê toda migração";
- `mensagensDoBanco` sem ler as mensagens: caem 5.

O SQL de cada mutação fica no scratchpad da sessão (`i34/mut/`), montado por `montar-mutacoes.mjs` a partir da definição vigente.

## I3.6: telas do domínio documental (30/10/2026)

Mutações do builder nos testes de tela (`ficha.test.ts` e `documental.test.ts`), conferidas com `cmp`. As 5 derrubaram testes:

- estado sem a fonte e a data;
- origem colada ao estado;
- sem "sem evidência anexada";
- ressalva do impedimento na lista de pendências;
- fornecedor podendo substituir consulta da plataforma.

## I3.9: correção das ressalvas da I3.7 (30/10/2026)

Resultado: 20 mutações, todas detectadas, sem derrubar o contraste. A E19 e a E20 vêm das decisões da pessoa responsável sobre a R-I3.7-07 e a R-I3.7-13. A maioria roda no `430-documental-ressalvas`; a E09 roda no `400`.

| ID  | Camada            | Arquivo                    | Mudança                                                                    | Casos que devem cair                                                                                                                                                          | Caíram |
| --- | ----------------- | -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| E01 | RLS               | `430-documental-ressalvas` | vehicle_checks_leitura com USING true                                      | R-I3.7-01: outra empresa não lê; R-I3.7-01: o comprador também não lê                                                                                                         | 2      |
| E02 | RLS               | `430-documental-ressalvas` | check_evidence_files_leitura com USING true                                | R-I3.7-01: outra empresa não lê; R-I3.7-01: o comprador também não lê                                                                                                         | 2      |
| E03 | RLS               | `430-documental-ressalvas` | documental_reviews_leitura com USING true                                  | R-I3.7-01: outra empresa não lê; R-I3.7-01: o comprador também não lê                                                                                                         | 2      |
| E04 | RLS               | `430-documental-ressalvas` | transfer_impediments_leitura com USING true                                | R-I3.7-01: outra empresa não lê; R-I3.7-01: o comprador também não lê                                                                                                         | 2      |
| E05 | Storage           | `430-documental-ressalvas` | política de leitura no bucket check-evidence                               | R-I3.7-01: nem a empresa dona lê o objeto; R-I3.7-01: o bucket das evidências não tem política                                                                                | 2      |
| E06 | RLS               | `430-documental-ressalvas` | vehicle_checks_inclusao com WITH CHECK true                                | R-I3.7-01 (política): outra empresa não registra consulta                                                                                                                     | 1      |
| E07 | RLS               | `430-documental-ressalvas` | check_evidence_files_inclusao com WITH CHECK true                          | R-I3.7-01 (política): nem evidência                                                                                                                                           | 1      |
| E08 | RLS               | `430-documental-ressalvas` | documental_reviews_inclusao com WITH CHECK true                            | R-I3.7-01 (política): o fornecedor não abre revisão pela API                                                                                                                  | 1      |
| E09 | GRANT             | `400-documental`           | INSERT de details para authenticated                                       | R-I3.7-02: pela API, a consulta não leva details                                                                                                                              | 2      |
| E10 | função da trava   | `430-documental-ressalvas` | chave_de_dado_pessoal() da I3.3                                            | R-I3.7-02: chave recusada: composta sem separador; R-I3.7-02: chave recusada: no plural; R-I3.7-02: chave recusada: com sufixo numérico; R-I3.7-02: chave recusada: em inglês | 7      |
| E11 | função do private | `430-documental-ressalvas` | texto_normalizado() da I3.5 (sem NFD)                                      | R-I3.7-03: acento composto; R-I3.7-03: marca invisível                                                                                                                        | 2      |
| E12 | função do private | `430-documental-ressalvas` | expressao_de_palavra_inteira() da I3.5 (\m e \M)                           | R-I3.7-03: o sublinhado é fronteira                                                                                                                                           | 1      |
| E13 | função do private | `430-documental-ressalvas` | termo_proibido() sem falhar fechado                                        | R-I3.7-04: sem a lista, o texto não passa em silêncio                                                                                                                         | 1      |
| E14 | função do private | `430-documental-ressalvas` | estados_documentais_da_oferta() sem as categorias das consultas e revisões | R-I3.7-05: a consulta com ocorrência numa categoria tirada                                                                                                                    | 1      |
| E15 | GRANT             | `430-documental-ressalvas` | USAGE na sequência de vehicle_checks.seq                                   | R-I3.7-08: as sequências de seq                                                                                                                                               | 1      |
| E16 | chave estrangeira | `430-documental-ressalvas` | sem vehicle_checks_veiculo_da_oferta_fkey                                  | R-I3.7-11: o veículo de outra oferta é recusado                                                                                                                               | 1      |
| E17 | gatilho           | `430-documental-ressalvas` | documental_reviews_revisar_linguagem desligado                             | R-I3.7-03: o motivo da revisão passa pela lista                                                                                                                               | 2      |
| E18 | gatilho           | `430-documental-ressalvas` | transfer_impediments_revisar_linguagem desligado                           | R-I3.7-03: o motivo da resolução do impedimento também                                                                                                                        | 1      |
| E19 | gatilho           | `430-documental-ressalvas` | supplier_declarations_revisar_linguagem desligado (R-I3.7-07)              | R-I3.7-07: o detalhe da declaração com termo da lista é recusado                                                                                                              | 1      |
| E20 | função da trava   | `430-documental-ressalvas` | chave_de_dado_pessoal() sem nome e razao nas três listas (R-I3.7-13)       | R-I3.7-02: chave recusada: razão social; R-I3.7-02: chave recusada: nome completo                                                                                             | 2      |

- **Ajustes ao rodar:**
  - na primeira rodada, a E11 não derrubou o caso do acento composto. O texto de teste ainda tinha "garantida", que a lista acha sozinha. O caso passou a usar "sem ocorrências" decomposto;
  - na E12, o espaço não separável já casava com a expressão antiga, porque o locale do banco o trata como espaço. Quem detecta a mutação é o caso do sublinhado;
  - na E17, a revisão indevida fica aberta, e o contraste da mesma categoria cai em cascata. O contraste passou a ser o da resolução;
  - a primeira E20 tirava só os trechos `nome` e `razao` e era equivalente: as palavras continuavam nas outras duas listas. Passou a tirar das três, e o `430` ganhou a chave `razaoSocial`, que só a palavra pega. A chave `razaoSocialDoDono` não cai, porque `dono` também é recusada.

### Mudança de cada mutação (I3.9)

**E01**

```sql
alter policy vehicle_checks_leitura on public.vehicle_checks using (true);
```

**E02**

```sql
alter policy check_evidence_files_leitura on public.check_evidence_files using (true);
```

**E03**

```sql
alter policy documental_reviews_leitura on public.documental_reviews using (true);
```

**E04**

```sql
alter policy transfer_impediments_leitura on public.transfer_impediments using (true);
```

**E05**

```sql
create policy zz_leitura_da_evidencia on storage.objects for select to authenticated using (bucket_id = 'check-evidence');
```

**E06**

```sql
alter policy vehicle_checks_inclusao on public.vehicle_checks with check (true);
```

**E07**

```sql
alter policy check_evidence_files_inclusao on public.check_evidence_files with check (true);
```

**E08**

```sql
alter policy documental_reviews_inclusao on public.documental_reviews with check (true);
```

**E09**

```sql
grant insert (details) on public.vehicle_checks to authenticated;
```

**E10**

Volta `private.chave_de_dado_pessoal(text)` à definição da I3.3, a de `20261030120000_dominio_documental.sql`, sem cópia aqui (R-I3.7-13).

**E11**

```sql
create or replace function private.texto_normalizado(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(valor, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüçñ',
                   'aaaaaeeeeiiiiooooouuuucn');
$$;
```

**E12**

```sql
create or replace function private.expressao_de_palavra_inteira(termo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '\m'
    || array_to_string(
         array(select private.literal_de_expressao(p)
               from regexp_split_to_table(btrim(termo), '\s+') as p),
         '\s+')
    || '\M';
$$;
```

**E13**

```sql
create or replace function private.termo_proibido(valor text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lista jsonb := private.configuracao('forbidden_terms');
  linha text;
  qualificacao text;
  marcador text;
  item jsonb;
  variante text;
begin
  if valor is null or lista is null then
    return null;
  end if;
  qualificacao := private.expressao_de_palavra_inteira(private.texto_normalizado(lista ->> 'qualificacao'));
  marcador := private.literal_de_expressao(btrim(private.texto_normalizado(lista ->> 'marcadorDeExcecao')))
    || '\s*[[:alnum:]]';
  for linha in
    select private.texto_normalizado(l) from regexp_split_to_table(valor, '\r\n|\r|\n') as l
  loop
    if linha ~ qualificacao or linha ~ marcador then
      continue;
    end if;
    for item in select jsonb_array_elements(lista -> 'termos') loop
      for variante in select jsonb_array_elements_text(item -> 'variantes') loop
        if linha ~ private.expressao_de_palavra_inteira(private.texto_normalizado(variante)) then
          return item ->> 'termo';
        end if;
      end loop;
    end loop;
  end loop;
  return null;
end;
$$;
```

**E14**

```sql
create or replace function private.estados_documentais_da_oferta(p_oferta uuid)
returns table (
  category text,
  state text,
  origin text,
  declared_value text,
  detail text,
  declared_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.conferir_leitura_da_oferta(p_oferta);
  return query
  select c.categoria,
         private.estado_documental(p_oferta, c.categoria),
         case when d.declared_value is null then 'unconfirmed' else 'supplier_declaration' end,
         d.declared_value,
         d.detail,
         d.declared_at
  from (
    select jsonb_array_elements_text(coalesce(private.configuracao('document_categories'), '[]')) as categoria
    union
    select sd.category from public.supplier_declarations sd where sd.offer_id = p_oferta
  ) c
  left join lateral (
    select sd.declared_value, sd.detail, sd.declared_at
    from public.supplier_declarations sd
    where sd.offer_id = p_oferta and sd.category = c.categoria
    order by sd.seq desc
    limit 1
  ) d on true
  order by c.categoria collate "C";
end;
$$;
```

**E15**

```sql
grant usage on sequence public.vehicle_checks_seq_seq to authenticated;
```

**E16**

```sql
alter table public.vehicle_checks drop constraint vehicle_checks_veiculo_da_oferta_fkey;
```

**E17**

```sql
alter table public.documental_reviews disable trigger documental_reviews_revisar_linguagem;
```

**E18**

```sql
alter table public.transfer_impediments disable trigger transfer_impediments_revisar_linguagem;
```

**E19**

```sql
alter table public.supplier_declarations disable trigger supplier_declarations_revisar_linguagem;
```

**E20**

Troca em `pg_get_functiondef('private.chave_de_dado_pessoal(text)'::regprocedure)`, com a flag `g`:

```sql
regexp_replace(d, '''(nome|razao)'', |nome[|]razao[|]', '', 'g')
```
