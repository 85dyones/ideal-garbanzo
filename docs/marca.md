# Marca: EntrePátios

**Nome e textos definidos pela pessoa responsável em 28/10/2026; identidade visual (kit v0.3, marinho e âmbar) aplicada ao site em 29/10/2026.** O kit é referência de marca, não um brief de telas (especificação §9).

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

## Identidade visual (kit v0.3)

**Cores** (valores em `src/app/globals.css`, iguais aos `tokens` do kit):

| Nome | Hex | Uso no site |
|---|---|---|
| Marinho | `#0B1F38` (marinho 900) | texto principal, cabeçalho, abas ativas, metade do símbolo |
| Âmbar | `#F59E0B` (âmbar 500) | botão de ação (texto marinho, 7,7:1), destaque sobre fundo marinho |
| Marinho 600 | `#44658F` | link (6,0:1 sobre branco) |
| Neutros | `#525252` (600), `#E5E5E5` (200), `#F5F5F5` (100) | texto secundário, bordas, fundo das páginas |
| Vermelho 700 | `#B91C1C` | risco e bloqueio |

- **Âmbar é acento:** nunca fundo grande e nunca texto sobre fundo claro (2,1:1). Para texto de destaque em fundo claro, âmbar 700 a 900 ou marinho.
- **Sem verde:** sucesso usa marinho.
- **Avisos:** informação em marinho 50 com borda marinho 600; alerta em âmbar 50 com borda âmbar 500; bloqueio em vermelho 50 com borda vermelho 700.
- **Modo escuro:** o kit traz tokens para tema escuro, mas o site ainda não tem tema escuro.

**Tipografia:** Geist (SIL OFL 1.1), pelo `next/font`, servida pelo próprio site. Títulos 700, subtítulos 600, texto 400.

**Logo e símbolo:**
- **Arquivos no site:** `public/marca/` (horizontal e empilhado, cor e negativo), pelo componente `src/components/logo.tsx`. O nome está em contornos no SVG.
- **Horizontal:** no mínimo 140 px de largura. Negativo no cabeçalho marinho e na faixa da apresentação; colorido nas telas públicas, sobre fundo claro.
- **Ícones:** `src/app/icon.svg` (símbolo compacto, que se adapta ao tema claro e escuro do navegador), `src/app/favicon.ico` e `src/app/apple-icon.png`.
- **Regras do kit:** não esticar, girar, espelhar, trocar as cores nem aplicar sombra; símbolo completo só a partir de 32 px; área de proteção de metade da altura da maiúscula do nome.

**Kit completo:** guia, paleta, painel, tokens e todas as exportações ficam na pasta `entrepatios-brand/`, hoje fora do Git. O site usa só as cópias acima.

**Pendências do próprio kit, antes de adotar publicamente:**
- **autoria:** a silhueta parte da proposta de outro designer, e a autoria e o uso precisam ser combinados com essa pessoa;
- **busca de anterioridade:** nome e símbolo no INPI;
- **impressão e Pantone:** prova com a gráfica;
- **testes:** em ícone de app real, em impressão e sobre fotografia.

## Onde aparece

- Título e descrição do site (`src/app/layout.tsx`).
- Apresentação (`/`): nome, assinatura, frase de apoio e descrição.
- Cabeçalho das áreas logadas (logo em negativo sobre marinho) e telas de entrar e cadastrar (logo colorido).
- Ícone da aba do navegador e do atalho no celular.
- Remetente e modelos dos e-mails do Auth, quando a caixa própria existir (ADR-0002 §2.8; plano, I6.1).
