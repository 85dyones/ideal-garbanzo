# Mutações do Inc. 2

Lista versionada da verificação de mutação (gate 3; ADR-0002 §3; ressalva R6 do ADR-0002 §8). Cada mutação afrouxa uma camada logo depois do `set constraints all immediate;` de uma cópia do arquivo de teste e é desfeita no rollback do próprio teste, no projeto de desenvolvimento. O negativo precisa cair, e o contraste precisa continuar passando.

## I2.3: migrações das ofertas (29/10/2026)

Resultado: 29 de 29 mutações derrubaram os casos esperados, sem derrubar o contraste. "Caíram" conta todas as asserções que falharam, inclusive as que dependem do estado deixado pela mutação.

| ID  | Arquivo                | Camada            | Mudança                                                       | Casos que devem cair                                                                                                    | Contraste                                                       | Caíram | Resultado              |
| --- | ---------------------- | ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------ | ---------------------- |
| M01 | 330-ofertas-isolamento | RLS               | política offers_leitura com USING true                        | CT2.7: fornecedor de outra empresa não lê o rascunho pelo id; CT2.7: nem na listagem; CT2.12:; CT2.13:; CT2.15:         | contraste: o fornecedor lê a própria oferta                     | 7      | caiu; contraste passou |
| M02 | 330-ofertas-isolamento | função do private | ofertas_do_usuario() sem o filtro de empresa                  | CT2.9: nem as versões; CT2.9: nem as declarações; CT2.9: nem as fotos; CT2.9: nem os documentos; CT2.9: nem as revisões | contraste: e os registros ligados a elas                        | 10     | caiu; contraste passou |
| M03 | 330-ofertas-isolamento | RLS               | política vehicles_leitura com USING true                      | CT2.8:                                                                                                                  | contraste: a empresa dona lê a placa                            | 1      | caiu; contraste passou |
| M04 | 330-ofertas-isolamento | função do private | empresas_do_usuario() sem o status do vínculo                 | CT2.15:                                                                                                                 | contraste: o member lê as ofertas da empresa                    | 1      | caiu; contraste passou |
| M05 | 330-ofertas-isolamento | RLS               | política field_history_ofertas sem o filtro de empresa        | CT2.9: nem o histórico da oferta e do veículo; A18:                                                                     | a empresa dona lê o histórico da própria oferta                 | 2      | caiu; contraste passou |
| M06 | 330-ofertas-isolamento | gatilho           | proteger_declaracao sem a checagem de vínculo                 | CT2.11: não declara na oferta alheia                                                                                    | CT2.11: e a resposta não revela se a oferta existe              | 1      | caiu; contraste passou |
| M07 | 320-ofertas-versoes    | RLS               | RLS de offers aberta: leitura e alteração com true            | CT12.1: fornecedor de outra empresa não altera o preço pela API; CT12.2:; CT12.3:                                       | CT12 contraste: o org_admin altera o preço da publicada         | 6      | caiu; contraste passou |
| M08 | 320-ofertas-versoes    | função do private | empresas_do_usuario() sem o status do vínculo                 | CT12.4: membro suspenso não altera o preço com o token antigo                                                           | CT12 contraste: o org_admin altera o preço da publicada         | 1      | caiu; contraste passou |
| M09 | 320-ofertas-versoes    | função do private | empresas_do_usuario() sem o status da empresa                 | CT12.4: com a empresa suspensa, o org_admin não altera o preço                                                          | CT12 contraste: o org_admin altera o preço da publicada         | 1      | caiu; contraste passou |
| M10 | 320-ofertas-versoes    | GRANT             | UPDATE de published_at e current_version para authenticated   | CT12.5: published_at fica fora do GRANT; CT12.5: o preço junto com current_version é recusado inteiro                   | CT12.6: a mudança direta pela API com o token do dono é aceita  | 2      | caiu; contraste passou |
| M11 | 320-ofertas-versoes    | CHECK             | sem offers_asking_price_check                                 | CT12.7: preço zero; CT12.7: preço negativo                                                                              | CT12 contraste: o org_admin altera o preço da publicada         | 2      | caiu; contraste passou |
| M12 | 320-ofertas-versoes    | gatilho           | versionamento da oferta desligado (offers_versionar)          | CT12: o preço novo gera versão nova; CT12.6: e com versão nova, como pela operação                                      | CT12.1: fornecedor de outra empresa não altera o preço pela API | 14     | caiu; contraste passou |
| M13 | 320-ofertas-versoes    | gatilho           | histórico da oferta desligado (offers_historico)              | CT12: field_history com valor anterior, novo e autor; CT12.6: com histórico                                             | CT12: o preço novo gera versão nova                             | 2      | caiu; contraste passou |
| M14 | 320-ofertas-versoes    | gatilho           | proteger_veiculo sem a trava da placa depois da publicação    | X19/Q4: a placa não muda depois da publicação; X19/Q4: nem o RENAVAM                                                    | Q4: no rascunho nunca publicado, a placa muda (contraste)       | 2      | caiu; contraste passou |
| M15 | 320-ofertas-versoes    | gatilho           | só inclusão desligado em offer_versions                       | CT11.4: versão não se altera, nem como postgres                                                                         | CT11.6: version_number repetido na mesma oferta                 | 1      | caiu; contraste passou |
| M16 | 320-ofertas-versoes    | gatilho           | só inclusão desligado em supplier_declarations                | CT11.4: declaração não se apaga, nem como postgres                                                                      | teste 11: a declaração repetida é linha nova                    | 1      | caiu; contraste passou |
| M17 | 320-ofertas-versoes    | GRANT             | UPDATE em supplier_declarations para authenticated            | CT11.1: o dono não altera declaração                                                                                    | teste 11: a declaração repetida é linha nova                    | 1      | caiu; contraste passou |
| M18 | 320-ofertas-versoes    | CHECK             | sem offer_versions_hash_confere                               | o banco recusa versão com hash que não confere                                                                          | CT11.6: version_number repetido na mesma oferta                 | 1      | caiu; contraste passou |
| M19 | 320-ofertas-versoes    | índice único      | sem o único (offer_id, version_number)                        | CT11.6: version_number repetido na mesma oferta                                                                         | o banco recusa versão com hash que não confere                  | 1      | caiu; contraste passou |
| M20 | 320-ofertas-versoes    | CHECK             | sem offer_documents_oculto_ate_d5                             | X18: o CHECK segura a visibilidade até a D5                                                                             | o caminho do documento segue                                    | 1      | caiu; contraste passou |
| M21 | 310-ofertas-transicoes | função do private | pendencias_de_publicacao() sem as declarações                 | X05: sem declaração em todas as categorias                                                                              | X07: com apontamento declarado                                  | 1      | caiu; contraste passou |
| M22 | 310-ofertas-transicoes | gatilho           | proteger_oferta: T04 sem a checagem de staff                  | T04: o fornecedor não publica a própria oferta em revisão; X16/B25:                                                     | T06: sem revisão exigida, o org_admin publica direto            | 10     | caiu; contraste passou |
| M23 | 310-ofertas-transicoes | gatilho           | proteger_oferta: usuário leva a oferta a expired              | X04: usuário não leva a oferta a expirada                                                                               | T08: o org_admin reserva                                        | 12     | caiu; contraste passou |
| M24 | 310-ofertas-transicoes | gatilho           | proteger_oferta: staff edita conteúdo (Q3)                    | Q3: o operador não edita o preço                                                                                        | T17: o org_admin estende a validade da publicada                | 2      | caiu; contraste passou |
| M25 | 310-ofertas-transicoes | função do private | conferir_edicao: qualquer membro altera a publicada (Q2)      | Q2: o member não altera a oferta publicada                                                                              | T17: o org_admin estende a validade da publicada                | 1      | caiu; contraste passou |
| M26 | 310-ofertas-transicoes | gatilho           | proteger_oferta: autorização de divulgação de qualquer pessoa | B30: o envio exige a autorização de divulgação; B30: a autorização é de quem envia                                      | T06: sem revisão exigida, o org_admin publica direto            | 3      | caiu; contraste passou |
| M27 | 310-ofertas-transicoes | gatilho           | proteger_oferta: suspensão sem motivo                         | X08: a suspensão exige motivo                                                                                           | T14: a suspensão exige categoria                                | 3      | caiu; contraste passou |
| M28 | 310-ofertas-transicoes | CHECK             | sem offers_suspended_category_check                           | X09: não há categoria de pendência documental                                                                           | X08: a suspensão exige motivo                                   | 3      | caiu; contraste passou |
| M29 | 310-ofertas-transicoes | RLS               | RLS de offers aberta: leitura e alteração com true            | X03: fornecedor de outra empresa não retira a oferta; X02: comprador não reserva oferta                                 | T08: o org_admin reserva                                        | 3      | caiu; contraste passou |

