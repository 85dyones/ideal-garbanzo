"use client";
import { ErroDaPagina } from "@/components/erro-da-pagina";

export default function Erro({
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <ErroDaPagina retry={retry} />
    </main>
  );
}
