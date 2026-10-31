/**
 * «Mi trabajo» (E3.2): inicio del panel organizado por función. Cada tarjeta muestra el número de elementos de la
 * propia bandeja de esa persona y lleva a ella; las capacidades existentes (calculadora, clientes, catálogo,
 * administración…) siguen en la navegación. No son los contadores operativos de 00 INICIO del libro, que siguen
 * pendientes de definición (ADR-0018 §2.2): solo cuentan lo que la persona tiene por hacer.
 *
 * La web solo muestra lo que las capacidades de la sesión permiten; la API decide siempre.
 */
import type { Capacidad } from "@softarq/contracts";
import type { ReactNode } from "react";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Pagina } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace, type Ruta } from "../navegacion/ruta.tsx";
import type { ServiciosSolicitudes } from "../solicitudes/servicios.ts";

function Tarjeta({ titulo, numero, ayuda, a, accion, cargando, fallo }: { titulo: string; numero: number | null; ayuda: string; a: Ruta; accion: string; cargando: boolean; fallo: boolean }) {
  return (
    <section className="tarjeta tarjeta-trabajo" aria-label={titulo}>
      <h2 className="tarjeta-titulo">{titulo}</h2>
      <p className="trabajo-numero" aria-live="polite">
        {cargando ? "…" : fallo ? "—" : numero}
      </p>
      <p className="ayuda">{fallo ? "No se pudo consultar ahora." : ayuda}</p>
      <Enlace a={a}>{accion}</Enlace>
    </section>
  );
}

function PorAtender({ servicios }: { servicios: ServiciosSolicitudes }) {
  const { estado } = useCarga((s) => servicios.listar(["ENVIADA"], s), []);
  return (
    <Tarjeta
      titulo="Solicitudes por atender"
      numero={estado.fase === "listo" ? estado.datos.solicitudes.length : null}
      ayuda="Enviadas por clientes desde la app."
      a={{ pantalla: "solicitudes" }}
      accion="Abrir la bandeja"
      cargando={estado.fase === "cargando"}
      fallo={estado.fase === "error"}
    />
  );
}

function EnRevision({ servicios }: { servicios: ServiciosCotizaciones }) {
  const { estado } = useCarga((s) => servicios.listarRevisiones("PENDIENTE", s), []);
  return (
    <Tarjeta
      titulo="Revisiones pendientes"
      numero={estado.fase === "listo" ? estado.datos.revisiones.length : null}
      ayuda="Versiones que esperan su decisión."
      a={{ pantalla: "revisiones" }}
      accion="Abrir las revisiones"
      cargando={estado.fase === "cargando"}
      fallo={estado.fase === "error"}
    />
  );
}

function SinReferencia({ servicios }: { servicios: ServiciosSolicitudes }) {
  const { estado } = useCarga((s) => servicios.referencias(s), []);
  return (
    <Tarjeta
      titulo="Insumos sin precio de referencia"
      numero={estado.fase === "listo" ? estado.datos.pendientes.length : null}
      ayuda="Sin referencia, la app no puede dar una estimación de esos trabajos."
      a={{ pantalla: "catalogo", vista: "referencias" }}
      accion="Designar referencias"
      cargando={estado.fase === "cargando"}
      fallo={estado.fase === "error"}
    />
  );
}

function Atajo({ titulo, texto, a, accion }: { titulo: string; texto: string; a: Ruta; accion: string }) {
  return (
    <section className="tarjeta tarjeta-trabajo" aria-label={titulo}>
      <h2 className="tarjeta-titulo">{titulo}</h2>
      <p className="ayuda">{texto}</p>
      <Enlace a={a}>{accion}</Enlace>
    </section>
  );
}

export function MiTrabajo({ nombre, capacidades, solicitudes, cotizaciones }: { nombre: string; capacidades: readonly Capacidad[]; solicitudes: ServiciosSolicitudes; cotizaciones: ServiciosCotizaciones }) {
  const puede = (c: Capacidad) => capacidades.includes(c);
  const tarjetas: ReactNode[] = [];
  if (puede("solicitudes.atender")) tarjetas.push(<PorAtender key="sol" servicios={solicitudes} />);
  if (puede("cotizaciones.preparar")) tarjetas.push(<Atajo key="cot" titulo="Mis cotizaciones" texto="Preparar, confirmar precios, calcular y enviar a revisión." a={{ pantalla: "cotizaciones" }} accion="Abrir las cotizaciones" />);
  if (puede("revisiones.decidir")) tarjetas.push(<EnRevision key="rev" servicios={cotizaciones} />);
  if (puede("catalogos.administrar")) tarjetas.push(<SinReferencia key="ref" servicios={solicitudes} />);
  if (puede("personas.administrar")) tarjetas.push(<Atajo key="per" titulo="Accesos de clientes" texto="Crear, desactivar y restablecer el acceso de un cliente desde su ficha." a={{ pantalla: "clientes" }} accion="Abrir los clientes" />);
  return (
    <Pagina titulo="Mi trabajo" subtitulo={`${nombre}: lo que tiene por hacer según su función. El resto del panel sigue disponible en la navegación.`}>
      {tarjetas.length === 0 ? <p className="vacio">Su función no tiene bandejas propias. Use la navegación para consultar cotizaciones, clientes y proyectos.</p> : <div className="tarjetas">{tarjetas}</div>}
    </Pagina>
  );
}
