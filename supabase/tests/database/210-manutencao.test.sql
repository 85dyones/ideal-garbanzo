-- I1.8: saída de manutenção (ADR-0002 §3 e §8, R5).
--
-- O pgTAP roda como postgres, então a sessão de outros serviços (Auth,
-- Storage) não é simulável aqui: a lista de sessões é conferida pela função
-- pura sessao_de_manutencao. Os chamadores de manutencao() ficam fixos, para
-- que um uso novo passe por revisão.
begin;
select plan(11);

-- Só dois gatilhos usam a saída de manutenção --------------------------------------

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname <> 'manutencao'
      and p.prosrc like '%manutencao()%'),
  array['proteger_configuracao', 'proteger_papel_da_plataforma'],
  'R5: só proteger_configuracao e proteger_papel_da_plataforma chamam manutencao()');

-- Lista de sessões -------------------------------------------------------------------

select ok(private.sessao_de_manutencao('postgres'), 'R5: postgres (migração e scripts do T2) conta como manutenção');
select ok(private.sessao_de_manutencao('supabase_admin'), 'R5: supabase_admin (CLI e editor do painel) conta como manutenção');
select ok(not private.sessao_de_manutencao('authenticator'), 'R5: authenticator (PostgREST) não conta');
select ok(not private.sessao_de_manutencao('supabase_auth_admin'), 'R5: a API do Auth não conta');
select ok(not private.sessao_de_manutencao('supabase_storage_admin'), 'R5: o Storage não conta');
select ok(not private.sessao_de_manutencao('supabase_realtime_admin'), 'R5: o Realtime não conta');

-- Nível do gatilho e claims --------------------------------------------------------

select set_config('request.jwt.claims', '', true);
select ok(not private.manutencao(), 'R5: fora de gatilho (nível 0), não é manutenção');

-- Contraste: o gatilho de primeiro nível, como postgres e sem claims, ainda vale.
select lives_ok(
  $$insert into public.platform_settings (key, value, description, is_critical)
    values ('teste_210', '1'::jsonb, 'teste da I1.8', false)$$,
  'R5 (contraste): migração como postgres, sem claims, grava configuração');

select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok(
  $$insert into public.platform_settings (key, value, description, is_critical)
    values ('teste_210_b', '1'::jsonb, 'teste da I1.8', false)$$,
  '42501', 'só um administrador da plataforma altera a configuração',
  'R5: com claims definidas, a mesma gravação não é manutenção');
select set_config('request.jwt.claims', '', true);

-- A função pura não é executável pela API.
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$select private.sessao_de_manutencao('postgres')$$,
  '42501', 'permission denied for function sessao_de_manutencao',
  'R5: authenticated não executa sessao_de_manutencao');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
