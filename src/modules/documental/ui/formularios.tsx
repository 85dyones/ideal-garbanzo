"use client";
/**
 * Formulários do domínio documental (I3.6): registrar consulta com evidência
 * opcional, abrir a evidência, abrir e fechar a revisão documental e resolver
 * o impedimento de transferência. A página mostra cada formulário só a quem a
 * regra de `rules/registro.ts` permite; a operação e o banco decidem de novo.
 *
 * A URL da evidência nunca vai para o HTML de antemão: o botão chama a ação,
 * que registra o acesso antes de gerar o link temporário (ADR-0004 §2.8).
 */
import {
  useActionState,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { localParaIso, paraCampoLocal } from "@/app/_apoio/datas";
import {
  ESTADO_INICIAL,
  type AcaoDoFormulario,
  type EstadoDoFormulario,
} from "@/app/_apoio/formulario";
import {
  BOTAO_DE_RISCO,
  BOTAO_SECUNDARIO,
  CAMPO,
  LINK,
} from "@/components/estilos";
import {
  AreaDeTexto,
  BotaoDeEnvio,
  Campo,
  CampoDeSelecao,
  ErrosDoCampo,
  MensagemDoFormulario,
} from "@/components/formulario";
import {
  RESULTADOS_DA_CONSULTA,
  ROTULO_DO_RESULTADO,
  ROTULO_DO_TIPO_DE_FONTE,
  TIPOS_DE_FONTE,
} from "../rules/estados";
import {
  EXPLICACAO_DO_RESULTADO,
  TEXTO_DOCUMENTAL,
  rotuloDoLinkDaEvidencia,
  type OpcaoDeSubstituicao,
} from "./ficha";

const TIPOS_DE_ARQUIVO_ACEITOS =
  "application/pdf,image/jpeg,image/png,image/webp";
const CAIXA = "flex flex-col gap-3 rounded border border-neutral-200 p-3";
const CAIXA_DE_RISCO = `${CAIXA} border-l-4 border-l-red-700`;

const OPCOES_DO_TIPO_DE_FONTE: readonly (readonly [string, string])[] = [
  ["", "Selecione"],
  ...TIPOS_DE_FONTE.map(
    (tipo) => [tipo, ROTULO_DO_TIPO_DE_FONTE[tipo]] as const,
  ),
];

/**
 * Link temporário da evidência, com a hora em que deixa de valer
 * (TV-I3.6-09). Depois dela, o link some e fica o aviso; o botão gera outro.
 */
function LinkTemporario({
  url,
  expiraEm,
}: {
  readonly url: string;
  readonly expiraEm: string | undefined;
}) {
  const [expirado, setExpirado] = useState(false);
  useEffect(() => {
    if (expiraEm === undefined) return undefined;
    const restante = Math.max(0, Date.parse(expiraEm) - Date.now());
    const relogio = setTimeout(() => {
      setExpirado(true);
    }, restante);
    return () => {
      clearTimeout(relogio);
    };
  }, [expiraEm]);
  if (expirado) {
    return (
      <p role="status" className="text-sm text-neutral-700">
        {TEXTO_DOCUMENTAL.linkExpirado}
      </p>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK}>
      {rotuloDoLinkDaEvidencia(expiraEm)}
    </a>
  );
}

/** Gera a URL temporária da evidência; o servidor registra o acesso antes. */
export function AberturaDaEvidencia({
  evidenciaId,
  rotulo,
  acao,
}: {
  readonly evidenciaId: string;
  readonly rotulo: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="evidenciaId" value={evidenciaId} />
      <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>{rotulo}</BotaoDeEnvio>
      {estado.situacao === "sucesso" && estado.url !== undefined ? (
        // A chave recomeça o relógio a cada link novo.
        <LinkTemporario
          key={String(estado.envios)}
          url={estado.url}
          expiraEm={estado.valores?.expiraEm}
        />
      ) : (
        <MensagemDoFormulario estado={estado} />
      )}
    </form>
  );
}

function CampoDaData({
  inicial,
  erros,
}: {
  readonly inicial: string;
  readonly erros: readonly string[] | undefined;
}) {
  const id = useId();
  const [dataLocal, setDataLocal] = useState(inicial);
  const temErro = (erros?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Data e hora da consulta
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="datetime-local"
          className={`${CAMPO} sm:w-auto`}
          value={dataLocal}
          aria-invalid={temErro ? true : undefined}
          aria-describedby={`${id}-dica ${id}-erro`}
          onChange={(evento) => {
            setDataLocal(evento.target.value);
          }}
        />
        <button
          type="button"
          className={BOTAO_SECUNDARIO}
          onClick={() => {
            setDataLocal(paraCampoLocal(new Date()));
          }}
        >
          Agora
        </button>
      </div>
      <p id={`${id}-dica`} className="text-sm text-neutral-600">
        {TEXTO_DOCUMENTAL.dicaDaData}
      </p>
      {/* O navegador conhece o fuso de quem preencheu: a conversão para ISO é feita aqui. */}
      <input
        type="hidden"
        name="realizadaEm"
        value={localParaIso(dataLocal) ?? ""}
      />
      <input type="hidden" name="realizadaEmLocal" value={dataLocal} />
      <ErrosDoCampo id={`${id}-erro`} erros={erros} />
    </div>
  );
}

function CamposDaConsulta({
  estado,
  categorias,
  substituiveis,
  dicaDaSubstituicao,
}: {
  readonly estado: EstadoDoFormulario;
  readonly categorias: readonly (readonly [string, string])[];
  readonly substituiveis: readonly OpcaoDeSubstituicao[];
  readonly dicaDaSubstituicao: string;
}) {
  const valores = estado.valores ?? {};
  const idDoResultado = useId();
  // A categoria escolhida só filtra as consultas que podem ser substituídas.
  // O campo fica sem controle, como os demais: o React recompõe o formulário
  // depois de cada envio, e o campo volta ao valor padrão devolvido.
  const [categoria, setCategoria] = useState(valores.categoria ?? "");
  const opcoesDeSubstituicao = substituiveis.filter(
    (opcao) => opcao.categoria === categoria,
  );
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDeSelecao
          nome="categoria"
          rotulo="Categoria da consulta"
          opcoes={[["", "Selecione"], ...categorias]}
          defaultValue={valores.categoria ?? ""}
          onChange={(evento) => {
            setCategoria(evento.target.value);
          }}
          erros={estado.campos.categoria}
        />
        <CampoDeSelecao
          nome="tipoDeFonte"
          rotulo="Tipo da fonte"
          opcoes={OPCOES_DO_TIPO_DE_FONTE}
          defaultValue={valores.tipoDeFonte ?? ""}
          erros={estado.campos.tipoDeFonte}
        />
      </div>
      <Campo
        nome="fonte"
        rotulo="Fonte consultada"
        maxLength={200}
        dica={TEXTO_DOCUMENTAL.dicaDaFonte}
        defaultValue={valores.fonte}
        erros={estado.campos.fonte}
      />
      <CampoDaData
        inicial={valores.realizadaEmLocal ?? ""}
        erros={estado.campos.realizadaEm}
      />
      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={`${idDoResultado}-dica ${idDoResultado}-erro`}
      >
        <legend className="text-sm font-medium">Resultado da consulta</legend>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-4">
          {RESULTADOS_DA_CONSULTA.map((resultado) => (
            <label key={resultado} className="flex items-center gap-2 py-2">
              <input
                type="radio"
                name="resultado"
                value={resultado}
                defaultChecked={valores.resultado === resultado}
              />
              {ROTULO_DO_RESULTADO[resultado]}
            </label>
          ))}
        </div>
        <p id={`${idDoResultado}-dica`} className="text-sm text-neutral-600">
          {ROTULO_DO_RESULTADO.awaiting_result}:{" "}
          {EXPLICACAO_DO_RESULTADO.awaiting_result}{" "}
          {ROTULO_DO_RESULTADO.inconclusive}:{" "}
          {EXPLICACAO_DO_RESULTADO.inconclusive}
        </p>
        <ErrosDoCampo
          id={`${idDoResultado}-erro`}
          erros={estado.campos.resultado}
        />
      </fieldset>
      <AreaDeTexto
        nome="resumo"
        rotulo="Resumo do resultado"
        maxLength={2000}
        defaultValue={valores.resumo}
        erros={estado.campos.resumo}
      />
      <AreaDeTexto
        nome="limitacoes"
        rotulo="Limitações conhecidas da fonte"
        maxLength={2000}
        dica={TEXTO_DOCUMENTAL.dicaDasLimitacoes}
        defaultValue={valores.limitacoes}
        erros={estado.campos.limitacoes}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          nome="protocolo"
          rotulo="Protocolo (opcional)"
          maxLength={200}
          defaultValue={valores.protocolo}
          erros={estado.campos.protocolo}
        />
        <Campo
          nome="arquivo"
          rotulo="Evidência (opcional)"
          type="file"
          accept={TIPOS_DE_ARQUIVO_ACEITOS}
          dica={TEXTO_DOCUMENTAL.dicaDaEvidencia}
          erros={estado.campos.arquivo}
        />
      </div>
      {opcoesDeSubstituicao.length === 0 ? null : (
        // A chave recomeça a escolha quando a categoria muda.
        <CampoDeSelecao
          key={`substitui-${categoria}`}
          nome="substitui"
          rotulo="Esta consulta substitui (opcional)"
          opcoes={[
            ["", "Não substitui nenhuma consulta"],
            ...opcoesDeSubstituicao.map(
              (opcao) => [opcao.id, opcao.rotulo] as const,
            ),
          ]}
          defaultValue={
            categoria === (valores.categoria ?? "")
              ? (valores.substitui ?? "")
              : ""
          }
          dica={dicaDaSubstituicao}
          erros={estado.campos.substitui}
        />
      )}
    </>
  );
}

