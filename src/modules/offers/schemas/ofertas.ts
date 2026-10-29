/**
 * Esquemas das operações da oferta (ADR-0003 §2.4, §2.5, §2.9 a §2.12 e
 * §2.15). Todos são estritos: campo a mais no payload é erro, não é ignorado
 * (CT12.5). Os limites repetem os CHECKs da migração `20261029120000_ofertas`.
 */
import { z } from "zod";
import { id, textoDeLinha, textoLivre } from "@/lib/operacao/campos";
import { VALORES_DECLARADOS } from "@/modules/documental/rules/estados";
import {
  CATEGORIAS_DA_SUSPENSAO,
  FORMATO_DO_PRECO,
  UFS,
} from "../rules/oferta";
import {
  FORMATO_DA_PLACA,
  FORMATO_DO_CHASSI,
  anosCoerentes,
  normalizarChassi,
  normalizarPlaca,
  normalizarRenavam,
  renavamValido,
} from "../rules/veiculo";

const placa = z
  .string()
  .transform(normalizarPlaca)
  .pipe(
    z.string().regex(FORMATO_DA_PLACA, {
      error: "Use a placa no formato AAA9999 ou AAA9A99.",
    }),
  );

const renavam = z
  .string()
  .transform(normalizarRenavam)
  .pipe(
    z.string().refine(renavamValido, {
      error: "RENAVAM inválido. Confira os dígitos.",
    }),
  );

const chassi = z
  .string()
  .transform(normalizarChassi)
  .pipe(
    z.string().regex(FORMATO_DO_CHASSI, {
      error: "O chassi tem 17 caracteres, sem as letras I, O e Q.",
    }),
  );

const veiculo = z
  .strictObject({
    marca: textoDeLinha(80).optional(),
    modelo: textoDeLinha(80).optional(),
    versao: textoDeLinha(120).optional(),
    anoDeFabricacao: z.int().min(1900).max(2100).optional(),
    anoDoModelo: z.int().min(1900).max(2101).optional(),
    quilometragem: z.int().min(0).max(9_999_999).optional(),
    combustivel: textoDeLinha(40).optional(),
    cambio: textoDeLinha(40).optional(),
    cor: textoDeLinha(40).optional(),
    carroceria: textoDeLinha(40).optional(),
    placa: placa.optional(),
    renavam: renavam.optional(),
    chassi: chassi.optional(),
  })
  .refine(
    ({ anoDeFabricacao, anoDoModelo }) =>
      anoDeFabricacao === undefined ||
      anoDoModelo === undefined ||
      anosCoerentes(anoDeFabricacao, anoDoModelo),
    {
      error: "O ano do modelo é o de fabricação ou o seguinte.",
      path: ["anoDoModelo"],
    },
  );

const preco = z
  .string()
  .trim()
  .regex(FORMATO_DO_PRECO, {
    error: "Informe o preço em reais, com ponto e até duas casas.",
  })
  .refine((valor) => Number(valor) > 0, {
    error: "O preço precisa ser maior que zero.",
  });

const dadosDaOferta = z.strictObject({
  preco: preco.optional(),
  condicoesComerciais: textoLivre(2000).optional(),
  cidade: textoDeLinha(120).optional(),
  uf: z.enum(UFS).optional(),
  /** Dia final da validade (AAAA-MM-DD), que vale até 23:59:59 de Brasília. */
  validaAte: z.iso.date({ error: "Data inválida." }).optional(),
});

export type DadosDoVeiculo = z.output<typeof veiculo>;
export type DadosDaOferta = z.output<typeof dadosDaOferta>;

export const esquemaDaCriacao = z.strictObject({
  empresaId: id,
  veiculo,
  oferta: dadosDaOferta.optional(),
});

function temCampo(objeto: object | undefined): boolean {
  return (
    objeto !== undefined &&
    Object.values(objeto).some((valor) => valor !== undefined)
  );
}

export const esquemaDaAlteracao = z
  .strictObject({
    ofertaId: id,
    veiculo: veiculo.optional(),
    oferta: dadosDaOferta.optional(),
  })
  .refine((dados) => temCampo(dados.veiculo) || temCampo(dados.oferta), {
    error: "Informe ao menos um campo.",
  });

export const esquemaDaDeclaracao = z
  .strictObject({
    ofertaId: id,
    categoria: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, { error: "Categoria inválida." }),
    /** "Desconhece" é escolha explícita, nunca valor padrão (§5.3). */
    valor: z.enum(VALORES_DECLARADOS),
    detalhe: textoLivre(2000).optional(),
  })
  .refine((dados) => dados.valor !== "has_occurrence" || dados.detalhe, {
    error: "Descreva a ocorrência.",
    path: ["detalhe"],
  });

const declaracaoDaLista = z
  .strictObject({
    categoria: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, { error: "Categoria inválida." }),
    valor: z.enum(VALORES_DECLARADOS),
    detalhe: textoLivre(2000).optional(),
  })
  .refine((dados) => dados.valor !== "has_occurrence" || dados.detalhe, {
    error: "Descreva a ocorrência.",
    path: ["detalhe"],
  });

/** Várias categorias de uma vez, cada uma no máximo uma vez. */
export const esquemaDasDeclaracoes = z
  .strictObject({
    ofertaId: id,
    declaracoes: z.array(declaracaoDaLista).min(1).max(30),
  })
  .refine(
    ({ declaracoes }) =>
      new Set(declaracoes.map((d) => d.categoria)).size === declaracoes.length,
    { error: "Cada categoria aparece uma vez só.", path: ["declaracoes"] },
  );

export const esquemaDaOferta = z.strictObject({ ofertaId: id });

/** A autorização de divulgação é declarada a cada envio ou publicação (§2.12). */
export const esquemaDaPublicacao = z.strictObject({
  ofertaId: id,
  autorizacaoDeDivulgacao: z.literal(true, {
    error: "Declare a autorização de divulgação para publicar.",
  }),
});

const motivo = textoLivre(1000);

export const esquemaDaRevisao = z
  .strictObject({
    ofertaId: id,
    decisao: z.enum(["publicar", "devolver"]),
    motivo: motivo.optional(),
  })
  .refine((dados) => dados.decisao !== "devolver" || dados.motivo, {
    error: "Informe o motivo da devolução.",
    path: ["motivo"],
  });

/** O motivo é obrigatório para a plataforma; o servidor confere pelo ator. */
export const esquemaDaRetirada = z.strictObject({
  ofertaId: id,
  motivo: motivo.optional(),
});

export const esquemaDaSuspensao = z.strictObject({
  ofertaId: id,
  categoria: z.enum(CATEGORIAS_DA_SUSPENSAO),
  motivo,
});

export const esquemaDaReativacao = z.strictObject({ ofertaId: id, motivo });
