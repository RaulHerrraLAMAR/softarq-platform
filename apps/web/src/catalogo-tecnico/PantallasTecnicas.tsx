/**
 * Catálogo técnico (módulo 12, ADR-0016): tipos de estructura, insumos y conversiones, conceptos y
 * componentes, con la aprobación de conceptos. Solo con la capacidad `catalogos.administrar`
 * (Administrador del catálogo); la API lo exige de todos modos y vuelve a comprobar cada regla.
 *
 * - Muestra rendimientos, desperdicios, traslapes, factores, reglas y trazabilidad solo en esta
 *   sección: no pasan a la cotización comercial, a la calculadora ni al PDF.
 * - Antes de un cambio técnico de un concepto aprobado se avisa que vuelve a Borrador; antes de
 *   editar una conversión se listan los conceptos que la usan.
 * - La lista de requisitos para aprobar es la del servidor (`Concepto_Problemas`), no una copia.
 * - Un conflicto conserva lo escrito y ofrece recargar el registro vigente.
 */
import {
  CAMPOS_TECNICOS_CONCEPTO,
  CLASES_CONCEPTO,
  FAMILIAS_ESTRUCTURA,
  LIMITES_CATALOGO_TECNICO,
  TIPOS_FORMULA,
  type ClaseConcepto,
  type ComponenteAdmin,
  type ConceptoTarifaAdmin,
  type ConversionAdmin,
  type DetalleConceptoAdmin,
  type FamiliaEstructura,
  type ImpactoVersiones,
  type InsumoAdmin,
  type RequisitoConcepto,
  type SolicitudConcepto,
  type TipoEstructuraAdmin,
} from "@softarq/contracts";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ResultadoApi } from "../api/cliente.ts";
import { Aviso, Boton, Codigo, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, EstadoRegistro, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { buscarInsumos, buscarTipos } from "../catalogo-admin/buscadores.ts";
import { AvisoFallo, CampoCasilla, CampoSeleccion, CampoTexto, ControlPaginas, errorDe, usePaginas } from "../catalogo-admin/campos.tsx";
import { Acciones, Busqueda, Confirmacion, FormularioAsignacion, Historial, opcional, textoImporteTarifa, textoImpactoVersiones, TEXTO_MODALIDAD, useEnvio } from "../catalogo-admin/piezas.tsx";
import { SelectorRegistro, type OpcionRegistro } from "../catalogo-admin/SelectorRegistro.tsx";
import type { ServiciosCatalogoAdmin } from "../catalogo-admin/servicios.ts";

type Props = { servicios: ServiciosCatalogoAdmin };

const TEXTO_FORMULA: Record<(typeof TIPOS_FORMULA)[number], string> = {
  CONTEO: "Conteo (piezas)",
  LONGITUD: "Longitud",
  AREA: "Área",
  VOLUMEN: "Volumen",
};
const MAGNITUD: Record<string, string> = { conteo: "conteo", longitud: "longitud", area: "área", volumen: "volumen", masa: "masa", tiempo: "tiempo", servicio: "servicio" };
const TEXTO_CLASE: Record<ClaseConcepto, string> = { ESTANDAR: "Estándar", GENERICO: "Genérico configurable", PERSONALIZADO: "Personalizado (exige excepción al cotizar)" };

/** Unidades de la referencia común, para los formularios. */
function useUnidades(servicios: ServiciosCatalogoAdmin) {
  const { estado } = useCarga((s) => servicios.unidades(s), []);
  return estado.fase === "listo" ? estado.datos.unidades : [];
}

function EstadoConcepto({ c }: { c: ConceptoTarifaAdmin }) {
  return (
    <>
      {c.estado === "Aprobado" ? <Insignia tono="estado">Aprobado</Insignia> : <Insignia tono="menor">Borrador</Insignia>}
      {c.activo ? null : <> <Insignia tono="menor">Inactivo</Insignia></>}
      {c.heredado ? <> <Insignia tono="alerta">Datos incompletos de la carga anterior</Insignia></> : null}
    </>
  );
}

// ===========================================================================
// Tipos de estructura (tblTiposEstructura)
// ===========================================================================

function FormularioTipo({
  titulo,
  inicial,
  textoBoton,
  alGuardar,
  alCancelar,
  alRecargar,
}: {
  titulo: string;
  inicial?: TipoEstructuraAdmin;
  textoBoton: string;
  alGuardar: (d: { familia: FamiliaEstructura; nombre: string; prioritario: boolean }) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
  alRecargar?: () => void;
}) {
  const [familia, setFamilia] = useState<string>(inicial?.familia ?? "");
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [prioritario, setPrioritario] = useState(inicial?.prioritario ?? false);
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const familiaBloqueada = (inicial?.conceptos ?? 0) > 0;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!familia || nombre.trim() === "") return;
    void envio.ejecutar(() => alGuardar({ familia: familia as FamiliaEstructura, nombre: nombre.trim(), prioritario }));
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <CampoSeleccion
        etiqueta="Familia"
        enfocar={!familiaBloqueada}
        valor={familia}
        alCambiar={setFamilia}
        obligatorio
        deshabilitado={familiaBloqueada}
        opciones={FAMILIAS_ESTRUCTURA.map((f) => ({ valor: f, texto: f }))}
        error={intentado && !familia ? "Seleccione la familia." : errorDe(envio.fallo, "familia")}
        ayuda={
          familiaBloqueada
            ? `El tipo ya clasifica ${inicial!.conceptos} concepto(s): su familia no cambia. Para otra clasificación registre otro tipo; los conceptos no se trasladan solos.`
            : "Las seis familias del libro (tblListas)."
        }
      />
      <CampoTexto
        etiqueta="Nombre del tipo"
        enfocar={familiaBloqueada}
        valor={nombre}
        alCambiar={setNombre}
        max={LIMITES_CATALOGO_TECNICO.longitudNombreTipo}
        obligatorio
        error={intentado && nombre.trim() === "" ? "Escriba el nombre del tipo." : errorDe(envio.fallo, "nombre")}
        ayuda="Único dentro de la familia: se rechaza el mismo nombre con otras mayúsculas, acentos o puntuación."
      />
      <CampoCasilla etiqueta="Tipo prioritario (validación exhaustiva)" valor={prioritario} alCambiar={setPrioritario} ayuda="Dato informativo del libro." />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} {...(alRecargar ? { alRecargar } : {})} /> : null}
      <Acciones enviando={envio.enviando} texto={textoBoton} alCancelar={alCancelar} />
    </form>
  );
}

