"use server";
/**
 * Entrar, cadastrar e recuperar acesso (ADR-0002 §2.8), com o cliente da
 * sessão, que grava os cookies. Ficam juntas neste arquivo para receberem o
 * limite de tentativas por IP e e-mail (`ipDoVisitante`, em
 * `src/app/_apoio/visitante.ts`; ADR-0002 §2.16).
 *
 * O anti-robô é o captcha do próprio Supabase Auth: com o widget na tela, o
 * token vai em `options.captchaToken` e o Auth confere. Sem o widget (sem
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), nenhum token é enviado.
 *
 * Cadastro e recuperação respondem igual exista ou não a conta.
 */
import { isAuthWeakPasswordError, type AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { email, textoObrigatorio } from "@/lib/operacao/campos";
import {
  LIMITES,
  consumirLimites,
  type Limite,
} from "@/lib/operacao/limite-de-tentativas";
import { entradaInvalida, falha } from "@/lib/operacao/resultado";
import {
  criarClienteAdministrativo,
  criarClienteDaSessao,
} from "@/lib/supabase/servidor";
import { senhaAleatoria } from "@/modules/auth/server/cadastro";
import {
  MENSAGEM_DA_RECUPERACAO,
  MENSAGEM_DO_CADASTRO,
  desfechoDaRecuperacao,
  desfechoDoCadastro,
  mensagemDoLogin,
  type ErroDoAuth,
} from "../_apoio/erros-do-auth";
import {
  estadoDeErro,
  estadoDeSucesso,
  estadoDoResultado,
  texto,
  textoOpcional,
  valoresDoFormulario,
  type EstadoDoFormulario,
} from "../_apoio/formulario";
import { origemDaRequisicao, urlDeRetorno } from "../_apoio/origem";
import { caminhoSeguro } from "../_apoio/proximo";
import { ipDoVisitante } from "../_apoio/visitante";

const senha = z
  .string()
  .min(1, { error: "Informe a senha." })
  .max(72, { error: "Use no máximo 72 caracteres." });

const esquemaDoLogin = z.object({ email, senha });
/** Sem senha: a pessoa cria a senha depois de confirmar o e-mail (ADR-0002 §8, R8). */
const esquemaDoCadastro = z.object({
  nome: textoObrigatorio(200),
  email,
});
const esquemaDaRecuperacao = z.object({ email });

/**
 * Conta a tentativa nos limites (ADR-0002 §2.16) e diz se ela cabe. Sem
 * `x-forwarded-for` (máquina local), todas as tentativas contam no mesmo IP.
 * A chave secreta só consome o contador; não lê nem grava identidade.
 */
async function cabeNosLimites(limites: {
  readonly porIp: Limite;
  readonly porEmail?: { readonly limite: Limite; readonly email: string };
}): Promise<boolean> {
  const ip = ipDoVisitante(await headers()) ?? "sem-ip";
  const pedidos: (readonly [Limite, readonly string[]])[] = [
    [limites.porIp, [ip]],
  ];
  if (limites.porEmail !== undefined) {
    pedidos.push([limites.porEmail.limite, [limites.porEmail.email]]);
  }
  return consumirLimites(criarClienteAdministrativo(), pedidos);
}

function opcoesDoCaptcha(dados: FormData): { captchaToken?: string } {
  const token = textoOpcional(dados, "captchaToken");
  return token === undefined ? {} : { captchaToken: token };
}

function erroDoAuth(erro: AuthError | null): ErroDoAuth | null {
  if (erro === null) return null;
  return {
    code: erro.code,
    ...(isAuthWeakPasswordError(erro) ? { reasons: erro.reasons } : {}),
  };
}

export async function entrarAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const valores = valoresDoFormulario(dados, ["email"]);
  const lido = esquemaDoLogin.safeParse({
    email: texto(dados, "email"),
    senha: texto(dados, "senha"),
  });
  if (!lido.success) {
    return estadoDoResultado(anterior, entradaInvalida(lido.error), "", {
      valores,
    });
  }
  const cabe = await cabeNosLimites({
    porIp: LIMITES.entrarPorIp,
    porEmail: { limite: LIMITES.entrarPorEmail, email: lido.data.email },
  });
  if (!cabe) {
    return estadoDoResultado(anterior, falha("limite_excedido"), "", {
      valores,
    });
  }
  const sessao = await criarClienteDaSessao();
  const { error } = await sessao.auth.signInWithPassword({
    email: lido.data.email,
    password: lido.data.senha,
    options: opcoesDoCaptcha(dados),
  });
  if (error !== null) {
    return estadoDeErro(anterior, mensagemDoLogin({ code: error.code }), {
      valores,
    });
  }
  redirect(caminhoSeguro(texto(dados, "proximo")));
}

export async function cadastrarAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const valores = valoresDoFormulario(dados, ["nome", "email"]);
  const lido = esquemaDoCadastro.safeParse({
    nome: texto(dados, "nome"),
    email: texto(dados, "email"),
  });
  if (!lido.success) {
    return estadoDoResultado(anterior, entradaInvalida(lido.error), "", {
      valores,
    });
  }
  if (!(await cabeNosLimites({ porIp: LIMITES.cadastroPorIp }))) {
    return estadoDoResultado(anterior, falha("limite_excedido"), "", {
      valores,
    });
  }
  const sessao = await criarClienteDaSessao();
  const { error } = await sessao.auth.signUp({
    email: lido.data.email,
    // O Auth exige senha no cadastro; esta ninguém conhece, e a confirmação
    // troca de novo antes de a pessoa criar a dela (R8).
    password: senhaAleatoria(),
    options: {
      // Só texto de exibição do perfil; nunca entra em decisão de acesso.
      data: { full_name: lido.data.nome },
      emailRedirectTo: urlDeRetorno(
        origemDaRequisicao(await headers()),
        "/nova-senha",
      ),
      ...opcoesDoCaptcha(dados),
    },
  });
  const desfecho = desfechoDoCadastro(erroDoAuth(error));
  if (desfecho.tipo === "erro") {
    return estadoDeErro(anterior, desfecho.mensagem, {
      ...(desfecho.campos === undefined ? {} : { campos: desfecho.campos }),
      valores,
    });
  }
  return estadoDeSucesso(anterior, MENSAGEM_DO_CADASTRO);
}

export async function recuperarAcessoAcao(
  anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const valores = valoresDoFormulario(dados, ["email"]);
  const lido = esquemaDaRecuperacao.safeParse({ email: texto(dados, "email") });
  if (!lido.success) {
    return estadoDoResultado(anterior, entradaInvalida(lido.error), "", {
      valores,
    });
  }
  const cabe = await cabeNosLimites({
    porIp: LIMITES.recuperacaoPorIp,
    porEmail: { limite: LIMITES.recuperacaoPorEmail, email: lido.data.email },
  });
  if (!cabe) {
    return estadoDoResultado(anterior, falha("limite_excedido"), "", {
      valores,
    });
  }
  const sessao = await criarClienteDaSessao();
  const { error } = await sessao.auth.resetPasswordForEmail(lido.data.email, {
    redirectTo: urlDeRetorno(
      origemDaRequisicao(await headers()),
      "/nova-senha",
    ),
    ...opcoesDoCaptcha(dados),
  });
  const desfecho = desfechoDaRecuperacao(erroDoAuth(error));
  if (desfecho.tipo === "erro") {
    return estadoDeErro(anterior, desfecho.mensagem, {
      ...(desfecho.campos === undefined ? {} : { campos: desfecho.campos }),
      valores,
    });
  }
  return estadoDeSucesso(anterior, MENSAGEM_DA_RECUPERACAO);
}
