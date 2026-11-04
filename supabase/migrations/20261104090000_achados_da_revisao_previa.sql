-- I3.10: achados da revisão prévia da I3.8 (04/11; ADR-0004 §9).
--
-- * R-AG-02: o texto digitado deixa de aceitar o marcador de exceção, que vale
--   só para o código-fonte, e a busca passa a ser por frase: a quebra de linha
--   não separa os termos de duas palavras, e a qualificação vale só na frase
--   em que aparece.
-- * R-AG-07 (decisão da pessoa responsável em 04/11): o texto livre recusa CPF,
--   número de 11 dígitos, telefone, placa e chassi.
-- * R-AG-08: a linguagem e o dado pessoal também nas condições comerciais da
--   oferta e na descrição do documento.
-- * R-AG-05: a base do impedimento corta o texto sem deixar espaço no fim.
-- * R-AG-04: a ressalva de "Em análise" passa ao código .v2, com texto que não
--   diz que a plataforma já está analisando.
-- * R-AG-12: a trava de chaves reconhece titular, possuidor, WhatsApp, rua e
--   bairro.
-- * Os gatilhos de texto conferem, na alteração, só o campo que mudou.

-- Primeiro termo proibido do texto digitado; nulo se não houver.
create or replace function private.termo_proibido(valor text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lista jsonb := private.configuracao('forbidden_terms');
  frase text;
  qualificacao text;
  item jsonb;
  variante text;
begin
  if valor is null then
    return null;
  end if;
  if lista is null
     or jsonb_typeof(lista) <> 'object'
     or jsonb_typeof(lista -> 'termos') is distinct from 'array'
     or jsonb_array_length(lista -> 'termos') = 0
     or coalesce(lista ->> 'qualificacao', '') = '' then
    raise exception 'a lista de linguagem proibida (forbidden_terms) está ausente ou fora do formato'
      using errcode = 'P0001';
  end if;
  qualificacao := private.expressao_de_palavra_inteira(private.texto_normalizado(lista ->> 'qualificacao'));
  -- Frases: separadas por ponto, ponto e vírgula, exclamação ou interrogação;
  -- a quebra de linha vira espaço.
  for frase in
    select private.texto_normalizado(f)
    from regexp_split_to_table(regexp_replace(valor, '[\r\n]+', ' ', 'g'), '[.;!?]+') as f
  loop
    if frase ~ qualificacao then
      continue;
    end if;
    for item in select jsonb_array_elements(lista -> 'termos') loop
      for variante in select jsonb_array_elements_text(item -> 'variantes') loop
        if frase ~ private.expressao_de_palavra_inteira(private.texto_normalizado(variante)) then
          return item ->> 'termo';
        end if;
      end loop;
    end loop;
  end loop;
  return null;
end;
$$;

-- Dado pessoal ou restrito digitado no texto livre; devolve o que achou.
create function private.dado_pessoal_no_texto(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when valor is null then null
    when valor ~ '(^|[^0-9])[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}($|[^0-9])' then 'um CPF'
    when valor ~ '(^|[^0-9])[0-9]{11}($|[^0-9])' then 'um número de 11 dígitos (CPF, RENAVAM ou telefone)'
    when valor ~ '[(][0-9]{2}[)] ?9?[0-9]{4}-?[0-9]{4}($|[^0-9])'
      or valor ~ '(^|[^0-9])9[0-9]{4}-[0-9]{4}($|[^0-9])' then 'um telefone'
    when valor ~ '(^|[^[:alnum:]])[A-Za-z]{3}-?[0-9]{4}($|[^[:alnum:]])'
      or valor ~ '(^|[^[:alnum:]])[A-Za-z]{3}[0-9][A-Za-z][0-9]{2}($|[^[:alnum:]])' then 'uma placa'
    when valor ~ '(^|[^[:alnum:]])[A-HJ-NPR-Za-hj-npr-z0-9]{17}($|[^[:alnum:]])' then 'um chassi'
  end;
$$;

-- Confere as colunas passadas como argumento do gatilho.
create function private.revisar_dado_pessoal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registro jsonb := to_jsonb(new);
  campo text;
  achado text;
begin
  foreach campo in array tg_argv loop
    if tg_op = 'UPDATE' and registro -> campo is not distinct from to_jsonb(old) -> campo then
      continue;
    end if;
    achado := private.dado_pessoal_no_texto(registro ->> campo);
    if achado is not null then
      raise exception 'o texto parece ter %; tire do texto o dado pessoal ou restrito', achado
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.revisar_linguagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registro jsonb := to_jsonb(new);
  campo text;
  termo text;
begin
  foreach campo in array tg_argv loop
    -- Na alteração, só o campo que mudou: o texto antigo já passou na gravação.
    if tg_op = 'UPDATE' and registro -> campo is not distinct from to_jsonb(old) -> campo then
      continue;
    end if;
    termo := private.termo_proibido(registro ->> campo);
    if termo is not null then
      raise exception 'o texto usa "%" sem a qualificação exigida pela §6.6', termo
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function private.registrar_impedimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- As duas tabelas têm colunas diferentes: a leitura passa pelo jsonb.
  registro jsonb := to_jsonb(new);
begin
  if registro ->> 'category' <> 'transfer_conditions' then
    return null;
  end if;
  if tg_table_name = 'supplier_declarations' and registro ->> 'declared_value' = 'has_occurrence' then
    insert into public.transfer_impediments (offer_id, basis, source_declaration_id)
    values ((registro ->> 'offer_id')::uuid,
            'Declaração do fornecedor em Condições de transferência: ' || rtrim(left(registro ->> 'detail', 900), E' \n'),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  elsif tg_table_name = 'vehicle_checks' and registro ->> 'result' = 'has_occurrence' then
    insert into public.transfer_impediments (offer_id, basis, source_check_id)
    values ((registro ->> 'offer_id')::uuid,
            'Consulta em Condições de transferência (' || (registro ->> 'source_name') || '): '
              || rtrim(left(registro ->> 'result_summary', 700), E' \n'),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create or replace function private.chave_de_dado_pessoal(chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with normalizada as (
    select translate(
             lower(regexp_replace(coalesce(chave, ''), '([a-z0-9])([A-Z])', '\1_\2', 'g')),
             'áàâãäéèêëíìîïóòôõöúùûüçñ',
             'aaaaaeeeeiiiiooooouuuucn') as texto
  ),
  palavras as (
    select regexp_replace(regexp_replace(p.palavra, '[0-9]+$', ''), 's$', '') as base, p.palavra
    from normalizada n, regexp_split_to_table(n.texto, '[^a-z0-9]+') as p(palavra)
    where p.palavra <> ''
  )
  select exists (
      select 1 from palavras w
      where w.palavra in ('cpf', 'cnpj', 'rg', 'cnh', 'doc', 'documento', 'nome', 'razao', 'mail', 'email', 'vin',
                          'chassis', 'cep', 'crv')
         or w.base in (
           'proprietario', 'proprietaria', 'dono', 'dona', 'cpf', 'cnpj', 'rg', 'cnh', 'documento',
           'nome', 'razao', 'financiado', 'financiada', 'arrendatario', 'arrendataria', 'faturado', 'faturada',
           'email', 'mail', 'celular', 'cellphone', 'telefone', 'fone', 'phone', 'endereco', 'logradouro',
           'cep', 'nascimento', 'placa', 'renavam', 'chassi', 'owner', 'name', 'address', 'document', 'plate',
           'driver', 'holder', 'titular', 'possuidor', 'possuidora', 'whatsapp', 'rua', 'bairro'))
    or exists (
      select 1 from normalizada n
      where regexp_replace(n.texto, '[^a-z0-9]+', '', 'g') ~
            '(cpf|cnpj|renavam|chassi|placa|email|nome|razao|proprietari|financiad|arrendatari|faturad|celular|telefone|seguranca|owner|titular|possuidor|whatsapp)');
$$;

create or replace function private.aviso_do_estado(estado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case estado
    when 'not_checked' then 'categoria_nao_consultada.v1'
    when 'declared_unverified' then 'declaracao_sem_comprovacao.v1'
    when 'with_findings' then 'categoria_com_apontamentos.v1'
    when 'pending' then 'categoria_pendente.v1'
    when 'under_review' then 'categoria_em_analise.v2'
    when 'no_findings_in_sources' then 'sem_apontamentos_nas_fontes_consultadas.v1'
  end;
$$;

create trigger vehicle_checks_revisar_dado_pessoal
  before insert on public.vehicle_checks
  for each row execute function private.revisar_dado_pessoal('result_summary', 'known_limitations');
create trigger documental_reviews_revisar_dado_pessoal
  before insert on public.documental_reviews
  for each row execute function private.revisar_dado_pessoal('reason');
create trigger transfer_impediments_revisar_dado_pessoal
  before update on public.transfer_impediments
  for each row execute function private.revisar_dado_pessoal('resolution_reason');
create trigger supplier_declarations_revisar_dado_pessoal
  before insert on public.supplier_declarations
  for each row execute function private.revisar_dado_pessoal('detail');
create trigger offers_revisar_linguagem
  before insert or update on public.offers
  for each row execute function private.revisar_linguagem('commercial_conditions');
create trigger offers_revisar_dado_pessoal
  before insert or update on public.offers
  for each row execute function private.revisar_dado_pessoal('commercial_conditions');
create trigger offer_documents_revisar_linguagem
  before insert on public.offer_documents
  for each row execute function private.revisar_linguagem('description');
create trigger offer_documents_revisar_dado_pessoal
  before insert on public.offer_documents
  for each row execute function private.revisar_dado_pessoal('description');

revoke all on function
  private.dado_pessoal_no_texto(text),
  private.revisar_dado_pessoal()
  from public, anon, authenticated, service_role;
