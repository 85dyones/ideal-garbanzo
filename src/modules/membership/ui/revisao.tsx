"use client";
/**
 * Revisão do pedido de adesão (ADR-0002 §2.5): mover para análise (equipe),
 * conferência em lista livre, evidência, link temporário da evidência e
 * decisão (só administrador). A tela esconde do operador o que é do
 * administrador; a operação de servidor recusa de qualquer jeito.
 */
import { useActionState, useId, useState } from "react";
import { localParaIso, paraCampoLocal } from "@/app/_apoio/datas";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_SECUNDARIO, CAMPO, LINK } from "@/components/estilos";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  ErrosDoCampo,
  MensagemDoFormulario,
} from "@/components/formulario";
import type { ItemDaConferencia } from "../queries/pedidos";

export function MoverParaAnalise({
  pedidoId,
  acao,
}: {
  readonly pedidoId: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <BotaoDeEnvio>Mover para análise</BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

interface Linha {
  readonly chave: number;
  readonly item: string;
  readonly resultado: string;
  readonly observacao: string;
}

function linhaVazia(chave: number): Linha {
  return { chave, item: "", resultado: "", observacao: "" };
}

function emBranco(linha: Linha): boolean {
  return (
    linha.item.trim() === "" &&
    linha.resultado.trim() === "" &&
    linha.observacao.trim() === ""
  );
}

export function FormularioDeConferencia({
  pedidoId,
  itensIniciais,
  acao,
}: {
  readonly pedidoId: string;
  readonly itensIniciais: readonly ItemDaConferencia[];
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const prefixo = useId();
  const [linhas, setLinhas] = useState<readonly Linha[]>(() =>
    itensIniciais.length === 0
      ? [linhaVazia(0)]
      : itensIniciais.map((item, indice) => ({
          chave: indice,
          item: item.item,
          resultado: item.resultado,
          observacao: item.observacao ?? "",
        })),
  );
  const itens = linhas
    .filter((linha) => !emBranco(linha))
    .map((linha) =>
      linha.observacao.trim() === ""
        ? { item: linha.item, resultado: linha.resultado }
        : {
            item: linha.item,
            resultado: linha.resultado,
            observacao: linha.observacao,
          },
    );
  const alterar = (
    chave: number,
    campo: keyof Omit<Linha, "chave">,
    valor: string,
  ) => {
    setLinhas((atuais) =>
      atuais.map((linha) =>
        linha.chave === chave ? { ...linha, [campo]: valor } : linha,
      ),
    );
  };

  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />
      <p className="text-sm text-gray-700">
        Lista livre: registre cada item conferido, o resultado e, se quiser, uma
        observação. Nenhum item é obrigatório.
      </p>
      <ol className="flex flex-col gap-4">
        {linhas.map((linha, posicao) => {
          const id = `${prefixo}-${String(linha.chave)}`;
          return (
            <li
              key={linha.chave}
              className="flex flex-col gap-2 rounded border border-gray-200 p-3"
            >
              <p className="text-sm font-medium">Item {posicao + 1}</p>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-item`} className="text-sm">
                  Item conferido
                </label>
                <input
                  id={`${id}-item`}
                  className={CAMPO}
                  maxLength={200}
                  value={linha.item}
                  onChange={(evento) => {
                    alterar(linha.chave, "item", evento.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-resultado`} className="text-sm">
                  Resultado
                </label>
                <input
                  id={`${id}-resultado`}
                  className={CAMPO}
                  maxLength={200}
                  value={linha.resultado}
                  onChange={(evento) => {
                    alterar(linha.chave, "resultado", evento.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-observacao`} className="text-sm">
                  Observação (opcional)
                </label>
                <textarea
                  id={`${id}-observacao`}
                  className={CAMPO}
                  rows={2}
                  maxLength={2000}
                  value={linha.observacao}
                  onChange={(evento) => {
                    alterar(linha.chave, "observacao", evento.target.value);
                  }}
                />
              </div>
              {linhas.length > 1 ? (
                <button
                  type="button"
                  className={`self-start ${BOTAO_SECUNDARIO}`}
                  onClick={() => {
                    setLinhas((atuais) =>
                      atuais.filter((outra) => outra.chave !== linha.chave),
                    );
                  }}
                >
                  Retirar item {posicao + 1}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className={`self-start ${BOTAO_SECUNDARIO}`}
        onClick={() => {
          setLinhas((atuais) => [
            ...atuais,
            linhaVazia(Math.max(-1, ...atuais.map((l) => l.chave)) + 1),
          ]);
        }}
      >
        Adicionar item
      </button>
      <ErrosDoCampo id={`${prefixo}-erros`} erros={estado.campos.itens} />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Gravar conferência</BotaoDeEnvio>
    </form>
  );
}

const TIPOS_ACEITOS = "application/pdf,image/png,image/jpeg,image/webp";

export function FormularioDeEvidencia({
  pedidoId,
  acao,
}: {
  readonly pedidoId: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <Campo
        nome="arquivo"
        rotulo="Arquivo da evidência"
        type="file"
        accept={TIPOS_ACEITOS}
        required
        dica="PDF, PNG, JPEG ou WebP, até 10 MB."
        erros={estado.campos.arquivo}
      />
      <Campo
        nome="descricao"
        rotulo="Descrição (opcional)"
        maxLength={500}
        defaultValue={estado.valores?.descricao}
        erros={estado.campos.descricao}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Enviar evidência</BotaoDeEnvio>
    </form>
  );
}

export function VerEvidencia({
  evidenciaId,
  acao,
}: {
  readonly evidenciaId: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="evidenciaId" value={evidenciaId} />
      <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>Ver</BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
      {estado.situacao === "sucesso" && estado.url !== undefined ? (
        <a
          href={estado.url}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          Abrir o arquivo
        </a>
      ) : null}
    </form>
  );
}

export function FormularioDeDecisao({
  pedidoId,
  evidencias,
  acao,
}: {
  readonly pedidoId: string;
  readonly evidencias: readonly (readonly [string, string])[];
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const [decisao, setDecisao] = useState(estado.valores?.decisao ?? "aprovar");
  const [dataLocal, setDataLocal] = useState("");
  const idDaData = useId();
  const idDoTeste = useId();
  const errosDaData = estado.campos.cnpjConferidoEm;

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Decisão</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="decisao"
            value="aprovar"
            checked={decisao === "aprovar"}
            onChange={() => {
              setDecisao("aprovar");
            }}
          />
          Aceitar o pedido
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="decisao"
            value="rejeitar"
            checked={decisao === "rejeitar"}
            onChange={() => {
              setDecisao("rejeitar");
            }}
          />
          Recusar o pedido
        </label>
        <ErrosDoCampo
          id={`${idDaData}-decisao`}
          erros={estado.campos.decisao}
        />
      </fieldset>

      {decisao === "aprovar" ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={idDaData} className="text-sm font-medium">
              Data e hora da conferência do CNPJ
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={idDaData}
                type="datetime-local"
                className={`${CAMPO} sm:w-auto`}
                value={dataLocal}
                aria-invalid={(errosDaData?.length ?? 0) > 0 ? true : undefined}
                aria-describedby={`${idDaData}-erro`}
                onChange={(evento) => {
                  setDataLocal(evento.target.value);
                }}
              />
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                onClick={() => {
                  setDataLocal(paraCampoLocal(new Date()));
                }}
              >
                Agora
              </button>
            </div>
            <input
              type="hidden"
              name="cnpjConferidoEm"
              value={localParaIso(dataLocal) ?? ""}
            />
            <ErrosDoCampo id={`${idDaData}-erro`} erros={errosDaData} />
          </div>
          <Campo
            nome="fonteDaConferencia"
            rotulo="Fonte da conferência"
            required
            maxLength={500}
            dica="Onde o CNPJ foi conferido."
            defaultValue={estado.valores?.fonteDaConferencia}
            erros={estado.campos.fonteDaConferencia}
          />
          {evidencias.length === 0 ? (
            <p className="text-sm text-amber-900">
              Envie uma evidência antes de aceitar o pedido.
            </p>
          ) : (
            <CampoDeSelecao
              nome="evidenciaId"
              rotulo="Evidência da conferência"
              opcoes={evidencias}
              erros={estado.campos.evidenciaId}
            />
          )}
        </>
      ) : (
        <AreaDeTexto
          nome="motivo"
          rotulo="Motivo da recusa"
          required
          maxLength={2000}
          defaultValue={estado.valores?.motivo}
          erros={estado.campos.motivo}
        />
      )}

      <div className="flex items-center gap-2">
        <input id={idDoTeste} type="checkbox" name="dadosDeTeste" value="sim" />
        <label htmlFor={idDoTeste}>Marcar como dados de teste</label>
      </div>
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Registrar decisão</BotaoDeEnvio>
    </form>
  );
}
