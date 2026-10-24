/**
 * Catálogo de trabajos que ve el cliente. Parte de lo que configura el equipo (`trabajo_cliente` y sus opciones) y deja
 * solo lo que realmente se puede calcular: opción activa, concepto activo y aprobado, medidas coherentes con la fórmula
 * del concepto (las dicta el motor, no el teléfono). Lo que no cumple no se ofrece, y una captura antigua que lo use se rechaza.
 */
import type { TrabajoCliente } from "@softarq/contracts";
import { claveOpcion, problemaDeConfiguracion, type CatalogoCliente, type OpcionCatalogo } from "../dominio/captura.js";
import type { TrabajoFila } from "../infraestructura/repositorio-cliente.js";

export interface CatalogoArmado {
  /** Contrato para la app: solo trabajos con al menos una opción disponible. */
  readonly trabajos: TrabajoCliente[];
  /** Por `trabajo/opción`, para validar y traducir capturas. */
  readonly mapa: CatalogoCliente;
}

/** `incluirNoDisponibles`: el equipo necesita resolver capturas antiguas aunque la opción ya no se ofrezca. */
export function armarCatalogo(filas: readonly TrabajoFila[], incluirNoDisponibles = false): CatalogoArmado {
  const mapa = new Map<string, OpcionCatalogo>();
  const trabajos: TrabajoCliente[] = [];
  for (const t of filas) {
    const opciones: TrabajoCliente["opciones"] = [];
    for (const o of t.opciones) {
      const medidas = o.medidas ?? [];
      const incoherente = o.medidas === null || problemaDeConfiguracion(o.concepto.tipoFormula, medidas.map((m) => m.clave)) !== null;
      const disponible = t.activo && o.activa && o.concepto.disponible && !incoherente;
      if (!disponible && !incluirNoDisponibles) continue;
      mapa.set(claveOpcion(t.codigo, o.codigo), {
        trabajoCodigo: t.codigo,
        trabajoNombre: t.nombre,
        trabajoActivo: t.activo && !incoherente,
        opcionCodigo: o.codigo,
        opcionNombre: o.nombre,
        opcionActiva: o.activa,
        consolidarCompras: o.consolidarCompras,
        medidas,
        concepto: { ...o.concepto, disponible: o.concepto.disponible && !incoherente },
      });
      if (disponible) {
        opciones.push({
          codigo: o.codigo,
          nombre: o.nombre,
          descripcion: o.descripcion,
          medidas,
          admiteHuecos: o.concepto.permiteDescuento,
          unidadResultado: o.concepto.unidad,
        });
      }
    }
    if (opciones.length > 0) trabajos.push({ codigo: t.codigo, nombre: t.nombre, descripcion: t.descripcion, ilustracion: t.ilustracion, opciones });
  }
  return { trabajos, mapa };
}
