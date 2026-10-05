import { LIMITES_RESPUESTAS, type EventoRespuestaCliente, type RegistroRespuesta, type CorreccionRespuesta } from "@softarq/contracts";
import type { RespuestaClienteEvento } from "../../../generated/prisma/client.js";
import { fechaDeColumna as fechaIso } from "../../../infraestructura/prisma/fechas.js";
import type { Db, ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import type { Autor } from "./repositorio-cotizaciones.js";
import type { Idempotencia, RegistroIdempotencia } from "../aplicacion/idempotencia.js";

export function presentarRespuesta(f: RespuestaClienteEvento): EventoRespuestaCliente {
  return { id: f.id, emisionId: f.emisionId, numero: f.numero, anteriorId: f.anteriorId,
    tipo: f.tipo as EventoRespuestaCliente["tipo"], resultado: f.resultado as EventoRespuestaCliente["resultado"],
    fechaRespuesta: fechaIso(f.fechaRespuesta), nota: f.nota, registradoPor: f.registradoPor,
    registradoNombre: f.registradoNombre, registradoEn: f.registradoEn.toISOString(), fechaRegistro: fechaIso(f.fechaRegistro), motivo: f.motivo };
}

export class RepositorioRespuestas {
  constructor(private readonly db: Db) {}

  emision(ctx: ContextoOrganizacion, id: string) {
    return this.db.emision.findFirst({ where: { id, organizacionId: ctx.organizacionId },
      select: { id: true, cotizacionId: true, versionId: true, versionNumero: true, folio: true, fechaEmision: true, vigenteHasta: true } });
  }
  async sustituida(ctx: ContextoOrganizacion, cotizacionId: string, numero: number) {
    return (await this.db.emision.count({ where: { organizacionId: ctx.organizacionId, cotizacionId, versionNumero: { gt: numero } } })) > 0;
  }
  async actual(ctx: ContextoOrganizacion, emisionId: string) {
    const f = await this.db.respuestaClienteEvento.findFirst({ where: { organizacionId: ctx.organizacionId, emisionId }, orderBy: { numero: "desc" } });
    return f ? presentarRespuesta(f) : null;
  }
  async pagina(ctx: ContextoOrganizacion, emisionId: string, antesDe?: number) {
    const f = await this.db.respuestaClienteEvento.findMany({
      where: { organizacionId: ctx.organizacionId, emisionId, ...(antesDe ? { numero: { lt: antesDe } } : {}) },
      orderBy: { numero: "desc" }, take: LIMITES_RESPUESTAS.pagina + 1,
    });
    const pagina = f.slice(0, LIMITES_RESPUESTAS.pagina).map(presentarRespuesta);
    return { historial: pagina, siguienteAntesDe: f.length > LIMITES_RESPUESTAS.pagina ? pagina.at(-1)!.numero : null };
  }
  async evento(ctx: ContextoOrganizacion, emisionId: string, id: string) {
    const f = await this.db.respuestaClienteEvento.findFirst({ where: { organizacionId: ctx.organizacionId, emisionId, id } });
    return f ? presentarRespuesta(f) : null;
  }
  buscarIdempotencia(ctx: ContextoOrganizacion, autor: Autor, clave: string): Promise<RegistroIdempotencia | null> {
    return this.db.idempotencia.findUnique({ where: { organizacionId_usuarioId_clave: { organizacionId: ctx.organizacionId, usuarioId: autor.usuarioId, clave } } });
  }
  async registrar(ctx: ContextoOrganizacion, autor: Autor, emisionId: string, anteriorId: string | null,
    datos: RegistroRespuesta | CorreccionRespuesta, fecha: string, instante: Date, idem: Idempotencia) {
    const r = await this.db.$queryRaw<{ id: string }[]>`
      SELECT softarq_registrar_respuesta(${ctx.organizacionId}::uuid,${autor.usuarioId}::uuid,${emisionId}::uuid,
        ${anteriorId}::uuid,${JSON.stringify(datos)}::jsonb,${fecha}::date,${instante}::timestamptz,
        ${idem.clave}::uuid,${idem.operacion},${idem.huella},${idem.expiraEn}::timestamptz)::text AS id`;
    return r[0]!.id;
  }
}
