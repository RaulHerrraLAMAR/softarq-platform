import type { CorreccionRespuesta, EventoRespuestaCliente, RegistroRespuesta, SeguimientoEmision } from "@softarq/contracts";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ContextoOrganizacion } from "../../catalogos/persistencia/repositorio-catalogos.js";
import { fechaDeColumna as fechaIso } from "../../../infraestructura/prisma/fechas.js";
import type { Reloj } from "../../calculo/aplicacion/reloj.js";
import { validarFechaRespuesta, vigenciaDocumento } from "../dominio/respuesta-cliente.js";
import { RepositorioRespuestas } from "../infraestructura/repositorio-respuestas.js";
import { ErrorNegocio } from "./errores.js";
import { ejecutarIdempotente, prepararIdempotencia } from "./idempotencia.js";
import type { RelojInstante } from "./servicio-clientes.js";
import type { Actor } from "./servicio-revisiones.js";

const noEncontrado = () => new ErrorNegocio("NO_ENCONTRADO", "La emisión o respuesta no existe en su organización.");
export class ServicioRespuestas {
  private readonly repo: RepositorioRespuestas;
  constructor(private readonly db: PrismaClient, private readonly reloj: Reloj, private readonly instante: RelojInstante, private readonly zona: string) {
    this.repo = new RepositorioRespuestas(db);
  }

  async seguimiento(ctx: ContextoOrganizacion, actor: Actor, id: string, antesDe?: number): Promise<SeguimientoEmision> {
    // Lectura coherente del documento, la cabeza y su página; nunca una transacción de escritura.
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const repo = new RepositorioRespuestas(tx);
      const e = await repo.emision(ctx, id);
      if (!e) throw noEncontrado();
      const sustituida = await repo.sustituida(ctx, e.cotizacionId, e.versionNumero);
      const actual = await repo.actual(ctx, id);
      const pagina = await repo.pagina(ctx, id, antesDe);
      const hoy = this.reloj.hoy();
      const puedeRegistrar = actor.capacidades.includes("respuestas.registrar");
      const puedeCorregir = actor.capacidades.includes("respuestas.corregir");
      const motivoRegistrar = !puedeRegistrar ? "Solo un Preparador puede registrar la respuesta recibida."
        : sustituida ? "El documento fue sustituido por otra emisión; solo se consulta su historial."
          : actual ? "Ya existe una respuesta: utilice la corrección con motivo." : null;
      const motivoCorregir = !puedeCorregir ? "Solo un Preparador puede corregir un registro interno."
        : !actual ? "No existe un registro que corregir." : null;
      return { emisionId: id, cotizacionId: e.cotizacionId, versionId: e.versionId, idVersion: `${e.folio}-v${e.versionNumero}`,
        fechaEmision: fechaIso(e.fechaEmision), vigenteHasta: fechaIso(e.vigenteHasta), sustituida,
        vigencia: { estado: vigenciaDocumento(fechaIso(e.vigenteHasta), hoy), fechaServidor: hoy, zonaHoraria: this.zona },
        respuestaVigente: actual, ...pagina,
        acciones: { registrar: { permitida: motivoRegistrar === null, motivo: motivoRegistrar }, corregir: { permitida: motivoCorregir === null, motivo: motivoCorregir } } };
    }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
  }

  async registrar(ctx: ContextoOrganizacion, actor: Actor, emisionId: string, anteriorId: string | null,
    datos: RegistroRespuesta | CorreccionRespuesta, clave: string): Promise<{ evento: EventoRespuestaCliente; reproducida: boolean }> {
    const capacidad = anteriorId ? "respuestas.corregir" : "respuestas.registrar";
    if (!actor.capacidades.includes(capacidad)) throw new ErrorNegocio("SIN_PERMISO", "Solo un Preparador puede registrar o corregir respuestas.");
    const ahora = this.instante.ahora();
    const hoy = this.reloj.hoy();
    const idem = prepararIdempotencia(clave, anteriorId ? "corregir_respuesta" : "registrar_respuesta", { emisionId, ...(anteriorId ? { anteriorId } : {}) }, datos, ahora);
    try {
      const resultado = await ejecutarIdempotente(this.repo, ctx, actor, idem, ahora, async () => {
        const e = await this.repo.emision(ctx, emisionId);
        if (!e) throw noEncontrado();
        if (anteriorId && !(await this.repo.evento(ctx, emisionId, anteriorId))) throw noEncontrado();
        validarFechaRespuesta(datos.fechaRespuesta, { fechaEmision: fechaIso(e.fechaEmision), vigenteHasta: fechaIso(e.vigenteHasta) }, hoy);
        return this.repo.registrar(ctx, actor, emisionId, anteriorId, datos, hoy, ahora, idem);
      });
      const evento = await this.repo.evento(ctx, emisionId, resultado.id);
      if (!evento) throw noEncontrado();
      // En un reintento se devuelve el evento original, aunque después haya sido corregido.
      return { evento, reproducida: resultado.reproducida };
    } catch (e) {
      if (e instanceof ErrorNegocio && (e.codigo === "CONFLICTO_RESPUESTA" || e.codigo === "EMISION_SUSTITUIDA")) {
        throw new ErrorNegocio(e.codigo, e.message, { seguimientoVigente: await this.seguimiento(ctx, actor, emisionId) });
      }
      throw e;
    }
  }
}
