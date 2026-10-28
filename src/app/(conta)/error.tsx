"use client";
import { ErroDaPagina } from "@/components/erro-da-pagina";

export default function Erro({
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}) {
  return <ErroDaPagina retry={retry} />;
}
