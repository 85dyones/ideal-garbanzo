"use client";
/** Resposta do convidado ao próprio convite (aceitar ou recusar) e seletor de empresa. */
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, CAMPO } from "@/components/estilos";
import { BotaoDeEnvio, MensagemDoFormulario } from "@/components/formulario";

export function RespostaAoConvite({
  empresaId,
  nomeDaEmpresa,
  acao,
}: {
  readonly empresaId: string;
  readonly nomeDaEmpresa: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-2"
      aria-label={`Convite de ${nomeDaEmpresa}`}
    >
      <input type="hidden" name="empresaId" value={empresaId} />
      <div className="flex flex-wrap gap-2">
        <BotaoDeEnvio nome="resposta" valor="aceitar">
          Aceitar convite
        </BotaoDeEnvio>
        <BotaoDeEnvio nome="resposta" valor="recusar" classe={BOTAO_SECUNDARIO}>
          Recusar
        </BotaoDeEnvio>
      </div>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

export function SeletorDeEmpresa({
  empresas,
}: {
  readonly empresas: readonly { readonly id: string; readonly nome: string }[];
}) {
  const id = useId();
  const roteador = useRouter();
  const [escolhida, setEscolhida] = useState(empresas[0]?.id ?? "");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (escolhida !== "") roteador.push(`/empresa/${escolhida}`);
      }}
    >
      <div className="flex grow flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Empresa
        </label>
        <select
          id={id}
          className={CAMPO}
          value={escolhida}
          onChange={(evento) => {
            setEscolhida(evento.target.value);
          }}
        >
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nome}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={BOTAO_PRINCIPAL}>
        Abrir empresa
      </button>
    </form>
  );
}
