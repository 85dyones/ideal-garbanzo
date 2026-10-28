import type { ReactNode } from "react";
import { MolduraLogada } from "@/app/_apoio/layout-logado";
import { lerSituacao } from "@/modules/auth/queries/acesso";

/** Área do próprio usuário. Cada página confere o acesso; o layout só monta o cabeçalho. */
export default async function LayoutDaConta({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <MolduraLogada situacao={await lerSituacao()}>{children}</MolduraLogada>
  );
}
