"use client";
/**
 * Fotos e documentos da oferta (I2.8; ADR-0003 §2.13): envio, remoção e ordem
 * das fotos, envio e abertura dos documentos. O servidor confere o tipo, o
 * tamanho, o conteúdo e quem pode agir no estado da oferta.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_DE_RISCO, BOTAO_SECUNDARIO, LINK } from "@/components/estilos";
import {
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import { TIPOS_DE_DOCUMENTO } from "../storage/arquivos";
import { ROTULO_DO_TIPO_DE_DOCUMENTO } from "./rotulos";

const TIPOS_DE_FOTO_ACEITOS = "image/jpeg,image/png,image/webp";
const TIPOS_DE_DOCUMENTO_ACEITOS =
  "application/pdf,image/jpeg,image/png,image/webp";

const OPCOES_DE_TIPO = [
  ["", "Selecione"],
  ...TIPOS_DE_DOCUMENTO.map(
    (tipo) => [tipo, ROTULO_DO_TIPO_DE_DOCUMENTO[tipo]] as const,
  ),
] as const;

export function EnvioDeFoto({
  ofertaId,
  ordem,
  acao,
}: {
  readonly ofertaId: string;
  /** Posição da nova foto: depois das que já existem. */
  readonly ordem: number;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-3"
      noValidate
      aria-label="Enviar foto"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <input type="hidden" name="ordem" value={String(ordem)} />
      <Campo
        nome="arquivo"
        rotulo="Foto do veículo"
        type="file"
        accept={TIPOS_DE_FOTO_ACEITOS}
        required
        dica="JPEG, PNG ou WebP, até 10 MB."
        erros={estado.campos.arquivo}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio>Enviar foto</BotaoDeEnvio>
      </div>
    </form>
  );
}

export function RemocaoDeFoto({
  fotoId,
  rotulo,
  acao,
}: {
  readonly fotoId: string;
  readonly rotulo: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="fotoId" value={fotoId} />
      <BotaoDeEnvio classe={BOTAO_DE_RISCO}>{rotulo}</BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

/** Nova ordem de algumas fotos, gravada uma a uma pelo servidor. */
export function OrdemDasFotos({
  mudancas,
  rotulo,
  acao,
}: {
  readonly mudancas: readonly { fotoId: string; ordem: number }[];
  readonly rotulo: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="ordem" value={JSON.stringify(mudancas)} />
      <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>{rotulo}</BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

export function EnvioDeDocumento({
  ofertaId,
  acao,
}: {
  readonly ofertaId: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-3"
      noValidate
      aria-label="Enviar documento"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDeSelecao
          nome="tipo"
          rotulo="Tipo do documento"
          opcoes={OPCOES_DE_TIPO}
          defaultValue={estado.valores?.tipo ?? ""}
          erros={estado.campos.tipo}
        />
        <Campo
          nome="arquivo"
          rotulo="Arquivo do documento"
          type="file"
          accept={TIPOS_DE_DOCUMENTO_ACEITOS}
          required
          dica="PDF, JPEG, PNG ou WebP, até 10 MB."
          erros={estado.campos.arquivo}
        />
      </div>
      <Campo
        nome="descricao"
        rotulo="Descrição do documento (opcional)"
        maxLength={300}
        defaultValue={estado.valores?.descricao}
        erros={estado.campos.descricao}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio>Enviar documento</BotaoDeEnvio>
      </div>
    </form>
  );
}

/** Gera a URL temporária do documento; o servidor registra o acesso antes. */
export function AberturaDeDocumento({
  documentoId,
  rotulo,
  acao,
}: {
  readonly documentoId: string;
  readonly rotulo: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="documentoId" value={documentoId} />
      <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>{rotulo}</BotaoDeEnvio>
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
