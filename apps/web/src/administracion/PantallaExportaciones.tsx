/**
 * Exportación CSV de tablas para migración (RF-26, ADR-0023). Muestra solo las tablas que la sesión puede exportar (la API decide
 * por capacidad) con sus columnas, y descarga el CSV UTF-8 de la propia organización. Sin contraseñas, hashes, sesiones ni tokens.
 * No es un informe (las compras y el detalle son las salidas internas de cada versión) ni sustituye al respaldo.
 */
import { useState } from "react";
import { mensajeDeFallo, type FalloApi } from "../api/cliente.ts";
import { Aviso, Boton } from "../comunes/componentes.tsx";
import { CargaFallida, Cargando, Pagina, SinResultados } from "../comunes/pagina.tsx";
import { useCarga } from "../comunes/usarCarga.ts";
import { guardarArchivo } from "../cotizaciones/emision.tsx";
import type { ServiciosAdministracion } from "./servicios.ts";

export function PantallaExportaciones({ servicios }: { servicios: ServiciosAdministracion }) {
  const { estado, recargar } = useCarga((s) => servicios.exportaciones(s), []);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<FalloApi | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const descargar = async (tabla: string) => {
    setDescargando(tabla);
    setFallo(null);
    setHecho(null);
    const r = await servicios.descargarExportacion(tabla);
    setDescargando(null);
    if (!r.ok) {
      if (r.fallo.tipo !== "cancelado") setFallo(r.fallo);
      return;
    }
    guardarArchivo(r.datos, `softarq-${tabla}.csv`);
    setHecho(`softarq-${tabla}.csv`);
  };

  return (
    <Pagina titulo="Exportaciones" subtitulo="CSV UTF-8 de tablas de su organización para migrar o guardar fuera del sistema. No es un informe ni sustituye al respaldo.">
      {estado.fase === "cargando" ? <Cargando etiqueta="Cargando exportaciones…" /> : null}
      {estado.fase === "error" ? <CargaFallida fallo={estado.fallo} alReintentar={recargar} /> : null}
      {fallo ? (
        <Aviso tono="error" titulo="No se pudo descargar" rol="alert">
          <p>{mensajeDeFallo(fallo)}</p>
        </Aviso>
      ) : null}
      <div aria-live="polite">{hecho ? <Aviso tono="correcto" titulo={`Se descargó ${hecho}`} /> : null}</div>
      {estado.fase === "listo" ? (
        estado.datos.tablas.length === 0 ? (
          <SinResultados>Su función no exporta tablas.</SinResultados>
        ) : (
          <div className="tarjetas">
            {estado.datos.tablas.map((t) => (
              <section key={t.tabla} className="tarjeta" aria-label={`Exportar ${t.tabla}`}>
                <h2 className="tarjeta-titulo">{t.tabla}</h2>
                <p>{t.descripcion}</p>
                <details>
                  <summary>Columnas ({t.columnas.length})</summary>
                  <p className="codigo">{t.columnas.join(", ")}</p>
                </details>
                <Boton variante="primario" onClick={() => void descargar(t.tabla)} disabled={descargando !== null} aria-busy={descargando === t.tabla}>
                  {descargando === t.tabla ? "Preparando…" : `Descargar ${t.tabla}.csv`}
                </Boton>
              </section>
            ))}
          </div>
        )
      ) : null}
      <Aviso tono="info" titulo="Qué no se exporta">
        <p>Contraseñas, hashes, sesiones, tokens, credenciales temporales, bitácora, versiones emitidas ni PDF: para eso está el respaldo.</p>
      </Aviso>
    </Pagina>
  );
}
