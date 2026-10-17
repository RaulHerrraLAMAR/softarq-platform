/**
 * Administración de proveedores, productos, precios y tarifas (módulo 11, ADR-0015). Solo con la
 * capacidad `catalogos.administrar` (Administrador del catálogo); la API lo exige de todos modos.
 *
 * - Muestra importes internos (precios de proveedor y tarifas) solo en esta sección: no se mezclan
 *   con la cotización comercial, la calculadora ni el PDF.
 * - Desactivar no borra. Antes de desactivar, anular, cerrar una vigencia o asignar una tarifa se
 *   muestra su impacto (precios vigentes, conceptos y cotizaciones abiertas) y se pide confirmar.
 * - Un conflicto conserva lo escrito y ofrece recargar el registro vigente.
 * - Nunca elige ni sustituye precios en los borradores: eso lo decide el Preparador.
 */
import {
  CAMPOS_TECNICOS_PRODUCTO,
  ESTADOS_PRECIO,
  LIMITES_CATALOGO_ADMIN,
  MAGNITUDES_UNIDAD_TARIFA,
  MODALIDADES_MANO_OBRA,
  type ConceptoTarifaAdmin,
  type EstadoPrecio,
  type EventoCatalogo,
  type ImpactoCatalogo,
  type ModalidadManoObra,
  type PrecioAdmin,
  type ProductoAdmin,
  type ProveedorAdmin,
  type TarifaAdmin,
} from "@softarq/contracts";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { FalloApi, ResultadoApi } from "../api/cliente.ts";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearCantidad, formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, EstadoRegistro, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace, VISTAS_CATALOGO_RUTA as VISTAS_CATALOGO, type VistaCatalogo } from "../navegacion/ruta.tsx";
import { AvisoFallo, CampoCasilla, CampoSeleccion, CampoTexto, ControlPaginas, errorDe, usePaginas } from "./campos.tsx";
import { diaSiguiente, maxima } from "./fechas.ts";
import type { ServiciosCatalogoAdmin } from "./servicios.ts";
import { buscarInsumos, buscarProductos, buscarProveedores } from "./buscadores.ts";
import { SelectorRegistro, type OpcionRegistro } from "./SelectorRegistro.tsx";

const TITULOS: Record<VistaCatalogo, string> = {
  proveedores: "Proveedores",
  productos: "Productos",
  precios: "Precios",
  "mano-de-obra": "Mano de obra",
  conceptos: "Tarifa de conceptos",
};

const TEXTO_MODALIDAD: Record<ModalidadManoObra, string> = {
  UNIDAD: "Por unidad del concepto",
  JORNADA: "Por jornada de cuadrilla",
  SUBCONTRATO: "Precio de subcontrato",
};

const TEXTO_ESTADO_PRECIO: Record<EstadoPrecio, string> = {
  VIGENTE: "Vigente",
  FUTURO: "Futuro",
  VENCIDO: "Vencido",
  ANULADO: "Anulado",
};

/** Importe interno con al menos dos decimales, sin pasar por `number` ("13.7" → "$13.70"). */
const mxn = (t: string) => {
  const m = /^(-?\d+)(?:\.(\d*))?$/.exec(t);
  return formatearImporte(m ? `${m[1]}.${(m[2] ?? "").padEnd(2, "0")}` : t, "MXN");
};
const vigencia = (desde: string, hasta: string) => `${formatearFecha(desde)} a ${formatearFecha(hasta)}`;
const opcional = (t: string) => (t.trim() === "" ? null : t.trim());

export function PantallaCatalogo({ servicios, vista }: { servicios: ServiciosCatalogoAdmin; vista: VistaCatalogo }) {
  return (
    <Pagina
      titulo="Catálogo de compras y mano de obra"
      subtitulo="Administrador del catálogo. Datos DEMO ilustrativos. Los precios de proveedor y las tarifas son internos: no aparecen en la cotización comercial ni en el PDF."
    >
      <nav aria-label="Secciones del catálogo">
        <ul className="navegacion-catalogo">
          {VISTAS_CATALOGO.map((v) => (
            <li key={v}>
              <Enlace a={{ pantalla: "catalogo", vista: v }} className="navegacion-enlace" actual={v === vista}>
                {TITULOS[v]}
              </Enlace>
            </li>
          ))}
        </ul>
      </nav>
      {vista === "proveedores" ? <VistaProveedores servicios={servicios} /> : null}
      {vista === "productos" ? <VistaProductos servicios={servicios} /> : null}
      {vista === "precios" ? <VistaPrecios servicios={servicios} /> : null}
      {vista === "mano-de-obra" ? <VistaTarifas servicios={servicios} /> : null}
      {vista === "conceptos" ? <VistaConceptos servicios={servicios} /> : null}
    </Pagina>
  );
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

function Busqueda({ etiqueta, alBuscar, children }: { etiqueta: string; alBuscar: (t: string) => void; children?: ReactNode }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      className="barra-busqueda"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        alBuscar(texto.trim());
      }}
    >
      <label className="etiqueta" htmlFor="buscar-catalogo">
        {etiqueta}
      </label>
      <div className="entrada-con-accion">
        <input id="buscar-catalogo" type="search" value={texto} maxLength={LIMITES_CATALOGO_ADMIN.longitudBusqueda} onChange={(e) => setTexto(e.target.value)} />
        <Boton type="submit">Buscar</Boton>
      </div>
      {children}
    </form>
  );
}

function Historial({ eventos }: { eventos: EventoCatalogo[] }) {
  if (eventos.length === 0) return <p className="ayuda">Sin cambios registrados desde la carga DEMO.</p>;
  return (
    <ul className="lista-historial" aria-label="Historial de cambios">
      {eventos.map((e, i) => (
        <li key={`${e.tipo}-${e.ocurridoEn}-${i}`}>
          <strong>{textoEvento(e.tipo)}</strong> · {formatearInstante(e.ocurridoEn)} · {e.usuario}
          {detalleEvento(e)}
        </li>
      ))}
    </ul>
  );
}

const TEXTOS_EVENTO: Record<string, string> = {
  PROVEEDOR_CREADO: "Alta",
  PROVEEDOR_EDITADO: "Edición",
  PROVEEDOR_DESACTIVADO: "Desactivado",
  PROVEEDOR_REACTIVADO: "Reactivado",
  PRODUCTO_CREADO: "Alta",
  PRODUCTO_EDITADO: "Edición",
  PRODUCTO_DESACTIVADO: "Desactivado",
  PRODUCTO_REACTIVADO: "Reactivado",
  PRECIO_REGISTRADO: "Registrado",
  PRECIO_ANULADO: "Anulado por error de captura",
  PRECIO_VIGENCIA_CERRADA: "Vigencia cerrada con sucesor",
  TARIFA_REGISTRADA: "Registrada",
  TARIFA_DESACTIVADA: "Desactivada",
  TARIFA_REACTIVADA: "Reactivada",
  CONCEPTO_TARIFA_ASIGNADA: "Tarifa asignada",
};
const textoEvento = (tipo: string) => TEXTOS_EVENTO[tipo] ?? tipo;

function detalleEvento(e: EventoCatalogo): ReactNode {
  const d = e.detalle as Record<string, unknown>;
  const partes: string[] = [];
  if (Array.isArray(d["campos"])) partes.push(`campos: ${(d["campos"] as unknown[]).join(", ")}`);
  if (typeof d["hastaAnterior"] === "string" && typeof d["hastaNueva"] === "string") {
    partes.push(`fin ${formatearFecha(d["hastaAnterior"])} → ${formatearFecha(d["hastaNueva"])}`);
  }
  if (typeof d["sucesor"] === "string") partes.push(`sucesor ${d["sucesor"]}`);
  if (typeof d["sucesorDe"] === "string") partes.push(`sucesor de ${d["sucesorDe"]}`);
  if (typeof d["tarifaNueva"] === "string") partes.push(`${typeof d["tarifaAnterior"] === "string" ? d["tarifaAnterior"] : "sin tarifa"} → ${d["tarifaNueva"]}`);
  if (typeof d["motivo"] === "string") partes.push(`motivo: ${d["motivo"]}`);
  return partes.length > 0 ? <span className="ayuda bloque">{partes.join(" · ")}</span> : null;
}

