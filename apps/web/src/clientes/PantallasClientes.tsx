/**
 * Clientes y proyectos (módulo 6): buscar, crear, editar, desactivar y reactivar. Desactivar no
 * borra: el registro deja de ofrecerse para cotizaciones nuevas y el historial lo conserva.
 * Los controles de alta y edición solo se muestran con la capacidad `clientes.gestionar`; la API
 * los rechaza de todos modos (403).
 */
import { AccesoCliente } from "../solicitudes/AccesoCliente.tsx";
import type { ServiciosSolicitudes } from "../solicitudes/servicios.ts";
import { useState, type FormEvent } from "react";
import type { Cliente, Proyecto } from "@softarq/contracts";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCotizaciones } from "../api/servicios-cotizaciones.ts";
import { Aviso, Boton, Codigo } from "../comunes/componentes.tsx";
import { formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, EstadoRegistro, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { Enlace, useRuta } from "../navegacion/ruta.tsx";
import { FormularioCliente, FormularioProyecto } from "./formularios.tsx";

function Busqueda({
  etiqueta,
  alBuscar,
  inactivos,
  alCambiarInactivos,
}: {
  etiqueta: string;
  alBuscar: (texto: string) => void;
  inactivos: boolean;
  alCambiarInactivos: (v: boolean) => void;
}) {
  const [texto, setTexto] = useState("");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    alBuscar(texto);
  };
  return (
    <form className="barra-busqueda" role="search" onSubmit={enviar}>
      <label className="etiqueta" htmlFor="buscar-registros">
        {etiqueta}
      </label>
      <div className="entrada-con-accion">
        <input id="buscar-registros" type="search" value={texto} maxLength={60} onChange={(e) => setTexto(e.target.value)} />
        <Boton type="submit">Buscar</Boton>
      </div>
      <label className="casilla">
        <input type="checkbox" checked={inactivos} onChange={(e) => alCambiarInactivos(e.target.checked)} />
        Incluir inactivos
      </label>
    </form>
  );
}

export function ListaClientes({ servicios, puedeGestionar }: { servicios: ServiciosCotizaciones; puedeGestionar: boolean }) {
  const { navegar } = useRuta();
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [creando, setCreando] = useState(false);
  const intenciones = useIntenciones();
  const { estado, recargar } = useCarga((s) => servicios.listarClientes({ buscar, incluirInactivos: inactivos }, s), [buscar, inactivos]);

  return (
    <Pagina
      titulo="Clientes"
      subtitulo="Quien recibe la cotización. Sin cuenta en el sistema. Datos DEMO."
      acciones={
        puedeGestionar && !creando ? (
          <Boton variante="primario" onClick={() => setCreando(true)}>
            Nuevo cliente
          </Boton>
        ) : null
      }
    >
      {creando ? (
        <FormularioCliente
          titulo="Nuevo cliente"
          textoBoton="Crear cliente"
          alCancelar={() => setCreando(false)}
          alGuardar={async (datos) => {
            const r = await servicios.crearCliente(datos, intenciones.clave("crear-cliente", datos));
            if (r.ok) {
              intenciones.olvidar("crear-cliente", datos);
              navegar({ pantalla: "cliente", id: r.datos.id });
            }
            return r;
          }}
        />
      ) : null}
      <Busqueda etiqueta="Buscar por nombre o código" alBuscar={setBuscar} inactivos={inactivos} alCambiarInactivos={setInactivos} />
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando clientes…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.clientes.length === 0 ? (
          <SinResultados>
            {buscar ? `No hay clientes que coincidan con «${buscar}». Pruebe con otro texto o incluya los inactivos.` : "Todavía no hay clientes."}
            {puedeGestionar && !buscar ? " Use «Nuevo cliente» para registrar el primero." : null}
          </SinResultados>
        ) : (
          <TablaClientes clientes={estado.datos.clientes} />
        )
      ) : null}
    </Pagina>
  );
}

