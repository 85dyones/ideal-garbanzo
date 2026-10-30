/**
 * Carga comum das páginas da oferta do fornecedor (I2.8), na ordem da
 * ADR-0002 §2.15:
 * 1. a checagem de acesso vem antes de qualquer leitura: sem vínculo ativo
 *    com a empresa, "Sem permissão" para qualquer id, exista a oferta ou não;
 * 2. com vínculo, a empresa é lida com a sessão; empresa inativa ou só
 *    compradora recebe a explicação, sem ler ofertas;
 * 3. a oferta é lida com a sessão (a RLS decide). Oferta de outra empresa e
 *    oferta inexistente dão o mesmo "Registro inexistente".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AcessoSuspenso,
  Aviso,
  RegistroInexistente,
  SemPermissao,
} from "@/components/estados";
import { LINK } from "@/components/estilos";
import { Pagina } from "@/components/pagina";
import { id as campoId } from "@/lib/operacao/campos";
import {
  verificarAcesso,
  vinculoAtivoCom,
} from "@/modules/auth/queries/acesso";
import type { ContextoDoUsuario } from "@/modules/auth/tipos";
import {
  podeEditarConteudo,
  vencidaAntesDaExpiracao,
} from "@/modules/offers/rules/edicao";
import {
  ROTULO_DO_STATUS,
  atorDaOferta,
  validadeVencida,
  type AtorDaOferta,
} from "@/modules/offers/rules/transicoes";
import { obterOferta, type Oferta } from "@/modules/offers/queries/ofertas";
import type { ValoresDaOferta } from "@/modules/offers/ui/formulario-da-oferta";
import { NavegacaoDaOferta } from "@/modules/offers/ui/navegacao";
import {
  TEXTO,
  tituloDaOferta,
  type EtapaDaOferta,
} from "@/modules/offers/ui/rotulos";
import {
  obterEmpresa,
  type Empresa,
} from "@/modules/organizations/queries/empresas";
import { ROTULO_DO_STATUS_DA_EMPRESA } from "@/modules/organizations/ui/rotulos";
import { precoParaTela, validadeParaCampo } from "./oferta";

/** Valores do formulário a partir da oferta gravada, no formato da tela. */
export function valoresDaOferta(oferta: Oferta): ValoresDaOferta {
  const { veiculo } = oferta;
  const numero = (valor: number | null) =>
    valor === null ? "" : String(valor);
  return {
    marca: veiculo.marca ?? "",
    modelo: veiculo.modelo ?? "",
    versao: veiculo.versao ?? "",
    anoDeFabricacao: numero(veiculo.anoDeFabricacao),
    anoDoModelo: numero(veiculo.anoDoModelo),
    quilometragem: numero(veiculo.quilometragem),
    combustivel: veiculo.combustivel ?? "",
    cambio: veiculo.cambio ?? "",
    cor: veiculo.cor ?? "",
    carroceria: veiculo.carroceria ?? "",
    placa: veiculo.placa ?? "",
    renavam: veiculo.renavam ?? "",
    chassi: veiculo.chassi ?? "",
    preco: precoParaTela(oferta.preco),
    condicoesComerciais: oferta.condicoesComerciais ?? "",
    cidade: oferta.cidade ?? "",
    uf: oferta.uf ?? "",
    validaAte: validadeParaCampo(oferta.validaAte),
  };
}

/** Formulário vazio da primeira etapa, com a validade sugerida. */
export function valoresDaNovaOferta(validaAte: string): ValoresDaOferta {
  return {
    marca: "",
    modelo: "",
    versao: "",
    anoDeFabricacao: "",
    anoDoModelo: "",
    quilometragem: "",
    combustivel: "",
    cambio: "",
    cor: "",
    carroceria: "",
    placa: "",
    renavam: "",
    chassi: "",
    preco: "",
    condicoesComerciais: "",
    cidade: "",
    uf: "",
    validaAte,
  };
}

export function caminhoDasOfertas(empresaId: string): string {
  return `/empresa/${encodeURIComponent(empresaId)}/ofertas`;
}

export function caminhoDaOferta(empresaId: string, ofertaId: string): string {
  return `${caminhoDasOfertas(empresaId)}/${encodeURIComponent(ofertaId)}`;
}

function VoltarAEmpresa({ empresaId }: { readonly empresaId: string }) {
  return (
    <p>
      <Link href={`/empresa/${encodeURIComponent(empresaId)}`} className={LINK}>
        Voltar à empresa
      </Link>
    </p>
  );
}

/** Empresa só compradora: ofertas são de empresa fornecedora. */
export function EmpresaSemOfertas({ empresa }: { readonly empresa: Empresa }) {
  return (
    <Pagina titulo={`Ofertas de ${empresa.nome}`}>
      <Aviso>{TEXTO.semEmpresaFornecedora}</Aviso>
      <VoltarAEmpresa empresaId={empresa.id} />
    </Pagina>
  );
}

