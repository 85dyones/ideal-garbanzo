"use client";
/**
 * Peças dos formulários: todo campo tem `label`, os erros do campo e a
 * mensagem do resultado ficam em regiões `aria-live`, que existem desde o
 * início para o leitor de tela anunciar a mudança.
 */
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import type { EstadoDoFormulario } from "@/app/_apoio/formulario";
import { BOTAO_PRINCIPAL, CAMPO } from "./estilos";

function descritores(...ids: (string | null)[]): string | undefined {
  const lista = ids.filter((id): id is string => id !== null);
  return lista.length > 0 ? lista.join(" ") : undefined;
}

export function ErrosDoCampo({
  id,
  erros,
}: {
  readonly id: string;
  readonly erros: readonly string[] | undefined;
}) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-red-800">
      {erros?.join(" ")}
    </p>
  );
}

interface PropsComuns {
  readonly nome: string;
  readonly rotulo: string;
  readonly erros?: readonly string[] | undefined;
  readonly dica?: string;
}

export function Campo({
  nome,
  rotulo,
  erros,
  dica,
  ...atributos
}: PropsComuns & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "id">) {
  const id = useId();
  const temErro = (erros?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        name={nome}
        className={CAMPO}
        aria-invalid={temErro ? true : undefined}
        aria-describedby={descritores(
          dica === undefined ? null : `${id}-dica`,
          `${id}-erro`,
        )}
        {...atributos}
      />
      {dica === undefined ? null : (
        <p id={`${id}-dica`} className="text-sm text-gray-600">
          {dica}
        </p>
      )}
      <ErrosDoCampo id={`${id}-erro`} erros={erros} />
    </div>
  );
}

export function CampoDeSelecao({
  nome,
  rotulo,
  erros,
  dica,
  opcoes,
  ...atributos
}: PropsComuns & {
  readonly opcoes: readonly (readonly [string, string])[];
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "id">) {
  const id = useId();
  const temErro = (erros?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        name={nome}
        className={CAMPO}
        aria-invalid={temErro ? true : undefined}
        aria-describedby={descritores(
          dica === undefined ? null : `${id}-dica`,
          `${id}-erro`,
        )}
        {...atributos}
      >
        {opcoes.map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </select>
      {dica === undefined ? null : (
        <p id={`${id}-dica`} className="text-sm text-gray-600">
          {dica}
        </p>
      )}
      <ErrosDoCampo id={`${id}-erro`} erros={erros} />
    </div>
  );
}

export function AreaDeTexto({
  nome,
  rotulo,
  erros,
  dica,
  ...atributos
}: PropsComuns &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "id">) {
  const id = useId();
  const temErro = (erros?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <textarea
        id={id}
        name={nome}
        rows={3}
        className={CAMPO}
        aria-invalid={temErro ? true : undefined}
        aria-describedby={descritores(
          dica === undefined ? null : `${id}-dica`,
          `${id}-erro`,
        )}
        {...atributos}
      />
      {dica === undefined ? null : (
        <p id={`${id}-dica`} className="text-sm text-gray-600">
          {dica}
        </p>
      )}
      <ErrosDoCampo id={`${id}-erro`} erros={erros} />
    </div>
  );
}

const CORES_DA_MENSAGEM: Readonly<Record<string, string>> = {
  sucesso: "text-green-800",
  aviso: "text-amber-900",
  erro: "text-red-800",
  inicial: "",
};

/** Mensagem do `Resultado` e erros gerais do formulário (campo `_`). */
export function MensagemDoFormulario({
  estado,
}: {
  readonly estado: EstadoDoFormulario;
}) {
  const gerais = estado.campos._ ?? [];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`text-sm ${CORES_DA_MENSAGEM[estado.situacao] ?? ""}`}
    >
      {estado.mensagem === "" ? null : <p>{estado.mensagem}</p>}
      {gerais.length === 0 ? null : <p>{gerais.join(" ")}</p>}
    </div>
  );
}

/** Botão que fica desabilitado enquanto o formulário é enviado. */
export function BotaoDeEnvio({
  children,
  classe = BOTAO_PRINCIPAL,
  nome,
  valor,
}: {
  readonly children: ReactNode;
  readonly classe?: string;
  readonly nome?: string;
  readonly valor?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={nome}
      value={valor}
      disabled={pending}
      aria-disabled={pending}
      className={classe}
    >
      {children}
    </button>
  );
}
