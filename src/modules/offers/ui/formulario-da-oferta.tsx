"use client";
/**
 * Formulário do veículo e das condições da oferta (I2.8): cria o rascunho
 * (primeira etapa) ou altera a oferta (etapas 1 e 3). O servidor normaliza e
 * confere tudo; aqui só há os rótulos, as dicas e os limites de tamanho.
 */
import { useActionState } from "react";
import { ESTADO_INICIAL, type AcaoDoFormulario } from "@/app/_apoio/formulario";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  MensagemDoFormulario,
} from "@/components/formulario";
import { Dados } from "@/components/pagina";
import { UFS } from "../rules/oferta";
import { TEXTO } from "./rotulos";

/** Valores iniciais dos campos, já no formato da tela (preço "65.000,00", data AAAA-MM-DD). */
export interface ValoresDaOferta {
  readonly marca: string;
  readonly modelo: string;
  readonly versao: string;
  readonly anoDeFabricacao: string;
  readonly anoDoModelo: string;
  readonly quilometragem: string;
  readonly combustivel: string;
  readonly cambio: string;
  readonly cor: string;
  readonly carroceria: string;
  readonly placa: string;
  readonly renavam: string;
  readonly chassi: string;
  readonly preco: string;
  readonly condicoesComerciais: string;
  readonly cidade: string;
  readonly uf: string;
  readonly validaAte: string;
}

export interface LimitesDaValidade {
  /** Primeiro dia aceito (hoje, em Brasília). */
  readonly minimo: string;
  /** Último dia aceito pelo teto da configuração; `null` sem teto lido. */
  readonly maximo: string | null;
  /** O mesmo teto, para leitura ("13/11/2026"). */
  readonly maximoParaLeitura: string | null;
}

const OPCOES_DE_UF = [
  ["", "Selecione"],
  ...UFS.map((uf) => [uf, uf] as const),
] as const;

function CamposDoVeiculo({
  iniciais,
  valores,
  erros,
  identidadeFixa,
}: {
  readonly iniciais: ValoresDaOferta;
  readonly valores: Readonly<Record<string, string>>;
  readonly erros: Readonly<Record<string, readonly string[]>>;
  readonly identidadeFixa: boolean;
}) {
  const valor = (nome: keyof ValoresDaOferta) =>
    valores[nome] ?? iniciais[nome];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-base font-semibold">Veículo</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          nome="marca"
          rotulo="Marca"
          maxLength={80}
          autoComplete="off"
          defaultValue={valor("marca")}
          erros={erros.marca}
        />
        <Campo
          nome="modelo"
          rotulo="Modelo"
          maxLength={80}
          autoComplete="off"
          defaultValue={valor("modelo")}
          erros={erros.modelo}
        />
        <Campo
          nome="versao"
          rotulo="Versão"
          maxLength={120}
          autoComplete="off"
          defaultValue={valor("versao")}
          erros={erros.versao}
        />
        <Campo
          nome="cor"
          rotulo="Cor"
          maxLength={40}
          autoComplete="off"
          defaultValue={valor("cor")}
          erros={erros.cor}
        />
        <Campo
          nome="anoDeFabricacao"
          rotulo="Ano de fabricação"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          defaultValue={valor("anoDeFabricacao")}
          erros={erros.anoDeFabricacao}
        />
        <Campo
          nome="anoDoModelo"
          rotulo="Ano do modelo"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          dica="O ano de fabricação ou o seguinte."
          defaultValue={valor("anoDoModelo")}
          erros={erros.anoDoModelo}
        />
        <Campo
          nome="quilometragem"
          rotulo="Quilometragem"
          inputMode="numeric"
          maxLength={9}
          autoComplete="off"
          dica="Em km, sem casas decimais. Ex.: 45.000"
          defaultValue={valor("quilometragem")}
          erros={erros.quilometragem}
        />
        <Campo
          nome="combustivel"
          rotulo="Combustível"
          maxLength={40}
          autoComplete="off"
          dica="Ex.: flex, gasolina, diesel."
          defaultValue={valor("combustivel")}
          erros={erros.combustivel}
        />
        <Campo
          nome="cambio"
          rotulo="Câmbio"
          maxLength={40}
          autoComplete="off"
          dica="Ex.: manual, automático."
          defaultValue={valor("cambio")}
          erros={erros.cambio}
        />
        <Campo
          nome="carroceria"
          rotulo="Carroceria"
          maxLength={40}
          autoComplete="off"
          dica="Ex.: hatch, sedã, picape."
          defaultValue={valor("carroceria")}
          erros={erros.carroceria}
        />
      </div>
      <p className="text-sm text-gray-700">{TEXTO.dadosRestritos}</p>
      {identidadeFixa ? (
        <>
          <Dados
            itens={[
              ["Placa", iniciais.placa === "" ? "—" : iniciais.placa],
              ["RENAVAM", iniciais.renavam === "" ? "—" : iniciais.renavam],
              ["Chassi", iniciais.chassi === "" ? "—" : iniciais.chassi],
            ]}
          />
          <p className="text-sm text-gray-700">{TEXTO.identidadeFixa}</p>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo
            nome="placa"
            rotulo="Placa"
            maxLength={8}
            autoComplete="off"
            autoCapitalize="characters"
            dica="Formato AAA9999 ou AAA9A99."
            defaultValue={valor("placa")}
            erros={erros.placa}
          />
          <Campo
            nome="renavam"
            rotulo="RENAVAM"
            inputMode="numeric"
            maxLength={13}
            autoComplete="off"
            dica="11 dígitos."
            defaultValue={valor("renavam")}
            erros={erros.renavam}
          />
          <Campo
            nome="chassi"
            rotulo="Chassi"
            maxLength={20}
            autoComplete="off"
            autoCapitalize="characters"
            dica="17 caracteres, sem as letras I, O e Q."
            defaultValue={valor("chassi")}
            erros={erros.chassi}
          />
        </div>
      )}
    </fieldset>
  );
}

