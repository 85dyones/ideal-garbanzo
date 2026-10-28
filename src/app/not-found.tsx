import Link from "next/link";
import { CARTAO, LINK } from "@/components/estilos";

export default function PaginaNaoEncontrada() {
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <section className={CARTAO} aria-labelledby="titulo-nao-encontrada">
        <h1 id="titulo-nao-encontrada" className="text-xl font-semibold">
          Página não encontrada
        </h1>
        <p className="mt-2">O endereço não corresponde a nenhuma página.</p>
        <p className="mt-4">
          <Link href="/" className={LINK}>
            Ir para a página inicial
          </Link>
        </p>
      </section>
    </main>
  );
}
