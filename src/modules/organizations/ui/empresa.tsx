"use client";
/**
 * Edição de nome e contatos (`org_admin` e administrador) e mudança de status
 * da empresa (só administrador, com motivo). A operação de servidor decide.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_DE_RISCO, BOTAO_SECUNDARIO } from "@/components/estilos";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  Campo,
  MensagemDoFormulario,
} from "@/components/formulario";
import type { StatusDaEmpresa } from "../tipos";

export function EdicaoDaEmpresa({
  empresaId,
  nome,
  emailDeContato,
  telefoneDeContato,
  acao,
}: {
  readonly empresaId: string;
  readonly nome: string;
  readonly emailDeContato: string | null;
  readonly telefoneDeContato: string | null;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const valores = estado.valores ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="empresaId" value={empresaId} />
      <Campo
        nome="nome"
        rotulo="Nome da empresa"
        required
        maxLength={200}
        defaultValue={valores.nome ?? nome}
        erros={estado.campos.nome}
      />
      <Campo
        nome="emailDeContato"
        rotulo="E-mail de contato"
        type="email"
        dica="Deixe em branco para apagar."
        defaultValue={valores.emailDeContato ?? emailDeContato ?? ""}
        erros={estado.campos.emailDeContato}
      />
      <Campo
        nome="telefoneDeContato"
        rotulo="Telefone de contato"
        type="tel"
        dica="Deixe em branco para apagar."
        defaultValue={valores.telefoneDeContato ?? telefoneDeContato ?? ""}
        erros={estado.campos.telefoneDeContato}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Gravar dados</BotaoDeEnvio>
    </form>
  );
}

const ACOES_DO_STATUS: Readonly<
  Record<StatusDaEmpresa, readonly (readonly [string, string])[]>
> = {
  pending: [],
  active: [
    ["suspender", "Suspender empresa"],
    ["encerrar", "Encerrar empresa"],
  ],
  suspended: [
    ["reativar", "Reativar empresa"],
    ["encerrar", "Encerrar empresa"],
  ],
  closed: [],
};

function MudancaDeStatus({
  empresaId,
  acao,
  rotulo,
  acaoDoServidor,
}: {
  readonly empresaId: string;
  readonly acao: string;
  readonly rotulo: string;
  readonly acaoDoServidor: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acaoDoServidor, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-2 rounded border border-neutral-200 p-3"
      noValidate
      aria-label={rotulo}
    >
      <input type="hidden" name="empresaId" value={empresaId} />
      <input type="hidden" name="acao" value={acao} />
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
      <BotaoDeEnvio
        classe={acao === "reativar" ? BOTAO_SECUNDARIO : BOTAO_DE_RISCO}
      >
        {rotulo}
      </BotaoDeEnvio>
    </form>
  );
}

export function StatusDaEmpresaAdministrado({
  empresaId,
  status,
  acao,
}: {
  readonly empresaId: string;
  readonly status: StatusDaEmpresa;
  readonly acao: AcaoDoFormulario;
}) {
  const acoes = ACOES_DO_STATUS[status];
  if (acoes.length === 0) {
    return (
      <p className="text-sm text-neutral-700">
        Nenhuma mudança de status disponível.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {acoes.map(([valor, rotulo]) => (
        <MudancaDeStatus
          key={valor}
          empresaId={empresaId}
          acao={valor}
          rotulo={rotulo}
          acaoDoServidor={acao}
        />
      ))}
    </div>
  );
}