function CamposDasCondicoes({
  iniciais,
  valores,
  erros,
  validade,
}: {
  readonly iniciais: ValoresDaOferta;
  readonly valores: Readonly<Record<string, string>>;
  readonly erros: Readonly<Record<string, readonly string[]>>;
  readonly validade: LimitesDaValidade;
}) {
  const valor = (nome: keyof ValoresDaOferta) =>
    valores[nome] ?? iniciais[nome];
  const dicaDaValidade =
    validade.maximoParaLeitura === null
      ? TEXTO.validade
      : `${TEXTO.validade} Escolha uma data até ${validade.maximoParaLeitura}.`;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-base font-semibold">Condições</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          nome="preco"
          rotulo="Preço (R$)"
          inputMode="decimal"
          maxLength={20}
          autoComplete="off"
          dica="Ex.: 65.000,00"
          defaultValue={valor("preco")}
          erros={erros.preco}
        />
        <Campo
          nome="validaAte"
          rotulo="Válida até"
          type="date"
          min={validade.minimo}
          max={validade.maximo ?? undefined}
          dica={dicaDaValidade}
          defaultValue={valor("validaAte")}
          erros={erros.validaAte}
        />
        <Campo
          nome="cidade"
          rotulo="Cidade"
          maxLength={120}
          autoComplete="address-level2"
          defaultValue={valor("cidade")}
          erros={erros.cidade}
        />
        <CampoDeSelecao
          nome="uf"
          rotulo="UF"
          opcoes={OPCOES_DE_UF}
          defaultValue={valor("uf")}
          erros={erros.uf}
        />
      </div>
      <AreaDeTexto
        nome="condicoesComerciais"
        rotulo="Condições comerciais"
        maxLength={2000}
        rows={4}
        dica="Forma de pagamento, prazos e o que mais for combinado na negociação."
        defaultValue={valor("condicoesComerciais")}
        erros={erros.condicoesComerciais}
      />
    </fieldset>
  );
}

export function FormularioDaOferta({
  modo,
  empresaId,
  ofertaId,
  partes,
  iniciais,
  identidadeFixa = false,
  validade,
  rotuloDoBotao,
  acao,
}: {
  readonly modo: "criar" | "alterar";
  readonly empresaId?: string;
  readonly ofertaId?: string;
  readonly partes: { readonly veiculo: boolean; readonly condicoes: boolean };
  readonly iniciais: ValoresDaOferta;
  readonly identidadeFixa?: boolean;
  readonly validade: LimitesDaValidade;
  readonly rotuloDoBotao: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const valores = estado.valores ?? {};
  const listaDePartes = [
    partes.veiculo ? "veiculo" : null,
    partes.condicoes ? "condicoes" : null,
  ]
    .filter((parte) => parte !== null)
    .join(",");
  return (
    <form action={enviar} className="flex flex-col gap-5" noValidate>
      {empresaId === undefined ? null : (
        <input type="hidden" name="empresaId" value={empresaId} />
      )}
      {ofertaId === undefined ? null : (
        <input type="hidden" name="ofertaId" value={ofertaId} />
      )}
      <input type="hidden" name="partes" value={listaDePartes} />
      {modo === "alterar" ? (
        <p className="text-sm text-gray-700">
          {TEXTO.campoEmBrancoNaAlteracao}
        </p>
      ) : null}
      {partes.veiculo ? (
        <CamposDoVeiculo
          iniciais={iniciais}
          valores={valores}
          erros={estado.campos}
          identidadeFixa={identidadeFixa}
        />
      ) : null}
      {partes.condicoes ? (
        <CamposDasCondicoes
          iniciais={iniciais}
          valores={valores}
          erros={estado.campos}
          validade={validade}
        />
      ) : null}
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio>{rotuloDoBotao}</BotaoDeEnvio>
      </div>
    </form>
  );
}