**Mutação equivalente:**

- **Política sozinha:** com só a política `offers_alteracao` aberta, nenhum teste cai.
- **Por quê:** num UPDATE com WHERE, o Postgres aplica também a política de SELECT, e as duas têm o mesmo predicado.
- **O que entrou no lugar:** M07 e M29 abrem a RLS da tabela inteira, que é a camada observável.

**Ainda não coberto aqui:**

- **Storage (teste 6):** entra na I2.4, com os buckets e a conferência do objeto.
- **Servidor:** a camada do servidor e o teste de integração que compara a tabela de transições com `transicoes.ts` entram na I2.6 e na I2.7.

## SQL de cada mutação (I2.3)

Inserido logo depois de `set constraints all immediate;`, na cópia do arquivo de teste indicado na tabela.

**M01**

```sql
alter policy offers_leitura on public.offers using (true);
```

**M02**

```sql
create or replace function private.ofertas_do_usuario() returns setof uuid language sql stable security definer set search_path = '' as $f$ select o.id from public.offers o $f$;
```

**M03**

```sql
alter policy vehicles_leitura on public.vehicles using (true);
```

**M04**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.empresas_do_usuario(text[])'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and m\.status = ''active'' and p\.status', 'and p.status');
  if n = d then
    raise exception 'mutação não aplicada em private.empresas_do_usuario(text[])';
  end if;
  execute n;
end
$m$;
```

**M05**

```sql
alter policy field_history_ofertas on public.field_history using (entity_type in ('offers', 'vehicles'));
```

**M06**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_declaracao()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not found or not private\.membro_ativo\(oferta\.supplier_organization_id\) then', 'if not found then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_declaracao()';
  end if;
  execute n;
end
$m$;
```

**M07**

```sql
alter policy offers_leitura on public.offers using (true); alter policy offers_alteracao on public.offers using (true) with check (true);
```

**M08**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.empresas_do_usuario(text[])'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and m\.status = ''active'' and p\.status', 'and p.status');
  if n = d then
    raise exception 'mutação não aplicada em private.empresas_do_usuario(text[])';
  end if;
  execute n;
end
$m$;
```

**M09**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.empresas_do_usuario(text[])'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and o\.status = ''active''', '');
  if n = d then
    raise exception 'mutação não aplicada em private.empresas_do_usuario(text[])';
  end if;
  execute n;
end
$m$;
```

**M10**

```sql
grant update (published_at, current_version) on public.offers to authenticated;
```

**M11**

```sql
alter table public.offers drop constraint offers_asking_price_check;
```

**M12**

```sql
alter table public.offers disable trigger offers_versionar;
```

**M13**

```sql
alter table public.offers disable trigger offers_historico;
```

**M14**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_veiculo()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if oferta\.published_at is not null and', 'if false and');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_veiculo()';
  end if;
  execute n;
end
$m$;
```

**M15**

```sql
alter table public.offer_versions disable trigger offer_versions_so_inclusao;
```

**M16**

```sql
alter table public.supplier_declarations disable trigger supplier_declarations_so_inclusao;
```

**M17**

```sql
grant update on public.supplier_declarations to authenticated;
```

**M18**

```sql
alter table public.offer_versions drop constraint offer_versions_hash_confere;
```

**M19**

```sql
alter table public.offer_versions drop constraint offer_versions_offer_id_version_number_key;
```

**M20**

```sql
alter table public.offer_documents drop constraint offer_documents_oculto_ate_d5;
```

**M21**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pendencias_de_publicacao(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'where not exists \(', 'where false and not exists (');
  if n = d then
    raise exception 'mutação não aplicada em private.pendencias_de_publicacao(uuid)';
  end if;
  execute n;
end
$m$;
```

**M22**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not eh_staff then\s+raise exception ''só o operador ou o administrador publica a oferta revisada''', 'if false then raise exception ''mutado''');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**M23**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if private\.manutencao\(\) then', 'if private.manutencao() or new.status = ''expired'' then return new; end if; if private.manutencao() then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**M24**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not eh_membro then\s+raise exception ''a equipe da plataforma não edita o conteúdo da oferta''', 'if false then raise exception ''mutado''');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**M25**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.conferir_edicao(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'private\.membro_ativo\(empresa, array\[''org_admin''\]\)', 'private.membro_ativo(empresa)');
  if n = d then
    raise exception 'mutação não aplicada em private.conferir_edicao(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**M26**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if new\.publication_authorized_by is distinct from ator then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**M27**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'new\.suspended_reason := private\.motivo_obrigatorio\(\);', 'new.suspended_reason := coalesce(private.cabecalho(''x-audit-reason''), ''sem motivo'');');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**M28**

