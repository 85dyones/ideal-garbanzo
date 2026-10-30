-- I3.5: linguagem proibida no texto livre gravado na hora (ADR-0004 §2.12,
-- E28; especificação v1.1, §6.6).
--
-- * A lista vive em config/linguagem-proibida.json, que o servidor usa. O banco
--   guarda uma cópia na chave forbidden_terms de platform_settings, e um teste
--   de integração confere que as duas são iguais.
-- * A busca segue o varredor do servidor: sem maiúsculas nem acentos, por
--   palavra inteira; a linha com a qualificação ("nas fontes consultadas") ou
--   com o marcador de exceção seguido de texto não conta.
-- * Os gatilhos levam o nome "revisar_linguagem" para rodar depois dos
--   gatilhos de proteção ("proteger"), que preenchem o motivo a partir do
--   cabeçalho. A ordem dos gatilhos BEFORE é a alfabética.

insert into public.platform_settings (key, value, description, is_critical) values
  ('forbidden_terms', '{"qualificacao": "nas fontes consultadas", "marcadorDeExcecao": "linguagem-permitida:", "termos": [{"termo": "verificado", "variantes": ["verificado", "verificada", "verificados", "verificadas"]}, {"termo": "aprovado", "variantes": ["aprovado", "aprovada", "aprovados", "aprovadas"]}, {"termo": "certificado", "variantes": ["certificado", "certificada", "certificados", "certificadas"]}, {"termo": "garantido", "variantes": ["garantido", "garantida", "garantidos", "garantidas"]}, {"termo": "procedência garantida", "variantes": ["procedência garantida", "procedências garantidas"]}, {"termo": "livre de problemas", "variantes": ["livre de problemas", "livres de problemas", "livre de problema", "livres de problema"]}, {"termo": "nada consta", "variantes": ["nada consta", "nada-consta"]}, {"termo": "sem ocorrências", "variantes": ["sem ocorrências"]}]}',
   'Cópia de config/linguagem-proibida.json para conferir o texto livre no banco (§6.6; ADR-0004 §2.12). Um teste confere a igualdade.', false);


-- Texto sem maiúsculas nem acentos, como normalizar() do servidor.
create function private.texto_normalizado(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(valor, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüçñ',
                   'aaaaaeeeeiiiiooooouuuucn');
$$;

-- Termo como expressão literal: escapa os caracteres especiais da expressão.
create function private.literal_de_expressao(valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(valor, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g');
$$;

-- Expressão de palavra inteira para um termo já normalizado: as palavras são
-- separadas por espaços quaisquer.
create function private.expressao_de_palavra_inteira(termo text)
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

-- Primeiro termo proibido do texto, fora das linhas com a qualificação ou com
-- o marcador de exceção seguido de texto; nulo se não houver.
create function private.termo_proibido(valor text)
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

-- Confere as colunas passadas como argumento do gatilho.
create function private.revisar_linguagem()
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
    termo := private.termo_proibido(registro ->> campo);
    if termo is not null then
      raise exception 'o texto usa "%" sem a qualificação exigida pela §6.6', termo
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

create trigger vehicle_checks_revisar_linguagem
  before insert on public.vehicle_checks
  for each row execute function private.revisar_linguagem('source_name', 'result_summary', 'known_limitations', 'protocol');
create trigger documental_reviews_revisar_linguagem
  before insert on public.documental_reviews
  for each row execute function private.revisar_linguagem('reason');
create trigger transfer_impediments_revisar_linguagem
  before update on public.transfer_impediments
  for each row execute function private.revisar_linguagem('resolution_reason');

revoke all on function
  private.texto_normalizado(text),
  private.literal_de_expressao(text),
  private.expressao_de_palavra_inteira(text),
  private.termo_proibido(text),
  private.revisar_linguagem()
  from public, anon, authenticated, service_role;

-- Base do impedimento automático com o rótulo da categoria, e não o código
-- técnico (I3.6): o texto vai para a tela e para o snapshot.
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
            'Declaração do fornecedor em Condições de transferência: ' || left(registro ->> 'detail', 900),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  elsif tg_table_name = 'vehicle_checks' and registro ->> 'result' = 'has_occurrence' then
    insert into public.transfer_impediments (offer_id, basis, source_check_id)
    values ((registro ->> 'offer_id')::uuid,
            'Consulta em Condições de transferência (' || (registro ->> 'source_name') || '): '
              || left(registro ->> 'result_summary', 700),
            (registro ->> 'id')::uuid)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
