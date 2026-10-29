-- I2.3: estrutura das ofertas (ADR-0003 §2.6, §2.7, §2.9 e §2.11 a §2.16).
--
-- RLS e privilégios das sete tabelas, validações de RENAVAM e de texto, JSON
-- canônico e hash (com valores de referência calculados fora do banco, em
-- Node), configuração do Inc. 2 e o job da expiração.
begin;
select plan(46);

-- RLS e privilégios -------------------------------------------------------------------

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relrowsecurity
      and c.relname in ('vehicles', 'offers', 'offer_versions', 'supplier_declarations',
                        'offer_media', 'offer_documents', 'offer_reviews')),
  7,
  'RLS ligada nas sete tabelas da oferta');
select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('vehicles', 'offers', 'offer_versions', 'supplier_declarations',
                         'offer_media', 'offer_documents', 'offer_reviews')),
  'anon não tem privilégio nas tabelas da oferta');
select is(
  (select array_agg(distinct privilege_type::text) from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public'
      and table_name in ('vehicles', 'offers', 'offer_versions', 'supplier_declarations',
                         'offer_media', 'offer_documents', 'offer_reviews')),
  array['SELECT'],
  'service_role só lê as tabelas da oferta (ADR-0003 §2.15)');
select is(
  (select array_agg(distinct privilege_type::text) from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public'
      and table_name in ('vehicles', 'offers', 'offer_versions', 'supplier_declarations',
                         'offer_media', 'offer_documents', 'offer_reviews')),
  array['SELECT'],
  'authenticated: na tabela, só leitura; a escrita é por coluna');
select ok(not has_column_privilege('authenticated', 'public.offers', 'published_at', 'UPDATE'),
  'CT12.5: authenticated não escreve published_at');
select ok(not has_column_privilege('authenticated', 'public.offers', 'current_version', 'UPDATE'),
  'CT12.5: authenticated não escreve current_version');
select ok(not has_column_privilege('authenticated', 'public.offers', 'suspended_reason', 'UPDATE'),
  'authenticated não escreve o motivo da suspensão (vem do cabeçalho)');
select ok(not has_column_privilege('authenticated', 'public.offers', 'supplier_organization_id', 'UPDATE'),
  'CT12.5: authenticated não muda a empresa da oferta');
select ok(has_column_privilege('authenticated', 'public.offers', 'asking_price', 'UPDATE'),
  'authenticated escreve o preço (o gatilho decide quem; contraste)');
select ok(not has_column_privilege('authenticated', 'public.vehicles', 'organization_id', 'UPDATE'),
  'authenticated não muda a empresa do veículo');
select ok(not has_column_privilege('authenticated', 'public.offer_documents', 'buyer_visibility', 'INSERT'),
  'X18: authenticated não escolhe a visibilidade do documento (D5)');
select ok(not has_any_column_privilege('authenticated', 'public.supplier_declarations', 'UPDATE'),
  'teste 11: nenhuma coluna de supplier_declarations se altera');
select ok(not has_any_column_privilege('authenticated', 'public.offer_versions', 'INSERT'),
  'só versionar_oferta grava versão');
select ok(not has_any_column_privilege('authenticated', 'public.offer_reviews', 'INSERT'),
  'só o gatilho da oferta grava a revisão');

-- RENAVAM e textos ------------------------------------------------------------------------

select ok(private.renavam_valido('12345678900'), 'RENAVAM com dígito verificador certo');
select ok(private.renavam_valido('00638790107'), 'RENAVAM antigo completado com zeros');
select ok(not private.renavam_valido('12345678901'), 'RENAVAM com dígito verificador errado');
select ok(not private.renavam_valido('1234567890'), 'RENAVAM sem 11 dígitos');
select ok(private.texto_de_linha('Gol', 80), 'texto de uma linha válido');
select ok(not private.texto_de_linha(' Gol', 80), 'texto com espaço na ponta');
select ok(not private.texto_de_linha('Go' || chr(8203) || 'l', 80), 'texto com caractere invisível');
select ok(not private.texto_de_linha('a' || chr(10) || 'b', 80), 'texto de linha não aceita quebra');
select ok(private.texto_livre('a' || chr(10) || 'b', 80), 'texto livre aceita quebra de linha');
select ok(not private.texto_livre('a' || chr(9) || 'b', 80), 'texto livre não aceita tabulação');

-- JSON canônico e hash (ADR-0003 §2.7) -------------------------------------------------

select is(
  private.json_canonico('{"b": "1", "a": null, "c": {"z": true, "y": ["x", "w"]}}'),
  '{"a":null,"b":"1","c":{"y":["x","w"],"z":true}}',
  'JSON canônico: chaves em ordem de código, sem espaços, listas na ordem dada');