```sql
alter table public.offers drop constraint offers_suspended_category_check;
```

**M29**

```sql
alter policy offers_leitura on public.offers using (true); alter policy offers_alteracao on public.offers using (true) with check (true);
```

## I2.4: Storage das ofertas (29/10/2026)

Resultado: 15 de 15 mutações derrubaram os casos esperados, sem derrubar o contraste.

### Banco (`340-ofertas-storage`)

Mesmo procedimento da I2.3: a mutação entra na cópia do arquivo e é desfeita no rollback.

| ID  | Camada              | Mudança                                                        | Casos que devem cair                                                                                                                              | Contraste                                                 | Caíram | Resultado              |
| --- | ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ | ---------------------- |
| S01 | política do Storage | offer_photos_leitura só com o bucket (sem a função de leitura) | CT6.2: outra empresa não lê o objeto da foto pelo caminho; CT6.5: nem lista o prefixo da empresa; CT6.4:                                          | contraste: a empresa dona lê o objeto da foto             | 3      | caiu; contraste passou |
| S02 | política do Storage | política de SELECT no bucket de documentos                     | nenhuma política de SELECT no bucket de documentos; nem o dono lê o objeto do documento direto; o operador também abre documento só pelo servidor | contraste: a empresa dona lê o objeto da foto             | 5      | caiu; contraste passou |
| S03 | função do private   | oferta_do_caminho() sem conferir a empresa do caminho          | caminho com a empresa errada é recusado                                                                                                           | contraste: o member envia foto para o rascunho da empresa | 1      | caiu; contraste passou |
| S04 | função do private   | pode_editar_oferta() sem exigir org_admin na publicada         | Q2: o member não envia arquivo para a publicada                                                                                                   | contraste: o org_admin envia arquivo para a publicada     | 1      | caiu; contraste passou |
| S05 | função do private   | pode_editar_oferta() sem o vínculo com a empresa dona          | CT6.6: outra empresa não envia para a oferta alheia; CT6.6: outra empresa não envia para o prefixo da oferta alheia                               | contraste: o member envia foto para o rascunho da empresa | 4      | caiu; contraste passou |
| S06 | gatilho             | proteger_foto sem conferir o objeto no bucket                  | a foto sem objeto no bucket não é registrada; ninguém registra como seu o objeto enviado por outra pessoa                                         | contraste: quem enviou o objeto registra a foto           | 2      | caiu; contraste passou |
| S07 | gatilho             | proteger_foto sem conferir o dono do objeto                    | ninguém registra como seu o objeto enviado por outra pessoa                                                                                       | contraste: quem enviou o objeto registra a foto           | 1      | caiu; contraste passou |
| S08 | gatilho             | proteger_documento sem conferir o objeto no bucket             | o documento sem objeto no bucket não é registrado                                                                                                 | contraste: quem enviou o objeto registra a foto           | 1      | caiu; contraste passou |
| S09 | política do Storage | política de UPDATE no bucket de fotos                          | CT6.6: nenhuma política de UPDATE ou DELETE nos buckets das ofertas; CT6.6: nem o dono sobrescreve a foto                                         | contraste: a empresa dona lê o objeto da foto             | 2      | caiu; contraste passou |
| S10 | bucket              | bucket de documentos público                                   | CT6.1: os dois buckets das ofertas são privados                                                                                                   | contraste: a empresa dona lê o objeto da foto             | 1      | caiu; contraste passou |

### Integração (`tests/integration/ofertas-storage.test.ts`)

Cada mutação foi aplicada no projeto de desenvolvimento (SQL gravado) ou no código do servidor, o teste rodou, e a mudança foi desfeita no fim. O script conferiu que `servidor.ts` voltou idêntico ao original, e a consulta final confirmou os buckets privados e só as políticas da migração.

| ID  | Camada              | Mudança                                                             | Casos que devem cair                                                                                                                                           | Contraste                                                                              | Caíram | Resultado              |
| --- | ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ | ---------------------- |
| I01 | bucket              | bucket offer-documents público                                      | CT6.1: o endereço público não entrega a foto nem o documento                                                                                                   | contraste: o dono obtém a URL do documento pelo servidor, com o registro gravado antes | 4      | caiu; contraste passou |
| I02 | servidor            | gerarUrlDoDocumento lê com a chave secreta e sem a segunda checagem | CT6.3: outra empresa não obtém URL temporária, nem pelo Storage nem pelo servidor                                                                              | contraste: o dono obtém a URL do documento pelo servidor, com o registro gravado antes | 1      | caiu; contraste passou |
| I03 | servidor            | gerarUrlDoDocumento sem o registro em restricted_access_logs        | contraste: o dono obtém a URL do documento pelo servidor, com o registro gravado antes; contraste: o operador obtém a URL do documento, registrado sem empresa | CT6.3: outra empresa não obtém URL temporária, nem pelo Storage nem pelo servidor      | 2      | caiu; contraste passou |
| I04 | política do Storage | política de DELETE nos buckets das ofertas                          | CT6.6: ninguém envia ao prefixo alheio, sobrescreve, move ou apaga                                                                                             | CT6.3: outra empresa não obtém URL temporária, nem pelo Storage nem pelo servidor      | 2      | caiu; contraste passou |
| I05 | política do Storage | políticas de SELECT e UPDATE no bucket de documentos (upsert)       | CT6.6: ninguém envia ao prefixo alheio, sobrescreve, move ou apaga; nem o dono baixa o documento direto pelo Storage: só pelo servidor, com registro           | contraste: o dono obtém a URL da foto com a própria sessão                             | 6      | caiu; contraste passou |

**Mudanças da integração:**

- **I01:** `update storage.buckets set public = true where id = 'offer-documents'`.
- **I02:** em `gerarUrlDoDocumento`, as duas leituras passam ao cliente da chave secreta, e a segunda checagem (membro ou staff) fica sempre falsa. É a camada inteira do servidor afrouxada: com a leitura pela sessão, a RLS já recusaria.
- **I03:** em `gerarUrlDoDocumento`, `registrarAcessoRestrito` dá lugar a uma função que só devolve `true`.
- **I04:** `create policy mutacao_i04 on storage.objects for delete to authenticated using (bucket_id in ('offer-photos', 'offer-documents'))`.
- **I05:** políticas de SELECT e de UPDATE em `offer-documents` para `authenticated`, as duas que o upsert exige.

**Não verificável pelo pgTAP:**

- O Supabase recusa o DELETE direto em `storage.objects`, com ou sem política. A camada da política de DELETE só aparece pela API do Storage, na I04.