/** Empresa suspensa ou encerrada: a RLS já esconde as ofertas; a tela explica. */
export function EmpresaInativa({ empresa }: { readonly empresa: Empresa }) {
  return (
    <Pagina titulo={`Ofertas de ${empresa.nome}`}>
      <Aviso tom="alerta">
        Esta empresa está{" "}
        {ROTULO_DO_STATUS_DA_EMPRESA[empresa.status].toLowerCase()}. As ofertas
        ficam bloqueadas enquanto ela não for reativada pela administração da
        plataforma.
      </Aviso>
      <VoltarAEmpresa empresaId={empresa.id} />
    </Pagina>
  );
}

export type CargaDaEmpresa =
  | { readonly ok: false; readonly resposta: ReactNode }
  | {
      readonly ok: true;
      readonly contexto: ContextoDoUsuario;
      readonly sessao: SupabaseClient;
      readonly empresa: Empresa;
    };

/** Acesso e empresa fornecedora ativa, para o painel e a nova oferta. */
export async function carregarEmpresaDasOfertas(
  empresaId: string,
  caminho: string,
): Promise<CargaDaEmpresa> {
  const acesso = await verificarAcesso(caminho, vinculoAtivoCom(empresaId));
  if (!acesso.liberado) {
    return {
      ok: false,
      resposta:
        acesso.motivo === "suspenso" ? <AcessoSuspenso /> : <SemPermissao />,
    };
  }
  const { contexto, sessao } = acesso;
  const empresa = await obterEmpresa(sessao, empresaId);
  if (empresa === null) {
    return {
      ok: false,
      resposta: (
        <RegistroInexistente
          voltarPara="/inicio"
          rotuloDaVolta="Voltar ao início"
        />
      ),
    };
  }
  if (empresa.tipo === "buyer") {
    return { ok: false, resposta: <EmpresaSemOfertas empresa={empresa} /> };
  }
  if (empresa.status !== "active") {
    return { ok: false, resposta: <EmpresaInativa empresa={empresa} /> };
  }
  return { ok: true, contexto, sessao, empresa };
}

export type CargaDaOferta =
  | { readonly ok: false; readonly resposta: ReactNode }
  | {
      readonly ok: true;
      readonly contexto: ContextoDoUsuario;
      readonly sessao: SupabaseClient;
      readonly empresa: Empresa;
      readonly oferta: Oferta;
      readonly ator: AtorDaOferta;
      /**
       * Publicada ou reservada com a validade vencida, à espera da rodada da
       * expiração: já se comporta como expirada (ADR-0003 §2.9).
       */
      readonly vencidaAntesDaExpiracao: boolean;
      /** O ator altera o conteúdo no estado atual (ADR-0003 §2.5). */
      readonly editavel: boolean;
      /** `/empresa/<empresa>/ofertas/<oferta>`. */
      readonly base: string;
    };

/** Acesso, empresa e oferta, para todas as páginas de uma oferta. */
export async function carregarOferta(
  empresaId: string,
  ofertaId: string,
  sufixo: string,
): Promise<CargaDaOferta> {
  const base = caminhoDaOferta(empresaId, ofertaId);
  const empresa = await carregarEmpresaDasOfertas(
    empresaId,
    `${base}${sufixo}`,
  );
  if (!empresa.ok) return empresa;
  const inexistente = {
    ok: false as const,
    resposta: (
      <RegistroInexistente
        voltarPara={caminhoDasOfertas(empresaId)}
        rotuloDaVolta="Voltar às ofertas"
      />
    ),
  };
  if (!campoId.safeParse(ofertaId).success) return inexistente;
  const oferta = await obterOferta(empresa.sessao, ofertaId);
  if (oferta?.empresaId !== empresaId) return inexistente;
  const ator = atorDaOferta(empresa.contexto, empresaId);
  const vencida = validadeVencida(oferta.validaAte);
  return {
    ...empresa,
    oferta,
    ator,
    vencidaAntesDaExpiracao: vencidaAntesDaExpiracao(oferta.status, vencida),
    editavel: podeEditarConteudo(oferta.status, ator, vencida),
    base,
  };
}

/** Título, situação e navegação das etapas, no topo de cada página da oferta. */
export function PaginaDaOferta({
  carga,
  atual,
  children,
}: {
  readonly carga: Extract<CargaDaOferta, { ok: true }>;
  readonly atual: EtapaDaOferta;
  readonly children: ReactNode;
}) {
  const { oferta, empresa } = carga;
  return (
    <Pagina
      titulo={tituloDaOferta(oferta.veiculo)}
      descricao={
        <p>
          Situação:{" "}
          <strong data-situacao={oferta.status}>
            {ROTULO_DO_STATUS[oferta.status]}
          </strong>
          {oferta.versaoAtual === null
            ? ""
            : ` · versão ${String(oferta.versaoAtual)}`}{" "}
          · {empresa.nome}
          {oferta.dadosDeTeste ? " · dados de teste" : ""}
        </p>
      }
    >
      <NavegacaoDaOferta base={carga.base} atual={atual} />
      {children}
      <p>
        <Link href={caminhoDasOfertas(empresa.id)} className={LINK}>
          Voltar às ofertas
        </Link>
      </p>
    </Pagina>
  );
}
