/**
 * Administración del sistema (módulo 13, ADR-0017): parámetros de venta y plantillas de textos (B-38)
 * y personas con sus funciones (B-39). Solo con `parametros.administrar` y `personas.administrar`
 * (Administrador del sistema); la API lo exige en cada ruta y decide siempre.
 *
 * - Porcentajes: se capturan en % y se guarda la fracción del libro (20 % = 0.2). Vacío = no definido,
 *   que no es lo mismo que 0.
 * - Un cambio de parámetros solo afecta a cálculos y cotizaciones NUEVOS. Antes de guardar se muestra
 *   el impacto en las cotizaciones abiertas; versiones y PDF emitidos no cambian.
 * - La contraseña temporal se muestra una sola vez, solo en memoria de esta pantalla; nunca se guarda
 *   en el navegador. Si se pierde, hay que restablecerla.
 * - Un conflicto (otra persona guardó antes) conserva lo escrito y ofrece recargar.
 */
import {
  FUNCIONES_USUARIO,
  LIMITES_ADMINISTRACION,
  LIMITES_CATALOGO_ADMIN,
  type DetalleParametros,
  type EdicionParametros,
  type EventoCatalogo,
  type FuncionUsuario,
  type PersonaAdmin,
  type RespuestaCredencialTemporal,
} from "@softarq/contracts";
import { useState, type FormEvent, type ReactNode } from "react";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { AvisoFallo, CampoCasilla, CampoSeleccion, CampoTexto, ControlPaginas, errorDe, usePaginas } from "../catalogo-admin/campos.tsx";
import { Busqueda, Confirmacion, textoImpactoVersiones, useEnvio } from "../catalogo-admin/piezas.tsx";
import { Enlace, VISTAS_ADMINISTRACION_RUTA, type VistaAdministracion } from "../navegacion/ruta.tsx";
import { nombreFunciones } from "../sesion/ProveedorSesion.tsx";
import { fraccionDePorcentaje, porcentajeDeFraccion } from "./porcentaje.ts";
import type { ServiciosAdministracion } from "./servicios.ts";

const TITULOS: Record<VistaAdministracion, string> = { parametros: "Parámetros", personas: "Personas y funciones" };

export function PantallaAdministracion({ servicios, vista }: { servicios: ServiciosAdministracion; vista: VistaAdministracion }) {
  return (
    <Pagina titulo="Administración" subtitulo="Administrador del sistema. Datos DEMO ilustrativos: no registre personas ni datos reales.">
      <NavegacionAdministracion vista={vista} />
      {vista === "parametros" ? <VistaParametros servicios={servicios} /> : <VistaPersonas servicios={servicios} />}
    </Pagina>
  );
}

