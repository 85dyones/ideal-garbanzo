# Orquestração de modelos pelo Claude Code CLI

## Objetivo

O Claude Code CLI é o orquestrador do trabalho técnico. Deve escolher o nível de modelo adequado por subtarefa, delegar trabalho delimitado quando compensar e validar todas as entregas. A pessoa responsável define o produto e os limites; não precisa escolher manualmente um modelo para cada microtarefa.

## Duas camadas diferentes

1. **Orquestração de tarefas no Claude Code:** decide quem deve executar uma subtarefa, com qual modelo, ferramentas, escopo e critérios de aceite. Use subagentes configurados em `.claude/agents/` e, para qualquer subagente que edite, prefira `isolation: worktree`.
2. **Roteamento de inferência no FreeLLMAPI:** escolhe um endpoint/provedor para uma chamada e pode fazer fallback conforme a cadeia configurada, a saúde e as cotas. Isso não substitui a decisão do Claude Code sobre a dificuldade da tarefa.

Um fallback de disponibilidade não deve virar rebaixamento silencioso de qualidade. Por exemplo, uma tarefa de autenticação não deve continuar automaticamente num modelo significativamente menos capaz só porque o modelo anterior atingiu o limite.

## Níveis de execução

| Nível | Perfil lógico | Exemplos de tarefas | Permissões padrão | Condição |
|---|---|---|---|---|
| T0 | `fast-helper` | Localizar arquivos, resumir documentação, mapear componentes, rascunhar casos de teste, classificar logs sem segredos | Somente leitura; sem decisão de arquitetura | Saída curta e delimitada, revisada pelo orquestrador |
| T1 | `builder` | Implementar uma tarefa pequena com critérios claros, adicionar testes a um módulo, ajustar um componente isolado, atualizar documentação técnica | Escrita apenas em worktree isolado; sem deploy, push ou migração destrutiva | Modelo já validado para tool calling, edição e execução de testes |
| T2 | `orchestrator` | Planejamento, integração entre módulos, depuração difícil, decisões técnicas dentro do escopo aprovado, integração de worktrees | Ferramentas do projeto conforme permissões, com gates de risco | Modelo confiável para uso agêntico e contexto suficiente |
| T3 | `reasoning-review` | Revisão independente de arquitetura, regressões difíceis, segurança, multi-tenancy, autenticação, migrações e análise final crítica | Somente leitura por padrão | Modelo forte, de preferência independente do que produziu a alteração |
| TV | `vision-review` | Comparar screenshots com brief visual, detectar inconsistência de layout e avaliar estados visuais | Somente leitura | Endpoint/modelo realmente aceita imagens; código/HTML sozinho não comprova fidelidade visual |

Os nomes são perfis lógicos, não IDs de modelo garantidos. Associe-os a IDs existentes e testados no catálogo FreeLLMAPI. Se a instalação aceitar `auto:<profile>` como `model` no Claude Code, os exemplos deste kit usam essa convenção; valide-a antes. Se não aceitar, use IDs exatos apresentados pelo catálogo e suportados pelo servidor.

## Algoritmo de despacho obrigatório

No começo de cada tarefa, o orquestrador deve:

1. Ler `CLAUDE.md`, `docs/workflow/current-task.md`, brief relevante e estado do Git.
2. Classificar a tarefa por risco, reversibilidade, ambiguidade, abrangência de arquivos e necessidade de ferramentas. Não classificar apenas por número de linhas de código.
3. Dividir o objetivo em subtarefas independentes, cada uma com escopo, arquivos permitidos, resultado esperado, critério de aceite e verificação.
4. Delegar tarefas de leitura/reconhecimento ao T0 quando isso economizar contexto ou tempo. Delegar tarefas de implementação ao T1 somente quando o escopo for independente, testável e reversível; o subagente deve trabalhar em worktree isolado.
5. Manter no modelo principal as decisões de arquitetura, a integração de alterações, o diagnóstico de falhas difíceis e a responsabilidade pelo aceite.
6. Usar T3 para revisar mudanças de risco alto ou quando a correção não é óbvia. A revisão deve examinar o diff e as evidências reais, não apenas o resumo do implementador.
7. Validar no modelo principal todos os resultados delegados: inspecionar diff, rodar testes relevantes, confirmar critérios de aceite, integrar ou rejeitar o worktree e atualizar os handoffs.
8. Registrar o modelo/perfil usado e qualquer fallback que seja informado de maneira confiável pelo gateway. Nunca inventar o modelo efetivo.

## Quando NÃO delegar a um modelo limitado

Não delegue autoridade final, nem permita fallback heterogêneo silencioso, para:

