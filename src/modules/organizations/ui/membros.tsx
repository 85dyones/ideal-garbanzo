"use client";
/**
 * Membros da empresa: convite, suspender, reativar, remover, cancelar convite
 * e trocar papel (ADR-0002 §2.6). As ações aparecem só para quem gere a
 * empresa e nunca na própria linha; a operação de servidor recusa de qualquer
 * jeito quem não pode.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import { Vazio } from "@/components/estados";
import { BOTAO_DE_RISCO, BOTAO_SECUNDARIO, CAMPO } from "@/components/estilos";
import {
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import type { PapelNaEmpresa, StatusDoVinculo } from "../tipos";
import { ROTULO_DO_PAPEL, ROTULO_DO_STATUS_DO_VINCULO } from "./rotulos";

export interface MembroParaTela {
  readonly vinculoId: string;
  readonly perfilId: string;
  readonly papel: PapelNaEmpresa;
  readonly status: StatusDoVinculo;
  readonly nome: string | null;
  readonly email: string | null;
}

export interface AcoesDosMembros {
  readonly convidar: AcaoDoFormulario;
  readonly gerir: AcaoDoFormulario;
  readonly trocarPapel: AcaoDoFormulario;
}

const OPCOES_DE_PAPEL = [
  ["member", ROTULO_DO_PAPEL.member],
  ["org_admin", ROTULO_DO_PAPEL.org_admin],
] as const;

const ACOES_POR_STATUS: Readonly<
  Record<StatusDoVinculo, readonly (readonly [string, string, boolean])[]>
> = {
  pending: [["cancelar_convite", "Cancelar convite", true]],
  active: [
    ["suspender", "Suspender", true],
    ["remover", "Remover", true],
  ],
  suspended: [
    ["reativar", "Reativar", false],
    ["remover", "Remover", true],
  ],
  removed: [],
};

function FormularioDeConvite({
  empresaId,
  acao,
}: {
  readonly empresaId: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className="flex flex-col gap-3 rounded border border-neutral-200 p-3"
      noValidate
      aria-label="Convidar membro"
    >
      <h3 className="font-medium">Convidar membro</h3>
      <input type="hidden" name="empresaId" value={empresaId} />
      <Campo
        nome="email"
        rotulo="E-mail da pessoa"
        type="email"
        autoComplete="off"
        required
        defaultValue={estado.valores?.email}
        erros={estado.campos.email}
      />
      <CampoDeSelecao
        nome="papel"
        rotulo="Papel"
        opcoes={OPCOES_DE_PAPEL}
        defaultValue={estado.valores?.papel ?? "member"}
        erros={estado.campos.papel}
      />
      <MensagemDoFormulario estado={estado} />
      <BotaoDeEnvio>Convidar</BotaoDeEnvio>
    </form>
  );
}

function AcaoDeGestao({
  empresaId,
  vinculoId,
  acao,
  rotulo,
  risco,
  acaoDoServidor,
}: {
  readonly empresaId: string;
  readonly vinculoId: string;
  readonly acao: string;
  readonly rotulo: string;
  readonly risco: boolean;
  readonly acaoDoServidor: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acaoDoServidor, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="empresaId" value={empresaId} />
      <input type="hidden" name="vinculoId" value={vinculoId} />
      <input type="hidden" name="acao" value={acao} />
      <BotaoDeEnvio classe={risco ? BOTAO_DE_RISCO : BOTAO_SECUNDARIO}>
        {rotulo}
      </BotaoDeEnvio>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

function TrocaDePapel({
  empresaId,
  membro,
  acaoDoServidor,
}: {
  readonly empresaId: string;
  readonly membro: MembroParaTela;
  readonly acaoDoServidor: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acaoDoServidor, ESTADO_INICIAL);
  const idDoCampo = `papel-${membro.vinculoId}`;
  return (
    <form action={enviar} className="flex flex-col gap-1">
      <input type="hidden" name="empresaId" value={empresaId} />
      <input type="hidden" name="vinculoId" value={membro.vinculoId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={idDoCampo} className="text-sm font-medium">
            Papel
          </label>
          <select
            id={idDoCampo}
            name="papel"
            defaultValue={membro.papel}
            className={CAMPO}
          >
            {OPCOES_DE_PAPEL.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </div>
        <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>Trocar papel</BotaoDeEnvio>
      </div>
      <MensagemDoFormulario estado={estado} />
    </form>
  );
}

export function GestaoDeMembros({
  empresaId,
  membros,
  podeGerir,
  perfilAtualId,
  acoes,
}: {
  readonly empresaId: string;
  readonly membros: readonly MembroParaTela[];
  readonly podeGerir: boolean;
  readonly perfilAtualId: string;
  readonly acoes: AcoesDosMembros;
}) {
  return (
    <div className="flex flex-col gap-4">
      {podeGerir ? (
        <FormularioDeConvite empresaId={empresaId} acao={acoes.convidar} />
      ) : null}
      {membros.length === 0 ? (
        <Vazio>Nenhum membro para mostrar.</Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200">
          {membros.map((membro) => {
            const proprio = membro.perfilId === perfilAtualId;
            const agir = podeGerir && !proprio;
            return (
              <li
                key={membro.vinculoId}
                className="flex flex-col gap-2 py-3"
                aria-label={membro.nome ?? membro.email ?? "Membro"}
              >
                <div>
                  <p className="font-medium">
                    {membro.nome === null || membro.nome === ""
                      ? (membro.email ?? "Convidado")
                      : membro.nome}
                    {proprio ? " (você)" : ""}
                  </p>
                  {membro.email !== null && membro.nome !== null ? (
                    <p className="text-sm text-neutral-700">{membro.email}</p>
                  ) : null}
                  <p className="text-sm text-neutral-700">
                    {ROTULO_DO_PAPEL[membro.papel]} ·{" "}
                    {ROTULO_DO_STATUS_DO_VINCULO[membro.status]}
                  </p>
                </div>
                {agir ? (
                  <div className="flex flex-wrap items-start gap-3">
                    {ACOES_POR_STATUS[membro.status].map(
                      ([acao, rotulo, risco]) => (
                        <AcaoDeGestao
                          key={acao}
                          empresaId={empresaId}
                          vinculoId={membro.vinculoId}
                          acao={acao}
                          rotulo={rotulo}
                          risco={risco}
                          acaoDoServidor={acoes.gerir}
                        />
                      ),
                    )}
                    {membro.status === "removed" ? null : (
                      <TrocaDePapel
                        empresaId={empresaId}
                        membro={membro}
                        acaoDoServidor={acoes.trocarPapel}
                      />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
