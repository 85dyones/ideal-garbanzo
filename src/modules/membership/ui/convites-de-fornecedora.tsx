"use client";
/**
 * Telas do convite de fornecedora (I1.10; ADR-0002 §9): o formulário e a
 * revogação, do administrador da plataforma, e os convites da própria
 * pessoa no início.
 *
 * Depois do sucesso, a ação recarrega a página, e o convite muda de lugar ou
 * sai da lista. Por isso a mensagem fica num componente que continua na tela:
 * a revogação fica no item mesmo sem o botão, e o aceite fica no fim da lista.
 */
import Link from "next/link";
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_DE_RISCO, LINK } from "@/components/estilos";
import {
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";

export function FormularioDoConviteDeFornecedora({
  acao,
  compradoras,
}: {
  readonly acao: AcaoDoFormulario;
  /** `[id, rótulo]` das compradoras ativas. */
  readonly compradoras: readonly (readonly [string, string])[];
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const valores = estado.valores ?? {};
  return (
    <form
      action={enviar}
      className="flex flex-col gap-4"
      noValidate
      aria-label="Novo convite de fornecedora"
    >
      <Campo
        nome="email"
        rotulo="E-mail convidado"
        type="email"
        autoComplete="off"
        required
        maxLength={320}
        defaultValue={valores.email}
        erros={estado.campos.email}
      />
      {compradoras.length === 0 ? (
        <p className="text-sm text-neutral-700">
          Nenhuma compradora ativa no momento. O convite vai para uma empresa
          nova.
        </p>
      ) : (
        <CampoDeSelecao
          nome="empresaId"
          rotulo="Compradora que passa a fornecer também (opcional)"
          opcoes={[["", "Nenhuma: convite para empresa nova"], ...compradoras]}
          defaultValue={valores.empresaId ?? ""}
          dica="Sem compradora, o convite libera o pedido de adesão de uma empresa nova como fornecedora. Com compradora, o e-mail precisa ser de um administrador ativo dela, que aceita o convite no início."
          erros={estado.campos.empresaId}
        />
      )}
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Convidar</BotaoDeEnvio>
    </form>
  );
}

/** Revogação de um convite; com o convite já final, sobra só a mensagem. */
export function RevogacaoDoConvite({
  conviteId,
  revogavel,
  acao,
}: {
  readonly conviteId: string;
  readonly revogavel: boolean;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  if (!revogavel && estado.situacao === "inicial") return null;
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="conviteId" value={conviteId} />
      {revogavel ? (
        <div>
          <BotaoDeEnvio classe={BOTAO_DE_RISCO}>Revogar convite</BotaoDeEnvio>
        </div>
      ) : null}
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

export interface ConviteParaFornecer {
  readonly id: string;
  /** `null` para empresa nova. */
  readonly empresaId: string | null;
  readonly nomeDaEmpresa: string;
  /** Validade já formatada para a tela. */
  readonly venceEm: string;
}

/** Convites de fornecedora da própria pessoa, na seção "Convites pendentes" do início. */
export function ConvitesParaFornecer({
  convites,
  acao,
}: {
  readonly convites: readonly ConviteParaFornecer[];
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <>
      {convites.length === 0 ? null : (
        <ul className="flex flex-col gap-4" aria-label="Convites para fornecer">
          {convites.map((convite) => (
            <li key={convite.id} className="flex flex-col gap-2">
              {convite.empresaId === null ? (
                <>
                  <p>
                    A plataforma convidou você para cadastrar uma empresa{" "}
                    <strong>fornecedora</strong>. O convite vale até{" "}
                    {convite.venceEm}.
                  </p>
                  <p>
                    <Link href="/adesao" className={LINK}>
                      Enviar o pedido como fornecedora
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Convite para <strong>{convite.nomeDaEmpresa}</strong>{" "}
                    fornecer também. O convite vale até {convite.venceEm}.
                  </p>
                  <form
                    action={enviar}
                    aria-label={`Convite para ${convite.nomeDaEmpresa} fornecer também`}
                  >
                    <input type="hidden" name="conviteId" value={convite.id} />
                    <BotaoDeEnvio>Aceitar e fornecer também</BotaoDeEnvio>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <MensagemDoFormulario estado={estado} />
    </>
  );
}
