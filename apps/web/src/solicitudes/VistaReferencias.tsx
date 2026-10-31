/**
 * Precios de referencia para las estimaciones de la app (módulo 17, ADR-0021 §3), en el catálogo. Solo con
 * `catalogos.administrar` (la API lo exige). Una referencia por insumo, designada de forma explícita y con motivo.
 *
 * - No elige por el cliente ni toma el menor precio: la persona designa un precio vigente de un producto del insumo.
 * - Retirar o reemplazar no borra: la bitácora conserva quién y por qué. Las cotizaciones formales NO heredan estas
 *   referencias (el Preparador confirma precios por su cuenta, CR-07).
 * - Sin referencia vigente, la app no da importe: «el equipo completará la valoración».
 */
import type { PrecioAdmin, ReferenciaEstimacion } from "@softarq/contracts";
import { useState, type FormEvent } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import type { ServiciosCatalogoAdmin } from "../catalogo-admin/servicios.ts";
import { Aviso, Boton, Insignia } from "../comunes/componentes.tsx";
import { formatearFecha, formatearImporte, formatearInstante } from "../comunes/formato.ts";
import { useIntenciones } from "../comunes/intencion.ts";
import { CargaFallida, Cargando, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import type { ServiciosSolicitudes } from "./servicios.ts";

type Accion = { tipo: "designar"; insumoCodigo: string; insumo: string } | { tipo: "retirar"; insumoCodigo: string; insumo: string };

/** Precios vigentes de los productos de un insumo (sin anular ni vencidos). */
async function preciosDelInsumo(catalogo: ServiciosCatalogoAdmin, insumoCodigo: string): Promise<{ ok: true; precios: PrecioAdmin[] } | { ok: false; fallo: FalloApi }> {
  const productos = await catalogo.listarProductos({ insumoCodigo });
  if (!productos.ok) return { ok: false, fallo: productos.fallo };
  const resultados = await Promise.all(productos.datos.productos.filter((p) => p.activo).map((p) => catalogo.listarPrecios({ productoCodigo: p.codigo, estado: "VIGENTE" })));
  const fallido = resultados.find((r) => !r.ok);
  if (fallido && !fallido.ok) return { ok: false, fallo: fallido.fallo };
  return { ok: true, precios: resultados.flatMap((r) => (r.ok ? r.datos.precios : [])) };
}

function FormularioReferencia({ accion, servicios, catalogo, alTerminar, alCancelar }: { accion: Accion; servicios: ServiciosSolicitudes; catalogo: ServiciosCatalogoAdmin; alTerminar: () => void; alCancelar: () => void }) {
  const { clave, olvidar } = useIntenciones();
  const [precio, setPrecio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const opciones = useCarga(
    async () => {
      if (accion.tipo !== "designar") return { ok: true as const, datos: [] as PrecioAdmin[] };
      const r = await preciosDelInsumo(catalogo, accion.insumoCodigo);
      return r.ok ? { ok: true as const, datos: r.precios } : { ok: false as const, fallo: r.fallo };
    },
    [accion.insumoCodigo, accion.tipo],
  );

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setFallo(null);
    const intencion = { accion: accion.tipo, insumo: accion.insumoCodigo, precio, motivo };
    const r =
      accion.tipo === "designar"
        ? await servicios.designarReferencia(accion.insumoCodigo, precio, motivo.trim(), clave("referencia", intencion))
        : await servicios.retirarReferencia(accion.insumoCodigo, motivo.trim(), clave("referencia", intencion));
    setEnviando(false);
    if (r.ok) {
      olvidar("referencia", intencion);
      alTerminar();
    } else if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
  };

  const idMotivo = `motivo-ref-${accion.insumoCodigo}`;
  const idPrecio = `precio-ref-${accion.insumoCodigo}`;
  const puedeEnviar = motivo.trim().length >= 3 && (accion.tipo === "retirar" || precio !== "") && !enviando;
  return (
    <form className="formulario" onSubmit={(e) => void enviar(e)} aria-label={accion.tipo === "designar" ? `Designar la referencia de ${accion.insumo}` : `Retirar la referencia de ${accion.insumo}`}>
      <h3>{accion.tipo === "designar" ? `Designar la referencia de «${accion.insumo}»` : `Retirar la referencia de «${accion.insumo}»`}</h3>
      {accion.tipo === "designar" ? (
        <div className="campo">
          <label htmlFor={idPrecio}>Precio vigente de referencia</label>
          {opciones.estado.fase === "cargando" ? <p className="ayuda">Cargando precios vigentes…</p> : null}
          {opciones.estado.fase === "error" ? <p className="error">No se pudieron cargar los precios: {mensajeDeFallo(opciones.estado.fallo)}</p> : null}
          {opciones.estado.fase === "listo" ? (
            opciones.estado.datos.length === 0 ? (
              <p className="error">Este insumo no tiene precios vigentes: registre uno en «Precios» antes de designar la referencia.</p>
            ) : (
              <select id={idPrecio} value={precio} onChange={(e) => setPrecio(e.target.value)} required>
                <option value="">Elija un precio…</option>
                {opciones.estado.datos.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.codigo} · {p.producto.descripcion} · {p.proveedor.nombre} · {formatearImporte(p.precioUnitario, "MXN")} · hasta {formatearFecha(p.vigenteHasta)}
                  </option>
                ))}
              </select>
            )
          ) : null}
        </div>
      ) : (
        <p className="ayuda">Sin referencia vigente, la app no dará importe para los trabajos que usen este insumo.</p>
      )}
      <div className="campo">
        <label htmlFor={idMotivo}>Motivo (queda en la bitácora)</label>
        <input id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required />
      </div>
      {fallo ? (
        <Aviso tono="error" titulo="No se guardó" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
        </Aviso>
      ) : null}
      <div className="formulario-acciones">
        <Boton type="submit" variante="primario" disabled={!puedeEnviar} aria-busy={enviando}>
          {enviando ? "Guardando…" : accion.tipo === "designar" ? "Designar" : "Retirar"}
        </Boton>
        <Boton onClick={alCancelar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export function VistaReferencias({ servicios, catalogo }: { servicios: ServiciosSolicitudes; catalogo: ServiciosCatalogoAdmin }) {
  const { estado, recargar } = useCarga((s) => servicios.referencias(s), []);
  const [accion, setAccion] = useState<Accion | null>(null);
  const terminar = () => {
    setAccion(null);
    recargar();
  };
  if (estado.fase === "cargando") return <Cargando etiqueta="Cargando referencias…" />;
  if (estado.fase === "error") return <CargaFallida fallo={estado.fallo} alReintentar={recargar} />;
  const { referencias, pendientes } = estado.datos;
  const fila = (r: ReferenciaEstimacion) => (
    <tr key={r.insumoCodigo}>
      <td data-etiqueta="Insumo">
        {r.insumo} <span className="codigo">{r.insumoCodigo}</span>
      </td>
      <td data-etiqueta="Producto y proveedor">
        {r.producto} · {r.proveedor} <span className="codigo">{r.precioCodigo}</span>
      </td>
      <td data-etiqueta="Vigente hasta">{formatearFecha(r.vigenteHasta)}</td>
      <td data-etiqueta="Estado">{r.vigente ? <Insignia tono="estado">Vigente</Insignia> : <Insignia tono="alerta">Ya no vale: la estimación no la usa</Insignia>}</td>
      <td data-etiqueta="Designada">
        {formatearInstante(r.designadaEn)}
        <span className="ayuda bloque">{r.motivo}</span>
      </td>
      <td data-etiqueta="Acciones">
        <Boton variante="enlace" onClick={() => setAccion({ tipo: "designar", insumoCodigo: r.insumoCodigo, insumo: r.insumo })}>
          Reemplazar
        </Boton>
        <Boton variante="enlace" onClick={() => setAccion({ tipo: "retirar", insumoCodigo: r.insumoCodigo, insumo: r.insumo })}>
          Retirar
        </Boton>
      </td>
    </tr>
  );
  return (
    <section aria-label="Precios de referencia para las estimaciones" className="pagina">
      <Aviso tono="info" titulo="Qué son">
        <p>Precio que la app usa para estimar un trabajo al cliente. Se designa por insumo, de forma explícita; no se elige el menor ni se hereda a la cotización formal.</p>
      </Aviso>
      {accion ? <FormularioReferencia accion={accion} servicios={servicios} catalogo={catalogo} alTerminar={terminar} alCancelar={() => setAccion(null)} /> : null}
      {pendientes.length > 0 ? (
        <section aria-labelledby="titulo-pendientes" className="tarjeta">
          <h2 id="titulo-pendientes" className="tarjeta-titulo">
            Insumos sin referencia ({pendientes.length})
          </h2>
          <ul className="lista-simple">
            {pendientes.map((p) => (
              <li key={p.insumoCodigo}>
                {p.insumo} <span className="codigo">{p.insumoCodigo}</span>{" "}
                <Boton variante="enlace" onClick={() => setAccion({ tipo: "designar", insumoCodigo: p.insumoCodigo, insumo: p.insumo })}>
                  Designar referencia
                </Boton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {referencias.length === 0 ? (
        <SinResultados>No hay referencias designadas.</SinResultados>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla tabla-registros">
            <caption className="solo-lector">Referencias designadas</caption>
            <thead>
              <tr>
                <th scope="col">Insumo</th>
                <th scope="col">Producto y proveedor</th>
                <th scope="col">Vigente hasta</th>
                <th scope="col">Estado</th>
                <th scope="col">Designada</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>{referencias.map(fila)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