export function VistaTiposEstructura({ servicios }: Props) {
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarTipos({ buscar, incluirInactivos: inactivos, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivos, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-tipos">
      <h2 id="titulo-tipos" className="seccion-titulo">
        Tipos de estructura
      </h2>
      <p className="ayuda">
        Datos base del libro: seis familias, cada una con su tipo genérico. Un concepto nuevo elige un tipo activo. Desactivar un tipo conserva sus conceptos,
        deja de ofrecerlo para conceptos nuevos o para reclasificar e impide aprobar sus conceptos; no bloquea el cálculo.
      </p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando ? (
        <FormularioTipo
          titulo="Nuevo tipo de estructura"
          textoBoton="Crear tipo"
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.crearTipo(d, intenciones.clave("crear-tipo", d));
            if (r.ok) {
              intenciones.olvidar("crear-tipo", d);
              setCreando(false);
              setMensaje(`Tipo ${r.datos.codigo} creado.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))}>
            Nuevo tipo
          </Boton>
        </div>
      )}
      <Busqueda etiqueta="Buscar por código, familia o nombre" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivos} onChange={(e) => (paginas.reiniciar(), setInactivos(e.target.checked))} />
          Incluir inactivos
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando tipos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.tipos.length === 0 ? (
          <SinResultados>{buscar ? `No hay tipos que coincidan con «${buscar}».` : "No hay tipos activos."}</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Tipos de estructura</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Familia</th>
                    <th scope="col">Nombre</th>
                    <th scope="col">Conceptos</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.tipos.map((t) => (
                    <FilaTipo
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

function FilaTipo({ t, servicios, abierto, alAlternar, alCambiar }: { t: TipoEstructuraAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void } & Props) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{t.codigo}</Codigo>
        </td>
        <td data-etiqueta="Familia">{t.familia}</td>
        <td data-etiqueta="Nombre">
          {t.nombre}
          {t.prioritario ? <span className="ayuda bloque">Prioritario</span> : null}
        </td>
        <td data-etiqueta="Conceptos" className="numero">
          {t.conceptos}
        </td>
        <td data-etiqueta="Estado">
          <EstadoRegistro activo={t.activo} />
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
            <PanelTipo codigo={t.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelTipo({ codigo, servicios, alCambiar }: { codigo: string; alCambiar: (m: string) => void } & Props) {
  const { estado, recargar } = useCarga((s) => servicios.detalleTipo(codigo, s), [codigo]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { tipo, historial } = estado.datos;
  const cambiarActivo = async () => {
    const r = await envio.ejecutar(() => servicios.editarTipo(codigo, { revision: tipo.revision, activo: !tipo.activo }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activo ? `Tipo ${codigo} reactivado.` : `Tipo ${codigo} desactivado; sus conceptos se conservan.`);
  };
  return (
    <div className="panel-registro">
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      {editando ? (
        <FormularioTipo
          titulo={`Editar ${codigo}`}
          inicial={tipo}
          textoBoton="Guardar cambios"
          alCancelar={() => setEditando(false)}
          alRecargar={() => (setEditando(false), recargar())}
          alGuardar={async (d) => {
            const r = await servicios.editarTipo(codigo, { revision: tipo.revision, ...d });
            if (r.ok) {
              setEditando(false);
              alCambiar(`Tipo ${codigo} actualizado.`);
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => setEditando(true)}>Editar datos</Boton>
          {confirmar ? (
            <Confirmacion
              texto={
                tipo.activo
                  ? `Se desactivará ${codigo}. No se borra: sus ${tipo.conceptos} concepto(s) y las versiones históricas lo conservan; deja de ofrecerse para conceptos nuevos o para reclasificar, y sus conceptos no podrán aprobarse mientras esté inactivo. El cálculo no se bloquea.`
                  : `Se reactivará ${codigo} y volverá a ofrecerse para conceptos nuevos.`
              }
              accion={tipo.activo ? "Desactivar" : "Reactivar"}
              variante={tipo.activo ? "peligro" : "primario"}
              alConfirmar={() => void cambiarActivo()}
              alCancelar={() => setConfirmar(false)}
              ocupado={envio.enviando}
            />
          ) : (
            <Boton variante={tipo.activo ? "peligro" : "secundario"} onClick={() => setConfirmar(true)}>
              {tipo.activo ? "Desactivar tipo" : "Reactivar tipo"}
            </Boton>
          )}
        </div>
      )}
      <p className="ayuda">
        Modificado {formatearInstante(tipo.modificadoEn)} · {tipo.modificadoPor ?? "carga base"} · revisión {tipo.revision}
      </p>
      <Historial eventos={historial} />
    </div>
  );
}

// ===========================================================================
// Insumos y conversiones (tblInsumos, tblConversiones)
// ===========================================================================

function FormularioInsumo({
  titulo,
  inicial,
  textoBoton,
  servicios,
  alGuardar,
  alCancelar,
  alRecargar,
}: {
  titulo: string;
  inicial?: InsumoAdmin;
  textoBoton: string;
  alGuardar: (d: { descripcion: string; especificacion: string | null; unidadBase: string }) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
  alRecargar?: () => void;
} & Props) {
  const unidades = useUnidades(servicios);
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [especificacion, setEspecificacion] = useState(inicial?.especificacion ?? "");
  const [unidadBase, setUnidadBase] = useState(inicial?.unidadBase ?? "");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const r = inicial?.referencias;
  const bloqueada = r !== undefined && r.productos + r.conversiones + r.componentes > 0;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (descripcion.trim() === "" || !unidadBase) return;
    void envio.ejecutar(() => alGuardar({ descripcion: descripcion.trim(), especificacion: opcional(especificacion), unidadBase }));
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <CampoTexto
        etiqueta="Descripción técnica"
        enfocar
        valor={descripcion}
        alCambiar={setDescripcion}
        max={LIMITES_CATALOGO_TECNICO.longitudDescripcion}
        obligatorio
        error={intentado && descripcion.trim() === "" ? "Escriba la descripción técnica." : errorDe(envio.fallo, "descripcion")}
        ayuda="Única en la organización (sin distinguir mayúsculas, acentos ni puntuación). Datos DEMO: use la marca [DEMO]."
      />
      <CampoTexto etiqueta="Especificación" valor={especificacion} alCambiar={setEspecificacion} max={LIMITES_CATALOGO_TECNICO.longitudEspecificacion} multilinea error={errorDe(envio.fallo, "especificacion")} />
      <CampoSeleccion
        etiqueta="Unidad base"
        valor={unidadBase}
        alCambiar={setUnidadBase}
        obligatorio
        deshabilitado={bloqueada}
        opciones={unidades.map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre} (${MAGNITUD[u.magnitud] ?? u.magnitud})` }))}
        error={intentado && !unidadBase ? "Seleccione la unidad base." : errorDe(envio.fallo, "unidadBase")}
        ayuda={
          bloqueada
            ? `No cambia: el insumo tiene ${r.productos} producto(s), ${r.conversiones} conversión(es) y ${r.componentes} componente(s). Para otra unidad registre un insumo nuevo.`
            : "Unidad en la que se expresan rendimientos, contenidos y conversiones del insumo."
        }
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} {...(alRecargar ? { alRecargar } : {})} /> : null}
      <Acciones enviando={envio.enviando} texto={textoBoton} alCancelar={alCancelar} />
    </form>
  );
}

