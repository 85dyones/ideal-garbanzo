-- I3.9: decisões da pessoa responsável sobre as ressalvas R-I3.7-07 e
-- R-I3.7-13 (30/10; ADR-0004 §8).
--
-- * R-I3.7-07: o detalhe da declaração do fornecedor passa pela lista de
--   linguagem proibida, como o resumo e as limitações da consulta. O
--   comprador o vê, e o aviso do impedimento o copia.
-- * R-I3.7-13: a trava de chaves de dado pessoal deixa de listar nomes de
--   campo de um provedor de consulta. Fica só com identificadores genéricos
--   (palavras e trechos), que continuam recusando as mesmas chaves.

create trigger supplier_declarations_revisar_linguagem
  before insert on public.supplier_declarations
  for each row execute function private.revisar_linguagem('detail');

-- Chave de dado pessoal, só com identificadores genéricos: a palavra (sem
-- plural nem sufixo numérico) ou o trecho colado a outra palavra.
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
           'driver', 'holder'))
    or exists (
      select 1 from normalizada n
      where regexp_replace(n.texto, '[^a-z0-9]+', '', 'g') ~
            '(cpf|cnpj|renavam|chassi|placa|email|nome|razao|proprietari|financiad|arrendatari|faturad|celular|telefone|seguranca|owner)');
$$;
