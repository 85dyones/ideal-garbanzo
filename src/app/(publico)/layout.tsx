import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export default function LayoutPublico({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link href="/" className="self-start">
          <Logo altura={32} />
        </Link>
        <span className="text-sm text-neutral-600">
          O repasse que conecta pátios
        </span>
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