select is(
  private.hash_do_snapshot('{"b": "1", "a": null, "c": {"z": true, "y": ["x", "w"]}}'),
  'bebfc2d4a3217d84815920ae3283af95f1d006059f16c5ced0ab768253c61e60',
  'hash igual ao calculado em Node sobre o mesmo JSON canônico');
select is(
  private.json_canonico(jsonb_build_object('t', 'Pátio "São" ' || chr(92) || ' 😀' || chr(10) || chr(1))),
  '{"t":"Pátio ' || chr(92) || '"São' || chr(92) || '" ' || chr(92) || chr(92) || ' 😀'
    || chr(92) || 'n' || chr(92) || 'u0001"}',
  'escape de texto igual ao do JCS (aspas, barra, quebra, controle; acento e emoji sem escape)');
select is(
  private.hash_do_snapshot(jsonb_build_object('t', 'Pátio "São" ' || chr(92) || ' 😀' || chr(10) || chr(1))),
  'eb1d68decc59c969692463a4c36fa8a6fa4caea48a3710397dc9f980cf1423d5',
  'hash do texto com escapes igual ao calculado em Node');
select throws_ok(
  $$select private.json_canonico('{"n": 1}')$$,
  '22023', 'o snapshot não aceita números; grave-os como texto',
  'o snapshot não aceita número');
select throws_ok(
  $$select private.json_canonico('{"á": "1"}')$$,
  '22023', 'o snapshot só aceita chaves ASCII',
  'o snapshot só aceita chave ASCII');
select is(
  array[private.estado_pela_declaracao('unknown'), private.estado_pela_declaracao('no_known_occurrence'),
        private.estado_pela_declaracao('has_occurrence'), private.estado_pela_declaracao(null)],
  array['not_checked', 'declared_unverified', 'with_findings', 'not_checked'],
  'B29: estado documental a partir só da declaração');

-- Configuração do Inc. 2 (ADR-0003 §2.16) ----------------------------------------------

select ok(private.revisao_exigida(), 'Q1: revisão antes de publicar ligada como valor provisório');
select is((select value from public.platform_settings where key = 'offer_max_validity_days'), '30'::jsonb,
  'Q5: teto da validade de 30 dias');
select is((select value from public.platform_settings where key = 'offer_default_validity_days'), '15'::jsonb,
  'Q5: validade sugerida de 15 dias');
select is((select jsonb_array_length(value) from public.platform_settings where key = 'document_categories'), 10,
  'as dez categorias da §5.3');
select ok(
  (select value ? 'make' and value ? 'model_year' and value ? 'asking_price' and not value ? 'plate'
     from public.platform_settings where key = 'material_fields'),
  'Q4: a identidade do veículo é material; a placa não entra');
select is(
  (select count(*)::int from public.platform_settings
    where not is_critical
      and key in ('offer_review_required', 'material_fields', 'document_categories',
                  'offer_default_validity_days', 'offer_max_validity_days')),
  5,
  'as cinco chaves do Inc. 2 não são críticas (formulários e operador leem)');

-- Validade (ADR-0003 §2.9) ---------------------------------------------------------------

select is(private.problema_da_validade(now() - interval '1 minute'), 'a validade precisa estar no futuro',
  'validade no passado');
select is(private.problema_da_validade(now() + interval '40 days'), 'a validade passa do teto de 30 dias',
  'validade acima do teto');
select is(private.problema_da_validade(now() + interval '29 days'), null, 'validade dentro do teto');

-- Expiração e funções (ADR-0003 §2.9 e §2.15) --------------------------------------------

select is(
  (select count(*)::int from cron.job
    where jobname = 'expirar-ofertas' and schedule = '*/10 * * * *'
      and command = 'select private.expirar_ofertas()'),
  1,
  'job do pg_cron que expira as ofertas a cada 10 minutos');
select ok(not has_function_privilege('authenticated', 'private.expirar_ofertas()', 'EXECUTE'),
  'X04: usuário não chama a expiração');
select ok(not has_function_privilege('authenticated', 'private.versionar_oferta(uuid)', 'EXECUTE'),
  'usuário não chama o versionamento');
select ok(has_function_privilege('authenticated', 'public.criar_oferta(uuid, jsonb, jsonb)', 'EXECUTE'),
  'authenticated chama criar_oferta');
select ok(not has_function_privilege('anon', 'public.criar_oferta(uuid, jsonb, jsonb)', 'EXECUTE'),
  'anon não chama criar_oferta');
select ok(not has_function_privilege('service_role', 'public.atualizar_oferta(uuid, jsonb, jsonb)', 'EXECUTE'),
  'service_role não escreve oferta (ADR-0003 §2.15)');

select * from finish();
rollback;