/** Texto del impacto de un cambio, sin importes. */
function textoImpacto(i: ImpactoCatalogo, que: string): string {
  const partes: string[] = [];
  if (i.preciosVigentes > 0) partes.push(`${i.preciosVigentes} precio(s) vigente(s) hoy dejarán de ofrecerse para selecciones nuevas`);
  if (i.tarifas > 0) partes.push(`${i.tarifas} tarifa(s) activa(s) lo citan como subcontratista`);
  if (i.conceptos > 0) partes.push(`${i.conceptos} concepto(s) usan esta tarifa: al calcular quedarán bloqueados (BL-10) hasta asignarles otra`);
  if (i.borradoresAbiertos > 0) {
    partes.push(
      `${i.borradoresAbiertos} cotización(es) abierta(s) lo usan: conservan su elección marcada como no disponible y el Preparador decide cómo corregirla`,
    );
  }
  const base = `${que} No se borra; las versiones calculadas y los PDF emitidos no cambian.`;
  return partes.length > 0 ? `${base} Efecto: ${partes.join("; ")}.` : `${base} Hoy no afecta a precios vigentes ni a cotizaciones abiertas.`;
}

function Confirmacion({ texto, accion, variante = "peligro", alConfirmar, alCancelar, ocupado }: { texto: string; accion: string; variante?: "peligro" | "primario"; alConfirmar: () => void; alCancelar: () => void; ocupado: boolean }) {
  return (
    <div className="confirmacion" role="group" aria-label={`Confirmar: ${accion}`}>
      <span>{texto}</span>
      <Boton variante={variante} onClick={alConfirmar} disabled={ocupado} aria-disabled={ocupado}>
        {ocupado ? "Guardando…" : accion}
      </Boton>
      <Boton onClick={alCancelar} autoFocus disabled={ocupado}>
        Cancelar
      </Boton>
    </div>
  );
}

/** Envío de un formulario con estado y fallo; conserva lo escrito si falla. */
function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const ejecutar = async <T,>(accion: () => Promise<ResultadoApi<T>>): Promise<ResultadoApi<T> | null> => {
    if (enviando) return null;
    setEnviando(true);
    setFallo(null);
    const r = await accion();
    setEnviando(false);
    if (!r.ok && r.fallo.tipo !== "cancelado") setFallo(r.fallo);
    return r;
  };
  return { enviando, fallo, setFallo, ejecutar };
}

