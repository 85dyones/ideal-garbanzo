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