### SQL das mutações de banco (I2.4)

**S01**

```sql
alter policy offer_photos_leitura on storage.objects using (bucket_id = 'offer-photos');
```

**S02**

```sql
create policy mutacao_s02 on storage.objects for select to authenticated using (bucket_id = 'offer-documents');
```

**S03**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.oferta_do_caminho(text,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, '\s+and o\.supplier_organization_id::text = split_part\(caminho, ''/'', 1\)', '');
  if n = d then
    raise exception 'mutação não aplicada em private.oferta_do_caminho(text,text)';
  end if;
  execute n;
end
$m$;
```

**S04**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pode_editar_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'array\[''org_admin''\]', 'null');
  if n = d then
    raise exception 'mutação não aplicada em private.pode_editar_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**S05**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pode_editar_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'private\.membro_ativo\(o\.supplier_organization_id\)\)', 'true)');
  if n = d then
    raise exception 'mutação não aplicada em private.pode_editar_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**S06**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_foto()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not exists \(\s+select 1 from storage\.objects s', 'if false and not exists (select 1 from storage.objects s');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_foto()';
  end if;
  execute n;
end
$m$;
```

**S07**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_foto()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'and s\.owner_id = ator::text', '');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_foto()';
  end if;
  execute n;
end
$m$;
```

**S08**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_documento()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not exists \(\s+select 1 from storage\.objects s', 'if false and not exists (select 1 from storage.objects s');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_documento()';
  end if;
  execute n;
end
$m$;
```

**S09**

```sql
create policy mutacao_s09 on storage.objects for update to authenticated using (bucket_id = 'offer-photos') with check (bucket_id = 'offer-photos');
```

**S10**

```sql
update storage.buckets set public = true where id = 'offer-documents';
```

## I2.5: estado documental (29/10/2026)

Resultado: 6 de 6 mutações derrubaram os casos esperados, sem derrubar o contraste. Mesmo procedimento da I2.3, sobre o `350-estado-documental`.

| ID  | Camada            | Mudança                                                                  | Casos que devem cair                                                  | Contraste                                                   | Caíram | Resultado              |
| --- | ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------- | ------ | ---------------------- |
| D01 | função do private | estado_pela_declaracao(): ocorrência declarada vira declared_unverified  | §6.4: ocorrência declarada dá "com apontamentos"                      | §6.4: "sem ocorrência conhecida" dá                         | 4      | caiu; contraste passou |
| D02 | função do private | estado_documental(): vale a declaração mais antiga                       | §5.3: a declaração mais recente é a vigente                           | B29: sem declaração, a categoria fica como não consultada   | 1      | caiu; contraste passou |
| D03 | função do private | estados_documentais_da_oferta() sem as categorias já declaradas          | remover a categoria da configuração não esconde o que foi declarado   | categoria nova aparece como não consultada e não confirmada | 1      | caiu; contraste passou |
| D04 | RPC               | estados_documentais() sem conferir se a sessão lê a oferta               | outra empresa não lê os estados da oferta alheia                      | contraste: a empresa dona lê os estados das dez categorias  | 2      | caiu; contraste passou |
| D05 | função do private | estados_documentais_da_oferta(): origem sempre declarada pelo fornecedor | §6.5: sem declaração, as dez categorias aparecem como não confirmadas | §6.4: ocorrência declarada dá "com apontamentos"            | 2      | caiu; contraste passou |
| D06 | função do private | precedencia_documental(): with_findings abaixo de todos                  | precedência da §6.4                                                   | B29: sem declaração, a categoria fica como não consultada   | 1      | caiu; contraste passou |

### SQL das mutações (I2.5)

**D01**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_pela_declaracao(text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'when ''has_occurrence'' then ''with_findings''', 'when ''has_occurrence'' then ''declared_unverified''');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_pela_declaracao(text)';
  end if;
  execute n;
