import Link from "next/link";
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from "@/components/estilos";

/**
 * Apresentação. A plataforma só intermedia oportunidades entre lojistas:
 * nenhum texto aqui sugere compra, venda, custódia ou financiamento de
 * veículos pela plataforma.
 */
export default function PaginaInicial() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">EntrePátios</h1>
        <p className="text-lg text-gray-700">O repasse que conecta pátios</p>
      </header>
      <p className="text-base">
        Do estoque de um lojista à oportunidade de outro.
      </p>
      <p className="text-base">
        Rede privada de oportunidades automotivas entre lojistas. O veículo que
        não serve a uma loja pode ser o que outra procura. O acesso às
        oportunidades é só para empresas aceitas pela administração da
        plataforma.
      </p>
      <p className="text-base">
        Para participar, crie uma conta, confirme o e-mail e envie o pedido de
        adesão da sua empresa.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/entrar" className={BOTAO_PRINCIPAL}>
          Entrar
        </Link>
        <Link href="/cadastro" className={BOTAO_SECUNDARIO}>
          Criar conta
        </Link>
      </div>
    </main>
  );
}