function Acciones({ enviando, texto, alCancelar }: { enviando: boolean; texto: string; alCancelar?: () => void }) {
  return (
    <div className="formulario-acciones">
      <Boton type="submit" variante="primario" disabled={enviando} aria-disabled={enviando}>
        {enviando ? "Guardando…" : texto}
      </Boton>
      {alCancelar ? (
        <Boton variante="enlace" onClick={alCancelar} disabled={enviando}>
          Cancelar
        </Boton>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

type DatosProveedor = { nombre: string; contacto: string | null; telefono: string | null; correo: string | null };

function FormularioProveedor({
  titulo,
  inicial,
  textoBoton,
  alGuardar,
  alCancelar,
  alRecargar,
}: {
  titulo: string;
  inicial?: ProveedorAdmin;
  textoBoton: string;
  alGuardar: (d: DatosProveedor) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
  /** En una edición: recargar el registro vigente tras un conflicto (descarta lo escrito por decisión explícita). */
  alRecargar?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [contacto, setContacto] = useState(inicial?.contacto ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [correo, setCorreo] = useState(inicial?.correo ?? "");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const vacio = nombre.trim() === "";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (vacio) return;
    void envio.ejecutar(() => alGuardar({ nombre: nombre.trim(), contacto: opcional(contacto), telefono: opcional(telefono), correo: opcional(correo) }));
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <CampoTexto
        etiqueta="Nombre del proveedor"
        enfocar
        valor={nombre}
        alCambiar={setNombre}
        max={LIMITES_CATALOGO_ADMIN.longitudNombre}
        obligatorio
        error={intentado && vacio ? "Escriba el nombre del proveedor." : errorDe(envio.fallo, "nombre")}
        ayuda="Se rechaza un nombre que ya exista con otras mayúsculas, acentos o espacios. Datos DEMO: use la marca [DEMO]; no registre proveedores reales."
      />
      <CampoTexto etiqueta="Contacto" valor={contacto} alCambiar={setContacto} max={LIMITES_CATALOGO_ADMIN.longitudContacto} error={errorDe(envio.fallo, "contacto")} />
      <div className="formulario-fila">
        <CampoTexto etiqueta="Teléfono" tipo="tel" valor={telefono} alCambiar={setTelefono} max={LIMITES_CATALOGO_ADMIN.longitudTelefono} error={errorDe(envio.fallo, "telefono")} />
        <CampoTexto etiqueta="Correo" tipo="email" valor={correo} alCambiar={setCorreo} max={LIMITES_CATALOGO_ADMIN.longitudCorreo} error={errorDe(envio.fallo, "correo")} />
      </div>
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} {...(alRecargar ? { alRecargar } : {})} /> : null}
      <Acciones enviando={envio.enviando} texto={textoBoton} alCancelar={alCancelar} />
    </form>
  );
}

function VistaProveedores({ servicios }: { servicios: ServiciosCatalogoAdmin }) {
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarProveedores({ buscar, incluirInactivos: inactivos, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivos, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-proveedores">
      <h2 id="titulo-proveedores" className="seccion-titulo">
        Proveedores
      </h2>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando ? (
        <FormularioProveedor
          titulo="Nuevo proveedor"
          textoBoton="Crear proveedor"
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.crearProveedor(d, intenciones.clave("crear-proveedor", d));
            if (r.ok) {
              intenciones.olvidar("crear-proveedor", d);
              setCreando(false);
              setMensaje(`Proveedor ${r.datos.codigo} creado.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones"><Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))}>
          Nuevo proveedor
        </Boton></div>
      )}
      <Busqueda etiqueta="Buscar por nombre o código" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivos} onChange={(e) => (paginas.reiniciar(), setInactivos(e.target.checked))} />
          Incluir inactivos
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando proveedores…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.proveedores.length === 0 ? (
          <SinResultados>{buscar ? `No hay proveedores que coincidan con «${buscar}».` : "No hay proveedores activos."}</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Proveedores</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.proveedores.map((p) => (
                    <FilaProveedor
                      key={p.codigo}
                      p={p}
                      servicios={servicios}
                      abierto={abierto === p.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === p.codigo ? null : p.codigo)))}
                      alCambiar={(m) => (setMensaje(m), recargar())}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPaginas paginas={paginas} siguiente={estado.datos.siguiente} />
          </>
        )
      ) : null}
    </section>
  );
}

function FilaProveedor({ p, servicios, abierto, alAlternar, alCambiar }: { p: ProveedorAdmin; servicios: ServiciosCatalogoAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void }) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{p.codigo}</Codigo>
        </td>
        <td data-etiqueta="Nombre">{p.nombre}</td>
        <td data-etiqueta="Contacto">{[p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") || <span className="ayuda">Sin capturar</span>}</td>
        <td data-etiqueta="Estado">
          <EstadoRegistro activo={p.activo} />
        </td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Gestionar"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={5}>
            <PanelProveedor codigo={p.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelProveedor({ codigo, servicios, alCambiar }: { codigo: string; servicios: ServiciosCatalogoAdmin; alCambiar: (m: string) => void }) {
  const { estado, recargar } = useCarga((s) => servicios.detalleProveedor(codigo, s), [codigo]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { proveedor, impacto, historial } = estado.datos;
  const cambiarActivo = async () => {
    const r = await envio.ejecutar(() => servicios.editarProveedor(codigo, { revision: proveedor.revision, activo: !proveedor.activo }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activo ? `Proveedor ${codigo} reactivado.` : `Proveedor ${codigo} desactivado; su historial y sus precios se conservan.`);
  };
  return (
    <div className="panel-registro">
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      {editando ? (
        <FormularioProveedor
          titulo={`Editar ${codigo}`}
          inicial={proveedor}
          textoBoton="Guardar cambios"
          alCancelar={() => setEditando(false)}
          alRecargar={() => (setEditando(false), recargar())}
          alGuardar={async (d) => {
            const r = await servicios.editarProveedor(codigo, { revision: proveedor.revision, ...d });
            if (r.ok) {
              setEditando(false);
              alCambiar(`Proveedor ${codigo} actualizado.`);
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => setEditando(true)}>Editar datos</Boton>
          {confirmar ? (
            <Confirmacion
              texto={proveedor.activo ? textoImpacto(impacto, `Se desactivará ${codigo}.`) : `Se reactivará ${codigo} y sus precios vigentes volverán a ofrecerse.`}
              accion={proveedor.activo ? "Desactivar" : "Reactivar"}
              variante={proveedor.activo ? "peligro" : "primario"}
              alConfirmar={() => void cambiarActivo()}
              alCancelar={() => setConfirmar(false)}
              ocupado={envio.enviando}
            />
          ) : (
            <Boton variante={proveedor.activo ? "peligro" : "secundario"} onClick={() => setConfirmar(true)}>
              {proveedor.activo ? "Desactivar proveedor" : "Reactivar proveedor"}
            </Boton>
          )}
        </div>
      )}
      <p className="ayuda">
        Modificado {formatearInstante(proveedor.modificadoEn)} · {proveedor.modificadoPor ?? "carga DEMO"} · revisión {proveedor.revision}
      </p>
      <Historial eventos={historial} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

type DatosProducto = {
  insumoCodigo: string;
  descripcion: string;
  presentacion: string;
  unidadCompra: string;
  contenido: string;
  fraccionable: boolean;
  incrementoMinimo: string | null;
};

function FormularioProducto({
  titulo,
  inicial,
  textoBoton,
  servicios,
  alGuardar,
  alCancelar,
  alRecargar,
}: {
  titulo: string;
  inicial?: ProductoAdmin;
  textoBoton: string;
  servicios: ServiciosCatalogoAdmin;
  alGuardar: (d: DatosProducto) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
  alRecargar?: () => void;
}) {
  const referencias = useCarga((s) => servicios.unidades(s), []);
  const buscarInsumo = useMemo(() => buscarInsumos(servicios), [servicios]);
  const [insumo, setInsumo] = useState(inicial?.insumo.codigo ?? "");
  const [insumoElegido, setInsumoElegido] = useState<OpcionRegistro | null>(
    inicial ? { codigo: inicial.insumo.codigo, texto: `${inicial.insumo.codigo} · ${inicial.insumo.descripcion} (${inicial.insumo.unidadBase})`, disponible: inicial.insumo.activo, detalle: inicial.insumo.unidadBase } : null,
  );
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [presentacion, setPresentacion] = useState(inicial?.presentacion ?? "");
  const [unidad, setUnidad] = useState(inicial?.unidadCompra ?? "");
  const [contenido, setContenido] = useState(inicial?.contenido ?? "");
  const [fraccionable, setFraccionable] = useState(inicial?.fraccionable ?? false);
  const [incremento, setIncremento] = useState(inicial?.incrementoMinimo ?? "");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const bloqueado = inicial?.tienePrecios === true;

  if (referencias.estado.fase === "cargando") return <Cargando etiqueta="Cargando unidades…" />;
  if (referencias.estado.fase === "error") return <CargaFallida fallo={referencias.estado.fallo} alReintentar={referencias.recargar} />;
  const { unidades } = referencias.estado.datos;
  const unidadBase = (insumoElegido?.codigo === insumo ? insumoElegido.detalle : undefined) ?? "unidad base";
  const faltantes = {
    insumo: insumo === "",
    descripcion: descripcion.trim() === "",
    presentacion: presentacion.trim() === "",
    unidad: unidad === "",
    contenido: contenido.trim() === "",
    incremento: fraccionable && incremento.trim() === "",
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(faltantes).some(Boolean)) return;
    void envio.ejecutar(() =>
      alGuardar({
        insumoCodigo: insumo,
        descripcion: descripcion.trim(),
        presentacion: presentacion.trim(),
        unidadCompra: unidad,
        contenido: contenido.trim(),
        fraccionable,
        incrementoMinimo: fraccionable ? incremento.trim() : null,
      }),
    );
  };
  const falta = (k: keyof typeof faltantes, texto: string, ruta: string) => (intentado && faltantes[k] ? texto : errorDe(envio.fallo, ruta));
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      {bloqueado ? (
        <Aviso tono="info" titulo="Campos técnicos bloqueados">
          <p>
            Este producto ya tiene precios registrados (vigentes, vencidos o anulados). Su insumo, presentación, unidad de compra, contenido y venta
            fraccionada ya no cambian, para que los borradores y las versiones conserven su significado. Para otra presentación registre un producto
            nuevo, con sus propios precios, y desactive este. Puede corregir la descripción comercial.
          </p>
        </Aviso>
      ) : null}
      <SelectorRegistro
        etiqueta="Insumo que cubre"
        enfocar={!bloqueado}
        valor={insumo}
        seleccion={insumoElegido}
        alCambiar={(c, o) => (setInsumo(c), setInsumoElegido(o))}
        buscar={buscarInsumo}
        obligatorio
        deshabilitado={bloqueado}
        error={falta("insumo", "Seleccione un insumo activo.", "insumoCodigo")}
        ayuda="Busque por código o descripción; solo se ofrecen insumos activos."
      />
      <CampoTexto
        etiqueta="Descripción comercial"
        enfocar={bloqueado}
        valor={descripcion}
        alCambiar={setDescripcion}
        max={LIMITES_CATALOGO_ADMIN.longitudDescripcion}
        obligatorio
        error={falta("descripcion", "Escriba la descripción comercial.", "descripcion")}
        ayuda="Datos DEMO: use la marca [DEMO]."
      />
      <div className="formulario-fila">
        <CampoTexto
          etiqueta="Presentación"
          valor={presentacion}
          alCambiar={setPresentacion}
          max={LIMITES_CATALOGO_ADMIN.longitudPresentacion}
          obligatorio
          deshabilitado={bloqueado}
          error={falta("presentacion", "Describa la presentación.", "presentacion")}
          ayuda="Lo que se compra, p. ej., «bulto 25 kg» o «tramo de 12 m»."
        />
        <CampoSeleccion
          etiqueta="Unidad de compra"
          valor={unidad}
          alCambiar={setUnidad}
          obligatorio
          deshabilitado={bloqueado}
          opciones={unidades.map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre}` }))}
          error={falta("unidad", "Seleccione la unidad de compra.", "unidadCompra")}
        />
      </div>
      <CampoTexto
        etiqueta={`Contenido por unidad de compra (en ${unidadBase})`}
        valor={contenido}
        alCambiar={setContenido}
        max={30}
        inputMode="decimal"
        obligatorio
        deshabilitado={bloqueado}
        error={falta("contenido", "Indique el contenido (mayor que cero).", "contenido")}
        ayuda={`Cuántos ${unidadBase} trae cada ${unidad || "unidad de compra"}: un bulto de 25 kg de un insumo en kg lleva 25. Punto decimal, hasta 6 decimales; no se redondea.`}
      />
      <CampoCasilla etiqueta="Venta fraccionada permitida" valor={fraccionable} alCambiar={setFraccionable} deshabilitado={bloqueado} ayuda="Si se permite, se compra en múltiplos del incremento mínimo en lugar de unidades completas." />
      {fraccionable ? (
        <CampoTexto
          etiqueta={`Incremento mínimo (en ${unidadBase})`}
          valor={incremento}
          alCambiar={setIncremento}
          max={30}
          inputMode="decimal"
          obligatorio
          deshabilitado={bloqueado}
          error={falta("incremento", "Indique el incremento mínimo de venta.", "incrementoMinimo")}
        />
      ) : null}
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} {...(alRecargar ? { alRecargar } : {})} /> : null}
      <Acciones enviando={envio.enviando} texto={textoBoton} alCancelar={alCancelar} />
    </form>
  );
}

function VistaProductos({ servicios }: { servicios: ServiciosCatalogoAdmin }) {
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarProductos({ buscar, incluirInactivos: inactivos, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivos, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-productos">
      <h2 id="titulo-productos" className="seccion-titulo">
        Productos comerciales
      </h2>
      <p className="ayuda">Cada producto cubre un insumo técnico y define su presentación de compra. El precio se registra después, por proveedor.</p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando ? (
        <FormularioProducto
          titulo="Nuevo producto"
          textoBoton="Crear producto"
          servicios={servicios}
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.crearProducto(d, intenciones.clave("crear-producto", d));
            if (r.ok) {
              intenciones.olvidar("crear-producto", d);
              setCreando(false);
              setMensaje(`Producto ${r.datos.codigo} creado.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones"><Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))}>
          Nuevo producto
        </Boton></div>
      )}
      <Busqueda etiqueta="Buscar por código, descripción o presentación" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivos} onChange={(e) => (paginas.reiniciar(), setInactivos(e.target.checked))} />
          Incluir inactivos
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando productos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.productos.length === 0 ? (
          <SinResultados>{buscar ? `No hay productos que coincidan con «${buscar}».` : "No hay productos activos."}</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Productos</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto y presentación</th>
                    <th scope="col">Contenido</th>
                    <th scope="col">Insumo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.productos.map((p) => (
                    <FilaProducto
                      key={p.codigo}
                      p={p}
                      servicios={servicios}
                      abierto={abierto === p.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === p.codigo ? null : p.codigo)))}
                      alCambiar={(m) => (setMensaje(m), recargar())}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPaginas paginas={paginas} siguiente={estado.datos.siguiente} />
          </>
        )
      ) : null}
    </section>
  );
}

function FilaProducto({ p, servicios, abierto, alAlternar, alCambiar }: { p: ProductoAdmin; servicios: ServiciosCatalogoAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void }) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{p.codigo}</Codigo>
        </td>
        <td data-etiqueta="Producto">
          {p.descripcion}
          <span className="ayuda bloque">{p.presentacion}</span>
        </td>
        <td data-etiqueta="Contenido">
          {formatearCantidad(p.contenido)} {p.insumo.unidadBase} por {p.unidadCompra}
          {p.fraccionable && p.incrementoMinimo ? <span className="ayuda bloque">Fraccionable cada {formatearCantidad(p.incrementoMinimo)} {p.insumo.unidadBase}</span> : null}
        </td>
        <td data-etiqueta="Insumo">
          <Codigo>{p.insumo.codigo}</Codigo>
        </td>
        <td data-etiqueta="Estado">
          <EstadoRegistro activo={p.activo} />
          {p.tienePrecios ? <span className="ayuda bloque">Con precios</span> : null}
        </td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Gestionar"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={6}>
            <PanelProducto codigo={p.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelProducto({ codigo, servicios, alCambiar }: { codigo: string; servicios: ServiciosCatalogoAdmin; alCambiar: (m: string) => void }) {
  const { estado, recargar } = useCarga((s) => servicios.detalleProducto(codigo, s), [codigo]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { producto, impacto, historial } = estado.datos;
  const cambiarActivo = async () => {
    const r = await envio.ejecutar(() => servicios.editarProducto(codigo, { revision: producto.revision, activo: !producto.activo }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activo ? `Producto ${codigo} reactivado.` : `Producto ${codigo} desactivado; su historial y sus precios se conservan.`);
  };
  return (
    <div className="panel-registro">
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      {editando ? (
        <FormularioProducto
          titulo={`Editar ${codigo}`}
          inicial={producto}
          textoBoton="Guardar cambios"
          servicios={servicios}
          alCancelar={() => setEditando(false)}
          alRecargar={() => (setEditando(false), recargar())}
          alGuardar={async (d) => {
            // Solo los campos que cambiaron; con precios, la API rechaza cualquier cambio técnico.
            const cambios: Record<string, unknown> = {};
            if (d.descripcion !== producto.descripcion) cambios["descripcion"] = d.descripcion;
            if (!producto.tienePrecios) {
              const actual: Record<string, unknown> = {
                insumoCodigo: producto.insumo.codigo,
                presentacion: producto.presentacion,
                unidadCompra: producto.unidadCompra,
                contenido: producto.contenido,
                fraccionable: producto.fraccionable,
                incrementoMinimo: producto.incrementoMinimo,
              };
              for (const k of CAMPOS_TECNICOS_PRODUCTO) if (d[k] !== actual[k]) cambios[k] = d[k];
            }
            if (Object.keys(cambios).length === 0) {
              setEditando(false);
              return { ok: true as const, datos: null };
            }
            const r = await servicios.editarProducto(codigo, { revision: producto.revision, ...cambios });
            if (r.ok) {
              setEditando(false);
              alCambiar(`Producto ${codigo} actualizado.`);
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => setEditando(true)}>{producto.tienePrecios ? "Corregir descripción" : "Editar producto"}</Boton>
          {confirmar ? (
            <Confirmacion
              texto={producto.activo ? textoImpacto(impacto, `Se desactivará ${codigo}.`) : `Se reactivará ${codigo}.`}
              accion={producto.activo ? "Desactivar" : "Reactivar"}
              variante={producto.activo ? "peligro" : "primario"}
              alConfirmar={() => void cambiarActivo()}
              alCancelar={() => setConfirmar(false)}
              ocupado={envio.enviando}
            />
          ) : (
            <Boton variante={producto.activo ? "peligro" : "secundario"} onClick={() => setConfirmar(true)}>
              {producto.activo ? "Desactivar producto" : "Reactivar producto"}
            </Boton>
          )}
        </div>
      )}
      <p className="ayuda">
        Modificado {formatearInstante(producto.modificadoEn)} · {producto.modificadoPor ?? "carga DEMO"} · revisión {producto.revision}
      </p>
      <Historial eventos={historial} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

function InsigniaPrecio({ estado }: { estado: EstadoPrecio }) {
  const tono = estado === "VIGENTE" ? "estado" : estado === "ANULADO" ? "alerta" : "menor";
  return <Insignia tono={tono}>{TEXTO_ESTADO_PRECIO[estado]}</Insignia>;
}

function FormularioPrecio({ servicios, hoy, alGuardar, alCancelar }: { servicios: ServiciosCatalogoAdmin; hoy: string; alGuardar: (d: { productoCodigo: string; proveedorCodigo: string; precioUnitario: string; vigenteDesde: string; vigenteHasta: string; fuente: string }) => Promise<ResultadoApi<unknown>>; alCancelar: () => void }) {
  const buscarProducto = useMemo(() => buscarProductos(servicios), [servicios]);
  const buscarProveedor = useMemo(() => buscarProveedores(servicios), [servicios]);
  const [producto, setProducto] = useState("");
  const [productoElegido, setProductoElegido] = useState<OpcionRegistro | null>(null);
  const [proveedor, setProveedor] = useState("");
  const [precio, setPrecio] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState("");
  const [fuente, setFuente] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const unidadCompra = productoElegido?.codigo === producto ? productoElegido.detalle : undefined;
  const faltan = { producto: producto === "", proveedor: proveedor === "", precio: precio.trim() === "", desde: desde === "", hasta: hasta === "", fuente: fuente.trim() === "" };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(faltan).some(Boolean)) return;
    void envio.ejecutar(() => alGuardar({ productoCodigo: producto, proveedorCodigo: proveedor, precioUnitario: precio.trim(), vigenteDesde: desde, vigenteHasta: hasta, fuente: fuente.trim() }));
  };
  const falta = (k: keyof typeof faltan, texto: string, ruta: string) => (intentado && faltan[k] ? texto : errorDe(envio.fallo, ruta));
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label="Registrar precio">
      <p className="formulario-titulo">Registrar precio</p>
      <p className="ayuda">Los precios no se editan: si cambia, cierre la vigencia y registre el sucesor. No puede haber dos precios del mismo producto y proveedor en fechas que se crucen.</p>
      <div className="formulario-fila">
        <SelectorRegistro
          etiqueta="Producto comercial (activo)"
          enfocar
          valor={producto}
          seleccion={productoElegido}
          alCambiar={(c, o) => (setProducto(c), setProductoElegido(o))}
          buscar={buscarProducto}
          obligatorio
          error={falta("producto", "Seleccione el producto.", "productoCodigo")}
        />
        <SelectorRegistro
          etiqueta="Proveedor (activo)"
          valor={proveedor}
          alCambiar={(c) => setProveedor(c)}
          buscar={buscarProveedor}
          obligatorio
          error={falta("proveedor", "Seleccione el proveedor.", "proveedorCodigo")}
        />
      </div>
      <CampoTexto
        etiqueta={`Precio en MXN por ${unidadCompra ?? "unidad de compra"}`}
        valor={precio}
        alCambiar={setPrecio}
        max={30}
        inputMode="decimal"
        obligatorio
        error={falta("precio", "Indique el precio (mayor que cero).", "precioUnitario")}
        ayuda={`Antes de impuestos${unidadCompra ? `, por cada ${unidadCompra}` : ""}. Punto decimal, hasta 6 decimales; no se redondea.`}
      />
      <div className="formulario-fila">
        <CampoTexto etiqueta="Vigente desde" tipo="date" valor={desde} alCambiar={setDesde} max={10} obligatorio error={falta("desde", "Indique la fecha inicial.", "vigenteDesde")} ayuda="Inclusive." />
        <CampoTexto etiqueta="Vigente hasta" tipo="date" valor={hasta} alCambiar={setHasta} max={10} obligatorio error={falta("hasta", "Indique la fecha final.", "vigenteHasta")} ayuda="Inclusive: el precio vale también ese día." />
      </div>
      <CampoTexto etiqueta="Fuente" valor={fuente} alCambiar={setFuente} max={LIMITES_CATALOGO_ADMIN.longitudFuente} obligatorio error={falta("fuente", "Indique la fuente (cotización, lista o folio).", "fuente")} ayuda="Cotización, lista o folio del proveedor. Datos DEMO: indique que es ficticio." />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      <Acciones enviando={envio.enviando} texto="Registrar precio" alCancelar={alCancelar} />
    </form>
  );
}

function VistaPrecios({ servicios }: { servicios: ServiciosCatalogoAdmin }) {
  const [buscar, setBuscar] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPrecio | "">("");
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarPrecios({ buscar, ...(estadoFiltro ? { estado: estadoFiltro } : {}), ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, estadoFiltro, paginas.actual],
  );
  const hoy = estado.fase === "listo" ? estado.datos.fechaReferencia : "";
  return (
    <section className="seccion" aria-labelledby="titulo-precios">
      <h2 id="titulo-precios" className="seccion-titulo">
        Precios por proveedor
      </h2>
      {hoy ? <p className="ayuda">Estado calculado con la fecha del servidor: {formatearFecha(hoy)}. Las vigencias son inclusivas.</p> : null}
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando && hoy ? (
        <FormularioPrecio
          servicios={servicios}
          hoy={hoy}
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.registrarPrecio(d, intenciones.clave("registrar-precio", d));
            if (r.ok) {
              intenciones.olvidar("registrar-precio", d);
              setCreando(false);
              setMensaje(`Precio ${r.datos.codigo} registrado.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones"><Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))} disabled={!hoy}>
          Registrar precio
        </Boton></div>
      )}
      <Busqueda etiqueta="Buscar por código, producto o proveedor" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <div className="campo">
          <label className="etiqueta" htmlFor="filtro-estado-precio">
            Estado
          </label>
          <select id="filtro-estado-precio" className="entrada" value={estadoFiltro} onChange={(e) => (paginas.reiniciar(), setEstadoFiltro(e.target.value as EstadoPrecio | ""))}>
            <option value="">Todos</option>
            {ESTADOS_PRECIO.map((x) => (
              <option key={x} value={x}>
                {TEXTO_ESTADO_PRECIO[x]}
              </option>
            ))}
          </select>
        </div>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando precios…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.precios.length === 0 ? (
          <SinResultados>No hay precios con esos criterios.</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Precios</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Proveedor</th>
                    <th scope="col">Precio</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.precios.map((p) => (
                    <FilaPrecio
                      key={p.codigo}
                      p={p}
                      servicios={servicios}
                      abierto={abierto === p.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === p.codigo ? null : p.codigo)))}
                      alCambiar={(m) => (setMensaje(m), setAbierto(null), recargar())}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPaginas paginas={paginas} siguiente={estado.datos.siguiente} />
          </>
        )
      ) : null}
    </section>
  );
}