/** Registro manual da consulta (§6.3), com a evidência opcional. */
export function RegistroDeConsulta({
  ofertaId,
  categorias,
  substituiveis,
  dicaDaSubstituicao,
  acao,
}: {
  readonly ofertaId: string;
  /** Categorias da configuração: código e rótulo. */
  readonly categorias: readonly (readonly [string, string])[];
  readonly substituiveis: readonly OpcaoDeSubstituicao[];
  readonly dicaDaSubstituicao: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form
      action={enviar}
      className={CAIXA}
      noValidate
      aria-label="Registrar consulta"
    >
      <input type="hidden" name="ofertaId" value={ofertaId} />
      {/* A cada resposta, os campos recomeçam: vazios depois de gravar, com o que foi digitado se houve erro. */}
      <CamposDaConsulta
        key={String(estado.envios)}
        estado={estado}
        categorias={categorias}
        substituiveis={substituiveis}
        dicaDaSubstituicao={dicaDaSubstituicao}
      />
      <MensagemDoFormulario estado={estado} />
      <div>
        <BotaoDeEnvio>Registrar consulta</BotaoDeEnvio>
      </div>
    </form>
  );
}

/**
 * Abrir ou fechar a revisão documental de uma categoria, com motivo. Sem
 * categoria para escolher, o formulário fica com o aviso no lugar dos campos e
 * guarda a mensagem do último envio.
 */
