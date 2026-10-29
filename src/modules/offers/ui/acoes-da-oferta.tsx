"use client";
/**
 * Ações sobre a oferta inteira (I2.8): enviar ou publicar com a autorização de
 * divulgação, cancelar o envio, reservar, liberar, retirar, reabrir, confirmar
 * a disponibilidade e alterar a validade. A tela mostra cada botão só para
 * quem pode; o servidor e o banco decidem de novo (ADR-0003 §2.3).
 */
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import {
  BOTAO_DE_RISCO,
  BOTAO_PRINCIPAL,
  BOTAO_SECUNDARIO,
} from "@/components/estilos";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  Campo,
  ErrosDoCampo,
  MensagemDoFormulario,
} from "@/components/formulario";
import { TEXTO } from "./rotulos";

/** Botão de envio que também fica desabilitado quando falta dado obrigatório. */
function BotaoDaPublicacao({
  bloqueado,
  rotulo,
}: {
  readonly bloqueado: boolean;
  readonly rotulo: string;
}) {
  const { pending } = useFormStatus();
  const desabilitado = bloqueado || pending;
  return (
    <button
      type="submit"
      disabled={desabilitado}
      aria-disabled={desabilitado}
      className={BOTAO_PRINCIPAL}
    >
      {rotulo}
    </button>
  );
}

/**
 * Envio à revisão ou publicação (D10). A autorização de divulgação é marcada
 * a cada envio e não vem marcada. Pendência documental não bloqueia; falta de
 * dado obrigatório, sim (§6.2).
 */
export function Publicacao({
  ofertaId,
  rotuloDoBotao,
  bloqueada,
  acao,
}: {
  readonly ofertaId: string;
  readonly rotuloDoBotao: string;
  readonly bloqueada: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const id = useId();
  const erros = estado.campos.autorizacao;
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="autorizacao"
            value="sim"
            className="mt-1"
            aria-invalid={(erros?.length ?? 0) > 0 ? true : undefined}
            aria-describedby={`${id}-dica ${id}-erro`}
          />
          <span>{TEXTO.autorizacao}</span>
        </label>
        <p id={`${id}-dica`} className="text-sm text-neutral-600">
          {TEXTO.autorizacaoACadaEnvio}
        </p>
        <ErrosDoCampo id={`${id}-erro`} erros={erros} />
      </div>
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDaPublicacao bloqueado={bloqueada} rotulo={rotuloDoBotao} />
      </div>
    </form>
  );
}

/** Ação de um botão só, sem campos além da oferta. */
export function AcaoDaOferta({
  ofertaId,
  rotulo,
  risco = false,
  principal = false,
  acao,
}: {
  readonly ofertaId: string;
  readonly rotulo: string;
  readonly risco?: boolean;
  readonly principal?: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const classe = risco
    ? BOTAO_DE_RISCO
    : principal
      ? BOTAO_PRINCIPAL
      : BOTAO_SECUNDARIO;
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <div>
        <BotaoDeEnvio classe={classe}>{rotulo}</BotaoDeEnvio>
      </div>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

/** Retirada pelo administrador da empresa, com motivo opcional. */
export function Retirada({
  ofertaId,
  rascunho,
  acao,
}: {
  readonly ofertaId: string;
  readonly rascunho: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
      noValidate
      aria-label="Retirar a oferta"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      {rascunho ? (
        <p className="text-sm text-neutral-700">{TEXTO.retirarRascunho}</p>
      ) : null}
      <AreaDeTexto
        nome="motivo"
        rotulo="Motivo da retirada (opcional)"
        maxLength={1000}
        rows={2}
        defaultValue={estado.valores?.motivo}
        erros={estado.campos.motivo}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio classe={BOTAO_DE_RISCO}>Retirar a oferta</BotaoDeEnvio>
      </div>
    </form>
  );
}

/** Nova validade da oferta publicada ou reservada, sem mudar a situação. */
export function AlteracaoDaValidade({
  ofertaId,
  validaAte,
  minimo,
  maximo,
  dica,
  acao,
}: {
  readonly ofertaId: string;
  readonly validaAte: string;
  readonly minimo: string;
  readonly maximo: string | null;
  readonly dica: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
      noValidate
      aria-label="Alterar a validade"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <Campo
        nome="validaAte"
        rotulo="Nova validade"
        type="date"
        min={minimo}
        max={maximo ?? undefined}
        dica={dica}
        defaultValue={estado.valores?.validaAte ?? validaAte}
        erros={estado.campos.validaAte}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>
          Alterar a validade
        </BotaoDeEnvio>
      </div>
    </form>
  );
}