function TablaClientes({ clientes }: { clientes: Cliente[] }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-registros">
        <caption className="solo-lector">Clientes</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Nombre o razón social</th>
            <th scope="col">Estado</th>
            <th scope="col">Última modificación</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td data-etiqueta="Código">
                <Codigo>{c.codigo}</Codigo>
              </td>
              <td data-etiqueta="Nombre">
                <Enlace a={{ pantalla: "cliente", id: c.id }}>{c.nombre}</Enlace>
              </td>
              <td data-etiqueta="Estado">
                <EstadoRegistro activo={c.activo} />
              </td>
              <td data-etiqueta="Modificado">
                {formatearInstante(c.modificadoEn)} · {c.modificadoPor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetalleClientePantalla({
  servicios,
  id,
  puedeGestionar,
  puedePreparar,
  accesos,
}: {
  servicios: ServiciosCotizaciones;
  id: string;
  puedeGestionar: boolean;
  puedePreparar: boolean;
  /** Acceso del cliente a la app (módulo 17): solo con `personas.administrar`. */
  accesos?: ServiciosSolicitudes;
}) {
  const { estado, recargar } = useCarga((s) => servicios.detalleCliente(id, s), [id]);
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [creandoProyecto, setCreandoProyecto] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const intenciones = useIntenciones();

  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando el cliente…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { cliente, proyectos, borradoresAbiertos } = estado.datos;

  const cambiarActivo = async () => {
    setFallo(null);
    const r = await servicios.editarCliente(cliente.id, { revision: cliente.revision, activo: !cliente.activo });
    setConfirmar(false);
    if (!r.ok) {
      setFallo(r.fallo);
      return;
    }
    setMensaje(r.datos.activo ? "Cliente reactivado." : "Cliente desactivado. Sus cotizaciones y versiones se conservan.");
    recargar();
  };

  return (
    <Pagina
      titulo={cliente.nombre}
      subtitulo={
        <>
          <Codigo>{cliente.codigo}</Codigo> · <EstadoRegistro activo={cliente.activo} /> · modificado {formatearInstante(cliente.modificadoEn)} por{" "}
          {cliente.modificadoPor}
        </>
      }
      acciones={<Enlace a={{ pantalla: "clientes" }}>Volver a clientes</Enlace>}
    >
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      {fallo ? (
        <Aviso tono="error" titulo="No se guardó" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
          {fallo.tipo === "conflicto" ? <Boton onClick={() => (setFallo(null), recargar())}>Recargar el cliente</Boton> : null}
        </Aviso>
      ) : null}
      <section className="seccion" aria-labelledby="titulo-datos-cliente">
        <h2 id="titulo-datos-cliente" className="seccion-titulo">
          Datos del cliente
        </h2>
        {!editando ? (
          <dl className="datos-cotizacion">
            <div>
              <dt>Contacto</dt>
              <dd>{cliente.contactoNombre ?? <span className="ayuda">Sin capturar (necesario para emitir)</span>}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{cliente.contactoTelefono ?? "—"}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{cliente.contactoCorreo ?? "—"}</dd>
            </div>
          </dl>
        ) : null}
      {puedeGestionar ? (
        <>
          {editando ? (
            <FormularioCliente
              titulo="Editar cliente"
              inicial={cliente}
              textoBoton="Guardar cambios"
              alCancelar={() => setEditando(false)}
              alGuardar={async (datos) => {
                const r = await servicios.editarCliente(cliente.id, { revision: cliente.revision, ...datos });
                if (r.ok) {
                  setEditando(false);
                  setMensaje("Cliente actualizado.");
                  recargar();
                }
                return r;
              }}
            />
          ) : (
            <div className="formulario-acciones">
              <Boton onClick={() => (setMensaje(null), setEditando(true))}>Editar datos y contacto</Boton>
              {confirmar ? (
                <div className="confirmacion" role="group" aria-label="Confirmar cambio de estado">
                  <span>
                    {cliente.activo
                      ? `${borradoresAbiertos > 0 ? `El cliente tiene ${borradoresAbiertos} cotizaciones abiertas. ` : ""}Se desactivará: no se borra, deja de ofrecerse para cotizaciones nuevas y sus versiones se conservan.`
                      : "Se reactivará y volverá a ofrecerse para cotizaciones nuevas."}
                  </span>
                  <Boton variante={cliente.activo ? "peligro" : "primario"} onClick={() => void cambiarActivo()}>
                    {cliente.activo ? "Desactivar" : "Reactivar"}
                  </Boton>
                  <Boton onClick={() => setConfirmar(false)} autoFocus>
                    Cancelar
                  </Boton>
                </div>
              ) : (
                <Boton variante={cliente.activo ? "peligro" : "secundario"} onClick={() => (setMensaje(null), setConfirmar(true))}>
                  {cliente.activo ? "Desactivar cliente" : "Reactivar cliente"}
                </Boton>
              )}
            </div>
          )}
        </>
      ) : null}
      </section>

      {accesos ? <AccesoCliente servicios={accesos} clienteId={cliente.id} clienteNombre={cliente.contactoNombre ?? cliente.nombre} clienteActivo={cliente.activo} /> : null}

      <section className="seccion" aria-labelledby="titulo-proyectos-cliente">
        <h2 id="titulo-proyectos-cliente" className="seccion-titulo">
          Proyectos del cliente
        </h2>
        {puedeGestionar && cliente.activo && !creandoProyecto ? (
          <Boton onClick={() => setCreandoProyecto(true)}>Nuevo proyecto</Boton>
        ) : null}
        {creandoProyecto ? (
          <FormularioProyecto
            titulo="Nuevo proyecto"
            textoBoton="Crear proyecto"
            alCancelar={() => setCreandoProyecto(false)}
            alGuardar={async (datos) => {
              const r = await servicios.crearProyecto(cliente.id, datos, intenciones.clave(`crear-proyecto:${cliente.id}`, datos));
              if (r.ok) {
                intenciones.olvidar(`crear-proyecto:${cliente.id}`, datos);
                setCreandoProyecto(false);
                setMensaje(`Proyecto ${r.datos.codigo} creado.`);
                recargar();
              }
              return r;
            }}
          />
        ) : null}
        {proyectos.length === 0 ? (
          <SinResultados>Este cliente no tiene proyectos.</SinResultados>
        ) : (
          <TablaProyectos
            proyectos={proyectos}
            servicios={servicios}
            puedeGestionar={puedeGestionar}
            puedePreparar={puedePreparar}
            alCambiar={(m) => (setMensaje(m), recargar())}
            mostrarCliente={false}
          />
        )}
      </section>
    </Pagina>
  );
}

function FilaProyecto({
  p,
  servicios,
  puedeGestionar,
  puedePreparar,
  alCambiar,
  mostrarCliente,
}: {
  p: Proyecto;
  servicios: ServiciosCotizaciones;
  puedeGestionar: boolean;
  puedePreparar: boolean;
  alCambiar: (mensaje: string) => void;
  mostrarCliente: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const ubicacion = [p.municipio, p.entidadFederativa].filter(Boolean).join(", ");
  const disponible = p.activo && p.cliente.activo;

  const cambiarActivo = async () => {
    setFallo(null);
    const r = await servicios.editarProyecto(p.id, { revision: p.revision, activo: !p.activo });
    if (!r.ok) setFallo(r.fallo);
    else alCambiar(r.datos.activo ? `Proyecto ${p.codigo} reactivado.` : `Proyecto ${p.codigo} desactivado; su historial se conserva.`);
  };

  return (
    <>
      <tr>
        <td data-etiqueta="Código">
          <Codigo>{p.codigo}</Codigo>
        </td>
        <td data-etiqueta="Proyecto">
          {p.nombre}
          {p.descripcion ? <span className="ayuda bloque">{p.descripcion}</span> : null}
        </td>
        {mostrarCliente ? (
          <td data-etiqueta="Cliente">
            <Enlace a={{ pantalla: "cliente", id: p.cliente.id }}>{p.cliente.nombre}</Enlace>
            {p.cliente.activo ? null : <span className="ayuda"> (cliente inactivo)</span>}
          </td>
        ) : null}
        <td data-etiqueta="Ubicación">{ubicacion || <span className="ayuda">Sin capturar</span>}</td>
        <td data-etiqueta="Estado">
          <EstadoRegistro activo={p.activo} />
        </td>
        <td data-etiqueta="Acciones" className="celda-acciones">
          {puedePreparar && disponible ? (
            <Enlace className="boton boton-secundario" a={{ pantalla: "nueva-cotizacion", proyectoId: p.id }}>
              Nueva cotización
            </Enlace>
          ) : null}
          {puedeGestionar ? (
            <>
              <Boton variante="enlace" onClick={() => setEditando((v) => !v)} aria-expanded={editando}>
                {editando ? "Cerrar edición" : "Editar"}
              </Boton>
              <Boton variante="enlace" onClick={() => void cambiarActivo()}>
                {p.activo ? "Desactivar" : "Reactivar"}
              </Boton>
            </>
          ) : null}
        </td>
      </tr>
      {fallo ? (
        <tr>
          <td colSpan={mostrarCliente ? 6 : 5}>
            <Aviso tono="error" titulo="No se guardó" rol="alert">
              <p>{mensajeDeFallo(fallo)}</p>
            </Aviso>
          </td>
        </tr>
      ) : null}
      {editando ? (
        <tr>
          <td colSpan={mostrarCliente ? 6 : 5}>
            <FormularioProyecto
              titulo={`Editar ${p.codigo}`}
              inicial={{ nombre: p.nombre, municipio: p.municipio, entidadFederativa: p.entidadFederativa, descripcion: p.descripcion }}
              textoBoton="Guardar cambios"
              alCancelar={() => setEditando(false)}
              alGuardar={async (datos) => {
                const r = await servicios.editarProyecto(p.id, { revision: p.revision, ...datos });
                if (r.ok) {
                  setEditando(false);
                  alCambiar(`Proyecto ${p.codigo} actualizado.`);
                }
                return r;
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TablaProyectos(props: {
  proyectos: Proyecto[];
  servicios: ServiciosCotizaciones;
  puedeGestionar: boolean;
  puedePreparar: boolean;
  alCambiar: (mensaje: string) => void;
  mostrarCliente: boolean;
}) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla tabla-registros">
        <caption className="solo-lector">Proyectos</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Proyecto</th>
            {props.mostrarCliente ? <th scope="col">Cliente</th> : null}
            <th scope="col">Ubicación</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {props.proyectos.map((p) => (
            <FilaProyecto key={p.id} p={p} {...props} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ListaProyectos({
  servicios,
  puedeGestionar,
  puedePreparar,
}: {
  servicios: ServiciosCotizaciones;
  puedeGestionar: boolean;
  puedePreparar: boolean;
}) {
  const [buscar, setBuscar] = useState("");
  const [inactivos, setInactivos] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const { estado, recargar } = useCarga((s) => servicios.listarProyectos({ buscar, incluirInactivos: inactivos }, s), [buscar, inactivos]);
  return (
    <Pagina
      titulo="Proyectos"
      subtitulo="Trabajos de los clientes. Un proyecto pertenece a un solo cliente; para crear uno, abra el cliente."
      acciones={<Enlace a={{ pantalla: "clientes" }}>Ir a clientes</Enlace>}
    >
      <div aria-live="polite">{mensaje ? <Aviso tono="correcto" titulo={mensaje} /> : null}</div>
      <Busqueda
        etiqueta="Buscar por proyecto, código, municipio o cliente"
        alBuscar={setBuscar}
        inactivos={inactivos}
        alCambiarInactivos={setInactivos}
      />
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando proyectos…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {estado.fase === "listo" ? (
        estado.datos.proyectos.length === 0 ? (
          <SinResultados>
            {buscar ? `No hay proyectos que coincidan con «${buscar}».` : "Todavía no hay proyectos activos."} Los proyectos se crean desde el cliente.
          </SinResultados>
        ) : (
          <TablaProyectos
            proyectos={estado.datos.proyectos}
            servicios={servicios}
            puedeGestionar={puedeGestionar}
            puedePreparar={puedePreparar}
            alCambiar={(m) => (setMensaje(m), recargar())}
            mostrarCliente
          />
        )
      ) : null}
    </Pagina>
  );
}