function NavegacionAdministracion({ vista }: { vista: VistaAdministracion | null }) {
  return (
    <nav aria-label="Secciones de la administración">
      <ul className="navegacion-catalogo">
        {VISTAS_ADMINISTRACION_RUTA.map((v) => (
          <li key={v}>
            <Enlace a={{ pantalla: "administracion", vista: v }} className="navegacion-enlace" actual={v === vista}>
              {TITULOS[v]}
            </Enlace>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Parámetros (B-38)
// ---------------------------------------------------------------------------

/** "20 % (fracción guardada: 0.2)" o «No definido». */
export function textoPorcentaje(fraccion: string | null): string {
  return fraccion === null ? "No definido" : `${porcentajeDeFraccion(fraccion)} % (fracción guardada: ${fraccion})`;
}

type Formulario = {
  recargo: string;
  conImpuesto: boolean;
  tasa: string;
  base: string;
  tratamiento: string;
  nombre: string;
  vigencia: string;
  conTextos: boolean;
  alcance: string;
  condiciones: string;
  exclusiones: string;
};

function formularioDe(p: DetalleParametros["parametros"]): Formulario {
  return {
    recargo: p.recargoSobreCosto === null ? "" : porcentajeDeFraccion(p.recargoSobreCosto),
    conImpuesto: p.impuesto !== null,
    tasa: p.impuesto ? porcentajeDeFraccion(p.impuesto.tasa) : "",
    base: p.impuesto?.base ?? "SUBTOTAL_VENTA",
    tratamiento: p.impuesto?.tratamiento ?? "",
    nombre: p.impuesto?.nombre ?? "",
    vigencia: p.vigenciaDias === null ? "" : String(p.vigenciaDias),
    conTextos: p.textos !== null,
    alcance: p.textos?.alcance ?? "",
    condiciones: p.textos?.condiciones ?? "",
    exclusiones: p.textos?.exclusiones ?? "",
  };
}

const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Cambios respecto a lo guardado, o los errores locales por campo (la validación final es del servidor). */
function cambiosDe(f: Formulario, p: DetalleParametros["parametros"]): { cambios: Omit<EdicionParametros, "revision" | "motivo">; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  const cambios: Omit<EdicionParametros, "revision" | "motivo"> = {};
  const recargo = f.recargo.trim() === "" ? null : fraccionDePorcentaje(f.recargo);
  if (f.recargo.trim() !== "" && recargo === null) errores["recargoSobreCosto"] = "Escriba un porcentaje entre 0 y 100, con hasta 4 decimales (20 = 20 %).";
  else if (recargo !== p.recargoSobreCosto) cambios.recargoSobreCosto = recargo;

  if (f.conImpuesto) {
    const tasa = fraccionDePorcentaje(f.tasa);
    if (tasa === null) errores["impuesto.tasa"] = "Escriba la tasa en %, entre 0 y 100 (16 = 16 %).";
    if (f.tratamiento.trim() === "") errores["impuesto.tratamiento"] = "Escriba el tratamiento fiscal.";
    if (f.nombre.trim() === "") errores["impuesto.nombre"] = "Escriba el nombre del impuesto.";
    const impuesto = { tasa: tasa ?? "", base: "SUBTOTAL_VENTA" as const, tratamiento: f.tratamiento.trim(), nombre: f.nombre.trim() };
    if (tasa !== null && !iguales(impuesto, p.impuesto)) cambios.impuesto = impuesto;
  } else if (p.impuesto !== null) {
    cambios.impuesto = null;
  }

  const vigencia = f.vigencia.trim();
  if (!/^\d{1,4}$/.test(vigencia) || Number(vigencia) < 1 || Number(vigencia) > LIMITES_ADMINISTRACION.vigenciaMaximaDias) {
    errores["vigenciaDias"] = `Escriba un número entero de días entre 1 y ${LIMITES_ADMINISTRACION.vigenciaMaximaDias}.`;
  } else if (Number(vigencia) !== p.vigenciaDias) {
    cambios.vigenciaDias = Number(vigencia);
  }

  if (f.conTextos) {
    const textos = { alcance: f.alcance.trim(), condiciones: f.condiciones.trim(), exclusiones: f.exclusiones.trim() };
    for (const [k, v] of Object.entries(textos)) if (v === "") errores[`textos.${k}`] = "Escriba el texto o quite las plantillas.";
    if (Object.values(textos).every((v) => v !== "") && !iguales(textos, p.textos)) cambios.textos = textos;
  } else if (p.textos !== null) {
    cambios.textos = null;
  }
  return { cambios, errores };
}

function VistaParametros({ servicios }: { servicios: ServiciosAdministracion }) {
  const { estado, recargar, setEstado } = useCarga((s) => servicios.parametros(s), []);
  const [mensaje, setMensaje] = useState<string | null>(null);
  // `null` = mostrar lo guardado; se crea al empezar a editar y se conserva si falla el guardado.
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando parámetros…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const detalle = estado.datos;
  return (
    <section className="seccion" aria-labelledby="titulo-parametros">
      <h2 id="titulo-parametros" className="seccion-titulo">
        Parámetros de venta y textos
      </h2>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      <ResumenParametros detalle={detalle} />
      {formulario ? (
        <FormularioParametros
          detalle={detalle}
          formulario={formulario}
          setFormulario={setFormulario}
          servicios={servicios}
          alGuardado={(d) => {
            setEstado({ fase: "listo", datos: d });
            setFormulario(null);
            setMensaje("Parámetros guardados. Solo afectan a cálculos y cotizaciones nuevos.");
          }}
          alCancelar={() => setFormulario(null)}
          alRecargar={() => (setFormulario(null), recargar())}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => (setMensaje(null), setFormulario(formularioDe(detalle.parametros)))}>
            Editar parámetros
          </Boton>
        </div>
      )}
      <h3>Historial</h3>
      <HistorialAdministracion eventos={detalle.historial} />
    </section>
  );
}

function ResumenParametros({ detalle }: { detalle: DetalleParametros }) {
  const p = detalle.parametros;
  const impacto = textoImpactoVersiones(detalle.impacto);
  return (
    <>
      <dl className="datos-cotizacion">
        <div>
          <dt>Ambiente</dt>
          <dd>
            {p.ambiente === "DEMO" ? <Insignia tono="demo">DEMO</Insignia> : p.ambiente} <span className="ayuda">(no se edita: una organización DEMO no pasa a producción)</span>
          </dd>
        </div>
        <div>
          <dt>Moneda</dt>
          <dd>{p.moneda} <span className="ayuda">(fija, D-18)</span></dd>
        </div>
        <div>
          <dt>Recargo (RECARGO_PCT)</dt>
          <dd>{textoPorcentaje(p.recargoSobreCosto)}</dd>
        </div>
        <div>
          <dt>Impuesto</dt>
          <dd>{p.impuesto ? `${p.impuesto.nombre}: ${textoPorcentaje(p.impuesto.tasa)} sobre el subtotal de venta · ${p.impuesto.tratamiento}` : "No definido"}</dd>
        </div>
        <div>
          <dt>Vigencia de la cotización</dt>
          <dd>{p.vigenciaDias === null ? "No definida" : `${p.vigenciaDias} días`}</dd>
        </div>
        <div>
          <dt>Última modificación</dt>
          <dd>
            {formatearInstante(p.modificadoEn)} · {p.modificadoPor ?? "carga inicial"} · revisión {p.revision}
          </dd>
        </div>
      </dl>
      <p className="ayuda">
        Los datos del emisor del PDF se configuran en <Enlace a={{ pantalla: "emisor" }}>Emisor</Enlace>. Los contadores de folios no se editan.
      </p>
      <Aviso tono="info" titulo="Cotizaciones abiertas">
        <p>
          {impacto ??
            "Hoy ningún cambio de recargo, impuesto o vigencia afecta a cotizaciones abiertas."}{" "}
          Un cambio solo se aplica a cálculos y cotizaciones nuevos; las versiones emitidas y sus PDF no cambian.
        </p>
      </Aviso>
    </>
  );
}

function FormularioParametros({
  detalle,
  formulario: f,
  setFormulario,
  servicios,
  alGuardado,
  alCancelar,
  alRecargar,
}: {
  detalle: DetalleParametros;
  formulario: Formulario;
  setFormulario: (f: Formulario) => void;
  servicios: ServiciosAdministracion;
  alGuardado: (d: DetalleParametros) => void;
  alCancelar: () => void;
  alRecargar: () => void;
}) {
  const p = detalle.parametros;
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  const campo = <K extends keyof Formulario>(k: K) => (v: Formulario[K]) => setFormulario({ ...f, [k]: v });
  const { cambios, errores } = cambiosDe(f, p);
  const sinCambios = Object.keys(cambios).length === 0;
  const motivoCorto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const error = (ruta: string) => (intentado ? errores[ruta] : undefined) ?? errorDe(envio.fallo, ruta);
  const afectaVersiones = cambios.recargoSobreCosto !== undefined || cambios.impuesto !== undefined || cambios.vigenciaDias !== undefined;

  const revisar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.keys(errores).length > 0 || sinCambios || motivoCorto) return;
    setConfirmar(true);
  };
  const guardar = async () => {
    const r = await envio.ejecutar(() => servicios.editarParametros({ revision: p.revision, motivo: motivo.trim(), ...cambios }));
    setConfirmar(false);
    if (r?.ok) alGuardado(r.datos);
  };
  const impacto = afectaVersiones ? textoImpactoVersiones(detalle.impacto) : null;
  const vistaFraccion = (t: string) => {
    const fr = t.trim() === "" ? null : fraccionDePorcentaje(t);
    return t.trim() === "" ? "Vacío = no definido (no es 0)." : fr === null ? "Porcentaje no válido." : `Se guardará la fracción ${fr} (${t.trim()} %).`;
  };
  return (
    <form className="formulario" onSubmit={revisar} noValidate aria-label="Editar parámetros">
      <p className="formulario-titulo">Editar parámetros</p>
      <CampoTexto
        etiqueta="Recargo (%)"
        enfocar
        inputMode="decimal"
        valor={f.recargo}
        alCambiar={campo("recargo")}
        max={9}
        error={error("recargoSobreCosto")}
        ayuda={`Se suma al costo directo para obtener el precio de venta (RECARGO_PCT, BL-12). Capture el porcentaje: 20 = 20 %. ${vistaFraccion(f.recargo)} 0 = sin recargo.`}
      />
      <CampoCasilla
        etiqueta="Impuesto definido"
        valor={f.conImpuesto}
        alCambiar={campo("conImpuesto")}
        ayuda="Sin impuesto definido, el cálculo queda bloqueado (BL-13): tasa, base, tratamiento y nombre van juntos."
      />
      {f.conImpuesto ? (
        <>
          <div className="formulario-fila">
            <CampoTexto etiqueta="Tasa (%)" inputMode="decimal" obligatorio valor={f.tasa} alCambiar={campo("tasa")} max={9} error={error("impuesto.tasa")} ayuda={vistaFraccion(f.tasa)} />
            <CampoSeleccion
              etiqueta="Base"
              obligatorio
              valor={f.base}
              alCambiar={campo("base")}
              opciones={[{ valor: "SUBTOTAL_VENTA", texto: "Subtotal de venta" }]}
              ayuda="La única base del libro (LISTA_BASE)."
            />
          </div>
          <div className="formulario-fila">
            <CampoTexto etiqueta="Nombre del impuesto" obligatorio valor={f.nombre} alCambiar={campo("nombre")} max={LIMITES_ADMINISTRACION.longitudNombreImpuesto} error={error("impuesto.nombre")} />
            <CampoTexto etiqueta="Tratamiento fiscal" obligatorio valor={f.tratamiento} alCambiar={campo("tratamiento")} max={LIMITES_ADMINISTRACION.longitudTratamiento} error={error("impuesto.tratamiento")} />
          </div>
        </>
      ) : null}
      <CampoTexto
        etiqueta="Vigencia de la cotización (días)"
        inputMode="text"
        obligatorio
        valor={f.vigencia}
        alCambiar={campo("vigencia")}
        max={4}
        error={error("vigenciaDias")}
        ayuda="Número entero mayor que cero (VIGENCIA_DIAS)."
      />
      <CampoCasilla
        etiqueta="Plantillas de textos definidas"
        valor={f.conTextos}
        alCambiar={campo("conTextos")}
        ayuda="Se COPIAN a cada cotización nueva (TEXTO_ALCANCE, TEXTO_CONDICIONES, TEXTO_EXCLUSIONES). El Preparador puede editarlos en su borrador y la versión los congela; cambiar la plantilla no modifica cotizaciones existentes."
      />
      {f.conTextos ? (
        <>
          <CampoTexto etiqueta="Alcance" multilinea obligatorio valor={f.alcance} alCambiar={campo("alcance")} max={LIMITES_ADMINISTRACION.longitudTexto} error={error("textos.alcance")} />
          <CampoTexto etiqueta="Condiciones" multilinea obligatorio valor={f.condiciones} alCambiar={campo("condiciones")} max={LIMITES_ADMINISTRACION.longitudTexto} error={error("textos.condiciones")} />
          <CampoTexto etiqueta="Exclusiones" multilinea obligatorio valor={f.exclusiones} alCambiar={campo("exclusiones")} max={LIMITES_ADMINISTRACION.longitudTexto} error={error("textos.exclusiones")} />
        </>
      ) : null}
      <CampoTexto
        etiqueta="Motivo del cambio"
        multilinea
        obligatorio
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        error={intentado && motivoCorto ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : errorDe(envio.fallo, "motivo")}
        ayuda="Queda en el historial con los valores anteriores y nuevos."
      />
      {intentado && sinCambios ? <Aviso tono="aviso" titulo="No hay cambios que guardar" /> : null}
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`${impacto ?? "No afecta a cotizaciones abiertas."} Los cambios solo se aplican a cálculos y cotizaciones nuevos; las versiones emitidas y sus PDF no cambian.`}
          accion="Guardar parámetros"
          variante="primario"
          alConfirmar={() => void guardar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton type="submit" variante="primario" disabled={envio.enviando}>
            Revisar y guardar
          </Boton>
          <Boton variante="enlace" onClick={alCancelar} disabled={envio.enviando}>
            Cancelar
          </Boton>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

const TEXTOS_EVENTO: Record<string, string> = {
  PARAMETROS_EDITADOS: "Parámetros editados",
  PERSONA_CREADA: "Alta",
  PERSONA_EDITADA: "Edición",
  PERSONA_FUNCIONES: "Funciones cambiadas",
  PERSONA_DESACTIVADA: "Desactivada",
  PERSONA_REACTIVADA: "Reactivada",
  PERSONA_CONTRASENA_RESTABLECIDA: "Contraseña restablecida",
  PERSONA_CONTRASENA_CAMBIADA: "Contraseña cambiada por la persona",
};

const NOMBRES_CAMPO: Record<string, string> = { recargoSobreCosto: "recargo", impuesto: "impuesto", vigenciaDias: "vigencia", textos: "plantillas de textos" };

function valorHistorial(campo: string, v: unknown): string {
  if (v === null || v === undefined) return "no definido";
  if (campo === "recargoSobreCosto" && typeof v === "string") return `${porcentajeDeFraccion(v)} %`;
  if (campo === "vigenciaDias") return `${String(v)} días`;
  if (campo === "impuesto" && typeof v === "object") {
    const i = v as Record<string, unknown>;
    return `${String(i["nombre"])} ${typeof i["tasa"] === "string" ? porcentajeDeFraccion(i["tasa"]) : "?"} %`;
  }
  if (campo === "textos") return "plantillas";
  return String(v);
}

function detalleEvento(e: EventoCatalogo): ReactNode {
  const d = e.detalle;
  const partes: string[] = [];
  if (d["cambios"] && typeof d["cambios"] === "object") {
    for (const [campo, c] of Object.entries(d["cambios"] as Record<string, { anterior?: unknown; nuevo?: unknown }>)) {
      partes.push(campo === "textos" ? "plantillas de textos cambiadas" : `${NOMBRES_CAMPO[campo] ?? campo}: ${valorHistorial(campo, c.anterior)} → ${valorHistorial(campo, c.nuevo)}`);
    }
  }
  if (Array.isArray(d["anteriores"]) && Array.isArray(d["nuevas"])) {
    partes.push(`${nombreFunciones(d["anteriores"] as string[])} → ${nombreFunciones(d["nuevas"] as string[])}`);
  } else if (Array.isArray(d["funciones"])) {
    partes.push(`funciones: ${nombreFunciones(d["funciones"] as string[])}`);
  }
  if (Array.isArray(d["campos"])) partes.push(`campos: ${(d["campos"] as unknown[]).join(", ")}`);
  if (typeof d["sesionesRevocadas"] === "number") partes.push(`${d["sesionesRevocadas"]} sesión(es) revocada(s)`);
  if (typeof d["motivo"] === "string") partes.push(`motivo: ${d["motivo"]}`);
  return partes.length > 0 ? <span className="ayuda bloque">{partes.join(" · ")}</span> : null;
}

function HistorialAdministracion({ eventos }: { eventos: EventoCatalogo[] }) {
  if (eventos.length === 0) return <p className="ayuda">Sin cambios registrados desde la carga inicial.</p>;
  return (
    <ul className="lista-historial" aria-label="Historial de cambios">
      {eventos.map((e, i) => (
        <li key={`${e.tipo}-${e.ocurridoEn}-${i}`}>
          <strong>{TEXTOS_EVENTO[e.tipo] ?? e.tipo}</strong> · {formatearInstante(e.ocurridoEn)} · {e.usuario}
          {detalleEvento(e)}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Personas (B-39)
// ---------------------------------------------------------------------------

function EstadoPersona({ p }: { p: PersonaAdmin }) {
  return (
    <>
      {p.activa ? <Insignia tono="estado">Activa</Insignia> : <Insignia tono="menor">Inactiva</Insignia>}
      {p.cambioContrasenaPendiente ? (
        <>
          {" "}
          <Insignia tono="alerta">Contraseña temporal pendiente</Insignia>
        </>
      ) : null}
    </>
  );
}

/** Casillas de funciones (al menos una). */
function CampoFunciones({ valor, alCambiar, error, deshabilitadas = [] }: { valor: FuncionUsuario[]; alCambiar: (f: FuncionUsuario[]) => void; error?: string | null; deshabilitadas?: FuncionUsuario[] }) {
  return (
    <fieldset className="campo">
      <legend className="etiqueta">Funciones *</legend>
      {FUNCIONES_USUARIO.map((f) => (
        <label key={f} className="casilla">
          <input
            type="checkbox"
            checked={valor.includes(f)}
            disabled={deshabilitadas.includes(f)}
            onChange={(e) => alCambiar(e.target.checked ? FUNCIONES_USUARIO.filter((x) => x === f || valor.includes(x)) : valor.filter((x) => x !== f))}
          />
          {nombreFunciones([f])}
        </label>
      ))}
      <p className="ayuda">Una persona puede tener varias funciones; aun así no aprueba lo que preparó (BL-17).</p>
      {error ? <p className="error-campo">{error}</p> : null}
    </fieldset>
  );
}

/**
 * Contraseña temporal recién generada: se muestra una vez, solo en memoria. Al ocultarla o salir de la
 * pantalla desaparece; si se pierde, hay que restablecerla.
 */
export function CredencialTemporal({ r, alOcultar }: { r: RespuestaCredencialTemporal; alOcultar: () => void }) {
  if (r.contrasenaTemporal === null) {
    return (
      <Aviso tono="aviso" titulo="La contraseña temporal ya se entregó" rol="status">
        <p>Esta operación ya se había hecho y su contraseña temporal solo se mostró la primera vez: no se puede recuperar. Si se perdió, restablézcala.</p>
        <Boton onClick={alOcultar}>Entendido</Boton>
      </Aviso>
    );
  }
  return (
    <Aviso tono="aviso" titulo={`Contraseña temporal de ${r.persona.nombre}`} rol="alert">
      <p>
        Entréguela en persona a {r.persona.correo}. Se muestra <strong>una sola vez</strong>: no se guarda en el navegador ni se puede volver a consultar.
        {r.temporalExpiraEn ? ` Caduca el ${formatearInstante(r.temporalExpiraEn)}` : ""}; al entrar, la persona deberá cambiarla.
      </p>
      <p>
        <code className="credencial-temporal" aria-label="Contraseña temporal">
          {r.contrasenaTemporal}
        </code>
      </p>
      <Boton variante="primario" onClick={alOcultar}>
        Ya la entregué: ocultar
      </Boton>
    </Aviso>
  );
}

function VistaPersonas({ servicios }: { servicios: ServiciosAdministracion }) {
  const [buscar, setBuscar] = useState("");
  const [inactivas, setInactivas] = useState(false);
  const [creando, setCreando] = useState(false);
  const [credencial, setCredencial] = useState<RespuestaCredencialTemporal | null>(null);
  const paginas = usePaginas();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarPersonas({ buscar, incluirInactivas: inactivas, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivas, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-personas">
      <h2 id="titulo-personas" className="seccion-titulo">
        Personas y funciones
      </h2>
      <p className="ayuda">
        Sin registro público, correo ni recuperación automática: el Administrador del sistema da de alta a cada persona y le entrega en persona su contraseña temporal.
      </p>
      {credencial ? <CredencialTemporal r={credencial} alOcultar={() => setCredencial(null)} /> : null}
      {creando ? (
        <FormularioAlta
          servicios={servicios}
          alCreada={(r) => {
            setCreando(false);
            setCredencial(r);
            recargar();
          }}
          alCancelar={() => setCreando(false)}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => (setCredencial(null), setCreando(true))}>
            Nueva persona
          </Boton>
        </div>
      )}
      <Busqueda etiqueta="Buscar por nombre o correo" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivas} onChange={(e) => (paginas.reiniciar(), setInactivas(e.target.checked))} />
          Incluir inactivas
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando personas…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.personas.length === 0 ? (
          <SinResultados>{buscar ? `No hay personas que coincidan con «${buscar}».` : "No hay personas activas."}</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Personas de la organización</caption>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Funciones</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.personas.map((p) => (
                    <tr key={p.id}>
                      <td data-etiqueta="Nombre">{p.nombre}</td>
                      <td data-etiqueta="Correo" className="celda-correo">{p.correo}</td>
                      <td data-etiqueta="Funciones">{nombreFunciones(p.funciones)}</td>
                      <td data-etiqueta="Estado">
                        <EstadoPersona p={p} />
                      </td>
                      <td data-etiqueta="Acciones" className="celda-acciones">
                        <Enlace a={{ pantalla: "persona", id: p.id }}>Gestionar</Enlace>
                      </td>
                    </tr>
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

function FormularioAlta({ servicios, alCreada, alCancelar }: { servicios: ServiciosAdministracion; alCreada: (r: RespuestaCredencialTemporal) => void; alCancelar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [funciones, setFunciones] = useState<FuncionUsuario[]>([]);
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  const errores = {
    nombre: nombre.trim() === "" ? "Escriba el nombre." : null,
    correo: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) ? "Escriba un correo válido." : null,
    funciones: funciones.length === 0 ? "Asigne al menos una función." : null,
    motivo: motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : null,
  };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(errores).some(Boolean)) return;
    const datos = { nombre: nombre.trim(), correo: correo.trim().toLowerCase(), funciones, motivo: motivo.trim() };
    // La misma intención reutiliza su clave: un reintento no genera otra contraseña.
    const r = await envio.ejecutar(() => servicios.crearPersona(datos, intenciones.clave("crear-persona", datos)));
    if (r?.ok) {
      intenciones.olvidar("crear-persona", datos);
      alCreada(r.datos);
    }
  };
  const error = (k: keyof typeof errores) => (intentado ? errores[k] : null) ?? errorDe(envio.fallo, k);
  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate aria-label="Nueva persona">
      <p className="formulario-titulo">Nueva persona</p>
      <CampoTexto etiqueta="Nombre" enfocar obligatorio valor={nombre} alCambiar={setNombre} max={LIMITES_ADMINISTRACION.longitudNombrePersona} error={error("nombre")} ayuda="Datos DEMO: use la marca [DEMO]." />
      <CampoTexto
        etiqueta="Correo"
        tipo="email"
        obligatorio
        valor={correo}
        alCambiar={setCorreo}
        max={LIMITES_CATALOGO_ADMIN.longitudCorreo}
        error={error("correo")}
        ayuda="Es su usuario para iniciar sesión y no se puede cambiar después."
      />
      <CampoFunciones valor={funciones} alCambiar={setFunciones} error={error("funciones")} />
      <CampoTexto etiqueta="Motivo del alta" multilinea obligatorio valor={motivo} alCambiar={setMotivo} max={LIMITES_CATALOGO_ADMIN.longitudMotivo} error={error("motivo")} />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={envio.enviando} aria-disabled={envio.enviando}>
          {envio.enviando ? "Creando…" : "Crear y generar contraseña temporal"}
        </Boton>
        <Boton variante="enlace" onClick={alCancelar} disabled={envio.enviando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Detalle de una persona
// ---------------------------------------------------------------------------

export function PantallaPersona({ servicios, id, correoPropio }: { servicios: ServiciosAdministracion; id: string; correoPropio: string }) {
  const { estado, recargar } = useCarga((s) => servicios.detallePersona(id, s), [id]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<RespuestaCredencialTemporal | null>(null);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando la persona…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { persona, historial } = estado.datos;
  const propia = persona.correo === correoPropio;
  const alCambiar = (m: string) => (setMensaje(m), recargar());
  return (
    <Pagina titulo={persona.nombre} subtitulo={`${persona.correo} · ${nombreFunciones(persona.funciones)}`}>
      <NavegacionAdministracion vista={null} />
      <p>
        <Enlace a={{ pantalla: "administracion", vista: "personas" }}>Volver a personas</Enlace>
      </p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {credencial ? <CredencialTemporal r={credencial} alOcultar={() => setCredencial(null)} /> : null}
      <p>
        <EstadoPersona p={persona} />
        {persona.temporalExpiraEn ? <span className="ayuda"> La temporal caduca el {formatearInstante(persona.temporalExpiraEn)}.</span> : null}
      </p>
      {propia ? (
        <Aviso tono="info" titulo="Es su propia cuenta">
          <p>No puede retirarse la función de Administrador del sistema, desactivarse ni restablecer su propia contraseña: pídaselo a otro Administrador del sistema.</p>
        </Aviso>
      ) : null}
      <EdicionPersonaFormulario key={persona.revision} persona={persona} propia={propia} servicios={servicios} alCambiar={alCambiar} alRecargar={recargar} />
      {propia ? null : (
        <>
          <ActivacionPersona key={`a-${persona.revision}`} persona={persona} servicios={servicios} alCambiar={alCambiar} alRecargar={recargar} />
          <Restablecimiento
            persona={persona}
            servicios={servicios}
            alRestablecida={(r) => {
              setMensaje(null);
              setCredencial(r);
              recargar();
            }}
          />
        </>
      )}
      <h2 className="seccion-titulo">Historial</h2>
      <HistorialAdministracion eventos={historial} />
    </Pagina>
  );
}

function EdicionPersonaFormulario({
  persona,
  propia,
  servicios,
  alCambiar,
  alRecargar,
}: {
  persona: PersonaAdmin;
  propia: boolean;
  servicios: ServiciosAdministracion;
  alCambiar: (m: string) => void;
  alRecargar: () => void;
}) {
  const [nombre, setNombre] = useState(persona.nombre);
  const [funciones, setFunciones] = useState<FuncionUsuario[]>(persona.funciones);
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const cambios = {
    ...(nombre.trim() !== persona.nombre ? { nombre: nombre.trim() } : {}),
    ...(!iguales([...funciones].sort(), [...persona.funciones].sort()) ? { funciones } : {}),
  };
  const errores = {
    nombre: nombre.trim() === "" ? "Escriba el nombre." : null,
    funciones: funciones.length === 0 ? "Asigne al menos una función." : null,
    motivo: motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo ? `Explique el motivo (al menos ${LIMITES_CATALOGO_ADMIN.minimoMotivo} caracteres).` : null,
  };
  const sinCambios = Object.keys(cambios).length === 0;
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (Object.values(errores).some(Boolean) || sinCambios) return;
    const r = await envio.ejecutar(() => servicios.editarPersona(persona.id, { revision: persona.revision, motivo: motivo.trim(), ...cambios }));
    if (r?.ok) alCambiar("Cambios guardados. Las funciones nuevas se aplican desde la siguiente petición de la persona.");
  };
  const error = (k: keyof typeof errores) => (intentado ? errores[k] : null) ?? errorDe(envio.fallo, k);
  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} noValidate aria-label="Datos y funciones">
      <p className="formulario-titulo">Datos y funciones</p>
      <CampoTexto etiqueta="Nombre" obligatorio valor={nombre} alCambiar={setNombre} max={LIMITES_ADMINISTRACION.longitudNombrePersona} error={error("nombre")} />
      <CampoFunciones valor={funciones} alCambiar={setFunciones} error={error("funciones")} deshabilitadas={propia ? ["ADMIN_SISTEMA"] : []} />
      <CampoTexto etiqueta="Motivo del cambio" multilinea obligatorio valor={motivo} alCambiar={setMotivo} max={LIMITES_CATALOGO_ADMIN.longitudMotivo} error={error("motivo")} />
      {intentado && sinCambios ? <Aviso tono="aviso" titulo="No hay cambios que guardar" /> : null}
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={envio.enviando} aria-disabled={envio.enviando}>
          {envio.enviando ? "Guardando…" : "Guardar cambios"}
        </Boton>
      </div>
    </form>
  );
}

function ActivacionPersona({ persona, servicios, alCambiar, alRecargar }: { persona: PersonaAdmin; servicios: ServiciosAdministracion; alCambiar: (m: string) => void; alRecargar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  const motivoCorto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const cambiar = async () => {
    const r = await envio.ejecutar(() => servicios.editarPersona(persona.id, { revision: persona.revision, motivo: motivo.trim(), activa: !persona.activa }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activa ? "Persona reactivada: puede volver a iniciar sesión." : "Persona desactivada: sus sesiones en esta organización se cerraron.");
  };
  return (
    <section className="seccion" aria-label={persona.activa ? "Desactivar" : "Reactivar"}>
      <h2 className="seccion-titulo">{persona.activa ? "Desactivar" : "Reactivar"}</h2>
      <CampoTexto
        etiqueta="Motivo"
        multilinea
        obligatorio
        valor={motivo}
        alCambiar={setMotivo}
        max={LIMITES_CATALOGO_ADMIN.longitudMotivo}
        error={errorDe(envio.fallo, "motivo")}
        ayuda={persona.activa ? "Desactivar no borra: conserva su historial y su autoría. Sus sesiones abiertas en esta organización se cierran de inmediato." : undefined}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={alRecargar} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={persona.activa ? `Se desactivará a ${persona.nombre} y se cerrarán sus sesiones.` : `Se reactivará a ${persona.nombre}.`}
          accion={persona.activa ? "Desactivar" : "Reactivar"}
          variante={persona.activa ? "peligro" : "primario"}
          alConfirmar={() => void cambiar()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante={persona.activa ? "peligro" : "primario"} disabled={motivoCorto} aria-disabled={motivoCorto} onClick={() => setConfirmar(true)}>
            {persona.activa ? "Desactivar…" : "Reactivar…"}
          </Boton>
        </div>
      )}
    </section>
  );
}

function Restablecimiento({ persona, servicios, alRestablecida }: { persona: PersonaAdmin; servicios: ServiciosAdministracion; alRestablecida: (r: RespuestaCredencialTemporal) => void }) {
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  const motivoCorto = motivo.trim().length < LIMITES_CATALOGO_ADMIN.minimoMotivo;
  const restablecer = async () => {
    const intencion = { id: persona.id, motivo: motivo.trim() };
    const r = await envio.ejecutar(() => servicios.restablecerContrasena(persona.id, intencion.motivo, intenciones.clave("restablecer", intencion)));
    setConfirmar(false);
    if (r?.ok) {
      intenciones.olvidar("restablecer", intencion);
      setMotivo("");
      alRestablecida(r.datos);
    }
  };
  return (
    <section className="seccion" aria-label="Restablecer la contraseña">
      <h2 className="seccion-titulo">Restablecer la contraseña</h2>
      <p className="ayuda">
        Genera una contraseña temporal nueva (válida {LIMITES_ADMINISTRACION.horasContrasenaTemporal} h) que se muestra una sola vez. La anterior deja de valer y se cierran todas sus sesiones.
      </p>
      <CampoTexto etiqueta="Motivo" multilinea obligatorio valor={motivo} alCambiar={setMotivo} max={LIMITES_CATALOGO_ADMIN.longitudMotivo} error={errorDe(envio.fallo, "motivo")} />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      {confirmar ? (
        <Confirmacion
          texto={`Se generará una contraseña temporal nueva para ${persona.nombre} y se cerrarán todas sus sesiones.`}
          accion="Restablecer"
          alConfirmar={() => void restablecer()}
          alCancelar={() => setConfirmar(false)}
          ocupado={envio.enviando}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton disabled={motivoCorto} aria-disabled={motivoCorto} onClick={() => setConfirmar(true)}>
            Restablecer contraseña…
          </Boton>
        </div>
      )}
    </section>
  );
}
