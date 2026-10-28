-- I0.6: tabelas de auditoria, histórico, acesso restrito e configuração.
-- Cobre o teste negativo 11 da §7.4 (parte base): registros só de inclusão.
-- Os inserts vêm antes das recusas: DELETE em tabela vazia não dispara o
-- gatilho de linha e passaria sem erro.
begin;
select plan(29);

-- Estrutura
select has_table('public', 'audit_logs', 'audit_logs existe');
select has_table('public', 'field_history', 'field_history existe');
select has_table('public', 'restricted_access_logs', 'restricted_access_logs existe');
select has_table('public', 'platform_settings', 'platform_settings existe');

-- RLS ligado em todas
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'RLS ligado em audit_logs');
select ok((select relrowsecurity from pg_class where oid = 'public.field_history'::regclass), 'RLS ligado em field_history');
select ok((select relrowsecurity from pg_class where oid = 'public.restricted_access_logs'::regclass), 'RLS ligado em restricted_access_logs');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_settings'::regclass), 'RLS ligado em platform_settings');

-- Inclusão funciona
select lives_ok(
  $$insert into public.audit_logs (action, entity_type) values ('teste', 'teste')$$,
  'inserir em audit_logs funciona'
);
select lives_ok(
  $$insert into public.field_history (entity_type, entity_id, field, old_value, new_value)
    values ('teste', gen_random_uuid(), 'preco', '1'::jsonb, '2'::jsonb)$$,
  'inserir em field_history funciona'
);
select lives_ok(
  $$insert into public.restricted_access_logs (resource_type, resource_id) values ('documento', gen_random_uuid())$$,
  'inserir em restricted_access_logs funciona'
);

-- Só inclusão (teste 11, parte base)
select throws_like($$update public.audit_logs set action = 'alterada'$$, '%só de inclusão%', 'UPDATE recusado em audit_logs');
select throws_like($$delete from public.audit_logs$$, '%só de inclusão%', 'DELETE recusado em audit_logs');
select throws_like($$truncate public.audit_logs$$, '%só de inclusão%', 'TRUNCATE recusado em audit_logs');
select throws_like($$update public.field_history set field = 'alterado'$$, '%só de inclusão%', 'UPDATE recusado em field_history');
select throws_like($$delete from public.field_history$$, '%só de inclusão%', 'DELETE recusado em field_history');
select throws_like($$truncate public.field_history$$, '%só de inclusão%', 'TRUNCATE recusado em field_history');
select throws_like($$update public.restricted_access_logs set resource_type = 'alterado'$$, '%só de inclusão%', 'UPDATE recusado em restricted_access_logs');
select throws_like($$delete from public.restricted_access_logs$$, '%só de inclusão%', 'DELETE recusado em restricted_access_logs');
select throws_like($$truncate public.restricted_access_logs$$, '%só de inclusão%', 'TRUNCATE recusado em restricted_access_logs');

-- anon sem acesso
set local role anon;
select throws_ok($$select * from public.audit_logs$$, '42501', 'permission denied for table audit_logs', 'anon não lê audit_logs');
select throws_ok(
  $$insert into public.audit_logs (action, entity_type) values ('anon', 'teste')$$,
  '42501', 'permission denied for table audit_logs', 'anon não insere em audit_logs'
);
select throws_ok($$select * from public.platform_settings$$, '42501', 'permission denied for table platform_settings', 'anon não lê platform_settings');
reset role;

-- authenticated sem papel não vê nada: desde a I1.3 a leitura existe, filtrada
-- pela RLS (ADR-0002 §2.7 e §2.9). Os registros inseridos acima e a chave
-- não crítica abaixo existem; a leitura volta vazia.
insert into public.platform_settings (key, value, description, is_critical)
  values ('teste_nao_critica', '1'::jsonb, 'teste', false);
set local role authenticated;
select is((select count(*)::int from public.audit_logs), 0, 'authenticated sem papel não lê audit_logs');
select is((select count(*)::int from public.field_history), 0, 'authenticated sem papel não lê field_history');
select is((select count(*)::int from public.restricted_access_logs), 0, 'authenticated sem papel não lê restricted_access_logs');
select is((select count(*)::int from public.platform_settings), 0, 'authenticated sem papel nem empresa não lê platform_settings');
reset role;

-- service_role insere, mas não altera
set local role service_role;
select lives_ok(
  $$insert into public.audit_logs (action, entity_type) values ('servidor', 'teste')$$,
  'service_role insere em audit_logs'
);
select throws_ok($$update public.audit_logs set action = 'alterada'$$, '42501', 'permission denied for table audit_logs', 'service_role não tem UPDATE em audit_logs');
reset role;

select * from finish();
rollback;