end
$m$;
```

**D02**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estado_documental(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'order by sd\.seq desc', 'order by sd.seq asc');
  if n = d then
    raise exception 'mutação não aplicada em private.estado_documental(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**D03**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estados_documentais_da_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, '\s+union\s+select sd\.category from public\.supplier_declarations sd where sd\.offer_id = p_oferta', '');
  if n = d then
    raise exception 'mutação não aplicada em private.estados_documentais_da_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**D04**

```sql
do $m$
declare
  d text := pg_get_functiondef('public.estados_documentais(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not exists \(select 1 from public\.offers o where o\.id = p_oferta\) then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em public.estados_documentais(uuid)';
  end if;
  execute n;
end
$m$;
```

**D05**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.estados_documentais_da_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'case when d\.declared_value is null then ''unconfirmed'' else ''supplier_declaration'' end', '''supplier_declaration''');
  if n = d then
    raise exception 'mutação não aplicada em private.estados_documentais_da_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**D06**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.precedencia_documental(text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'when ''with_findings'' then 5', 'when ''with_findings'' then 0');
  if n = d then
    raise exception 'mutação não aplicada em private.precedencia_documental(text)';
  end if;
  execute n;
end
$m$;
```

## I2.6: operações de servidor da oferta (29/10/2026)

Resultado: 14 de 14 mutações derrubaram os casos esperados, sem derrubar o contraste. Três procedimentos:

- **banco:** a função é trocada no projeto de desenvolvimento, o teste de integração roda, e a definição salva antes é reaplicada. O script conferiu com `pg_get_functiondef` que cada função voltou idêntica;
- **código:** o arquivo é trocado, o teste roda, e o original volta. O script conferiu que cada arquivo voltou idêntico;
- **pgTAP:** como na I2.3, a mutação entra na cópia do arquivo de teste e é desfeita no rollback.

O teste `ofertas-transicoes` compara o banco com `rules/transicoes.ts` e `rules/edicao.ts`. Por isso, ele cai tanto com a mutação no gatilho quanto com a mutação na tabela do servidor. Os testes de operação dão a mesma resposta com qualquer um dos lados, porque o banco recusa de novo. Para a checagem do servidor ser observável, eles conferem com as dependências espiadas que a recusa veio antes da escrita.

| ID  | Camada             | Teste                    | Mudança                                                                                          | Casos que devem cair                                                                                                   | Contraste                                                                                                       | Caíram | Resultado              |
| --- | ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ | ---------------------- |
| O01 | gatilho            | `ofertas-transicoes`     | proteger_oferta(): o member reserva e libera (T08 e T09)                                         | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                               | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                       | 1      | caiu; contraste passou |
| O02 | gatilho            | `ofertas-transicoes`     | proteger_oferta(): a plataforma retira sem motivo (T11)                                          | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                               | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                       | 1      | caiu; contraste passou |
| O03 | função do private  | `ofertas-transicoes`     | conferir_edicao(): o member edita a publicada e a reservada                                      | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                              | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                        | 1      | caiu; contraste passou |
| O04 | gatilho            | `ofertas-transicoes`     | proteger_oferta() sem o conflito de interesse (B25)                                              | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                               | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                       | 1      | caiu; contraste passou |
| O05 | tabela do servidor | `ofertas-transicoes`     | transicoes.ts: o member reserva (T08)                                                            | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                               | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                       | 1      | caiu; contraste passou |
| O06 | regra do servidor  | `ofertas-transicoes`     | edicao.ts: o member edita a publicada e a reservada                                              | edição da oferta, do veículo, declaração e disponibilidade em cada estado                                              | todo par de estados, todo ator, os dois valores da D10, com e sem motivo                                        | 1      | caiu; contraste passou |
| O07 | servidor           | `ofertas-operacoes`      | atualizarOferta sem conferir o ator e o estado antes da RPC                                      | o member, o operador, o administrador e outra empresa não mudam o preço da publicada (Q2, CT12.9, CT12.1); updateOffer | mudança de preço na publicada gera versão nova, histórico e auditoria; as versões anteriores ficam intactas     | 2      | caiu; contraste passou |
| O08 | servidor           | `ofertas-operacoes`      | mudarStatus sem conferir o ator e o estado antes de escrever                                     | o org_admin e a plataforma reservam e liberam; qualquer F confirma a disponibilidade, sem versão                       | mudança de preço na publicada gera versão nova, histórico e auditoria; as versões anteriores ficam intactas     | 3      | caiu; contraste passou |
| O09 | servidor           | `ofertas-operacoes`      | mudarStatus sem exigir o motivo da plataforma                                                    | o org_admin retira sem motivo e reabre; a plataforma retira só com motivo                                              | com revisão exigida, o org_admin envia; o fornecedor cancela; a plataforma devolve com motivo e publica         | 1      | caiu; contraste passou |
| O10 | esquema            | `ofertas`                | dados da oferta sem .strict()                                                                    | CT12.5: preço junto com status, empresa ou colunas do banco é recusado inteiro                                         | CT12.7: preço zero, negativo, não numérico ou com três casas é recusado                                         | 1      | caiu; contraste passou |
| O11 | snapshot           | `snapshot`               | jsonCanonico() sem ordenar as chaves                                                             | chaves em ordem de código, sem espaços, listas na ordem dada                                                           | recusa número e chave fora do ASCII, como o banco                                                               | 1      | caiu; contraste passou |
| O12 | gatilho            | `310-ofertas-transicoes` | proteger_oferta(): a nova suspensão exige a categoria como coluna alterada (o defeito corrigido) | T14: a reativada pode ser suspensa de novo com a mesma categoria                                                       | T14: o operador suspende com categoria e motivo                                                                 | 2      | caiu; contraste passou |
| O13 | gatilho            | `320-ofertas-versoes`    | proteger_veiculo() sem conferir os dados obrigatórios da publicada                               | B16: a publicada não perde dado do veículo pela RPC; B16: nem pela API direta                                          | B16: no rascunho, o dado do veículo pode ficar vazio (contraste); X19/Q4: a placa não muda depois da publicação | 3      | caiu; contraste passou |
| O14 | gatilho            | `ofertas-operacoes`      | proteger_veiculo() sem conferir os dados obrigatórios da publicada                               | a publicada não perde dado do veículo, nem pela API direta; o rascunho pode ficar incompleto                           | mudança de preço na publicada gera versão nova, histórico e auditoria; as versões anteriores ficam intactas     | 1      | caiu; contraste passou |

Na O13, a terceira asserção que caiu ("§5.6: os dados do veículo têm histórico") é efeito em cascata: com a mutação, as mudanças para vazio foram aceitas e deixaram linhas a mais no histórico do veículo. As O13 e O14 cobrem a correção da lacuna do veículo, feita depois da primeira rodada.

### Mudança de cada mutação (I2.6)

**O01**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not \(eh_adm_empresa or eh_staff\) then', 'if not (eh_membro or eh_staff) then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**O02**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'elsif eh_staff then\s+motivo := private\.motivo_obrigatorio\(\);\s+else\s+raise exception ''só o administrador da empresa ou a plataforma retira', 'elsif eh_staff then motivo := private.cabecalho(''x-audit-reason''); else raise exception ''só o administrador da empresa ou a plataforma retira');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**O03**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.conferir_edicao(uuid,text)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not private\.membro_ativo\(empresa, array\[''org_admin''\]\) then', 'if not private.membro_ativo(empresa) then');
  if n = d then
    raise exception 'mutação não aplicada em private.conferir_edicao(uuid,text)';
  end if;
  execute n;
