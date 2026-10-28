/**
 * Respostas das telas de autenticação a partir do erro do Supabase Auth.
 *
 * Cadastro e recuperação respondem igual exista ou não a conta: só os erros
 * que dependem do que foi digitado (senha fraca, e-mail malformado), do
 * anti-robô ou do limite por endereço de rede mudam a resposta. Qualquer
 * outro erro, inclusive "e-mail já cadastrado", vira a resposta neutra.
 */
export interface ErroDoAuth {
  readonly code?: string | undefined;
  /** Motivos da senha fraca (`AuthWeakPasswordError.reasons`). */
  readonly reasons?: readonly string[];
}

export type Desfecho =
  | { readonly tipo: "neutro" }
  | {
      readonly tipo: "erro";
      readonly mensagem: string;
      readonly campos?: Readonly<Record<string, readonly string[]>>;
    };

export const MENSAGEM_DO_CADASTRO =
  "Se for possível concluir o cadastro, enviamos um link de confirmação para o e-mail informado. Confirme seu e-mail e, em seguida, crie sua senha. Se você já tem conta, entre ou recupere o acesso.";

export const MENSAGEM_DA_RECUPERACAO =
  "Se houver conta com este e-mail, enviamos um link para criar uma nova senha. Confira também a caixa de spam.";

const ANTI_ROBO =
  "Não foi possível confirmar que você não é um robô. Tente de novo.";
const MUITAS_TENTATIVAS =
  "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
const CAMPOS_INVALIDOS = "Confira os campos destacados.";

const NEUTRO: Desfecho = { tipo: "neutro" };

function erroDeCampo(campo: string, mensagens: readonly string[]): Desfecho {
  return {
    tipo: "erro",
    mensagem: CAMPOS_INVALIDOS,
    campos: { [campo]: mensagens },
  };
}

export function mensagensDaSenhaFraca(
  motivos: readonly string[] | undefined,
): string[] {
  const mensagens = (motivos ?? []).map((motivo) => {
    switch (motivo) {
      case "length":
        return "A senha é curta demais.";
      case "characters":
        return "A senha precisa misturar os tipos de caractere exigidos (letras, números e símbolos).";
      case "pwned":
        return "Esta senha aparece em vazamentos conhecidos. Escolha outra.";
      default:
        return "A senha não atende à política de senhas.";
    }
  });
  return mensagens.length > 0
    ? [...new Set(mensagens)]
    : ["A senha não atende à política de senhas."];
}

/** Erros que não dependem de a conta existir. */
function erroComum(erro: ErroDoAuth): Desfecho | null {
  switch (erro.code) {
    case "captcha_failed":
      return { tipo: "erro", mensagem: ANTI_ROBO };
    case "over_request_rate_limit":
      return { tipo: "erro", mensagem: MUITAS_TENTATIVAS };
    case "email_address_invalid":
      return erroDeCampo("email", ["E-mail inválido."]);
    default:
      return null;
  }
}

export function desfechoDoCadastro(erro: ErroDoAuth | null): Desfecho {
  if (erro === null) return NEUTRO;
  if (erro.code === "weak_password") {
    return erroDeCampo("senha", mensagensDaSenhaFraca(erro.reasons));
  }
  return erroComum(erro) ?? NEUTRO;
}

export function desfechoDaRecuperacao(erro: ErroDoAuth | null): Desfecho {
  if (erro === null) return NEUTRO;
  return erroComum(erro) ?? NEUTRO;
}

export function mensagemDoLogin(erro: ErroDoAuth): string {
  switch (erro.code) {
    case "invalid_credentials":
      return "E-mail ou senha incorretos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar: procure o link que enviamos.";
    case "user_banned":
      return "Seu acesso está suspenso. Fale com a administração da plataforma.";
    case "captcha_failed":
      return ANTI_ROBO;
    case "over_request_rate_limit":
      return MUITAS_TENTATIVAS;
    default:
      return "Não foi possível entrar agora. Tente de novo.";
  }
}

export function desfechoDaNovaSenha(erro: ErroDoAuth | null): Desfecho {
  if (erro === null) return NEUTRO;
  switch (erro.code) {
    case "weak_password":
      return erroDeCampo("senha", mensagensDaSenhaFraca(erro.reasons));
    case "same_password":
      return erroDeCampo("senha", [
        "A nova senha precisa ser diferente da atual.",
      ]);
    case "session_not_found":
    case "session_expired":
      return {
        tipo: "erro",
        mensagem:
          "O link expirou. Peça um novo em Recuperar acesso e tente de novo.",
      };
    default:
      return {
        tipo: "erro",
        mensagem: "Não foi possível gravar a nova senha agora. Tente de novo.",
      };
  }
}