export function VistaInsumos({ servicios }: Props) {
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarInsumos({ buscar, incluirInactivos: inactivos, ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, inactivos, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-insumos">
      <h2 id="titulo-insumos" className="seccion-titulo">
        Insumos y conversiones
      </h2>
      <p className="ayuda">
        El motor solo usa conversiones directas de una unidad a la unidad base del insumo (sin inversas ni cadenas). Datos DEMO ilustrativos: no son fichas
        técnicas reales.
      </p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando ? (
        <FormularioInsumo
          titulo="Nuevo insumo"
          textoBoton="Crear insumo"
          servicios={servicios}
          alCancelar={() => setCreando(false)}
          alGuardar={async (d) => {
            const r = await servicios.crearInsumo(d, intenciones.clave("crear-insumo", d));
            if (r.ok) {
              intenciones.olvidar("crear-insumo", d);
              setCreando(false);
              setMensaje(`Insumo ${r.datos.codigo} creado.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))}>
            Nuevo insumo
          </Boton>
        </div>
      )}
      <Busqueda etiqueta="Buscar por código o descripción" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="casilla">
          <input type="checkbox" checked={inactivos} onChange={(e) => (paginas.reiniciar(), setInactivos(e.target.checked))} />
          Incluir inactivos
        </label>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando insumos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.insumos.length === 0 ? (
          <SinResultados>{buscar ? `No hay insumos que coincidan con «${buscar}».` : "No hay insumos activos."}</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Insumos</caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Descripción</th>
                    <th scope="col">Unidad base</th>
                    <th scope="col">Referencias</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.datos.insumos.map((i) => (
                    <FilaInsumo
                      key={i.codigo}
                      i={i}
                      servicios={servicios}
                      abierto={abierto === i.codigo}
                      alAlternar={() => (setMensaje(null), setAbierto((a) => (a === i.codigo ? null : i.codigo)))}
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

function FilaInsumo({ i, servicios, abierto, alAlternar, alCambiar }: { i: InsumoAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void } & Props) {
  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{i.codigo}</Codigo>
        </td>
        <td data-etiqueta="Descripción">
          {i.descripcion}
          {i.especificacion ? <span className="ayuda bloque">{i.especificacion}</span> : null}
        </td>
        <td data-etiqueta="Unidad base">{i.unidadBase}</td>
        <td data-etiqueta="Referencias">
          {i.referencias.productos} producto(s) · {i.referencias.conversiones} conversión(es) · {i.referencias.componentes} componente(s)
        </td>
        <td data-etiqueta="Estado">
          <EstadoRegistro activo={i.activo} />
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
            <PanelInsumo codigo={i.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PanelInsumo({ codigo, servicios, alCambiar }: { codigo: string; alCambiar: (m: string) => void } & Props) {
  const { estado, recargar } = useCarga((s) => servicios.detalleInsumo(codigo, s), [codigo]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [nuevaConversion, setNuevaConversion] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { insumo, conversiones, historial } = estado.datos;
  const cambiarActivo = async () => {
    const r = await envio.ejecutar(() => servicios.editarInsumo(codigo, { revision: insumo.revision, activo: !insumo.activo }));
    setConfirmar(false);
    if (r?.ok) alCambiar(r.datos.activo ? `Insumo ${codigo} reactivado.` : `Insumo ${codigo} desactivado; sus productos, conversiones y componentes se conservan.`);
  };
  return (
    <div className="panel-registro">
      <div aria-live="polite">{aviso ? <Aviso tono="correcto" titulo={aviso} /> : null}</div>
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      {editando ? (
        <FormularioInsumo
          titulo={`Editar ${codigo}`}
          inicial={insumo}
          textoBoton="Guardar cambios"
          servicios={servicios}
          alCancelar={() => setEditando(false)}
          alRecargar={() => (setEditando(false), recargar())}
          alGuardar={async (d) => {
            const r = await servicios.editarInsumo(codigo, { revision: insumo.revision, ...d });
            if (r.ok) {
              setEditando(false);
              alCambiar(`Insumo ${codigo} actualizado.`);
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => setEditando(true)}>Editar datos</Boton>
          {confirmar ? (
            <Confirmacion
              texto={
                insumo.activo
                  ? `Se desactivará ${codigo}. No se borra: deja de ofrecerse para productos y componentes nuevos; los existentes y las versiones históricas lo conservan.`
                  : `Se reactivará ${codigo}.`
              }
              accion={insumo.activo ? "Desactivar" : "Reactivar"}
              variante={insumo.activo ? "peligro" : "primario"}
              alConfirmar={() => void cambiarActivo()}
              alCancelar={() => setConfirmar(false)}
              ocupado={envio.enviando}
            />
          ) : (
            <Boton variante={insumo.activo ? "peligro" : "secundario"} onClick={() => setConfirmar(true)}>
              {insumo.activo ? "Desactivar insumo" : "Reactivar insumo"}
            </Boton>
          )}
        </div>
      )}
      <h3 className="subtitulo">Conversiones a {insumo.unidadBase}</h3>
      {conversiones.length === 0 ? (
        <p className="ayuda">Sin conversiones: los componentes deben medirse en {insumo.unidadBase}.</p>
      ) : (
        <ul className="lista-registros" aria-label={`Conversiones de ${codigo}`}>
          {conversiones.map((c) => (
            <FilaConversion key={c.unidadOrigen} c={c} impacto={estado.datos.impacto} servicios={servicios} alGuardada={(m) => (setAviso(m), recargar())} />
          ))}
        </ul>
      )}
      {nuevaConversion ? (
        <FormularioConversion
          insumo={insumo}
          servicios={servicios}
          alCancelar={() => setNuevaConversion(false)}
          alGuardar={async (d) => {
            const r = await servicios.crearConversion(codigo, d, intenciones.clave(`conversion:${codigo}`, d));
            if (r.ok) {
              intenciones.olvidar(`conversion:${codigo}`, d);
              setNuevaConversion(false);
              setAviso(`Conversión ${d.unidadOrigen} → ${insumo.unidadBase} registrada.`);
              recargar();
            }
            return r;
          }}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => (setAviso(null), setNuevaConversion(true))}>Nueva conversión</Boton>
        </div>
      )}
      <p className="ayuda">
        Modificado {formatearInstante(insumo.modificadoEn)} · {insumo.modificadoPor ?? "carga DEMO"} · revisión {insumo.revision}
      </p>
      <Historial eventos={historial} />
    </div>
  );
}

function FormularioConversion({
  insumo,
  servicios,
  alGuardar,
  alCancelar,
}: {
  insumo: InsumoAdmin;
  alGuardar: (d: { unidadOrigen: string; factor: string; fuente: string }) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
} & Props) {
  const unidades = useUnidades(servicios).filter((u) => u.clave !== insumo.unidadBase);
  const [origen, setOrigen] = useState("");
  const [factor, setFactor] = useState("");
  const [fuente, setFuente] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!origen || factor.trim() === "" || fuente.trim() === "") return;
    void envio.ejecutar(() => alGuardar({ unidadOrigen: origen, factor: factor.trim(), fuente: fuente.trim() }));
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={`Nueva conversión de ${insumo.codigo}`}>
      <p className="formulario-titulo">Nueva conversión a {insumo.unidadBase}</p>
      <CampoSeleccion
        etiqueta="Unidad de origen"
        enfocar
        valor={origen}
        alCambiar={setOrigen}
        obligatorio
        opciones={unidades.map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre}` }))}
        error={intentado && !origen ? "Seleccione la unidad de origen." : errorDe(envio.fallo, "unidadOrigen")}
        ayuda={`Distinta de ${insumo.unidadBase}, la unidad base (destino de toda conversión).`}
      />
      <CampoTexto
        etiqueta={`Factor (1 ${origen || "unidad de origen"} = factor × ${insumo.unidadBase})`}
        valor={factor}
        alCambiar={setFactor}
        max={32}
        inputMode="decimal"
        obligatorio
        error={intentado && factor.trim() === "" ? "Indique el factor." : errorDe(envio.fallo, "factor")}
        ayuda="Mayor que cero, con punto decimal y hasta 10 decimales (no se redondea)."
      />
      <CampoTexto
        etiqueta="Fuente del factor"
        valor={fuente}
        alCambiar={setFuente}
        max={LIMITES_CATALOGO_TECNICO.longitudFuente}
        obligatorio
        error={intentado && fuente.trim() === "" ? "Indique la fuente del factor de conversión." : errorDe(envio.fallo, "fuente")}
      />
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      <Acciones enviando={envio.enviando} texto="Registrar conversión" alCancelar={alCancelar} />
    </form>
  );
}

function FilaConversion({ c, impacto, servicios, alGuardada }: { c: ConversionAdmin; impacto: ImpactoVersiones; alGuardada: (m: string) => void } & Props) {
  const [editando, setEditando] = useState(false);
  const [factor, setFactor] = useState(c.factor);
  const [fuente, setFuente] = useState(c.fuente);
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const envio = useEnvio();
  const aprobados = c.conceptos.filter((x) => x.estado === "Aprobado");
  const motivoCorto = motivo.trim().length < 10;
  const guardar = async () => {
    const cambios = { revision: c.revision, motivo: motivo.trim(), ...(factor.trim() !== c.factor ? { factor: factor.trim() } : {}), ...(fuente.trim() !== c.fuente ? { fuente: fuente.trim() } : {}) };
    const r = await envio.ejecutar(() => servicios.editarConversion(c.insumoCodigo, c.unidadOrigen, cambios));
    setConfirmar(false);
    if (r?.ok) {
      setEditando(false);
      alGuardada(
        aprobados.length > 0
          ? `Conversión ${c.unidadOrigen} → ${c.unidadDestino} guardada. Volvieron a Borrador: ${aprobados.map((x) => x.codigo).join(", ")}.`
          : `Conversión ${c.unidadOrigen} → ${c.unidadDestino} guardada.`,
      );
    }
  };
  return (
    <li>
      <strong>
        1 {c.unidadOrigen} = {c.factor} {c.unidadDestino}
      </strong>{" "}
      · {c.fuente}
      <span className="ayuda bloque">
        {c.conceptos.length === 0 ? "Ningún componente activo la usa." : `La usan: ${c.conceptos.map((x) => `${x.codigo} (${x.estado}${x.activo ? "" : ", inactivo"})`).join(", ")}.`} Revisión {c.revision}.
      </span>
      {editando ? (
        <form
          className="formulario"
          noValidate
          aria-label={`Editar conversión ${c.unidadOrigen} → ${c.unidadDestino}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!motivoCorto && (factor.trim() !== c.factor || fuente.trim() !== c.fuente)) setConfirmar(true);
          }}
        >
          <CampoTexto etiqueta={`Factor (1 ${c.unidadOrigen} = factor × ${c.unidadDestino})`} enfocar valor={factor} alCambiar={setFactor} max={32} inputMode="decimal" obligatorio error={errorDe(envio.fallo, "factor")} />
          <CampoTexto etiqueta="Fuente del factor" valor={fuente} alCambiar={setFuente} max={LIMITES_CATALOGO_TECNICO.longitudFuente} obligatorio error={errorDe(envio.fallo, "fuente")} />
          <CampoTexto
            etiqueta="Motivo del cambio"
            valor={motivo}
            alCambiar={setMotivo}
            max={500}
            obligatorio
            multilinea
            error={motivo && motivoCorto ? "Explique el motivo (al menos 10 caracteres)." : errorDe(envio.fallo, "motivo")}
          />
          {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), setEditando(false), alGuardada("Se recargó la conversión vigente."))} /> : null}
          {confirmar ? (
            <Confirmacion
              texto={`${
                aprobados.length > 0
                  ? `Volverán a Borrador y perderán su aprobación: ${aprobados.map((x) => x.codigo).join(", ")}. Deberán aprobarse de nuevo.`
                  : "Ningún concepto aprobado la usa."
              } ${textoImpactoVersiones(impacto) ?? "Ninguna cotización abierta usa el insumo."} Las versiones emitidas y sus PDF conservan el factor anterior.`}
              accion="Guardar conversión"
              variante="primario"
              alConfirmar={() => void guardar()}
              alCancelar={() => setConfirmar(false)}
              ocupado={envio.enviando}
            />
          ) : (
            <Acciones enviando={envio.enviando} texto="Revisar y confirmar" alCancelar={() => setEditando(false)} />
          )}
        </form>
      ) : (
        <Boton variante="enlace" onClick={() => setEditando(true)}>
          Editar factor o fuente
        </Boton>
      )}
    </li>
  );
}

// ===========================================================================
// Conceptos y componentes (tblConceptos, tblComponentes)
// ===========================================================================

type DatosConcepto = Omit<SolicitudConcepto, "tarifaCodigo"> & { tarifaCodigo?: string | null };

function FormularioConcepto({
  titulo,
  inicial,
  textoBoton,
  servicios,
  alGuardar,
  alCancelar,
  alRecargar,
}: {
  titulo: string;
  inicial?: DetalleConceptoAdmin;
  textoBoton: string;
  alGuardar: (d: DatosConcepto, tecnico: boolean) => Promise<ResultadoApi<unknown>> | null;
  alCancelar: () => void;
  alRecargar?: () => void;
} & Props) {
  const c = inicial?.concepto;
  const unidades = useUnidades(servicios);
  const [tipo, setTipo] = useState(c?.tipo?.codigo ?? "");
  const [tipoElegido, setTipoElegido] = useState<OpcionRegistro | null>(
    c?.tipo ? { codigo: c.tipo.codigo, texto: `${c.tipo.codigo} · [${c.tipo.familia}] ${c.tipo.nombre}`, disponible: c.tipo.activo } : null,
  );
  const [descripcion, setDescripcion] = useState(c?.descripcion ?? "");
  const [formula, setFormula] = useState<string>(c?.tipoFormula ?? "");
  const [unidad, setUnidad] = useState(c?.unidad ?? "");
  const [descuentos, setDescuentos] = useState(inicial?.permiteDescuento ?? false);
  const [regla, setRegla] = useState(inicial?.reglaMedicion ?? "");
  const [criterios, setCriterios] = useState(inicial?.criterios ?? "");
  const [clase, setClase] = useState<string>(c?.clase ?? "ESTANDAR");
  const [tarifa, setTarifa] = useState("");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const tarifas = useCarga((s) => (unidad ? servicios.listarTarifas({ unidad }, s) : Promise.resolve({ ok: true as const, datos: { tarifas: [], fechaReferencia: "", limite: 0, siguiente: null } })), [unidad]);
  const magnitud = formula ? formula.toLowerCase() : null;
  const unidadesFormula = unidades.filter((u) => magnitud !== null && u.magnitud === magnitud);
  const datos: DatosConcepto = {
    tipoCodigo: tipo,
    descripcion: descripcion.trim(),
    unidad,
    tipoFormula: formula as DatosConcepto["tipoFormula"],
    permiteDescuento: descuentos,
    reglaMedicion: regla.trim(),
    criterios: opcional(criterios),
    clase: clase as ClaseConcepto,
    ...(inicial ? {} : { tarifaCodigo: tarifa || null }),
  };
  const faltan = !tipo || datos.descripcion === "" || !formula || !unidad || datos.reglaMedicion === "";
  const tecnico =
    inicial !== undefined &&
    (tipo !== (c?.tipo?.codigo ?? "") ||
      datos.descripcion !== c?.descripcion ||
      unidad !== c?.unidad ||
      formula !== c?.tipoFormula ||
      descuentos !== inicial.permiteDescuento ||
      datos.reglaMedicion !== (inicial.reglaMedicion ?? "") ||
      datos.criterios !== inicial.criterios ||
      clase !== c?.clase);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (faltan) return;
    const r = alGuardar(datos, tecnico);
    if (r) void envio.ejecutar(() => r);
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <SelectorRegistro
        etiqueta="Tipo de estructura (activo)"
        valor={tipo}
        seleccion={tipoElegido}
        alCambiar={(codigo, opcion) => (setTipo(codigo), setTipoElegido(opcion))}
        buscar={buscarTipos(servicios)}
        obligatorio
        enfocar
        error={intentado && !tipo ? "Seleccione el tipo de estructura." : errorDe(envio.fallo, "tipoCodigo")}
        ayuda="Solo se ofrecen tipos activos. La descripción del concepto es única dentro del tipo."
      />
      <CampoTexto
        etiqueta="Descripción del concepto"
        valor={descripcion}
        alCambiar={setDescripcion}
        max={LIMITES_CATALOGO_TECNICO.longitudDescripcion}
        obligatorio
        error={intentado && datos.descripcion === "" ? "Escriba la descripción del concepto." : errorDe(envio.fallo, "descripcion")}
      />
      <div className="formulario-fila">
        <CampoSeleccion
          etiqueta="Tipo de fórmula de medición"
          valor={formula}
          alCambiar={(f) => (setFormula(f), setUnidad(""))}
          obligatorio
          opciones={TIPOS_FORMULA.map((f) => ({ valor: f, texto: TEXTO_FORMULA[f] }))}
          error={intentado && !formula ? "Seleccione el tipo de fórmula." : errorDe(envio.fallo, "tipoFormula")}
        />
        <CampoSeleccion
          etiqueta="Unidad del concepto"
          valor={unidad}
          alCambiar={setUnidad}
          obligatorio
          deshabilitado={!formula}
          vacio={formula ? "Seleccione…" : "Elija antes la fórmula"}
          opciones={unidadesFormula.map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre}` }))}
          error={intentado && !unidad ? "Seleccione la unidad del concepto." : errorDe(envio.fallo, "unidad")}
          ayuda={magnitud ? `Solo unidades de ${MAGNITUD[magnitud]}: la unidad debe corresponder a la fórmula.` : "La lista depende de la fórmula."}
        />
      </div>
      <CampoCasilla etiqueta="La regla permite descuentos (signo -)" valor={descuentos} alCambiar={setDescuentos} />
      <CampoTexto
        etiqueta="Regla de medición"
        valor={regla}
        alCambiar={setRegla}
        max={LIMITES_CATALOGO_TECNICO.longitudRegla}
        obligatorio
        multilinea
        error={intentado && datos.reglaMedicion === "" ? "Escriba la regla de medición del concepto." : errorDe(envio.fallo, "reglaMedicion")}
        ayuda="Texto descriptivo para quien mide. El cálculo usa el tipo de fórmula; la regla no cambia la fórmula del motor."
      />
      <CampoTexto etiqueta="Criterios especiales (vanos, traslapes…)" valor={criterios} alCambiar={setCriterios} max={LIMITES_CATALOGO_TECNICO.longitudCriterios} multilinea error={errorDe(envio.fallo, "criterios")} />
      <CampoSeleccion
        etiqueta="Clase"
        valor={clase}
        alCambiar={setClase}
        obligatorio
        opciones={CLASES_CONCEPTO.map((k) => ({ valor: k, texto: TEXTO_CLASE[k] }))}
        error={errorDe(envio.fallo, "clase")}
      />
      {inicial ? null : (
        <CampoSeleccion
          etiqueta="Tarifa de mano de obra"
          valor={tarifa}
          alCambiar={setTarifa}
          deshabilitado={!unidad}
          vacio={unidad ? "Sin tarifa por ahora" : "Elija antes la unidad"}
          opciones={tarifas.estado.fase === "listo" ? tarifas.estado.datos.tarifas.map((t) => ({ valor: t.codigo, texto: `${t.codigo} · ${TEXTO_MODALIDAD[t.modalidad]} · ${textoImporteTarifa(t)}` })) : []}
          error={errorDe(envio.fallo, "tarifaCodigo")}
          ayuda="Tarifas activas en la unidad del concepto (BL-06). Es obligatoria para aprobar."
        />
      )}
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} {...(alRecargar ? { alRecargar } : {})} /> : null}
      {tecnico && c?.estado === "Aprobado" ? (
        <Aviso tono="aviso" titulo="Al guardar, el concepto aprobado vuelve a Borrador">
          <p>Es un cambio técnico: pierde su aprobación hasta que un Administrador del catálogo lo apruebe de nuevo. Las versiones ya calculadas no cambian.</p>
        </Aviso>
      ) : null}
      <Acciones enviando={envio.enviando} texto={textoBoton} alCancelar={alCancelar} />
    </form>
  );
}

