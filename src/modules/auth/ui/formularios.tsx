"use client";
/**
 * Formulários de entrada, cadastro, recuperação e nova senha. A ação vem da
 * página (Server Action); o widget anti-robô aparece só com a chave do site.
 */
import Link from "next/link";
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { LINK } from "@/components/estilos";
import {
  BotaoDeEnvio,
  Campo,
  MensagemDoFormulario,
} from "@/components/formulario";
import { WidgetTurnstile } from "@/components/turnstile";

interface PropsDoFormulario {
  readonly acao: AcaoDoFormulario;
  readonly chaveDoTurnstile?: string | null;
}

function AntiRobo({
  chave,
  rodada,
}: {
  readonly chave: string | null | undefined;
  readonly rodada: number;
}) {
  if (chave === null || chave === undefined || chave === "") return null;
  return <WidgetTurnstile chaveDoSite={chave} rodada={rodada} />;
}

export function FormularioDeEntrada({
  acao,
  chaveDoTurnstile,
  proximo,
}: PropsDoFormulario & { readonly proximo: string }) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="proximo" value={proximo} />
      <Campo
        nome="email"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        required
        defaultValue={estado.valores?.email}
        erros={estado.campos.email}
      />
      <Campo
        nome="senha"
        rotulo="Senha"
        type="password"
        autoComplete="current-password"
        required
        erros={estado.campos.senha}
      />
      <AntiRobo chave={chaveDoTurnstile} rodada={estado.envios} />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Entrar</BotaoDeEnvio>
      <p className="text-sm">
        <Link href="/recuperar" className={LINK}>
          Esqueci a senha
        </Link>
        {" · "}
        <Link href="/cadastro" className={LINK}>
          Criar conta
        </Link>
      </p>
    </form>
  );
}

export function FormularioDeCadastro({
  acao,
  chaveDoTurnstile,
}: PropsDoFormulario) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  if (estado.situacao === "sucesso") {
    return (
      <div className="flex flex-col gap-3">
        <MensagemDoFormulario estado={estado} />
        <p className="text-sm">
          <Link href="/entrar" className={LINK}>
            Ir para a entrada
          </Link>
        </p>
      </div>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        nome="nome"
        rotulo="Nome completo"
        autoComplete="name"
        required
        maxLength={200}
        defaultValue={estado.valores?.nome}
        erros={estado.campos.nome}
      />
      <Campo
        nome="email"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        required
        defaultValue={estado.valores?.email}
        erros={estado.campos.email}
      />
      <Campo
        nome="senha"
        rotulo="Senha"
        type="password"
        autoComplete="new-password"
        required
        maxLength={72}
        erros={estado.campos.senha}
      />
      <AntiRobo chave={chaveDoTurnstile} rodada={estado.envios} />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Criar conta</BotaoDeEnvio>
      <p className="text-sm">
        Já tem conta?{" "}
        <Link href="/entrar" className={LINK}>
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function FormularioDeRecuperacao({
  acao,
  chaveDoTurnstile,
}: PropsDoFormulario) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        nome="email"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        required
        defaultValue={estado.valores?.email}
        erros={estado.campos.email}
      />
      <AntiRobo chave={chaveDoTurnstile} rodada={estado.envios} />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Enviar link</BotaoDeEnvio>
      <p className="text-sm">
        <Link href="/entrar" className={LINK}>
          Voltar para a entrada
        </Link>
      </p>
    </form>
  );
}

export function FormularioDeNovaSenha({ acao }: PropsDoFormulario) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        nome="senha"
        rotulo="Nova senha"
        type="password"
        autoComplete="new-password"
        required
        maxLength={72}
        erros={estado.campos.senha}
      />
      <Campo
        nome="confirmacao"
        rotulo="Repita a nova senha"
        type="password"
        autoComplete="new-password"
        required
        maxLength={72}
        erros={estado.campos.confirmacao}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Gravar a nova senha</BotaoDeEnvio>
    </form>
  );
}
