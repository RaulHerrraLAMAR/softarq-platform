/**
 * Trabajos que se ofrecen al cliente en la app (Cubierta, Losa, Muro…), en el catálogo (módulo 17, ADR-0021). Solo con
 * `catalogos.administrar` (la API lo exige). Se pueden cambiar el nombre, la descripción, el orden y el estado de cada trabajo y de sus
 * opciones, siempre con motivo (queda en la bitácora). Desactivar no borra: el trabajo deja de ofrecerse en solicitudes nuevas y las
 * ya capturadas se conservan.
 *
 * Los conceptos técnicos que respaldan cada opción y las medidas que pide se ven pero NO se editan aquí: cambiarlos altera el cálculo
 * y se hace en «Conceptos y componentes» o con la API. Crear un trabajo nuevo tampoco se ofrece en pantalla por esa misma razón.
 */
import type { DefinicionTrabajo, RespuestaDefinicionesTrabajo } from "@softarq/contracts";
import { useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import type { ServiciosSolicitudes } from "./servicios.ts";

type Trabajo = RespuestaDefinicionesTrabajo["trabajos"][number];

function Edicion({ trabajo, servicios, alTerminar, alCancelar }: { trabajo: Trabajo; servicios: ServiciosSolicitudes; alTerminar: () => void; alCancelar: () => void }) {
  const { clave, olvidar } = useIntenciones();
  const [nombre, setNombre] = useState(trabajo.nombre);
  const [descripcion, setDescripcion] = useState(trabajo.descripcion);
  const [orden, setOrden] = useState(String(trabajo.orden));
  const [activo, setActivo] = useState(trabajo.activo);
  const [opciones, setOpciones] = useState(trabajo.opciones.map((o) => ({ ...o, orden: String(o.orden) })));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);

  const cambiarOpcion = (i: number, cambios: Partial<(typeof opciones)[number]>) => setOpciones((lista) => lista.map((o, j) => (j === i ? { ...o, ...cambios } : o)));
  const ordenValido = (t: string) => /^\d{1,3}$/.test(t);
  const valido = nombre.trim() !== "" && ordenValido(orden) && opciones.every((o) => o.nombre.trim() !== "" && ordenValido(o.orden)) && motivo.trim().length >= 3;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setFallo(null);
    const definicion: DefinicionTrabajo = {
      ...trabajo,
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      orden: Number(orden),
      activo,
      motivo: motivo.trim(),
      opciones: opciones.map((o) => ({ ...o, nombre: o.nombre.trim(), descripcion: o.descripcion.trim(), orden: Number(o.orden) })),
    };
    const intencion = { codigo: trabajo.codigo, definicion };
    const r = await servicios.guardarTrabajoCliente(definicion, clave("trabajo-cliente", intencion));
    setEnviando(false);
    if (r.ok) {
      olvidar("trabajo-cliente", intencion);
      alTerminar();
    } else if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
  };

  const id = (s: string) => `trabajo-${trabajo.codigo}-${s}`;
  return (
    <form className="formulario" onSubmit={(e) => void guardar(e)} aria-label={`Editar el trabajo ${trabajo.nombre}`}>
      <h3>
        Editar «{trabajo.nombre}» <span className="codigo">{trabajo.codigo}</span>
      </h3>
      <div className="campo">
        <label htmlFor={id("nombre")}>Nombre</label>
        <input id={id("nombre")} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required />
      </div>
      <div className="campo">
        <label htmlFor={id("descripcion")}>Descripción para el cliente</label>
        <input id={id("descripcion")} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} />
      </div>
      <div className="campo">
        <label htmlFor={id("orden")}>Orden (menor primero)</label>
        <input id={id("orden")} inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value)} maxLength={3} required />
      </div>
      <label className="casilla">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Se ofrece al cliente en la app
      </label>
      <fieldset>
        <legend>Opciones</legend>
        {opciones.map((o, i) => (
          <div key={o.codigo} className="tarjeta">
            <p>
              <span className="codigo">{o.codigo}</span> · concepto <span className="codigo">{o.conceptoCodigo}</span> · pide{" "}
              {o.medidas.map((m) => m.etiqueta).join(", ")}
              <span className="ayuda bloque">El concepto y las medidas no se editan aquí (cambian el cálculo).</span>
            </p>
            <div className="campo">
              <label htmlFor={id(`opcion-${i}-nombre`)}>Nombre de la opción {o.codigo}</label>
              <input id={id(`opcion-${i}-nombre`)} value={o.nombre} onChange={(e) => cambiarOpcion(i, { nombre: e.target.value })} maxLength={80} required />
            </div>
            <div className="campo">
              <label htmlFor={id(`opcion-${i}-descripcion`)}>Descripción de la opción {o.codigo}</label>
              <input id={id(`opcion-${i}-descripcion`)} value={o.descripcion} onChange={(e) => cambiarOpcion(i, { descripcion: e.target.value })} maxLength={300} />
            </div>
            <div className="campo">
              <label htmlFor={id(`opcion-${i}-orden`)}>Orden de la opción {o.codigo}</label>
              <input id={id(`opcion-${i}-orden`)} inputMode="numeric" value={o.orden} onChange={(e) => cambiarOpcion(i, { orden: e.target.value })} maxLength={3} required />
            </div>
            <label className="casilla">
              <input type="checkbox" checked={o.activa} onChange={(e) => cambiarOpcion(i, { activa: e.target.checked })} />
              La opción {o.codigo} está activa
            </label>
          </div>
        ))}
      </fieldset>
      <div className="campo">
        <label htmlFor={id("motivo")}>Motivo (queda en la bitácora)</label>
        <input id={id("motivo")} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required />
      </div>
      {fallo ? (
        <Aviso tono="error" titulo="No se guardó" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
          {fallo.tipo === "invalida" ? <ul>{fallo.campos.map((c) => <li key={c.ruta}>{c.mensaje}</li>)}</ul> : null}
        </Aviso>
      ) : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={!valido || enviando} aria-busy={enviando}>
          {enviando ? "Guardando…" : "Guardar el trabajo"}
        </Boton>
        <Boton onClick={alCancelar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export function VistaTrabajosCliente({ servicios }: { servicios: ServiciosSolicitudes }) {
  const { estado, recargar } = useCarga((s) => servicios.trabajosCliente(s), []);
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando trabajos…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const trabajos = [...estado.datos.trabajos].sort((a, b) => a.orden - b.orden);
  const enEdicion = trabajos.find((t) => t.codigo === editando);
  return (
    <section aria-label="Trabajos para clientes" className="pagina">
      <Aviso tono="info" titulo="Qué son">
        <p>Los trabajos que el cliente elige en la app para pedir una cotización. Desactivar uno no borra nada: deja de ofrecerse en solicitudes nuevas y las ya capturadas se conservan.</p>
      </Aviso>
      <div aria-live="polite">{aviso ? <Aviso tono="correcto" titulo={aviso} /> : null}</div>
      {enEdicion ? (
        <Edicion
          key={enEdicion.codigo}
          trabajo={enEdicion}
          servicios={servicios}
          alCancelar={() => setEditando(null)}
          alTerminar={() => {
            setAviso(`Trabajo «${enEdicion.nombre}» guardado.`);
            setEditando(null);
            recargar();
          }}
        />
      ) : null}
      {trabajos.length === 0 ? (
        <SinResultados>No hay trabajos definidos para clientes.</SinResultados>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla tabla-registros">
            <caption className="solo-lector">Trabajos para clientes</caption>
            <thead>
              <tr>
                <th scope="col">Trabajo</th>
                <th scope="col">Orden</th>
                <th scope="col">Opciones</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trabajos.map((t) => (
                <tr key={t.codigo}>
                  <td data-etiqueta="Trabajo">
                    {t.nombre} <span className="codigo">{t.codigo}</span>
                    <span className="ayuda bloque">{t.descripcion}</span>
                  </td>
                  <td data-etiqueta="Orden">{t.orden}</td>
                  <td data-etiqueta="Opciones">
                    {t.opciones.map((o) => (
                      <span key={o.codigo} className="bloque">
                        {o.nombre} {o.activa ? null : <span className="ayuda">(inactiva)</span>}
                      </span>
                    ))}
                  </td>
                  <td data-etiqueta="Estado">{t.activo ? <Insignia tono="estado">Se ofrece</Insignia> : <Insignia tono="menor">Desactivado</Insignia>}</td>
                  <td data-etiqueta="Acciones">
                    <Boton variante="enlace" onClick={() => (setAviso(null), setEditando(t.codigo))}>
                      Editar
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
