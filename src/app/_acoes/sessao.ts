"use server";
/**
 * Nova senha (recuperação e convidado sem conta) e saída, com o cliente da
 * sessão, que grava os cookies.
 */
import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { criarClienteDaSessao } from "@/lib/supabase/servidor";
import { desfechoDaNovaSenha } from "../_apoio/erros-do-auth";
import {
  estadoDeErro,
  texto,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { DESTINO_PADRAO } from "../_apoio/proximo";

const LINK_EXPIRADO =
  "O link expirou ou já foi usado. Peça um novo em Recuperar acesso.";

export async function definirNovaSenhaAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const senha = texto(dados, "senha");
  const confirmacao = texto(dados, "confirmacao");
  if (senha === "" || senha.length > 72) {
    return estadoDeErro(anterior, "Confira os campos destacados.", {
      campos: {
        senha: [
          senha === "" ? "Informe a senha." : "Use no máximo 72 caracteres.",
        ],
      },
    });
  }
  if (senha !== confirmacao) {
    return estadoDeErro(anterior, "Confira os campos destacados.", {
      campos: { confirmacao: ["As duas senhas precisam ser iguais."] },
    });
  }
  const sessao = await criarClienteDaSessao();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (user === null) return estadoDeErro(anterior, LINK_EXPIRADO);

  const { error } = await sessao.auth.updateUser({ password: senha });
  const desfecho = desfechoDaNovaSenha(
    error === null
      ? null
      : {
          code: error.code,
          ...(isAuthWeakPasswordError(error) ? { reasons: error.reasons } : {}),
        },
  );
  if (desfecho.tipo === "erro") {
    return estadoDeErro(anterior, desfecho.mensagem, {
      ...(desfecho.campos === undefined ? {} : { campos: desfecho.campos }),
    });
  }
  // Senha nova encerra as outras sessões da conta: quem entrou com a senha
  // anterior, inclusive uma senha posta por outra pessoa antes da confirmação
  // do cadastro, sai (ADR-0002 §8, R8). O Auth já faz isso na troca de senha;
  // a chamada é a segunda camada. Se ela falhar, a pessoa segue.
  await sessao.auth.signOut({ scope: "others" });
  redirect(DESTINO_PADRAO);
}

/** Encerra a sessão deste navegador. */
export async function sairAcao(): Promise<void> {
  const sessao = await criarClienteDaSessao();
  await sessao.auth.signOut({ scope: "local" });
  redirect("/entrar");
}
