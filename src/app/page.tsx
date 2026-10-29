import Link from "next/link";
import { BOTAO_PRINCIPAL } from "@/components/estilos";
import { Logo } from "@/components/logo";

/**
 * Apresentação. A plataforma só intermedia oportunidades entre lojistas:
 * nenhum texto aqui sugere compra, venda, custódia ou financiamento de
 * veículos pela plataforma. A faixa marinho segue o painel da marca (kit
 * v0.3), com o logo em negativo.
 */
export default function PaginaInicial() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="bg-marinho-900 px-6 py-12 text-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <h1>
            <Logo variante="negativo" altura={48} />
          </h1>
          <p className="text-xl font-light">O repasse que conecta pátios</p>
          <p className="text-lg font-semibold text-amber-500">
            Do estoque de um lojista à oportunidade de outro.
          </p>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <p className="text-base">
          Rede privada de oportunidades automotivas entre lojistas. O veículo
          que não serve a uma loja pode ser o que outra procura. O acesso às
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
          <Link
            href="/cadastro"
            className="inline-flex items-center justify-center rounded border border-marinho-900 bg-white px-4 py-2 text-base font-medium text-marinho-900 hover:bg-marinho-50"
          >
            Criar conta
          </Link>
        </div>
      </section>
    </main>
  );
}
