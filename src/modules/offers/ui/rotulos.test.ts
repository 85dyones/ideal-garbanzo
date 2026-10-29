import { describe, expect, it } from "vitest";
import { varrerTexto } from "@/lib/linguagem-proibida";
import { AVISOS } from "@/modules/documental/rules/avisos";
import {
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ESTADO,
  ROTULO_DO_VALOR_DECLARADO,
} from "@/modules/documental/rules/estados";
import { rotuloDaPendencia } from "../rules/oferta";
import {
  ATORES_DA_OFERTA,
  ROTULO_DO_STATUS,
  STATUS_DA_OFERTA,
} from "../rules/transicoes";
import { TIPOS_DE_DOCUMENTO } from "../storage/arquivos";
import {
  ETAPAS_DA_OFERTA,
  ROTULO_DA_DECISAO_DA_REVISAO,
  ROTULO_DO_CAMPO,
  ROTULO_DO_TIPO_DE_DOCUMENTO,
  TEXTO,
  motivoDaEtapaSoLeitura,
  orientacaoDoStatus,
  resumoDaMudanca,
  rotuloDoCampo,
  tituloDaOferta,
} from "./rotulos";

/** Colunas de `offers` e `vehicles` que o `field_history` pode registrar. */
const COLUNAS_DO_HISTORICO = [
  "make",
  "model",
  "version",
  "manufacture_year",
  "model_year",
  "mileage_km",
  "fuel_type",
  "transmission",
  "color",
  "body_type",
  "plate",
  "renavam",
  "chassis",
  "status",
  "asking_price",
  "commercial_conditions",
  "location_city",
  "location_state",
  "valid_until",
  "availability_confirmed_at",
  "publication_authorized_by",
  "publication_authorized_at",
  "published_at",
  "withdrawn_by",
  "withdrawn_at",
  "withdrawn_reason",
  "suspended_category",
  "suspended_reason",
  "suspended_by",
  "suspended_at",
];

/** Todos os textos que as telas da oferta mostram, para o teste de linguagem. */
function textosDasTelas(): string[] {
  const pendencias = [
    "supplier",
    "make",
    "location",
    "asking_price",
    "commercial_conditions",
    "valid_until",
    "transfer_impediment",
    "declaration:auction",
  ].map(rotuloDaPendencia);
  return [
    ...Object.values(ROTULO_DO_TIPO_DE_DOCUMENTO),
    ...Object.values(ROTULO_DA_DECISAO_DA_REVISAO),
    ...Object.values(ROTULO_DO_CAMPO),
    ...Object.values(TEXTO),
    ...ETAPAS_DA_OFERTA.map((etapa) => etapa.rotulo),
    ...Object.values(ROTULO_DO_STATUS),
    ...Object.values(AVISOS),
    ...Object.values(ROTULO_DO_ESTADO),
    ...Object.values(ROTULO_DA_ORIGEM),
    ...Object.values(ROTULO_DO_VALOR_DECLARADO),
    ...pendencias,
    ...STATUS_DA_OFERTA.flatMap((status) =>
      ATORES_DA_OFERTA.flatMap((ator) => [
        orientacaoDoStatus(status, ator),
        motivoDaEtapaSoLeitura(status, ator),
      ]),
    ),
  ];
}

describe("rótulos da oferta", () => {
  it("todo tipo de documento tem rótulo", () => {
    for (const tipo of TIPOS_DE_DOCUMENTO) {
      expect(ROTULO_DO_TIPO_DE_DOCUMENTO[tipo]).toBeTruthy();
    }
  });

  it("toda coluna do histórico tem rótulo; coluna nova aparece pelo nome", () => {
    for (const coluna of COLUNAS_DO_HISTORICO) {
      expect(rotuloDoCampo(coluna), coluna).not.toBe(coluna);
    }
    expect(rotuloDoCampo("coluna_nova")).toBe("coluna_nova");
  });

  it("toda situação tem orientação para o membro e para o administrador", () => {
    for (const status of STATUS_DA_OFERTA) {
      expect(orientacaoDoStatus(status, "membro")).toBeTruthy();
      expect(orientacaoDoStatus(status, "adm_empresa")).toBeTruthy();
    }
    expect(orientacaoDoStatus("draft", "membro")).toContain("administrador");
    expect(motivoDaEtapaSoLeitura("published", "membro")).toContain(
      "administrador",
    );
  });

  it("nenhum texto das telas usa linguagem proibida (§6.6)", () => {
    const textos = textosDasTelas();
    expect(textos.length).toBeGreaterThan(50);
    const achados = textos.flatMap((texto) =>
      varrerTexto(texto).map((ocorrencia) => `"${texto}": ${ocorrencia.termo}`),
    );
    expect(achados).toEqual([]);
  });

  it("o varredor pegaria um texto proibido nesta lista", () => {
    const proibido = "verificado"; // linguagem-permitida: prova do varredor
    expect(varrerTexto(`Veículo ${proibido}`)).not.toEqual([]);
  });
});

describe("resumo da mudança da versão", () => {
  it("traduz os caminhos do snapshot", () => {
    expect(resumoDaMudanca("versão inicial")).toBe("Versão inicial");
    expect(resumoDaMudanca("sem mudança")).toBe("Sem mudança");
    expect(
      resumoDaMudanca(
        "categories.auction, fields.asking_price, notices, transfer_impediments",
      ),
    ).toBe(
      "Declaração em Passagem por leilão; Preço; avisos documentais; impedimentos de transferência",
    );
    expect(resumoDaMudanca("fields.campo_novo")).toBe("Campo_novo");
  });
});

describe("título da oferta", () => {
  it("usa marca, modelo, versão e anos", () => {
    expect(
      tituloDaOferta({
        marca: "Fiat",
        modelo: "Argo",
        versao: "Drive 1.0",
        anoDeFabricacao: 2022,
        anoDoModelo: 2023,
      }),
    ).toBe("Fiat Argo Drive 1.0 2022/2023");
    expect(
      tituloDaOferta({
        marca: null,
        modelo: "Argo",
        versao: null,
        anoDeFabricacao: null,
        anoDoModelo: 2023,
      }),
    ).toBe("Argo 2023");
  });

  it("sem dados do veículo, um título neutro", () => {
    expect(tituloDaOferta(null)).toBe("Veículo sem identificação");
    expect(
      tituloDaOferta({
        marca: null,
        modelo: null,
        versao: null,
        anoDeFabricacao: null,
        anoDoModelo: null,
      }),
    ).toBe("Veículo sem identificação");
  });
});
