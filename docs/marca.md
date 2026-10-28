# Marca: EntrePátios

**Definida pela pessoa responsável em 28/10/2026.** Não há brief visual (especificação §9). Este documento cobre só o nome e os textos.

## Elementos

| Elemento | Texto |
|---|---|
| Nome | **EntrePátios** |
| Assinatura | O repasse que conecta pátios |
| Frase de apoio | Do estoque de um lojista à oportunidade de outro. |
| Descrição | Rede privada de oportunidades automotivas entre lojistas. |

## A ideia

A plataforma conecta pátios, isto é, os estoques de revendas diferentes. Um veículo que não faz sentido para uma loja pode ser exatamente o que outra procura.

O nome explica a intermediação sem sugerir que a plataforma compra, guarda ou financia os veículos.

## Regras de uso

- **Grafia:** sempre **EntrePátios**, com E e P maiúsculos, acento e tudo junto. Não use "Entre Pátios", "Entrepátios" nem "ENTREPATIOS".
- **Onde o acento não cabe:** em domínio, e-mail, slug ou identificador técnico, use `entrepatios`, em minúsculas e sem acento.
- **Identificadores técnicos não mudam:** pacote `repasse`, repositório `ideal-garbanzo`, projetos no Supabase e na Vercel, rotas e variáveis.
- **O que a plataforma faz:** intermedia oportunidades entre lojistas. Nenhum texto diz ou sugere que ela compra, vende, custodia, financia ou garante veículos. Isso vale junto com a linguagem proibida da especificação (§6.6, `config/linguagem-proibida.json`).
- **Público:** lojistas e revendas, ou seja, compradores e fornecedores profissionais. Não é vitrine para consumidor final.

## Onde aparece

- Título e descrição do site (`src/app/layout.tsx`).
- Apresentação (`/`): nome, assinatura, frase de apoio e descrição.
- Cabeçalho das áreas logadas e telas de entrar e cadastrar.
- Remetente e modelos dos e-mails do Auth, quando a caixa própria existir (ADR-0002 §2.8; plano, I6.1).
