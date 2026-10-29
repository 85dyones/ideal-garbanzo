/** Esquema da consulta dos estados documentais da oferta. Estrito. */
import { z } from "zod";
import { id } from "@/lib/operacao/campos";

export const esquemaDosEstados = z.strictObject({ ofertaId: id });
