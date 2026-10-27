-- Fundação (I0.5): o reset preserva o schema public e os grants padrão do
-- Supabase, e o histórico de migrações existe e bate com as migrações aplicadas.
begin;
select plan(6);

select has_schema('public', 'o schema public existe');
select ok(has_schema_privilege('anon', 'public', 'USAGE'), 'anon tem USAGE em public');
select ok(has_schema_privilege('authenticated', 'public', 'USAGE'), 'authenticated tem USAGE em public');
select ok(has_schema_privilege('service_role', 'public', 'USAGE'), 'service_role tem USAGE em public');
select has_table('supabase_migrations', 'schema_migrations', 'o histórico de migrações existe');
select is(
  (select count(*)::int from supabase_migrations.schema_migrations where version !~ '^[0-9]+$'),
  0,
  'toda versão de migração registrada é numérica'
);

select * from finish();
rollback;