end
$m$;
```

**O04**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'tem_vinculo := exists \([^;]*\);', 'tem_vinculo := false;');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**O05**

```diff
- quem: [...F_ADM, ...ST],
+ quem: [...F, ...ST],
```

**O06**

```diff
-     return ator === "adm_empresa";
+     return FORNECEDOR.includes(ator);
```

**O07**

```diff
-       const editavel = await ofertaEditavel(dependencias, contexto, ofertaId);
-       if (!editavel.ok) return editavel;
-       const resposta = await comRastreio(
-         dependencias.sessao.rpc("atualizar_oferta", {
+       void contexto;
+       const resposta = await comRastreio(
+         dependencias.sessao.rpc("atualizar_oferta", {
```

**O08**

```diff
-   if (!candidatas.some((transicao) => transicao.quem.includes(ator))) {
+   if (false) {
```

```diff
-   if (transicao === undefined || !pedido.permitidas.includes(transicao.id)) {
-     return falha("regra_violada");
-   }
-   if (motivoObrigatorio(transicao, ator)
+   if (transicao !== undefined && motivoObrigatorio(transicao, ator)
```

**O09**

```diff
-   if (motivoObrigatorio(transicao, ator) && pedido.motivo === undefined) {
+   if (false) {
```

**O10**

```diff
- const dadosDaOferta = z.strictObject({
+ const dadosDaOferta = z.object({
```

**O11**

```diff
-     entradas.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
-
```

**O12**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if new\.suspended_category is null then', 'if new.suspended_category is null or ''suspended_category'' <> all (alterados) then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**O13**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_veiculo()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if oferta\.status in \(''published'', ''reserved''\) and cardinality\(faltando\) > 0 then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_veiculo()';
  end if;
  execute n;
end
$m$;
```

**O14**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_veiculo()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if oferta\.status in \(''published'', ''reserved''\) and cardinality\(faltando\) > 0 then', 'if false then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_veiculo()';
  end if;
  execute n;
end
$m$;
```

## I2.7: testes da máquina de estados, do versionamento e do teste 11 (29/10/2026)

Resultado: 11 de 11 mutações derrubaram os casos esperados, sem derrubar o contraste. Os testes foram escritos pelo builder (T1) e rodados pelo orquestrador.

- **banco:** a mudança entra na cópia do arquivo de teste, depois do `set constraints all immediate;`, e é desfeita no rollback;
- **código:** o arquivo é trocado, o teste roda, e o original volta. O script conferiu que cada arquivo voltou idêntico.

Nas recusas do 360, o teste confere a mensagem exata. Por isso, ampliar um privilégio (V02 e V05) muda o resultado e derruba o caso, embora o gatilho continue recusando: na V02, a RLS deixa o UPDATE passar com 0 linhas; na V05, quem recusa passa a ser o gatilho, com outra mensagem.

| ID  | Camada             | Teste                       | Mudança                                                 | Casos que devem cair                                                                                      | Contraste                                                 | Caíram | Resultado              |
| --- | ------------------ | --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------ | ---------------------- |
| V01 | gatilho            | `360-ofertas-so-inclusao`   | só inclusão desligado em offer_documents                | CT11.4: o documento não se altera, nem como postgres; CT11.4: o documento não se apaga, nem como postgres | CT11.4: a declaração não se altera, nem como postgres     | 3      | caiu; contraste passou |
| V02 | GRANT              | `360-ofertas-so-inclusao`   | UPDATE em supplier_declarations para authenticated      | CT11.1: o dono não altera o valor da declaração                                                           | CT11.1: o dono não altera o hash da versão                | 2      | caiu; contraste passou |
| V03 | índice único       | `360-ofertas-so-inclusao`   | sem o único (offer_id, version_number)                  | CT11.6: version_number repetido na mesma oferta, nem como postgres (índice único)                         | CT11.5: sem exclusão de oferta, nem como postgres         | 1      | caiu; contraste passou |
| V04 | chave estrangeira  | `360-ofertas-so-inclusao`   | offer_versions com exclusão em cascata                  | CT11.5: toda chave estrangeira para offers e vehicles é restrict, sem cascata                             | CT11.5: sem exclusão de oferta, nem como postgres         | 1      | caiu; contraste passou |
| V05 | GRANT              | `360-ofertas-so-inclusao`   | TRUNCATE em offer_reviews para service_role             | CT11.4: service_role não esvazia as revisões                                                              | CT11.4: service_role não apaga a revisão                  | 1      | caiu; contraste passou |
| V06 | configuração       | `370-ofertas-versionamento` | quilometragem fora de material_fields                   | quilometragem: material, uma versão e histórico                                                           | preço: material, uma versão e histórico                   | 3      | caiu; contraste passou |
| V07 | gatilho            | `370-ofertas-versionamento` | versionamento do veículo desligado (vehicles_versionar) | Q4: marca é material                                                                                      | preço: material, uma versão e histórico                   | 7      | caiu; contraste passou |
| V08 | gatilho            | `370-ofertas-versionamento` | histórico do veículo desligado (vehicles_historico)     | B14: cor não é material; só histórico                                                                     | preço: material, uma versão e histórico                   | 13     | caiu; contraste passou |
| V09 | configuração       | `370-ofertas-versionamento` | cidade dentro de material_fields                        | A.4: cidade não é material; só histórico                                                                  | A.4: UF não é material; só histórico                      | 3      | caiu; contraste passou |
| V10 | tabela do servidor | `transicoes.decisao`        | transicoes.ts: a devolução (T05) sem motivo             | todos os pares, atores e condições: o servidor devolve a linha da ADR, ou nenhuma, e o mesmo motivo       | X17: nenhuma transição leva a sold nem sai dela no Inc. 2 | 1      | caiu; contraste passou |
| V11 | regra do servidor  | `transicoes.decisao`        | edicao.ts: o member edita a publicada e a reservada     | edição de conteúdo: todos os estados e atores, como na ADR                                                | disponibilidade: todos os estados e atores, como na ADR   | 2      | caiu; contraste passou |

### Mudança de cada mutação (I2.7)

**V01**

```sql
alter table public.offer_documents disable trigger offer_documents_so_inclusao;
```

**V02**

```sql
grant update on public.supplier_declarations to authenticated;
```

**V03**

```sql
alter table public.offer_versions drop constraint offer_versions_offer_id_version_number_key;
```

**V04**

```sql
alter table public.offer_versions drop constraint offer_versions_offer_id_fkey, add constraint offer_versions_offer_id_fkey foreign key (offer_id) references public.offers (id) on delete cascade;
```

**V05**

```sql
grant truncate on public.offer_reviews to service_role;
```

**V06**

```sql
update public.platform_settings set value = value - 'mileage_km' where key = 'material_fields';
```

**V07**

```sql
alter table public.vehicles disable trigger vehicles_versionar;
```

**V08**

```sql
alter table public.vehicles disable trigger vehicles_historico;
```

**V09**

```sql
update public.platform_settings set value = value || '["location_city"]'::jsonb where key = 'material_fields';
```

**V10**

```diff
- { id: "T05", de: ["under_review"], para: "draft", quem: ST, motivoDe: ST },
+ { id: "T05", de: ["under_review"], para: "draft", quem: ST, motivoDe: [] },
```

**V11**

```diff
-     return ator === "adm_empresa";
+     return FORNECEDOR.includes(ator);
```

## I2.11: correção das ressalvas da I2.10 (30/10/2026)

Resultado: 21 mutações do banco e do servidor, mais 4 do código do builder. Todas as que precisavam cair caíram sem derrubar o contraste; a N07 é equivalente, como a revisão T3 previu (R-I2.11-06). Procedimentos:

- **banco (N e P):** como na I2.3, a mutação entra na cópia do arquivo de teste e é desfeita no rollback. As P entram em todos os arquivos de oferta com escrita;
- **servidor (S):** o arquivo é trocado, o teste de integração `ofertas-transicoes` roda, e o original volta, conferido byte a byte pelo script;
- **código do builder (B):** o arquivo é trocado, o teste unitário roda, e o original volta, conferido com `cmp`.

### Achados 01 e 02

| ID  | Camada                        | Teste                            | Mudança                                                                          | Casos que devem cair                                                                                                                                                                                                                                                                                                                                                                                                                                              | Contraste                                                                                                         | Caíram  | Resultado                   |
| --- | ----------------------------- | -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------- | --------------------------- |
| N01 | função do private             | `380-ofertas-validade-e-leitura` | situacao_da_oferta() devolve sempre o status gravado                             | ACH-01: vencida, o org_admin não altera o preço; ACH-01: nem estende a validade; ACH-01: nem na reservada vencida; ACH-01: nem o veículo; ACH-01: nem declara; ACH-01: nem remove foto; ACH-01: nem registra foto nova; ACH-01: nem registra documento; ACH-01: o org_admin não reserva a vencida (T08); ACH-01: nem libera a reserva vencida (T09); ACH-01: o member não confirma a disponibilidade da vencida (T16); ACH-01: nem a plataforma reserva a vencida | contraste ACH-01: dentro da validade, o org_admin altera o preço; contraste ACH-01: e reserva                     | 15      | caiu; contraste passou      |
| N02 | gatilho                       | `380-ofertas-validade-e-leitura` | proteger_oferta(): T08 e T09 sem conferir a validade                             | ACH-01: o org_admin não reserva a vencida (T08); ACH-01: nem libera a reserva vencida (T09); ACH-01: nem a plataforma reserva a vencida                                                                                                                                                                                                                                                                                                                           | contraste ACH-01: e reserva; contraste ACH-01: e libera                                                           | 3       | caiu; contraste passou      |
| N03 | gatilho                       | `380-ofertas-validade-e-leitura` | proteger_oferta(): disponibilidade sem conferir a validade                       | ACH-01: o member não confirma a disponibilidade da vencida (T16)                                                                                                                                                                                                                                                                                                                                                                                                  | contraste ACH-01: o member confirma a disponibilidade dentro da validade                                          | 1       | caiu; contraste passou      |
| N04 | função da política do Storage | `380-ofertas-validade-e-leitura` | pode_editar_oferta() sem a validade                                              | ACH-01: a política do Storage recusa arquivo novo na vencida                                                                                                                                                                                                                                                                                                                                                                                                      | contraste ACH-01: a política do Storage aceita arquivo novo dentro da validade                                    | 1       | caiu; contraste passou      |
| N05 | função do private             | `380-ofertas-validade-e-leitura` | conferir_leitura_da_oferta() não confere nada                                    | ACH-02: fornecedor de outra empresa não lê as pendências; ACH-02: nem o detalhe das declarações; ACH-02: oferta inexistente dá a mesma resposta; ACH-02: comprador não lê os estados da publicada                                                                                                                                                                                                                                                                 | contraste ACH-02: o member da empresa dona lê as pendências; contraste ACH-02: a plataforma lê os estados         | 4       | caiu; contraste passou      |
| N06 | função do private             | `380-ofertas-validade-e-leitura` | conferir_leitura_da_oferta() aceita qualquer sessão sem usuário                  | contraste ACH-02: sem usuário, na sessão de manutenção, a função responde                                                                                                                                                                                                                                                                                                                                                                                         | contraste ACH-02: o member da empresa dona lê as pendências                                                       | arquivo | o arquivo cai na preparação |
| N07 | função do private             | `380-ofertas-validade-e-leitura` | conferir_leitura_da_oferta() sem usuário aceita qualquer sessão (sugestão da T3) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                 | 0       | equivalente: nada caiu      |
| S01 | regra do servidor             | `ofertas-transicoes`             | situacaoParaEdicao() devolve sempre o status gravado                             | edição da oferta, do veículo, declaração e disponibilidade em cada estado (publicada e reservada vencidas: true)                                                                                                                                                                                                                                                                                                                                                  | edição da oferta, do veículo, declaração e disponibilidade em cada estado (publicada e reservada vencidas: false) | 1       | caiu; contraste passou      |
| S02 | tabela do servidor            | `ofertas-transicoes`             | transicaoDaOferta() sem a condição da validade em vigor (T08 e T09)              | todo par de estados, todo ator, os dois valores da D10, com e sem motivo (publicada e reservada vencidas: true)                                                                                                                                                                                                                                                                                                                                                   | todo par de estados, todo ator, os dois valores da D10, com e sem motivo (publicada e reservada vencidas: false)  | 1       | caiu; contraste passou      |

- **N01:** além dos 12 esperados, caíram 3 em cascata. Com a mutação, a extensão da validade foi aceita, e a oferta deixou de estar vencida para a política do Storage, para a rodada da expiração e para a reabertura.
- **N06:** a mutação recusa toda sessão sem usuário. O arquivo cai já na preparação, porque o versionamento que roda sem usuário passa pela função. Isso mostra que o ramo da sessão de manutenção é usado.
- **N07:** a mutação inversa aceita qualquer sessão sem usuário. Nada cai, porque no pgTAP e na integração a sessão é sempre `postgres`, e pela API `anon` e `service_role` não têm EXECUTE. O ramo fica como defesa em profundidade.

### Achado 04: políticas de escrita

Cada política foi afrouxada sozinha (P). As de inclusão também foram afrouxadas junto com a checagem de vínculo do gatilho da tabela (Pd).

| ID   | Mudança                                                                                           | Caíram | Casos                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01  | política vehicles_cadastro com with check true                                                    | 1      | ACH-04 (política): vehicles_cadastro recusa veículo em nome de outra empresa                                                                                                        |
| P01d | política vehicles_cadastro com with check true e o gatilho sem a checagem de vínculo              | 2      | CT2.11: não cria oferta em nome de outra empresa; ACH-04 (política): vehicles_cadastro recusa veículo em nome de outra empresa                                                      |
| P02  | política vehicles_alteracao com using true with check true                                        | 1      | ACH-04 (política): vehicles_alteracao não deixa o staff alterar o veículo                                                                                                           |
| P03  | política offers_cadastro com with check true                                                      | 1      | ACH-04 (política): offers_cadastro recusa oferta em nome de outra empresa                                                                                                           |
| P03d | política offers_cadastro com with check true e o gatilho sem a checagem de vínculo                | 2      | ACH-04/CT2.11: outra empresa não cadastra oferta na empresa dona pela API direta, nem com o veículo dela; ACH-04 (política): offers_cadastro recusa oferta em nome de outra empresa |
| P04  | política supplier_declarations_inclusao com with check true                                       | 1      | ACH-04 (política): supplier_declarations_inclusao recusa declaração na oferta alheia                                                                                                |
| P04d | política supplier_declarations_inclusao com with check true e o gatilho sem a checagem de vínculo | 3      | B5: o staff não declara; CT2.11: não declara na oferta alheia; ACH-04 (política): supplier_declarations_inclusao recusa declaração na oferta alheia                                 |
| P05  | política offer_media_inclusao com with check true                                                 | 1      | ACH-04 (política): offer_media_inclusao recusa foto na oferta alheia                                                                                                                |
| P05d | política offer_media_inclusao com with check true e o gatilho sem a checagem de vínculo           | 2      | CT2.11: não envia foto para a oferta alheia; ACH-04 (política): offer_media_inclusao recusa foto na oferta alheia                                                                   |
| P06  | política offer_media_alteracao com using true with check true                                     | 1      | ACH-04 (política): offer_media_alteracao não deixa o staff alterar a foto                                                                                                           |
| P07  | política offer_documents_inclusao com with check true                                             | 1      | ACH-04 (política): offer_documents_inclusao recusa documento na oferta alheia                                                                                                       |
| P07d | política offer_documents_inclusao com with check true e o gatilho sem a checagem de vínculo       | 2      | CT2.11: nem documento; ACH-04 (política): offer_documents_inclusao recusa documento na oferta alheia                                                                                |

- **Primeira rodada, antes do negativo próprio:**
  - as sete P não derrubaram nada, porque o gatilho BEFORE recusa antes da WITH CHECK, com o mesmo predicado, e no UPDATE a política de leitura já filtra a linha de outra empresa. Eram equivalentes;
  - por sugestão da revisão T3 (R-I2.11-02), e como no Inc. 1, o `380` ganhou um negativo por política, com o gatilho desligado só durante a asserção. Nas de inclusão, outra empresa recebe a recusa da RLS. Nas de alteração, o staff, que lê a linha, altera 0 linhas. As sete passaram a cair, com o contraste da empresa dona intacto.
- **Lacuna achada e fechada:**
  - na primeira rodada, a P03d não derrubou nada, porque nenhum teste tentava cadastrar oferta de outra empresa pela API direta com um veículo da empresa dona. O CT2.11 existente passa pela RPC, que cai antes no gatilho do veículo;
  - o caso entrou no `380` (ACH-04/CT2.11, com contraste).

### Código do builder

| ID  | Teste                      | Mudança                                                      | Resultado                                                   |
| --- | -------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| B01 | `storage/servidor.test.ts` | a falha do registro em `restricted_access_logs` vira um log  | caiu o caso da falha; o contraste passou                    |
| B02 | `storage/servidor.test.ts` | o registro vai para depois da URL                            | caíram o caso da falha e o contraste, pela ordem dos passos |
| B03 | `storage/esquemas.test.ts` | a descrição do documento volta ao esquema sem `textoDeLinha` | caíram U+200B e U+0000; os demais passaram                  |
| B04 | `ui/plataforma.test.ts`    | `resultadoConfereComStatus` sempre verdadeiro                | caiu o teste dos sete resultados contra os oito status      |

### Mudança de cada mutação (I2.11)

**N01**

```sql
create or replace function private.situacao_da_oferta(o public.offers) returns text language sql stable set search_path = '' as $f$ select o.status $f$;
```

**N02**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if private\.situacao_da_oferta\(old\) = ''expired'' then\s+raise exception ''a validade da oferta venceu: ela não pode ser reservada nem liberada''', 'if false then raise exception ''mutado''');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**N03**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if private\.situacao_da_oferta\(old\) = ''expired'' then\s+raise exception ''a validade da oferta venceu: a disponibilidade não se confirma''', 'if false then raise exception ''mutado''');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**N04**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.pode_editar_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, ' and o\.valid_until > now\(\)', '');
  if n = d then
    raise exception 'mutação não aplicada em private.pode_editar_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**N05**

```sql
create or replace function private.conferir_leitura_da_oferta(p_oferta uuid) returns void language plpgsql stable security definer set search_path = '' as $f$ begin return; end $f$;
```

**N06**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.conferir_leitura_da_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if private\.sessao_de_manutencao\(session_user\) then\s+return;\s+end if;\s+raise exception ''sem permissão'' using errcode = ''42501'';', 'raise exception ''sem permissão'' using errcode = ''42501'';');
  if n = d then
    raise exception 'mutação não aplicada em private.conferir_leitura_da_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**N07**

```sql
do $m$
declare
  d text := pg_get_functiondef('private.conferir_leitura_da_oferta(uuid)'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if private\.sessao_de_manutencao\(session_user\) then\s+return;\s+end if;\s+raise exception ''sem permissão'' using errcode = ''42501'';', 'return;');
  if n = d then
    raise exception 'mutação não aplicada em private.conferir_leitura_da_oferta(uuid)';
  end if;
  execute n;
end
$m$;
```

**S01**

Em `src/modules/offers/rules/edicao.ts`: situacaoParaEdicao() devolve sempre o status gravado.

**S02**

Em `src/modules/offers/rules/transicoes.ts`: transicaoDaOferta() sem a condição da validade em vigor (T08 e T09).

**P01**

```sql
alter policy vehicles_cadastro on public.vehicles with check (true);
```

**P01d**

```sql
alter policy vehicles_cadastro on public.vehicles with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_veiculo()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if ator is null or not private\.membro_ativo\(new\.organization_id\) then', 'if ator is null then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_veiculo()';
  end if;
  execute n;
end
$m$;
```

**P02**

```sql
alter policy vehicles_alteracao on public.vehicles using (true) with check (true);
```

**P03**

```sql
alter policy offers_cadastro on public.offers with check (true);
```

**P03d**

```sql
alter policy offers_cadastro on public.offers with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_oferta()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not private\.membro_ativo\(new\.supplier_organization_id\) then\s+raise exception ''só membro ativo da empresa fornecedora cadastra oferta''', 'if false then raise exception ''mutado''');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_oferta()';
  end if;
  execute n;
end
$m$;
```

**P04**

```sql
alter policy supplier_declarations_inclusao on public.supplier_declarations with check (true);
```

**P04d**

```sql
alter policy supplier_declarations_inclusao on public.supplier_declarations with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_declaracao()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not found or not private\.membro_ativo\(oferta\.supplier_organization_id\) then', 'if not found then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_declaracao()';
  end if;
  execute n;
end
$m$;
```

**P05**

```sql
alter policy offer_media_inclusao on public.offer_media with check (true);
```

**P05d**

```sql
alter policy offer_media_inclusao on public.offer_media with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_foto()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not found or not private\.membro_ativo\(oferta\.supplier_organization_id\) then', 'if not found then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_foto()';
  end if;
  execute n;
end
$m$;
```

**P06**

```sql
alter policy offer_media_alteracao on public.offer_media using (true) with check (true);
```

**P07**

```sql
alter policy offer_documents_inclusao on public.offer_documents with check (true);
```

**P07d**

```sql
alter policy offer_documents_inclusao on public.offer_documents with check (true);
do $m$
declare
  d text := pg_get_functiondef('private.proteger_documento()'::regprocedure);
  n text;
begin
  n := regexp_replace(d, 'if not found or not private\.membro_ativo\(oferta\.supplier_organization_id\) then', 'if not found then');
  if n = d then
    raise exception 'mutação não aplicada em private.proteger_documento()';
  end if;
  execute n;
end
$m$;
```
