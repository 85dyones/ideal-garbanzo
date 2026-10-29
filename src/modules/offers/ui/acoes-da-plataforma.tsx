"use client";
/**
 * Formulários das ações da plataforma sobre a oferta (I2.9): revisão
 * (publicar ou devolver), suspensão, reativação e retirada. A página mostra
 * cada formulário só quando a tabela de transições permite a quem vê; a
 * operação e o banco decidem de novo. Os formulários não usam a validação do
 * navegador: o erro volta do servidor, no campo.
 */
import { useActionState } from "react";
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
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import {
  OPCOES_DA_CATEGORIA_DA_SUSPENSAO,
  TEXTO_DA_PLATAFORMA,
} from "./plataforma";

const CAIXA = "flex flex-col gap-2 rounded border border-neutral-200 p-3";
/** Suspensão e retirada: a borda vermelha à esquerda marca a ação de risco. */
const CAIXA_DE_RISCO = `${CAIXA} border-l-4 border-l-red-700`;

/** Botão de publicar, desabilitado quando falta dado obrigatório. */
function BotaoDePublicar({ bloqueado }: { readonly bloqueado: boolean }) {
  const { pending } = useFormStatus();
  const desabilitado = bloqueado || pending;
  return (
    <button
      type="submit"
      disabled={desabilitado}
      aria-disabled={desabilitado}
      className={BOTAO_PRINCIPAL}
    >
      Publicar a oferta
    </button>
  );
}

/**
 * Revisão antes de publicar (D10): publicar, ou devolver com motivo. Com dado
 * obrigatório faltando, o botão de publicar fica desabilitado; pendência
 * documental não conta (X07).
 */
export function RevisaoPelaPlataforma({
  ofertaId,
  publicacaoBloqueada,
  acao,
}: {
  readonly ofertaId: string;
  readonly publicacaoBloqueada: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [publicacao, publicar] = useActionState(acao, ESTADO_INICIAL);
  const [devolucao, devolver] = useActionState(acao, ESTADO_INICIAL);
  return (
    <div className="flex flex-col gap-3">
      <form
        action={publicar}
        className={CAIXA}
        noValidate
        aria-label="Publicar a oferta"
      >
        <input type="hidden" name="ofertaId" value={ofertaId} />
        <input type="hidden" name="decisao" value="publicar" />
        {publicacaoBloqueada ? (
          <p className="text-sm text-amber-900">
            {TEXTO_DA_PLATAFORMA.publicacaoBloqueada}
          </p>
        ) : null}
        <MensagemDoFormulario estado={publicacao} />
        <div>
          <BotaoDePublicar bloqueado={publicacaoBloqueada} />
        </div>
      </form>
      <form
        action={devolver}
        className={CAIXA}
        noValidate
        aria-label="Devolver à empresa fornecedora"
      >
        <input type="hidden" name="ofertaId" value={ofertaId} />
        <input type="hidden" name="decisao" value="devolver" />
        <AreaDeTexto
          nome="motivo"
          rotulo="Motivo da devolução"
          required
          maxLength={1000}
          rows={3}
          dica={TEXTO_DA_PLATAFORMA.motivoDaDevolucao}
          defaultValue={devolucao.valores?.motivo}
          erros={devolucao.campos.motivo}
        />
        <MensagemDoFormulario estado={devolucao} />
        <div>
          <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>
            Devolver à empresa fornecedora
          </BotaoDeEnvio>
        </div>
      </form>
    </div>
  );
}

/** Suspensão (§6.10): categoria fechada e motivo, os dois obrigatórios. */
export function SuspensaoPelaPlataforma({
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
      className={CAIXA_DE_RISCO}
      noValidate
      aria-label="Suspender a oferta"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      {/* A chave recomeça o campo a cada resposta, com o valor devolvido pelo servidor. */}
      <CampoDeSelecao
        key={`categoria-${String(estado.envios)}`}
        nome="categoria"
        rotulo="Categoria da suspensão"
        required
        opcoes={OPCOES_DA_CATEGORIA_DA_SUSPENSAO}
        defaultValue={estado.valores?.categoria ?? ""}
        erros={estado.campos.categoria}
      />
      <AreaDeTexto
        nome="motivo"
        rotulo="Motivo da suspensão"
        required
        maxLength={1000}
        rows={3}
        defaultValue={estado.valores?.motivo}
        erros={estado.campos.motivo}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio classe={BOTAO_DE_RISCO}>Suspender a oferta</BotaoDeEnvio>
      </div>
    </form>
  );
}

/**
 * Formulário de um motivo obrigatório: reativação (só o administrador) e
 * retirada pela plataforma.
 */
export function AcaoComMotivo({
  ofertaId,
  titulo,
  rotuloDoMotivo,
  dica,
  rotuloDoBotao,
  risco = false,
  acao,
}: {
  readonly ofertaId: string;
  /** Nome acessível do formulário. */
  readonly titulo: string;
  readonly rotuloDoMotivo: string;
  readonly dica?: string;
  readonly rotuloDoBotao: string;
  readonly risco?: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className={risco ? CAIXA_DE_RISCO : CAIXA}
      noValidate
      aria-label={titulo}
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      <AreaDeTexto
        nome="motivo"
        rotulo={rotuloDoMotivo}
        required
        maxLength={1000}
        rows={3}
        dica={dica}
        defaultValue={estado.valores?.motivo}
        erros={estado.campos.motivo}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio classe={risco ? BOTAO_DE_RISCO : BOTAO_PRINCIPAL}>
          {rotuloDoBotao}
        </BotaoDeEnvio>
      </div>
    </form>
  );
}
