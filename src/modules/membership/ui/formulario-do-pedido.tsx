"use client";
/**
 * Formulário do pedido de adesão; os erros vêm do `Resultado`, por campo.
 *
 * Sem convite de fornecedora, o pedido é de compradora e a escolha do tipo
 * não aparece (ADR-0002 §9). O banco confere o convite de novo no envio.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import {
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import { ROTULO_DO_TIPO } from "@/modules/organizations/ui/rotulos";

const OPCOES_DO_TIPO = [
  ["", "Escolha"],
  ["buyer", ROTULO_DO_TIPO.buyer],
  ["supplier", ROTULO_DO_TIPO.supplier],
  ["both", ROTULO_DO_TIPO.both],
] as const;

export function FormularioDoPedido({
  acao,
  podeFornecer,
}: {
  readonly acao: AcaoDoFormulario;
  /** Há convite de fornecedora válido para o e-mail de quem pede. */
  readonly podeFornecer: boolean;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const valores = estado.valores ?? {};
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        nome="nomeDaEmpresa"
        rotulo="Nome da empresa"
        required
        maxLength={200}
        defaultValue={valores.nomeDaEmpresa}
        erros={estado.campos.nomeDaEmpresa}
      />
      <Campo
        nome="razaoSocial"
        rotulo="Razão social"
        required
        maxLength={300}
        defaultValue={valores.razaoSocial}
        erros={estado.campos.razaoSocial}
      />
      <Campo
        nome="cnpj"
        rotulo="CNPJ"
        required
        inputMode="text"
        autoCapitalize="characters"
        dica="Com ou sem pontuação. O CNPJ alfanumérico também é aceito."
        defaultValue={valores.cnpj}
        erros={estado.campos.cnpj}
      />
      {podeFornecer ? (
        <CampoDeSelecao
          nome="tipo"
          rotulo="A empresa vai atuar como"
          required
          opcoes={OPCOES_DO_TIPO}
          defaultValue={valores.tipo ?? ""}
          erros={estado.campos.tipo}
        />
      ) : (
        <input type="hidden" name="tipo" value="buyer" />
      )}
      <Campo
        nome="emailDeContato"
        rotulo="E-mail de contato da empresa (opcional)"
        type="email"
        autoComplete="email"
        defaultValue={valores.emailDeContato}
        erros={estado.campos.emailDeContato}
      />
      <Campo
        nome="telefoneDeContato"
        rotulo="Telefone de contato da empresa (opcional)"
        type="tel"
        autoComplete="tel"
        defaultValue={valores.telefoneDeContato}
        erros={estado.campos.telefoneDeContato}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Enviar pedido</BotaoDeEnvio>
    </form>
  );
}