function FilaPrecio({ p, servicios, abierto, alAlternar, alCambiar }: { p: PrecioAdmin; servicios: ServiciosCatalogoAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void }) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{p.codigo}</Codigo>
        </td>
        <td data-etiqueta="Producto">
          {p.producto.descripcion}
          <span className="ayuda bloque">{p.producto.presentacion}</span>
        </td>
        <td data-etiqueta="Proveedor">{p.proveedor.nombre}</td>
        <td data-etiqueta="Precio" className="numero">
          {mxn(p.precioUnitario)} / {p.producto.unidadCompra}
        </td>
        <td data-etiqueta="Vigencia">{vigencia(p.vigenteDesde, p.vigenteHasta)}</td>
        <td data-etiqueta="Estado">
          <InsigniaPrecio estado={p.estado} />
        </td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Gestionar"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={7}>
            <PanelPrecio codigo={p.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelPrecio({ codigo, servicios, alCambiar }: { codigo: string; servicios: ServiciosCatalogoAdmin; alCambiar: (m: string) => void }) {
  const { estado, recargar } = useCarga((s) => servicios.detallePrecio(codigo, s), [codigo]);
  const [accion, setAccion] = useState<"cerrar" | "anular" | null>(null);
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { precio, impacto, historial, fechaReferencia } = estado.datos;
  const cerrable = (precio.estado === "VIGENTE" || precio.estado === "FUTURO") && precio.vigenteHasta > fechaReferencia;
  return (
    <div className="panel-registro">
      <dl className="datos-cotizacion">
        <div>
          <dt>Fuente</dt>
          <dd>{precio.fuente}</dd>
        </div>
        <div>
          <dt>Registrado</dt>
          <dd>
            {formatearInstante(precio.registradoEn)} · {precio.registradoPor ?? "carga DEMO"}
          </dd>
        </div>
        {precio.estado === "ANULADO" ? (
          <div>
            <dt>Anulación</dt>
            <dd>
              {precio.motivoAnulacion} · {precio.anuladoPor ?? "—"} · {precio.anuladoEn ? formatearInstante(precio.anuladoEn) : "—"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Cotizaciones abiertas que lo eligieron</dt>
          <dd>{impacto.borradoresAbiertos}</dd>
        </div>
      </dl>
      {accion === null && precio.estado !== "ANULADO" ? (
        <div className="formulario-acciones">
          {cerrable ? <Boton variante="primario" onClick={() => setAccion("cerrar")}>Cerrar vigencia y registrar sucesor</Boton> : null}
          <Boton variante="peligro" onClick={() => setAccion("anular")}>
            Anular precio erróneo
          </Boton>
        </div>
      ) : null}
      {accion === "cerrar" ? (
        <FormularioCierre precio={precio} hoy={fechaReferencia} impacto={impacto} servicios={servicios} alCancelar={() => setAccion(null)} alRecargar={recargar} alCerrado={alCambiar} />
      ) : null}
      {accion === "anular" ? (
        <FormularioAnulacion precio={precio} impacto={impacto} servicios={servicios} alCancelar={() => setAccion(null)} alRecargar={recargar} alAnulado={alCambiar} />
      ) : null}
      <Historial eventos={historial} />
    </div>
  );
}

function FormularioCierre({
  precio,
  hoy,
  impacto,
  servicios,
  alCancelar,
  alRecargar,
  alCerrado,
}: {
  precio: PrecioAdmin;
  hoy: string;
  impacto: ImpactoCatalogo;
  servicios: ServiciosCatalogoAdmin;
  alCancelar: () => void;
  alRecargar: () => void;
  alCerrado: (m: string) => void;
}) {
  const inicial = maxima(hoy, precio.vigenteDesde);
  const [nuevaHasta, setNuevaHasta] = useState(inicial);
  const [desde, setDesde] = useState(diaSiguiente(inicial));
  const [desdeEditado, setDesdeEditado] = useState(false);
  const [hasta, setHasta] = useState(precio.vigenteHasta);
  const [importe, setImporte] = useState("");
  const [fuente, setFuente] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  const faltan = { importe: importe.trim() === "", fuente: fuente.trim() === "", motivo: motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo, hasta: hasta === "" };
  const cuerpo = { revision: precio.revision, nuevaHasta, motivo: motivo.trim(), sucesor: { precioUnitario: importe.trim(), vigenteDesde: desde, vigenteHasta: hasta, fuente: fuente.trim() } };
  const solicitar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!Object.values(faltan).some(Boolean)) setConfirmar(true);
  };
  const ejecutar = async () => {
    const r = await envio.ejecutar(() => servicios.cerrarVigencia(precio.codigo, cuerpo, intenciones.clave(`cierre:${precio.codigo}`, cuerpo)));
    setConfirmar(false);
    if (r?.ok) {
      intenciones.olvidar(`cierre:${precio.codigo}`, cuerpo);
      alCerrado(`Vigencia de ${precio.codigo} cerrada el ${formatearFecha(r.datos.cerrado.vigenteHasta)}; sucesor ${r.datos.sucesor.codigo} desde el ${formatearFecha(r.datos.sucesor.vigenteDesde)}.`);
    }
  };
  const falta = (k: keyof typeof faltan, texto: string, ruta: string) => (intentado && faltan[k] ? texto : errorDe(envio.fallo, ruta));
  return (
    <form className="formulario" onSubmit={solicitar} noValidate aria-label="Cerrar vigencia y registrar sucesor">
      <p className="formulario-titulo">Cerrar vigencia de {precio.codigo} y registrar el sucesor</p>
      <Aviso tono="info" titulo="Cómo funciona">
        <p>
          Adaptación del DEMO (la política definitiva de vigencias está pendiente con el cliente, P3). El precio actual ({mxn(precio.precioUnitario)}) no
          cambia: solo se adelanta su último día, que no puede ser anterior a hoy ({formatearFecha(hoy)}). El sucesor empieza después de ese día. Si el
          sucesor no se puede registrar, la vigencia no se acorta.
        </p>
      </Aviso>
      <div className="formulario-fila">
        <CampoTexto
          etiqueta="Nuevo último día del precio actual"
          enfocar
          tipo="date"
          valor={nuevaHasta}
          alCambiar={(v) => {
            setNuevaHasta(v);
            if (!desdeEditado) setDesde(diaSiguiente(v));
          }}
          max={10}
          obligatorio
          error={errorDe(envio.fallo, "nuevaHasta")}
          ayuda={`Inclusive. Entre ${formatearFecha(inicial)} y el día anterior a ${formatearFecha(precio.vigenteHasta)}.`}
        />
        <CampoTexto
          etiqueta="El sucesor empieza"
          tipo="date"
          valor={desde}
          alCambiar={(v) => (setDesde(v), setDesdeEditado(true))}
          max={10}
          obligatorio
          error={errorDe(envio.fallo, "sucesor.vigenteDesde")}
          ayuda="Se propone el día siguiente."
        />
        <CampoTexto etiqueta="El sucesor termina" tipo="date" valor={hasta} alCambiar={setHasta} max={10} obligatorio error={falta("hasta", "Indique la fecha final.", "sucesor.vigenteHasta")} ayuda="Inclusive." />
      </div>
      <CampoTexto
        etiqueta={`Precio del sucesor en MXN por ${precio.producto.unidadCompra}`}
        valor={importe}
        alCambiar={setImporte}
        max={30}
        inputMode="decimal"
        obligatorio
        error={falta("importe", "Indique el precio del sucesor.", "sucesor.precioUnitario")}
        ayuda="Antes de impuestos. Punto decimal, hasta 6 decimales."
      />
      <CampoTexto etiqueta="Fuente del sucesor" valor={fuente} alCambiar={setFuente} max={LIMITES_CATALOGO_ADMIN.longitudFuente} obligatorio error={falta("fuente", "Indique la fuente.", "sucesor.fuente")} />
      <CampoTexto
        etiqueta="Motivo"
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        obligatorio
        multilinea
        error={falta("motivo", `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).`, "motivo")}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`${precio.codigo} quedará vigente hasta el ${formatearFecha(nuevaHasta)} y el sucesor desde el ${formatearFecha(desde)}. ${
            impacto.borradoresAbiertos > 0
              ? `${impacto.borradoresAbiertos} cotización(es) abierta(s) lo eligieron: no se cambian solas; después de esa fecha su cálculo pedirá elegir el sucesor u otro precio (BL-09).`
              : "Ninguna cotización abierta lo eligió."
          } Las versiones y los PDF emitidos no cambian.`}
          accion="Cerrar vigencia y registrar sucesor"
          variante="primario"
          alConfirmar={() => void ejecutar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <Acciones enviando={envio.enviando} texto="Revisar y confirmar" alCancelar={alCancelar} />
      )}
    </form>
  );
}

