-- I3.9: ressalvas da revisão independente do Inc. 3 (I3.7; ADR-0004 §8).
--
-- * R-I3.7-02: details deixa de ser gravável pela API, porque no piloto a
--   lista positiva de chaves é vazia (ADR-0004 §2.10). A trava de chaves fica
--   como segunda camada e passa a pegar chave composta sem separador, plural,
--   sufixo numérico e os nomes em inglês.
-- * R-I3.7-03: a busca de linguagem do banco repete a normalização do
--   servidor: decomposição (NFD) e remoção das marcas combinantes, antes das
--   minúsculas; fronteira de palavra por letra ou dígito, como o varredor, e
--   espaço também o não separável.
-- * R-I3.7-04: lista de linguagem ausente ou inválida falha fechada.
-- * R-I3.7-05: categoria com consulta ou revisão continua na ficha depois de
--   sair da configuração.
-- * R-I3.7-06: a abertura da revisão trava a oferta antes de ler o pareamento.
-- * R-I3.7-08: as sequências de seq não têm privilégio para os papéis da API.
-- * R-I3.7-11: o veículo da consulta fica preso ao veículo da oferta também
--   por chave composta.
--
-- As funções trocadas repetem a definição vigente, com só as mudanças acima.

create or replace function private.proteger_revisao_documental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  oferta public.offers;
  aberta boolean;
begin
  if ator is null then
    raise exception 'revisão documental exige sessão de usuário' using errcode = '42501';
  end if;
  select * into oferta from public.offers o where o.id = new.offer_id;
  if not found or not private.equipe_sem_vinculo(oferta.supplier_organization_id) then
    raise exception 'só o operador ou o administrador sem vínculo com a empresa dona revisa' using errcode = '42501';
  end if;
  if private.situacao_da_oferta(oferta) not in ('draft', 'under_review', 'published', 'reserved', 'suspended') then
    raise exception 'a oferta em % não recebe revisão documental', private.situacao_da_oferta(oferta)
      using errcode = 'P0001';
  end if;
  if not coalesce(private.configuracao('document_categories'), '[]') ? new.category
     and not exists (
       select 1 from public.supplier_declarations d where d.offer_id = new.offer_id and d.category = new.category) then
    raise exception 'categoria documental fora da configuração: %', new.category using errcode = 'P0001';
  end if;
  -- Duas aberturas ao mesmo tempo esperam uma pela outra (R-I3.7-06).
  perform 1 from public.offers o where o.id = new.offer_id for update;
  aberta := private.revisao_aberta(new.offer_id, new.category);
  if new.action = 'open_review' and aberta then
    raise exception 'a categoria já tem revisão aberta' using errcode = 'P0001';
  end if;
  if new.action = 'close_review' and not aberta then
    raise exception 'a categoria não tem revisão aberta' using errcode = 'P0001';
  end if;
  new.reason := private.motivo_obrigatorio();
  new.actor := ator;
  new.created_at := now();
  return new;
end;
$$;

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
    -- Consulta ou revisão em categoria que saiu da configuração continua na
    -- ficha e no snapshot (R-I3.7-05; ADR-0003 §2.6).
    union
    select vc.category from public.vehicle_checks vc where vc.offer_id = p_oferta
    union
    select dr.category from public.documental_reviews dr where dr.offer_id = p_oferta
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

-- R-I3.7-02: details só com o valor padrão pela API -------------------------------------

revoke insert (details) on public.vehicle_checks from authenticated;

-- Chave de dado pessoal: além das palavras e das compostas conhecidas, pega a
-- palavra no plural ou com sufixo numérico, os nomes em inglês e o
-- identificador forte colado a outra palavra (por exemplo, cpfproprietario).
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
                          'chassis', 'cep')
         or w.base in (
           'proprietario', 'proprietaria', 'dono', 'dona', 'pronome', 'cpf', 'cnpj', 'rg', 'cnh', 'documento',
           'nome', 'razao', 'financiado', 'financiada', 'arrendatario', 'arrendataria', 'faturado', 'faturada',
           'email', 'mail', 'celular', 'cellphone', 'telefone', 'fone', 'phone', 'endereco', 'logradouro',
           'cep', 'nascimento', 'placa', 'renavam', 'chassi', 'owner', 'name', 'address', 'document', 'plate',
           'driver', 'holder'))
    or exists (
      select 1 from normalizada n
      where regexp_replace(n.texto, '[^a-z0-9]+', '', 'g') ~
            '(cpf|cnpj|renavam|chassi|placa|email|proprietari|financiad|arrendatari|celular|telefone|owner)')
    or exists (
      select 1 from normalizada n
      where regexp_replace(n.texto, '[^a-z0-9]+', '', 'g') in (
        'cpfcnpj', 'pronomeanterior', 'documentofinanciado', 'nomerazao',
        'codigosegurancacrv', 'restricaodocarrendatario', 'numeroidentificacaodofaturado'));
$$;

-- R-I3.7-03: a mesma normalização do varredor do servidor ---------------------------------

-- Minúsculas e sem acentos: decomposição (NFD), remoção das marcas
-- combinantes e só então as minúsculas, para não depender do LC_CTYPE com
-- letra acentuada maiúscula.
create or replace function private.texto_normalizado(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(
           normalize(coalesce(valor, ''), nfd),
           '[' || chr(768) || '-' || chr(879) || chr(6832) || '-' || chr(6911) || chr(7616) || '-' || chr(7679)
             || chr(8400) || '-' || chr(8447) || chr(65056) || '-' || chr(65071) || ']',
           '', 'g'));
$$;

-- Palavras do termo separadas por qualquer espaço (inclusive o não separável),
-- sem letra ou dígito colado antes nem depois, como o varredor do servidor.
create or replace function private.expressao_de_palavra_inteira(termo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '(^|[^[:alnum:]])'
    || array_to_string(
         array(select private.literal_de_expressao(p)
               from regexp_split_to_table(btrim(termo), '\s+') as p),
         '[[:space:]' || chr(160) || ']+')
    || '($|[^[:alnum:]])';
$$;

-- R-I3.7-04: lista ausente ou fora do formato falha fechada.
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
  if valor is null then
    return null;
  end if;
  if lista is null
     or jsonb_typeof(lista) <> 'object'
     or jsonb_typeof(lista -> 'termos') is distinct from 'array'
     or jsonb_array_length(lista -> 'termos') = 0
     or coalesce(lista ->> 'qualificacao', '') = ''
     or coalesce(lista ->> 'marcadorDeExcecao', '') = '' then
    raise exception 'a lista de linguagem proibida (forbidden_terms) está ausente ou fora do formato'
      using errcode = 'P0001';
  end if;
  qualificacao := private.expressao_de_palavra_inteira(private.texto_normalizado(lista ->> 'qualificacao'));
  marcador := private.literal_de_expressao(btrim(private.texto_normalizado(lista ->> 'marcadorDeExcecao')))
    || '[[:space:]]*[[:alnum:]]';
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

-- R-I3.7-08: as sequências de seq sem privilégio para a API ---------------------------------

revoke all on sequence public.vehicle_checks_seq_seq, public.documental_reviews_seq_seq
  from anon, authenticated, service_role;

-- R-I3.7-11: o veículo da consulta é o da oferta, também por chave ------------------------

alter table public.offers add constraint offers_vehicle_id_id_key unique (vehicle_id, id);
alter table public.vehicle_checks
  add constraint vehicle_checks_veiculo_da_oferta_fkey foreign key (vehicle_id, offer_id)
  references public.offers (vehicle_id, id) on delete restrict;
