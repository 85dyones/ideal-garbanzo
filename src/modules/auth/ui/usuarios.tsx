"use client";
/**
 * Ações do administrador sobre um perfil: suspender ou reativar (com motivo),
 * conceder ou revogar papel na plataforma e liberar ou retirar a leitura da
 * auditoria do operador. A operação de servidor recusa quem não é
 * administrador e a própria linha.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_DE_RISCO, BOTAO_SECUNDARIO } from "@/components/estilos";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import type { PapelNaPlataforma } from "../tipos";
import { ROTULO_DO_PAPEL_NA_PLATAFORMA } from "./rotulos";

export interface AcoesDosUsuarios {
  readonly mudarStatus: AcaoDoFormulario;
  readonly conceder: AcaoDoFormulario;
  readonly revogar: AcaoDoFormulario;
  readonly leituraDeAuditoria: AcaoDoFormulario;
}

function StatusDoPerfil({
  perfilId,
  suspenso,
  acao,
}: {
  readonly perfilId: string;
  readonly suspenso: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const rotulo = suspenso ? "Reativar perfil" : "Suspender perfil";
  return (
    <form action={enviar} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="perfilId" value={perfilId} />
      <input
        type="hidden"
        name="acao"
        value={suspenso ? "reativar" : "suspender"}
      />
      <AreaDeTexto
        nome="motivo"
        rotulo={`Motivo (${rotulo.toLowerCase()})`}
        required
        maxLength={1000}
        dica="Obrigatório; fica registrado na auditoria."
        defaultValue={estado.valores?.motivo}
        erros={estado.campos.motivo}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio classe={suspenso ? BOTAO_SECUNDARIO : BOTAO_DE_RISCO}>
        {rotulo}
      </BotaoDeEnvio>
    </form>
  );
}

const OPCOES_DE_PAPEL = [
  ["operator", ROTULO_DO_PAPEL_NA_PLATAFORMA.operator],
  ["admin", ROTULO_DO_PAPEL_NA_PLATAFORMA.admin],
] as const;

function Concessao({
  perfilId,
  papelAtual,
  acao,
}: {
  readonly perfilId: string;
  readonly papelAtual: PapelNaPlataforma | null;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="perfilId" value={perfilId} />
      <CampoDeSelecao
        nome="papel"
        rotulo={papelAtual === null ? "Conceder papel" : "Trocar o papel para"}
        opcoes={OPCOES_DE_PAPEL}
        defaultValue={papelAtual === "operator" ? "admin" : "operator"}
        erros={estado.campos.papel}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>Conceder</BotaoDeEnvio>
    </form>
  );
}

function BotaoSimples({
  perfilId,
  acao,
  rotulo,
  extras = {},
  risco = false,
}: {
  readonly perfilId: string;
  readonly acao: AcaoDoFormulario;
  readonly rotulo: string;
  readonly extras?: Readonly<Record<string, string>>;
  readonly risco?: boolean;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="perfilId" value={perfilId} />
      {Object.entries(extras).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoDeEnvio classe={risco ? BOTAO_DE_RISCO : BOTAO_SECUNDARIO}>
        {rotulo}
      </BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

export function AcoesDoUsuario({
  perfilId,
  suspenso,
  papelAtivo,
  podeLerAuditoria,
  acoes,
}: {
  readonly perfilId: string;
  readonly suspenso: boolean;
  readonly papelAtivo: PapelNaPlataforma | null;
  readonly podeLerAuditoria: boolean;
  readonly acoes: AcoesDosUsuarios;
}) {
  return (
    <details className="rounded border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">Ações</summary>
      <div className="mt-3 flex flex-col gap-4">
        <StatusDoPerfil
          perfilId={perfilId}
          suspenso={suspenso}
          acao={acoes.mudarStatus}
        />
        <Concessao
          perfilId={perfilId}
          papelAtual={papelAtivo}
          acao={acoes.conceder}
        />
        {papelAtivo === null ? null : (
          <BotaoSimples
            perfilId={perfilId}
            acao={acoes.revogar}
            rotulo="Revogar papel na plataforma"
            risco
          />
        )}
        {papelAtivo === "operator" ? (
          <BotaoSimples
            perfilId={perfilId}
            acao={acoes.leituraDeAuditoria}
            rotulo={
              podeLerAuditoria
                ? "Retirar a leitura da auditoria"
                : "Liberar a leitura da auditoria"
            }
            extras={{ permitir: podeLerAuditoria ? "nao" : "sim" }}
          />
        ) : null}
      </div>
    </details>
  );
}