function FormularioAnulacion({
  precio,
  impacto,
  servicios,
  alCancelar,
  alRecargar,
  alAnulado,
}: {
  precio: PrecioAdmin;
  impacto: ImpactoCatalogo;
  servicios: ServiciosCatalogoAdmin;
  alCancelar: () => void;
  alRecargar: () => void;
  alAnulado: (m: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  const corto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const cuerpo = { revision: precio.revision, motivo: motivo.trim() };
  const ejecutar = async () => {
    const r = await envio.ejecutar(() => servicios.anularPrecio(precio.codigo, cuerpo, intenciones.clave(`anular:${precio.codigo}`, cuerpo)));
    setConfirmar(false);
    if (r?.ok) {
      intenciones.olvidar(`anular:${precio.codigo}`, cuerpo);
      alAnulado(`Precio ${precio.codigo} anulado. El registro se conserva.`);
    }
  };
  return (
    <form
      className="formulario"
      noValidate
      aria-label="Anular precio erróneo"
      onSubmit={(e) => {
        e.preventDefault();
        setIntentado(true);
        if (!corto) setConfirmar(true);
      }}
    >
      <p className="formulario-titulo">Anular {precio.codigo} por error de captura</p>
      <p className="ayuda">Úsela solo si el precio se capturó mal. Para un cambio de precio del proveedor use «Cerrar vigencia y registrar sucesor».</p>
      <CampoTexto
        etiqueta="Motivo de la anulación"
        enfocar
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        obligatorio
        multilinea
        error={intentado && corto ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : errorDe(envio.fallo, "motivo")}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`La anulación es definitiva: ${precio.codigo} se conserva marcado como anulado y deja de poder elegirse. ${
            impacto.borradoresAbiertos > 0
              ? `${impacto.borradoresAbiertos} cotización(es) abierta(s) lo eligieron: su cálculo quedará bloqueado (BL-08) hasta que el Preparador elija otro precio.`
              : "Ninguna cotización abierta lo eligió."
          } Las versiones y los PDF emitidos no cambian.`}
          accion="Anular precio"
          alConfirmar={() => void ejecutar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <Acciones enviando={envio.enviando} texto="Revisar y confirmar" alCancelar={alCancelar} />
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tarifas de mano de obra
// ---------------------------------------------------------------------------

function FormularioTarifa({ servicios, hoy, alGuardar, alCancelar }: { servicios: ServiciosCatalogoAdmin; hoy: string; alGuardar: (d: { modalidad: ModalidadManoObra; descripcion: string; unidad: string; importe: string; rendimientoJornada: string | null; proveedorCodigo: string | null; vigenteDesde: string; vigenteHasta: string; fuente: string }) => Promise<ResultadoApi<unknown>>; alCancelar: () => void }) {
  const referencias = useCarga((s) => servicios.unidades(s), []);
  const buscarProveedor = useMemo(() => buscarProveedores(servicios), [servicios]);
  const [modalidad, setModalidad] = useState<ModalidadManoObra | "">("");
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("");
  const [importe, setImporte] = useState("");
  const [rendimiento, setRendimiento] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState("");
  const [fuente, setFuente] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  if (referencias.estado.fase === "cargando") return <Cargando etiqueta="Cargando unidades y proveedores…" />;
  if (referencias.estado.fase === "error") return <CargaFallida fallo={referencias.estado.fallo} alReintentar={referencias.recargar} />;
  const { unidades } = referencias.estado.datos;
  const faltan = {
    modalidad: modalidad === "",
    descripcion: descripcion.trim() === "",
    unidad: unidad === "",
    importe: importe.trim() === "",
    rendimiento: modalidad === "JORNADA" && rendimiento.trim() === "",
    desde: desde === "",
    hasta: hasta === "",
    fuente: fuente.trim() === "",
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(faltan).some(Boolean) || modalidad === "") return;
    void envio.ejecutar(() =>
      alGuardar({
        modalidad,
        descripcion: descripcion.trim(),
        unidad,
        importe: importe.trim(),
        rendimientoJornada: modalidad === "JORNADA" ? rendimiento.trim() : null,
        proveedorCodigo: proveedor || null,
        vigenteDesde: desde,
        vigenteHasta: hasta,
        fuente: fuente.trim(),
      }),
    );
  };
  const falta = (k: keyof typeof faltan, texto: string, ruta: string) => (intentado && faltan[k] ? texto : errorDe(envio.fallo, ruta));
  const textoImporte = modalidad === "JORNADA" ? "Importe de una jornada (MXN)" : modalidad === "SUBCONTRATO" ? `Precio del subcontrato por ${unidad || "unidad"} (MXN)` : `Importe por ${unidad || "unidad"} del concepto (MXN)`;
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label="Registrar tarifa">
      <p className="formulario-titulo">Registrar tarifa</p>
      <p className="ayuda">Las tarifas no se editan: registre una nueva, asígnela al concepto en «Tarifa de conceptos» y desactive la anterior.</p>
      <div className="formulario-fila">
        <CampoSeleccion
          etiqueta="Modalidad"
          enfocar
          valor={modalidad}
          alCambiar={(v) => setModalidad(v as ModalidadManoObra | "")}
          obligatorio
          opciones={MODALIDADES_MANO_OBRA.map((m) => ({ valor: m, texto: TEXTO_MODALIDAD[m] }))}
          error={falta("modalidad", "Seleccione la modalidad.", "modalidad")}
        />
        <CampoSeleccion
          etiqueta="Unidad del concepto a la que aplica"
          valor={unidad}
          alCambiar={setUnidad}
          obligatorio
          opciones={unidades.filter((u) => (MAGNITUDES_UNIDAD_TARIFA as readonly string[]).includes(u.magnitud)).map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre}` }))}
          error={falta("unidad", "Seleccione la unidad.", "unidad")}
          ayuda="Debe coincidir con la unidad del concepto (BL-06)."
        />
      </div>
      <CampoTexto etiqueta="Descripción" valor={descripcion} alCambiar={setDescripcion} max={LIMITES_CATALOGO_ADMIN.longitudDescripcion} obligatorio error={falta("descripcion", "Escriba la descripción.", "descripcion")} ayuda="Datos DEMO: use la marca [DEMO]." />
      <div className="formulario-fila">
        <CampoTexto etiqueta={textoImporte} valor={importe} alCambiar={setImporte} max={30} inputMode="decimal" obligatorio error={falta("importe", "Indique el importe (mayor que cero).", "importe")} ayuda="Punto decimal, hasta 6 decimales; no se redondea." />
        {modalidad === "JORNADA" ? (
          <CampoTexto
            etiqueta={`Rendimiento por jornada (${unidad || "unidades"} por jornada)`}
            valor={rendimiento}
            alCambiar={setRendimiento}
            max={30}
            inputMode="decimal"
            obligatorio
            error={falta("rendimiento", "Falta el rendimiento por jornada.", "rendimientoJornada")}
          />
        ) : null}
      </div>
      <SelectorRegistro
        etiqueta="Subcontratista"
        valor={proveedor}
        alCambiar={(c) => setProveedor(c)}
        buscar={buscarProveedor}
        textoVacio="Sin subcontratista"
        permitirQuitar
        error={errorDe(envio.fallo, "proveedorCodigo")}
      />
      <div className="formulario-fila">
        <CampoTexto etiqueta="Vigente desde" tipo="date" valor={desde} alCambiar={setDesde} max={10} obligatorio error={falta("desde", "Indique la fecha inicial.", "vigenteDesde")} ayuda="Inclusive." />
        <CampoTexto etiqueta="Vigente hasta" tipo="date" valor={hasta} alCambiar={setHasta} max={10} obligatorio error={falta("hasta", "Indique la fecha final.", "vigenteHasta")} ayuda="Inclusive. Fuera de vigencia bloquea el cálculo (BL-10)." />
      </div>
      <CampoTexto etiqueta="Fuente" valor={fuente} alCambiar={setFuente} max={LIMITES_CATALOGO_ADMIN.longitudFuente} obligatorio error={falta("fuente", "Indique la fuente.", "fuente")} />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      <Acciones enviando={envio.enviando} texto="Registrar tarifa" alCancelar={alCancelar} />
    </form>
  );
}

function VistaTarifas({ servicios }: { servicios: ServiciosCatalogoAdmin }) {
  const [buscar, setBuscar] = useState("");
  const [inactivas, setInactivas] = useState(false);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarTarifas({ buscar, incluirInactivas: inactivas, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivas, paginas.actual],
  );
  const hoy = estado.fase === "listo" ? estado.datos.fechaReferencia : "";
  return (
    <section className="seccion" aria-labelledby="titulo-tarifas">
      <h2 id="titulo-tarifas" className="seccion-titulo">
        Tarifas de mano de obra y subcontrato
      </h2>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando && hoy ? (
        <FormularioTarifa
          servicios={servicios}
          hoy={hoy}
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.registrarTarifa(d, intenciones.clave("registrar-tarifa", d));
            if (r.ok) {
              intenciones.olvidar("registrar-tarifa", d);
              setCreando(false);
              setMensaje(`Tarifa ${r.datos.codigo} registrada. Para usarla, asígnela al concepto en «Tarifa de conceptos».`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones"><Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))} disabled={!hoy}>
          Registrar tarifa
        </Boton></div>
      )}
      <Busqueda etiqueta="Buscar por código o descripción" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivas} onChange={(e) => (paginas.reiniciar(), setInactivas(e.target.checked))} />
          Incluir inactivas
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando tarifas…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.tarifas.length === 0 ? (
          <SinResultados>No hay tarifas con esos criterios.</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Tarifas</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Modalidad y descripción</th>
                    <th scope="col">Importe</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.tarifas.map((t) => (
                    <FilaTarifa
                      key={t.codigo}
                      t={t}
                      servicios={servicios}
                      abierto={abierto === t.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === t.codigo ? null : t.codigo)))}
                      alCambiar={(m) => (setMensaje(m), recargar())}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPaginas paginas={paginas} siguiente={estado.datos.siguiente} />
          </>
        )
      ) : null}
    </section>
  );
}

const textoImporteTarifa = (t: { modalidad: ModalidadManoObra; importe: string; unidad: string }) =>
  t.modalidad === "JORNADA" ? `${mxn(t.importe)} / jornada` : `${mxn(t.importe)} / ${t.unidad}`;

function FilaTarifa({ t, servicios, abierto, alAlternar, alCambiar }: { t: TarifaAdmin; servicios: ServiciosCatalogoAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void }) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{t.codigo}</Codigo>
        </td>
        <td data-etiqueta="Tarifa">
          {TEXTO_MODALIDAD[t.modalidad]}
          <span className="ayuda bloque">
            {t.descripcion}
            {t.proveedor ? ` · ${t.proveedor.nombre}` : ""}
          </span>
        </td>
        <td data-etiqueta="Importe" className="numero">
          {textoImporteTarifa(t)}
          {t.rendimientoJornada ? <span className="ayuda bloque">{formatearCantidad(t.rendimientoJornada)} {t.unidad} por jornada</span> : null}
        </td>
        <td data-etiqueta="Vigencia">
          {vigencia(t.vigenteDesde, t.vigenteHasta)}
          {t.vigenteHoy ? null : <span className="ayuda bloque">No vigente hoy</span>}
        </td>
        <td data-etiqueta="Estado">{t.activa ? <Insignia tono="estado">Activa</Insignia> : <Insignia tono="menor">Inactiva</Insignia>}</td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Gestionar"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={6}>
            <PanelTarifa codigo={t.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelTarifa({ codigo, servicios, alCambiar }: { codigo: string; servicios: ServiciosCatalogoAdmin; alCambiar: (m: string) => void }) {
  const { estado, recargar } = useCarga((s) => servicios.detalleTarifa(codigo, s), [codigo]);
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { tarifa, conceptos, impacto, historial } = estado.datos;
  const cambiar = async () => {
    const r = await envio.ejecutar(() => servicios.cambiarActivaTarifa(codigo, { revision: tarifa.revision, activa: !tarifa.activa }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activa ? `Tarifa ${codigo} reactivada.` : `Tarifa ${codigo} desactivada; su historial se conserva.`);
  };
  return (
    <div className="panel-registro">
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      <p>
        <strong>Conceptos que la usan:</strong> {conceptos.length === 0 ? "ninguno" : conceptos.map((c) => c.codigo).join(", ")}
      </p>
      <p className="ayuda">Fuente: {tarifa.fuente} · registrada {formatearInstante(tarifa.registradoEn)} · {tarifa.registradoPor ?? "carga DEMO"}</p>
      {confirmar ? (
        <Confirmacion
          texto={tarifa.activa ? textoImpacto(impacto, `Se desactivará ${codigo}.`) : `Se reactivará ${codigo}.`}
          accion={tarifa.activa ? "Desactivar" : "Reactivar"}
          variante={tarifa.activa ? "peligro" : "primario"}
          alConfirmar={() => void cambiar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <Boton variante={tarifa.activa ? "peligro" : "secundario"} onClick={() => setConfirmar(true)}>
          {tarifa.activa ? "Desactivar tarifa" : "Reactivar tarifa"}
        </Boton>
      )}
      <Historial eventos={historial} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asignación de tarifa a conceptos (dependencia mínima autorizada)
// ---------------------------------------------------------------------------

function VistaConceptos({ servicios }: { servicios: ServiciosCatalogoAdmin }) {
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const { estado, recargar } = useCarga((s) => servicios.listarConceptos({ buscar, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s), [buscar, paginas.actual]);
  return (
    <section className="seccion" aria-labelledby="titulo-conceptos-tarifa">
      <h2 id="titulo-conceptos-tarifa" className="seccion-titulo">
        Tarifa asignada a cada concepto
      </h2>
      <p className="ayuda">
        Aquí solo se cambia la tarifa de un concepto (Word §3.5). La edición de conceptos y componentes llegará en otro módulo. Cambiar solo la tarifa
        conserva la aprobación técnica del concepto.
      </p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      <Busqueda etiqueta="Buscar por código o descripción" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))} />
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando conceptos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.conceptos.length === 0 ? (
          <SinResultados>No hay conceptos con esos criterios.</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Conceptos y tarifa</caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Tarifa actual</th>
                    <th scope="col">Cotizaciones abiertas</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.conceptos.map((c) => (
                    <FilaConcepto
                      key={c.codigo}
                      c={c}
                      servicios={servicios}
                      abierto={abierto === c.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === c.codigo ? null : c.codigo)))}
                      alAsignada={(m) => (setMensaje(m), setAbierto(null), recargar())}
                      alRecargar={recargar}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPaginas paginas={paginas} siguiente={estado.datos.siguiente} />
          </>
        )
      ) : null}
    </section>
  );
}

function FilaConcepto({ c, servicios, abierto, alAlternar, alAsignada, alRecargar }: { c: ConceptoTarifaAdmin; servicios: ServiciosCatalogoAdmin; abierto: boolean; alAlternar: () => void; alAsignada: (m: string) => void; alRecargar: () => void }) {
  return (
    <>
      <tr>
        <td data-etiqueta="Concepto">
          <Codigo>{c.codigo}</Codigo> {c.descripcion}
          <span className="ayuda bloque">
            {c.estado}
            {c.activo ? "" : " · inactivo"}
          </span>
        </td>
        <td data-etiqueta="Unidad">{c.unidad}</td>
        <td data-etiqueta="Tarifa actual">
          {c.tarifa ? (
            <>
              <Codigo>{c.tarifa.codigo}</Codigo> {TEXTO_MODALIDAD[c.tarifa.modalidad]} · {textoImporteTarifa(c.tarifa)}
              <span className="ayuda bloque">
                {vigencia(c.tarifa.vigenteDesde, c.tarifa.vigenteHasta)}
                {c.tarifa.activa ? "" : " · inactiva"}
              </span>
            </>
          ) : (
            <span className="ayuda">Sin tarifa</span>
          )}
        </td>
        <td data-etiqueta="Cotizaciones abiertas" className="numero">
          {c.borradoresAbiertos}
        </td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Asignar tarifa"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={5}>
            <FormularioAsignacion concepto={c} servicios={servicios} alAsignada={alAsignada} alRecargar={alRecargar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FormularioAsignacion({ concepto, servicios, alAsignada, alRecargar }: { concepto: ConceptoTarifaAdmin; servicios: ServiciosCatalogoAdmin; alAsignada: (m: string) => void; alRecargar: () => void }) {
  const tarifas = useCarga((s) => servicios.listarTarifas({ unidad: concepto.unidad }, s), [concepto.unidad]);
  const [nueva, setNueva] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  if (tarifas.estado.fase === "cargando") return <Cargando etiqueta="Cargando tarifas de la misma unidad…" />;
  if (tarifas.estado.fase === "error") return <CargaFallida fallo={tarifas.estado.fallo} alReintentar={tarifas.recargar} />;
  const opciones = tarifas.estado.datos.tarifas.filter((t) => t.codigo !== concepto.tarifa?.codigo);
  const corto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const cuerpo = { tarifaActual: concepto.tarifa?.codigo ?? null, tarifaNueva: nueva, motivo: motivo.trim() };
  const elegida = opciones.find((t) => t.codigo === nueva);
  const ejecutar = async () => {
    const r = await envio.ejecutar(() => servicios.asignarTarifa(concepto.codigo, cuerpo, intenciones.clave(`tarifa:${concepto.codigo}`, cuerpo)));
    setConfirmar(false);
    if (r?.ok) {
      intenciones.olvidar(`tarifa:${concepto.codigo}`, cuerpo);
      alAsignada(`Tarifa ${nueva} asignada a ${concepto.codigo}. Las cotizaciones abiertas deben recalcular.`);
    }
  };
  return (
    <form
      className="formulario"
      noValidate
      aria-label={`Asignar tarifa a ${concepto.codigo}`}
      onSubmit={(e) => {
        e.preventDefault();
        setIntentado(true);
        if (nueva && !corto) setConfirmar(true);
      }}
    >
      <p className="formulario-titulo">Asignar tarifa a {concepto.codigo}</p>
      {opciones.length === 0 ? (
        <Aviso tono="info" titulo={`No hay otras tarifas activas en ${concepto.unidad}`}>
          <p>Registre una tarifa en la unidad del concepto en «Mano de obra».</p>
        </Aviso>
      ) : (
        <CampoSeleccion
          etiqueta={`Tarifa nueva (activas en ${concepto.unidad})`}
          valor={nueva}
          alCambiar={setNueva}
          obligatorio
          opciones={opciones.map((t) => ({ valor: t.codigo, texto: `${t.codigo} · ${TEXTO_MODALIDAD[t.modalidad]} · ${textoImporteTarifa(t)}${t.vigenteHoy ? "" : " · no vigente hoy"}` }))}
          error={intentado && !nueva ? "Seleccione la tarifa." : errorDe(envio.fallo, "tarifaNueva")}
        />
      )}
      <CampoTexto
        etiqueta="Motivo"
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        obligatorio
        multilinea
        error={intentado && corto ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : errorDe(envio.fallo, "motivo")}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`${concepto.codigo} pasará de ${concepto.tarifa?.codigo ?? "sin tarifa"} a ${nueva}${elegida && !elegida.vigenteHoy ? " (no vigente hoy: el cálculo la bloqueará fuera de su vigencia, BL-10)" : ""}. La aprobación técnica del concepto se conserva. ${
            concepto.borradoresAbiertos > 0
              ? `${concepto.borradoresAbiertos} cotización(es) abierta(s) lo usan: deberán recalcular, y sus versiones ya calculadas no podrán enviarse ni aprobarse sin una versión nueva (BL-16).`
              : "Ninguna cotización abierta lo usa."
          } Las versiones y los PDF emitidos conservan su tarifa.`}
          accion="Asignar tarifa"
          variante="primario"
          alConfirmar={() => void ejecutar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : opciones.length > 0 ? (
        <Acciones enviando={envio.enviando} texto="Revisar y confirmar" />
      ) : null}
    </form>
  );
}
