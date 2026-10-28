-- I1.6: limite de tentativas (ADR-0002 §2.16). Só o servidor, com a chave
-- secreta, consome; anon e authenticated não leem nem executam.
begin;
select plan(17);

select has_table('public', 'limites_de_tentativas', 'a tabela do limite existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.limites_de_tentativas'::regclass),
  'RLS ligada na tabela do limite');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.consumir_limite_de_tentativas(text, integer, integer)'::regprocedure),
  'a função do limite é security invoker');
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.consumir_limite_de_tentativas(text, integer, integer)'::regprocedure),
  'a função do limite fixa search_path vazio');

-- Privilégios: negativos e contraste.
select ok(
  not has_function_privilege('anon', 'public.consumir_limite_de_tentativas(text, integer, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.consumir_limite_de_tentativas(text, integer, integer)', 'EXECUTE'),
  'anon e authenticated não executam a função do limite');
select ok(
  has_function_privilege('service_role', 'public.consumir_limite_de_tentativas(text, integer, integer)', 'EXECUTE'),
  'contraste: service_role executa a função do limite');
select ok(
  not has_table_privilege('anon', 'public.limites_de_tentativas', 'SELECT')
  and not has_table_privilege('authenticated', 'public.limites_de_tentativas', 'SELECT')
  and not has_table_privilege('authenticated', 'public.limites_de_tentativas', 'INSERT')
  and not has_table_privilege('authenticated', 'public.limites_de_tentativas', 'UPDATE'),
  'anon e authenticated não leem nem gravam a tabela do limite');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "20000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$select public.consumir_limite_de_tentativas(repeat('a', 64), 1000, 3600)$$,
  '42501', null,
  'authenticated não consome o limite (zerar o próprio contador seria trivial)');
select throws_ok(
  $$select count(*) from public.limites_de_tentativas$$,
  '42501', null,
  'authenticated não lê os contadores');
reset role;

-- Comportamento, como o servidor (service_role).
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(public.consumir_limite_de_tentativas(repeat('b', 64), 2, 3600), true, '1ª tentativa dentro do limite');
select is(public.consumir_limite_de_tentativas(repeat('b', 64), 2, 3600), true, '2ª tentativa dentro do limite');
select is(public.consumir_limite_de_tentativas(repeat('b', 64), 2, 3600), false, '3ª tentativa passa do limite');
select is(public.consumir_limite_de_tentativas(repeat('c', 64), 2, 3600), true, 'outra chave tem contador próprio');
select throws_ok(
  $$select public.consumir_limite_de_tentativas('192.168.0.1', 2, 3600)$$,
  '22023', null,
  'chave em claro (sem resumo) é recusada');
select throws_ok(
  $$select public.consumir_limite_de_tentativas(repeat('d', 64), 0, 3600)$$,
  '22023', null,
  'limite zero é recusado');
reset role;

-- Janela vencida da mesma chave é apagada na chamada seguinte.
insert into public.limites_de_tentativas (chave, janela_inicio, tentativas)
values (repeat('e', 64), now() - interval '2 hours', 50);
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(public.consumir_limite_de_tentativas(repeat('e', 64), 2, 3600), true,
  'a janela antiga não conta na janela atual');
reset role;
select is(
  (select count(*)::int from public.limites_de_tentativas
   where chave = repeat('e', 64) and janela_inicio < now() - interval '1 hour'),
  0,
  'a janela vencida da chave foi apagada');

select * from finish();
rollback;