export function MudancaDaRevisao({
  ofertaId,
  titulo,
  rotuloDaCategoria,
  opcoes,
  semOpcoes,
  rotuloDoMotivo,
  dica,
  rotuloDoBotao,
  acao,
}: {
  readonly ofertaId: string;
  /** Nome acessível do formulário. */
  readonly titulo: string;
  readonly rotuloDaCategoria: string;
  readonly opcoes: readonly (readonly [string, string])[];
  readonly semOpcoes: string;
  readonly rotuloDoMotivo: string;
  readonly dica?: string;
  readonly rotuloDoBotao: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  return (
    <form action={enviar} className={CAIXA} noValidate aria-label={titulo}>
      <input type="hidden" name="ofertaId" value={ofertaId} />
      {opcoes.length === 0 ? (
        <p className="text-sm text-neutral-700">{semOpcoes}</p>
      ) : (
        <>
          <CampoDeSelecao
            key={`categoria-${String(estado.envios)}`}
            nome="categoria"
            rotulo={rotuloDaCategoria}
            opcoes={[["", "Selecione"], ...opcoes]}
            defaultValue={estado.valores?.categoria ?? ""}
            erros={estado.campos.categoria}
          />
          <AreaDeTexto
            nome="motivo"
            rotulo={rotuloDoMotivo}
            maxLength={1000}
            rows={3}
            dica={dica}
            defaultValue={estado.valores?.motivo}
            erros={estado.campos.motivo}
          />
        </>
      )}
      <MensagemDoFormulario estado={estado} />
      {opcoes.length === 0 ? null : (
        <div>
          <BotaoDeEnvio classe={BOTAO_SECUNDARIO}>{rotuloDoBotao}</BotaoDeEnvio>
        </div>
      )}
    </form>
  );
}

/**
 * Resolução do impedimento (só o administrador; E21): motivo e evidência da
 * regularização, os dois obrigatórios. Sem impedimento ativo, fica o aviso e a
 * mensagem do último envio.
 */
export function ResolucaoDoImpedimento({
  impedimentos,
  semImpedimento,
  acao,
}: {
  /** Impedimentos ativos: id e texto de leitura. */
  readonly impedimentos: readonly (readonly [string, string])[];
  readonly semImpedimento: string;
  readonly acao: AcaoDoFormulario;
}) {
  const [estado, enviar] = useActionState(acao, ESTADO_INICIAL);
  const [unico] = impedimentos;
  let escolha: ReactNode = null;
  if (impedimentos.length === 1 && unico !== undefined) {
    escolha = (
      <>
        <input type="hidden" name="impedimentoId" value={unico[0]} />
        <p className="break-words text-sm">Impedimento: {unico[1]}</p>
      </>
    );
  } else if (impedimentos.length > 1) {
    escolha = (
      <CampoDeSelecao
        key={`impedimento-${String(estado.envios)}`}
        nome="impedimentoId"
        rotulo="Impedimento a resolver"
        opcoes={[["", "Selecione"], ...impedimentos]}
        defaultValue={estado.valores?.impedimentoId ?? ""}
        erros={estado.campos.impedimentoId}
      />
    );
  }
  return (
    <form
      action={enviar}
      className={CAIXA_DE_RISCO}
      noValidate
      aria-label="Resolver impedimento de transferência"
    >
      {impedimentos.length === 0 ? (
        <p className="text-sm text-neutral-700">{semImpedimento}</p>
      ) : (
        <>
          {escolha}
          <AreaDeTexto
            nome="motivo"
            rotulo="Motivo da resolução"
            maxLength={1000}
            rows={3}
            defaultValue={estado.valores?.motivo}
            erros={estado.campos.motivo}
          />
          <Campo
            nome="arquivo"
            rotulo="Evidência da regularização"
            type="file"
            accept={TIPOS_DE_ARQUIVO_ACEITOS}
            dica={TEXTO_DOCUMENTAL.dicaDaEvidencia}
            erros={estado.campos.arquivo}
          />
        </>
      )}
      <MensagemDoFormulario estado={estado} />
      {impedimentos.length === 0 ? null : (
        <div>
          <BotaoDeEnvio classe={BOTAO_DE_RISCO}>
            Resolver o impedimento
          </BotaoDeEnvio>
        </div>
      )}
    </form>
  );
}
