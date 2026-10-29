"use client";
/**
 * Declarações do fornecedor por categoria (I2.8; especificação v1.1, §5.3;
 * ADR-0003 §2.12). Nenhuma resposta vem marcada: "Desconhece" também é
 * escolha explícita. Só as categorias marcadas são gravadas, todas numa
 * inclusão só e com uma versão só; a mais recente de cada categoria é a
 * vigente. A categoria sem declaração aparece destacada, porque bloqueia o
 * envio.
 */
import { useActionState, useId, useState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  ErrosDoCampo,
  MensagemDoFormulario,
} from "@/components/formulario";
import {
  ROTULO_DO_VALOR_DECLARADO,
  VALORES_DECLARADOS,
} from "@/modules/documental/rules/estados";

export interface CategoriaParaDeclarar {
  readonly categoria: string;
  readonly rotulo: string;
  /** Rótulo do estado documental (§6.4). */
  readonly estado: string;
  /** Rótulo da origem da informação (§6.5). */
  readonly origem: string;
  /** Declaração vigente já em texto de leitura; `null` sem declaração. */
  readonly vigente: {
    readonly resposta: string;
    readonly detalhe: string | null;
    readonly em: string;
  } | null;
}

function LinhaDaCategoria({
  item,
  valorInicial,
  detalheInicial,
  erros,
}: {
  readonly item: CategoriaParaDeclarar;
  readonly valorInicial: string | undefined;
  readonly detalheInicial: string | undefined;
  readonly erros: Readonly<Record<string, readonly string[]>>;
}) {
  const [escolha, setEscolha] = useState(valorInicial ?? "");
  const id = useId();
  const nomeDoValor = `valor-${item.categoria}`;
  const nomeDoDetalhe = `detalhe-${item.categoria}`;
  const semDeclaracao = item.vigente === null;
  return (
    <fieldset
      className={`flex flex-col gap-2 rounded border p-3 ${
        semDeclaracao ? "border-red-700 border-l-4" : "border-gray-200"
      }`}
      aria-describedby={`${id}-situacao`}
    >
      <legend className="px-1 font-semibold">{item.rotulo}</legend>
      <input type="hidden" name="categoria" value={item.categoria} />
      <div id={`${id}-situacao`} className="flex flex-col gap-1">
        {item.vigente === null ? (
          <p className="font-medium text-red-900">
            Falta declarar: o envio depende desta resposta.
          </p>
        ) : (
          <p>
            <span className="font-medium">
              Declaração vigente: {item.vigente.resposta}
            </span>
            <span className="text-sm text-gray-700">
              {" "}
              (em {item.vigente.em})
            </span>
          </p>
        )}
        {item.vigente?.detalhe === null ||
        item.vigente?.detalhe === undefined ? null : (
          <p className="break-words">Detalhe: {item.vigente.detalhe}</p>
        )}
        <p className="text-sm text-gray-700">
          <span className="block sm:inline">Estado: {item.estado}</span>
          <span className="hidden sm:inline"> · </span>
          <span className="block sm:inline">Origem: {item.origem}</span>
        </p>
        {item.vigente === null ? null : (
          <p className="text-sm text-gray-700">
            Marque uma resposta só se quiser mudar a declaração.
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-4">
        {VALORES_DECLARADOS.map((valor) => (
          <label key={valor} className="flex items-center gap-2 py-2">
            <input
              type="radio"
              name={nomeDoValor}
              value={valor}
              checked={escolha === valor}
              onChange={() => {
                setEscolha(valor);
              }}
            />
            {ROTULO_DO_VALOR_DECLARADO[valor]}
          </label>
        ))}
      </div>
      <ErrosDoCampo id={`${id}-erro`} erros={erros[nomeDoValor]} />
      {escolha === "" ? null : (
        <AreaDeTexto
          nome={nomeDoDetalhe}
          rotulo={
            escolha === "has_occurrence"
              ? "Detalhe da ocorrência"
              : "Observação (opcional)"
          }
          required={escolha === "has_occurrence"}
          maxLength={2000}
          dica={
            escolha === "has_occurrence"
              ? "Obrigatório: descreva a ocorrência."
              : undefined
          }
          defaultValue={detalheInicial}
          erros={erros[nomeDoDetalhe]}
        />
      )}
    </fieldset>
  );
}

export function FormularioDeDeclaracoes({
  ofertaId,
  categorias,
  acao,
}: {
  readonly ofertaId: string;
  readonly categorias: readonly CategoriaParaDeclarar[];
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const valores = estado.valores ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="ofertaId" value={ofertaId} />
      {categorias.map((item) => (
        // A cada resposta do servidor, as linhas recomeçam: vazias depois de
        // gravar, com o que foi marcado se houve erro.
        <LinhaDaCategoria
          key={`${item.categoria}-${String(estado.envios)}`}
          item={item}
          valorInicial={valores[`valor-${item.categoria}`]}
          detalheInicial={valores[`detalhe-${item.categoria}`]}
          erros={estado.campos}
        />
      ))}
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio>Gravar declarações</BotaoDeEnvio>
      </div>
    </form>
  );
}