export function VistaConceptosTecnicos({ servicios }: Props) {
  const [buscar, setBuscar] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | "Borrador" | "Aprobado">("");
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginas = usePaginas();
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga(
    (s) => servicios.listarConceptos({ buscar, ...(estadoFiltro ? { estado: estadoFiltro } : {}), ...(paginas.actual ? { despuesDe: paginas.actual } : {}) }, s),
    [buscar, estadoFiltro, paginas.actual],
  );
  return (
    <section className="seccion" aria-labelledby="titulo-conceptos">
      <h2 id="titulo-conceptos" className="seccion-titulo">
        Conceptos y componentes
      </h2>
      <p className="ayuda">
        Un concepto nuevo empieza en Borrador; cualquier Administrador del catálogo lo aprueba (también quien lo creó) cuando cumple la lista del servidor. Un
        cambio técnico lo devuelve a Borrador; asignar otra tarifa de la misma unidad o desactivarlo conserva la aprobación.
      </p>
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {creando ? (
        <FormularioConcepto
          titulo="Nuevo concepto"
          textoBoton="Crear concepto en Borrador"
          servicios={servicios}
          alCancelar={() => setCreando(false)}
          alGuardar={(d) =>
            servicios.crearConcepto(d, intenciones.clave("crear-concepto", d)).then((r) => {
              if (r.ok) {
                intenciones.olvidar("crear-concepto", d);
                setCreando(false);
                setMensaje(`Concepto ${r.datos.concepto.codigo} creado en Borrador. Agregue sus componentes y apruébelo.`);
                setAbierto(r.datos.concepto.codigo);
                recargar();
              }
              return r;
            })
          }
        />
      ) : (
        <div className="formulario-acciones">
          <Boton variante="primario" onClick={() => (setMensaje(null), setCreando(true))}>
            Nuevo concepto
          </Boton>
        </div>
      )}
      <Busqueda etiqueta="Buscar por código o descripción" alBuscar={(t) => (paginas.reiniciar(), setBuscar(t))}>
        <label className="etiqueta" htmlFor="filtro-estado-concepto">
          Estado
        </label>
        <select id="filtro-estado-concepto" className="entrada" value={estadoFiltro} onChange={(e) => (paginas.reiniciar(), setEstadoFiltro(e.target.value as typeof estadoFiltro))}>
          <option value="">Todos</option>
          <option value="Borrador">Borrador</option>
          <option value="Aprobado">Aprobado</option>
        </select>
      </Busqueda>
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando conceptos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.conceptos.length === 0 ? (
          <SinResultados>No hay conceptos con esos criterios.</SinResultados>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla-registros">
                <caption className="solo-lector">Conceptos</caption>
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Tarifa</th>
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

function FilaConcepto({ c, servicios, abierto, alAlternar, alCambiar }: { c: ConceptoTarifaAdmin; abierto: boolean; alAlternar: () => void; alCambiar: (m: string) => void } & Props) {
  return (
    <>
      <tr>
        <td data-etiqueta="Concepto">
          <Codigo>{c.codigo}</Codigo> {c.descripcion}
          <span className="ayuda bloque">{TEXTO_CLASE[c.clase as ClaseConcepto] ?? c.clase}</span>
        </td>
        <td data-etiqueta="Tipo">{c.tipo ? `${c.tipo.codigo} · ${c.tipo.familia}` : <span className="ayuda">Sin tipo</span>}</td>
        <td data-etiqueta="Unidad">
          {c.unidad} · {TEXTO_FORMULA[c.tipoFormula as keyof typeof TEXTO_FORMULA] ?? c.tipoFormula}
        </td>
        <td data-etiqueta="Estado">
          <EstadoConcepto c={c} />
        </td>
        <td data-etiqueta="Tarifa">{c.tarifa ? <Codigo>{c.tarifa.codigo}</Codigo> : <span className="ayuda">Sin tarifa</span>}</td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          <Boton variante="enlace" onClick={alAlternar} aria-expanded={abierto}>
            {abierto ? "Cerrar" : "Gestionar"}
          </Boton>
        </td>
      </tr>
      {abierto ? (
        <tr>
          <td colSpan={6}>
            <PanelConcepto codigo={c.codigo} servicios={servicios} alCambiar={alCambiar} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** «Datos incompletos de la carga anterior»: qué falta y qué significa (decisión 3). */
function AvisoHeredado({ requisitos }: { requisitos: RequisitoConcepto[] }) {
  const faltan = [
    ...(requisitos.some((r) => r.codigo === "SIN_TIPO") ? ["el tipo de estructura"] : []),
    ...(requisitos.some((r) => r.codigo === "SIN_REGLA") ? ["la regla de medición"] : []),
  ];
  return (
    <Aviso tono="aviso" titulo="Datos incompletos de la carga anterior">
      <p>Falta {faltan.join(" y ") || "completar sus datos"}. El concepto sigue calculando como antes y conserva su aprobación anterior.</p>
      <p>Para editarlo o cambiar sus componentes complete esos datos: el concepto pasará a Borrador y necesitará una nueva aprobación.</p>
    </Aviso>
  );
}

function PanelConcepto({ codigo, servicios, alCambiar }: { codigo: string; alCambiar: (m: string) => void } & Props) {
  const { estado, recargar } = useCarga((s) => servicios.detalleConcepto(codigo, s), [codigo]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState<null | "tecnico" | "activo" | "aprobar">(null);
  const [pendiente, setPendiente] = useState<DatosConcepto | null>(null);
  const [asignando, setAsignando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const envio = useEnvio();
  const intenciones = useIntenciones();
  if (estado.fase === "cargando") return <Cargando etiqueta={`Cargando ${codigo}…`} />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const d = estado.datos;
  const c = d.concepto;
  const cambios = (x: DatosConcepto) => {
    const { tarifaCodigo: _t, ...resto } = x;
    return Object.fromEntries(
      Object.entries(resto).filter(([k, v]) => {
        if (!(CAMPOS_TECNICOS_CONCEPTO as readonly string[]).includes(k)) return false;
        const actual: Record<string, unknown> = {
          tipoCodigo: c.tipo?.codigo ?? "",
          descripcion: c.descripcion,
          unidad: c.unidad,
          tipoFormula: c.tipoFormula,
          permiteDescuento: d.permiteDescuento,
          reglaMedicion: d.reglaMedicion ?? "",
          criterios: d.criterios,
          clase: c.clase,
        };
        return v !== actual[k];
      }),
    );
  };
  const guardarTecnico = async (x: DatosConcepto) => {
    const r = await envio.ejecutar(() => servicios.editarConcepto(codigo, { revision: c.revision, ...cambios(x) }));
    setConfirmar(null);
    if (r?.ok) {
      setEditando(false);
      setPendiente(null);
      alCambiar(
        c.estado === "Aprobado" && r.datos.concepto.estado === "Borrador"
          ? `Concepto ${codigo} guardado: volvió a Borrador y necesita una nueva aprobación.`
          : `Concepto ${codigo} guardado.`,
      );
      recargar();
    }
  };
  const cambiarActivo = async () => {
    const r = await envio.ejecutar(() => servicios.editarConcepto(codigo, { revision: c.revision, activo: !c.activo }));
    setConfirmar(null);
    if (r?.ok) (alCambiar(r.datos.concepto.activo ? `Concepto ${codigo} reactivado en Borrador (requiere aprobación).` : `Concepto ${codigo} desactivado; conserva su aprobación.`), recargar());
  };
  const aprobar = async () => {
    const cuerpo = { revisionTecnica: c.revisionTecnica };
    const r = await envio.ejecutar(() => servicios.aprobarConcepto(codigo, cuerpo, intenciones.clave(`aprobar:${codigo}`, cuerpo)));
    setConfirmar(null);
    if (r?.ok) {
      intenciones.olvidar(`aprobar:${codigo}`, cuerpo);
      alCambiar(`Concepto ${codigo} aprobado (revisión técnica ${c.revisionTecnica}).`);
      recargar();
    } else if (r && !r.ok && r.fallo.tipo === "catalogo" && r.fallo.codigo === "REQUISITOS_INCOMPLETOS") {
      recargar();
    }
  };
  const requisitosFallo = envio.fallo?.tipo === "catalogo" ? envio.fallo.problemas : undefined;
  return (
    <div className="panel-registro">
      <div aria-live="polite">{aviso ? <Aviso tono="correcto" titulo={aviso} /> : null}</div>
      {c.heredado ? <AvisoHeredado requisitos={d.requisitos} /> : null}
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} alRecargar={() => (envio.setFallo(null), recargar())} /> : null}
      {requisitosFallo && requisitosFallo.length > 0 ? (
        <ul className="lista-registros" aria-label="Requisitos pendientes según el servidor">
          {requisitosFallo.map((p) => (
            <li key={`${p.codigo}-${p.referencia}`}>{p.mensaje}</li>
          ))}
        </ul>
      ) : null}
      {editando ? (
        <>
          <FormularioConcepto
            titulo={`Editar ${codigo}`}
            inicial={d}
            textoBoton={c.estado === "Aprobado" ? "Revisar y confirmar" : "Guardar cambios"}
            servicios={servicios}
            alCancelar={() => (setEditando(false), setConfirmar(null))}
            alRecargar={() => (setEditando(false), recargar())}
            alGuardar={(x, tecnico) => {
              if (tecnico && c.estado === "Aprobado") {
                setPendiente(x);
                setConfirmar("tecnico");
                return null;
              }
              return servicios.editarConcepto(codigo, { revision: c.revision, ...cambios(x) }).then((r) => {
                if (r.ok) (setEditando(false), alCambiar(`Concepto ${codigo} guardado.`), recargar());
                return r;
              });
            }}
          />
          {confirmar === "tecnico" && pendiente ? (
            <Confirmacion
              texto={`Es un cambio técnico: ${codigo} volverá a Borrador y perderá la aprobación de ${c.aprobadoPor ?? "la carga anterior"}. ${
                textoImpactoVersiones(d.impacto) ?? "Ninguna cotización abierta lo usa."
              } Las versiones calculadas y los PDF emitidos no cambian.`}
              accion="Guardar y volver a Borrador"
              variante="primario"
              alConfirmar={() => void guardarTecnico(pendiente)}
              alCancelar={() => setConfirmar(null)}
              ocupado={envio.enviando}
            />
          ) : null}
        </>
      ) : (
        <>
          <dl className="lista-datos">
            <dt>Tipo de estructura</dt>
            <dd>{c.tipo ? `${c.tipo.codigo} · [${c.tipo.familia}] ${c.tipo.nombre}${c.tipo.activo ? "" : " (inactivo)"}` : "Sin tipo"}</dd>
            <dt>Unidad y fórmula</dt>
            <dd>
              {c.unidad} · {TEXTO_FORMULA[c.tipoFormula as keyof typeof TEXTO_FORMULA] ?? c.tipoFormula} · {d.permiteDescuento ? "admite descuentos (signo -)" : "sin descuentos"}
            </dd>
            <dt>Regla de medición</dt>
            <dd>{d.reglaMedicion ?? <span className="ayuda">Sin regla</span>}</dd>
            <dt>Criterios especiales</dt>
            <dd>{d.criterios ?? <span className="ayuda">Sin criterios</span>}</dd>
            <dt>Clase</dt>
            <dd>{TEXTO_CLASE[c.clase as ClaseConcepto] ?? c.clase}</dd>
            <dt>Aprobación</dt>
            <dd>
              {c.estado === "Aprobado"
                ? c.aprobadoEn
                  ? `Aprobado por ${c.aprobadoPor ?? "la carga base"} el ${formatearInstante(c.aprobadoEn)}`
                  : "Aprobado en la carga anterior (sin fecha registrada)"
                : "Borrador"}{" "}
              · revisión técnica {c.revisionTecnica}
            </dd>
            <dt>Registro</dt>
            <dd>
              Creado {formatearInstante(d.creadoEn)} por {d.creadoPor ?? "la carga"}
              {d.cambioTecnicoEn ? ` · último cambio técnico ${formatearInstante(d.cambioTecnicoEn)} por ${d.cambioTecnicoPor ?? "—"}` : ""}
            </dd>
          </dl>
          <div className="formulario-acciones">
            <Boton onClick={() => (setAviso(null), setEditando(true))}>{c.heredado ? "Completar datos" : "Editar datos"}</Boton>
            {confirmar === "activo" ? (
              <Confirmacion
                texto={
                  c.activo
                    ? `Se desactivará ${codigo}. No se borra y conserva su aprobación: deja de ofrecerse para cotizaciones nuevas y el cálculo lo bloquea (BL-04).`
                    : `Se reactivará ${codigo} en Borrador: necesitará una nueva aprobación (BTN_ConceptoActivo).`
                }
                accion={c.activo ? "Desactivar" : "Reactivar"}
                variante={c.activo ? "peligro" : "primario"}
                alConfirmar={() => void cambiarActivo()}
                alCancelar={() => setConfirmar(null)}
                ocupado={envio.enviando}
              />
            ) : (
              <Boton variante={c.activo ? "peligro" : "secundario"} onClick={() => setConfirmar("activo")}>
                {c.activo ? "Desactivar concepto" : "Reactivar concepto"}
              </Boton>
            )}
          </div>
        </>
      )}

      <h3 className="subtitulo">Tarifa de mano de obra</h3>
      <p>
        {c.tarifa ? (
          <>
            <Codigo>{c.tarifa.codigo}</Codigo> {TEXTO_MODALIDAD[c.tarifa.modalidad]} · {textoImporteTarifa(c.tarifa)} · {formatearFecha(c.tarifa.vigenteDesde)} a{" "}
            {formatearFecha(c.tarifa.vigenteHasta)}
            {c.tarifa.activa ? "" : " · inactiva"}
          </>
        ) : (
          <span className="ayuda">Sin tarifa (obligatoria para aprobar).</span>
        )}
      </p>
      {asignando ? (
        <FormularioAsignacion
          concepto={c}
          servicios={servicios}
          alAsignada={(m) => (setAsignando(false), setAviso(m), recargar())}
          alRecargar={recargar}
        />
      ) : (
        <div className="formulario-acciones">
          <Boton onClick={() => (setAviso(null), setAsignando(true))}>Asignar tarifa</Boton>
        </div>
      )}

      <SeccionComponentes d={d} servicios={servicios} alCambiar={(m) => (setAviso(m), recargar())} />

      <h3 className="subtitulo">Cotizaciones abiertas</h3>
      <p className="ayuda">{textoImpactoVersiones(d.impacto) ?? "Ninguna cotización abierta usa este concepto."}</p>

      <h3 className="subtitulo">Aprobación</h3>
      {c.estado === "Aprobado" ? (
        <p className="ayuda">Aprobado. Un cambio técnico lo devolverá a Borrador.</p>
      ) : d.requisitos.length > 0 ? (
        <>
          <p>Requisitos pendientes según el servidor:</p>
          <ul className="lista-registros" aria-label="Requisitos para aprobar">
            {d.requisitos.map((p) => (
              <li key={`${p.codigo}-${p.referencia}`}>{p.mensaje}</li>
            ))}
          </ul>
        </>
      ) : confirmar === "aprobar" ? (
        <Confirmacion
          texto={`Aprobará ${codigo} tal como está ahora (revisión técnica ${c.revisionTecnica}). Si otra persona lo cambia antes, no se aprobará y verá la versión vigente.`}
          accion="Aprobar concepto"
          variante="primario"
          alConfirmar={() => void aprobar()}
          alCancelar={() => setConfirmar(null)}
          ocupado={envio.enviando}
        />
      ) : (
        <div className="formulario-acciones">
          <p className="ayuda">Cumple todos los requisitos del servidor.</p>
          <Boton variante="primario" onClick={() => setConfirmar("aprobar")}>
            Aprobar concepto
          </Boton>
        </div>
      )}
      <Historial eventos={d.historial} />
    </div>
  );
}

// ------------------------------- componentes --------------------------------

const textoConvertibilidad = (k: ComponenteAdmin) =>
  k.convertibilidad.estado === "BASE"
    ? "En la unidad base"
    : k.convertibilidad.estado === "CONVERSION"
      ? `Convierte: 1 ${k.unidadRendimiento} = ${k.convertibilidad.factor} ${k.insumo.unidadBase}`
      : `Falta la conversión ${k.unidadRendimiento} → ${k.insumo.unidadBase}`;

function textoTrazabilidad(k: ComponenteAdmin): ReactNode {
  if (k.trazable) return `${k.fuente} · ${formatearFecha(k.fecha!)} · ${k.responsable}`;
  const faltan = [k.fuente ? null : "fuente", k.fecha ? null : "fecha", k.responsable ? null : "responsable técnico"].filter(Boolean);
  return <strong>Falta: {faltan.join(", ")}</strong>;
}

function SeccionComponentes({ d, servicios, alCambiar }: { d: DetalleConceptoAdmin; alCambiar: (m: string) => void } & Props) {
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const intenciones = useIntenciones();
  const envio = useEnvio();
  const c = d.concepto;
  const aviso = c.estado === "Aprobado" ? " Es un cambio técnico: el concepto volvió a Borrador y necesita una nueva aprobación." : "";
  return (
    <>
      <h3 className="subtitulo">Componentes</h3>
      {envio.fallo ? <AvisoFallo fallo={envio.fallo} /> : null}
      {d.componentes.length === 0 ? (
        <p className="ayuda">Sin componentes{c.clase === "GENERICO" ? " (un concepto genérico puede aprobarse sin ellos)." : "."}</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla tabla-registros">
            <caption className="solo-lector">Componentes de {c.codigo}</caption>
            <thead>
              <tr>
                <th scope="col">Insumo</th>
                <th scope="col">Rendimiento</th>
                <th scope="col">Unidad</th>
                <th scope="col">Desperdicio y traslape</th>
                <th scope="col">Trazabilidad</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {d.componentes.map((k) => (
                <tr key={k.codigo}>
                  <td data-etiqueta="Insumo">
                    <Codigo>{k.codigo}</Codigo> {k.insumo.codigo} · {k.insumo.descripcion}
                    <span className="ayuda bloque">Unidad base {k.insumo.unidadBase}{k.insumo.activo ? "" : " · insumo inactivo"}</span>
                  </td>
                  <td data-etiqueta="Rendimiento" className="numero">
                    {k.rendimiento} {k.unidadRendimiento} / {c.unidad}
                  </td>
                  <td data-etiqueta="Unidad">{textoConvertibilidad(k)}</td>
                  <td data-etiqueta="Desperdicio y traslape">
                    {k.desperdicio}
                    {k.factorTraslape !== null ? ` · traslape ${k.factorTraslape}` : " · sin traslape"}
                  </td>
                  <td data-etiqueta="Trazabilidad">{textoTrazabilidad(k)}</td>
                  <td data-etiqueta="Estado">
                    <EstadoRegistro activo={k.activo} />
                  </td>
                  <td data-etiqueta="Acciones" className="celda-acciones">
                    <Boton variante="enlace" onClick={() => setEditando((e) => (e === k.codigo ? null : k.codigo))} aria-expanded={editando === k.codigo}>
                      {editando === k.codigo ? "Cerrar" : `Editar ${k.codigo}`}
                    </Boton>
                    <Boton
                      variante="enlace"
                      disabled={envio.enviando}
                      onClick={() =>
                        void envio
                          .ejecutar(() => servicios.editarComponente(c.codigo, k.codigo, { revision: k.revision, activo: !k.activo }))
                          .then((r) => r?.ok && alCambiar(`Componente ${k.codigo} ${k.activo ? "desactivado" : "reactivado"}.${aviso}`))
                      }
                    >
                      {k.activo ? `Desactivar ${k.codigo}` : `Reactivar ${k.codigo}`}
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando ? (
        <FormularioComponente
          key={editando}
          concepto={c}
          inicial={d.componentes.find((k) => k.codigo === editando)!}
          servicios={servicios}
          alCancelar={() => setEditando(null)}
          alGuardar={(x) =>
            servicios.editarComponente(c.codigo, editando, { revision: d.componentes.find((k) => k.codigo === editando)!.revision, ...x }).then((r) => {
              if (r.ok) (setEditando(null), alCambiar(`Componente ${editando} guardado.${aviso}`));
              return r;
            })
          }
        />
      ) : null}
      {nuevo ? (
        <FormularioComponente
          concepto={c}
          servicios={servicios}
          alCancelar={() => setNuevo(false)}
          alGuardar={(x) =>
            servicios.crearComponente(c.codigo, x, intenciones.clave(`componente:${c.codigo}`, x)).then((r) => {
              if (r.ok) (intenciones.olvidar(`componente:${c.codigo}`, x), setNuevo(false), alCambiar(`Componente agregado a ${c.codigo}.${aviso}`));
              return r;
            })
          }
        />
      ) : editando ? null : (
        <div className="formulario-acciones">
          <Boton onClick={() => setNuevo(true)} disabled={c.heredado}>
            Agregar componente
          </Boton>
          {c.heredado ? <span className="ayuda">Complete primero los datos del concepto.</span> : null}
        </div>
      )}
    </>
  );
}

type DatosComponente = {
  insumoCodigo: string;
  rendimiento: string;
  unidadRendimiento: string;
  desperdicio: string;
  factorTraslape: string | null;
  fuente: string | null;
  fecha: string | null;
  responsable: string | null;
};

function FormularioComponente({
  concepto,
  inicial,
  servicios,
  alGuardar,
  alCancelar,
}: {
  concepto: ConceptoTarifaAdmin;
  inicial?: ComponenteAdmin;
  alGuardar: (d: DatosComponente) => Promise<ResultadoApi<unknown>>;
  alCancelar: () => void;
} & Props) {
  const unidades = useUnidades(servicios);
  const [insumo, setInsumo] = useState(inicial?.insumo.codigo ?? "");
  const [insumoElegido, setInsumoElegido] = useState<OpcionRegistro | null>(
    inicial ? { codigo: inicial.insumo.codigo, texto: `${inicial.insumo.codigo} · ${inicial.insumo.descripcion} (${inicial.insumo.unidadBase})`, disponible: inicial.insumo.activo, detalle: inicial.insumo.unidadBase } : null,
  );
  const [rendimiento, setRendimiento] = useState(inicial?.rendimiento ?? "");
  const [unidad, setUnidad] = useState(inicial?.unidadRendimiento ?? "");
  const [desperdicio, setDesperdicio] = useState(inicial?.desperdicio ?? "0");
  const [traslape, setTraslape] = useState(inicial?.factorTraslape ?? "");
  const [fuente, setFuente] = useState(inicial?.fuente ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? "");
  const [responsable, setResponsable] = useState(inicial?.responsable ?? "");
  const [intentado, setIntentado] = useState(false);
  const envio = useEnvio();
  const titulo = inicial ? `Editar ${inicial.codigo}` : `Nuevo componente de ${concepto.codigo}`;
  const faltan = !insumo || rendimiento.trim() === "" || !unidad || desperdicio.trim() === "";
  const sinTraza = fuente.trim() === "" || fecha === "" || responsable.trim() === "";
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (faltan) return;
    void envio.ejecutar(() =>
      alGuardar({
        insumoCodigo: insumo,
        rendimiento: rendimiento.trim(),
        unidadRendimiento: unidad,
        desperdicio: desperdicio.trim(),
        factorTraslape: opcional(traslape),
        fuente: opcional(fuente),
        fecha: fecha || null,
        responsable: opcional(responsable),
      }),
    );
  };
  return (
    <form className="formulario" onSubmit={enviar} noValidate aria-label={titulo}>
      <p className="formulario-titulo">{titulo}</p>
      <SelectorRegistro
        etiqueta="Insumo técnico (activo)"
        valor={insumo}
        seleccion={insumoElegido}
        alCambiar={(codigo, opcion) => (setInsumo(codigo), setInsumoElegido(opcion), opcion?.detalle && !unidad ? setUnidad(opcion.detalle) : undefined)}
        buscar={buscarInsumos(servicios)}
        obligatorio
        enfocar
        error={intentado && !insumo ? "Seleccione el insumo." : errorDe(envio.fallo, "insumoCodigo")}
        ayuda="Un componente por insumo en cada concepto."
      />
      <div className="formulario-fila">
        <CampoTexto
          etiqueta={`Rendimiento (por ${concepto.unidad} de concepto)`}
          valor={rendimiento}
          alCambiar={setRendimiento}
          max={32}
          inputMode="decimal"
          obligatorio
          error={intentado && rendimiento.trim() === "" ? "Indique el rendimiento." : errorDe(envio.fallo, "rendimiento")}
          ayuda="Mayor que cero, hasta 6 decimales."
        />
        <CampoSeleccion
          etiqueta="Unidad del rendimiento"
          valor={unidad}
          alCambiar={setUnidad}
          obligatorio
          opciones={unidades.map((u) => ({ valor: u.clave, texto: `${u.clave} · ${u.nombre}` }))}
          error={intentado && !unidad ? "Seleccione la unidad." : errorDe(envio.fallo, "unidadRendimiento")}
          ayuda={insumoElegido?.detalle ? `Si no es ${insumoElegido.detalle}, el insumo necesita una conversión directa a ${insumoElegido.detalle}.` : undefined}
        />
      </div>
      <div className="formulario-fila">
        <CampoTexto
          etiqueta="Desperdicio (fracción 0 a <1)"
          valor={desperdicio}
          alCambiar={setDesperdicio}
          max={10}
          inputMode="decimal"
          obligatorio
          error={intentado && desperdicio.trim() === "" ? "Indique el desperdicio (0 si no hay)." : errorDe(envio.fallo, "desperdicio")}
          ayuda="Por ejemplo 0.05 = 5 %."
        />
        <CampoTexto
          etiqueta="Factor de traslape"
          valor={traslape}
          alCambiar={setTraslape}
          max={12}
          inputMode="decimal"
          error={errorDe(envio.fallo, "factorTraslape")}
          ayuda="Vacío = sin traslape; 0 es un valor capturado."
        />
      </div>
      <fieldset className="campo">
        <legend className="etiqueta">Trazabilidad del rendimiento</legend>
        <p className="ayuda">Opcional al guardar; obligatoria para aprobar el concepto y para calcular (BL-05).</p>
        <CampoTexto etiqueta="Fuente del rendimiento" valor={fuente} alCambiar={setFuente} max={LIMITES_CATALOGO_TECNICO.longitudFuente} error={errorDe(envio.fallo, "fuente")} />
        <div className="formulario-fila">
          <CampoTexto etiqueta="Fecha de la fuente" tipo="date" valor={fecha} alCambiar={setFecha} max={10} error={errorDe(envio.fallo, "fecha")} />
          <CampoTexto etiqueta="Responsable técnico" valor={responsable} alCambiar={setResponsable} max={LIMITES_CATALOGO_TECNICO.longitudResponsable} error={errorDe(envio.fallo, "responsable")} />
        </div>
      </fieldset>
      {sinTraza ? <p className="ayuda">Sin trazabilidad completa el componente se guarda, pero el concepto no podrá aprobarse.</p> : null}
      {envio.fallo && envio.fallo.tipo !== "invalida" ? <AvisoFallo fallo={envio.fallo} /> : null}
      <Acciones enviando={envio.enviando} texto={inicial ? "Guardar componente" : "Agregar componente"} alCancelar={alCancelar} />
    </form>
  );
}