- decisões de produto ou interpretação ambígua de requisitos;
- arquitetura que afete vários módulos ou contratos públicos;
- autenticação, autorização, isolamento multi-tenant e tratamento de dados pessoais;
- pagamentos, segredos, criptografia, migrações destrutivas ou operações de produção;
- investigação que já falhou duas vezes sem nova hipótese;
- integração final e declaração de que o trabalho está pronto.

Modelos menores podem fazer reconhecimento e propor verificações nessas áreas, mas um modelo forte e o fluxo de aprovação do projeto devem revisar a conclusão.

## Política de escalonamento

Escalone de T0/T1 para T2/T3 quando ocorrer qualquer um destes sinais:

- ferramentas não chamadas ou chamadas em formato inválido;
- patch que não aplica, mudanças desconexas ou alterações fora do escopo;
- incapacidade de seguir a sequência de teste/correção;
- contradições sobre requisitos ou perda de contexto;
- duas tentativas de correção sem avanço demonstrável;
- risco real maior do que o previsto inicialmente.

Ao escalar, não recomece às cegas. Gere um handoff de no máximo uma página com objetivo, critérios de aceite, estado de `git diff`, arquivos alterados, comandos e resultados dos testes, erro observado e próxima hipótese. Preserve as alterações existentes.

## Regras de paralelismo

- O paralelismo é permitido somente para subtarefas realmente independentes.
- O máximo inicial recomendado é de dois subagentes simultâneos; aumente somente após comprovar que a integração compensa o overhead.
- Agentes que editam usam `isolation: worktree`; nunca dois agentes alteram o mesmo working tree.
- Um subagente entrega resumo, arquivos/diff, testes executados, limitações e riscos. O agente principal decide se integra.
- Não delegue tarefas minúsculas quando explicar o contexto, monitorar o agente e integrar o resultado custar mais do que fazer diretamente.

## Configuração de perfis no FreeLLMAPI

Crie cadeias nomeadas no painel somente depois de consultar o catálogo e os limites atuais. Use esta intenção como referência:

- `fast-helper`: modelos rápidos para leitura, resumos e tarefas textuais curtas; não precisa receber autorização para editar o repositório.
- `builder`: modelos com uso de ferramentas, JSON/tool calls, streaming e edição de código validados. Mantenha a cadeia estreita: os fallbacks precisam ter capacidade equivalente para a tarefa.
- `orchestrator`: o conjunto mais confiável para planejar, dirigir subagentes, compreender ferramentas e integrar código. Evite uma cadeia que faça downgrade grande sem aviso.
- `reasoning-review`: modelos fortes para análise independente. Pode ser uma cadeia diferente da implementação, não uma cópia da mesma seleção.
- `vision-review`: somente modelos e endpoints com entrada de imagem confirmada.

No FreeLLMAPI, o mecanismo de fallback e o `auto:<profile>` são recursos do gateway; seus nomes e disponibilidade devem ser confirmados na versão instalada. O perfil de orquestração do CLI e as cadeias do gateway são duas configurações distintas.

## Checklist de validação antes de confiar na automação

- [ ] Confirmado o projeto FreeLLM real, versão instalada e endpoint local.
- [ ] Obtidos IDs exatos por meio do catálogo disponível; nenhum ID foi inventado.
- [ ] Confirmado que os perfis definidos podem ser chamados pelo Claude Code ou pelos subagentes.
- [ ] T0 consegue ler arquivos relevantes e devolver achados concretos sem escrever.
- [ ] T1 consegue editar dois ou mais arquivos em worktree isolado, usar ferramentas, rodar teste e corrigir uma falha.
- [ ] T2 consegue dirigir a tarefa e integrar/rejeitar o worktree corretamente.
- [ ] T3 revisa o diff independentemente e encontra defeitos inseridos de propósito no teste.
- [ ] Testados rate limit, timeout, fallback, continuidade e identificação do modelo efetivo.
- [ ] Confirmado que segredos e dados sensíveis não aparecem em logs nem são enviados a provedores sem autorização.
- [ ] Existem gates de segurança para mudanças de alto impacto, independentemente do modelo.

## Registro por tarefa

No `current-task.md`, registre:

- perfil/modelo principal selecionado;
- subagentes e perfis utilizados;
- se houve fallback e quais evidências foram expostas;
- resultados de testes e critérios ainda pendentes;
- motivo de qualquer escalonamento.

A meta não é usar o modelo mais caro em tudo nem fazer tudo com o mais barato. É usar o modelo mais limitado que consiga concluir uma tarefa delimitada de modo confiável, com o modelo principal responsável por dirigir, verificar e escalar.
