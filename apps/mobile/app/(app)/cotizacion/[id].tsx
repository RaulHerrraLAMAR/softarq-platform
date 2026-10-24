import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { esFalloApi, mensajeDeFallo } from "../../../src/api/errores";
import { useConsulta } from "../../../src/consultas/usar-consulta";
import { ErrorDocumento, guardarYAbrirPdf } from "../../../src/documentos/pdf";
import { rutas } from "../../../src/navegacion/rutas";
import { servicios } from "../../../src/servicios/instancia";
import { Aviso, BarraAccion, Boton, Cargando, ErrorConsulta, Insignia, Pantalla, Texto } from "../../../src/ui/componentes";
import { Encabezado } from "../../../src/ui/componentes-captura";
import { formatearCantidad, formatearFecha, formatearImporte, formatearTasa } from "../../../src/ui/formato";
import { ESP, FUENTE, TEXTO, useTema } from "../../../src/ui/tema";

/**
 * Cotización formal emitida por el equipo. Muestra la misma proyección comercial que el PDF (sin costos ni datos internos).
 * El PDF se descarga con tu sesión, tal como lo emitió el equipo: la app no lo regenera ni lo modifica.
 */
export default function CotizacionEmitida() {
  const t = useTema();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado, reintentar } = useConsulta(`cotizacion-${id ?? ""}`, (senal) => servicios.cotizacion(id ?? "", { senal }));
  const [descargando, setDescargando] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const enCurso = useRef(false);
  const c = estado.datos;

  const abrirPdf = async () => {
    if (!id || !c || enCurso.current) return;
    enCurso.current = true;
    setDescargando(true);
    setErrorPdf(null);
    try {
      const bytes = await servicios.documento(id);
      await guardarYAbrirPdf(bytes, c.folio);
    } catch (e) {
      if (esFalloApi(e) && e.tipo === "cancelada") return;
      setErrorPdf(esFalloApi(e) ? mensajeDeFallo(e) : e instanceof ErrorDocumento ? e.message : "No pudimos abrir el PDF. Intenta de nuevo.");
    } finally {
      enCurso.current = false;
      setDescargando(false);
    }
  };

  const encabezado = <Encabezado titulo="Cotización" alVolver={() => (router.canGoBack() ? router.back() : router.replace(rutas.inicio))} />;

  if (!c) {
    return <Pantalla encabezado={encabezado}>{estado.fase === "error" && estado.error ? <ErrorConsulta fallo={estado.error} alReintentar={reintentar} /> : <Cargando texto="Abriendo tu cotización…" />}</Pantalla>;
  }
  const k = c.comercial;

  return (
    <Pantalla
      encabezado={encabezado}
      pie={
        <BarraAccion>
          <Boton texto="Ver o descargar el PDF" subtitulo="El mismo documento que emitió el equipo" alPulsar={() => void abrirPdf()} cargando={descargando} />
        </BarraAccion>
      }
    >
      <View style={{ gap: ESP[2] }}>
        <Texto variante="titulo">{c.proyecto}</Texto>
        <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave, fontVariant: ["tabular-nums"] }}>
          {c.folio} · emitida el {formatearFecha(c.fechaEmision)}
        </Text>
        <Insignia texto={c.vigente ? `Vigente hasta el ${formatearFecha(c.vigenteHasta)}` : `Venció el ${formatearFecha(c.vigenteHasta)}`} tono={c.vigente ? "correcto" : "neutro"} />
        {k.leyenda ? <Insignia texto="DEMO · datos ilustrativos, sin validez comercial" tono="demo" /> : null}
      </View>

      <View accessible accessibilityLabel={`Total ${formatearImporte(k.total)} pesos mexicanos, IVA incluido`} style={{ gap: ESP[1] }}>
        <Texto variante="importe">{formatearImporte(k.total)}</Texto>
        <Texto variante="pequeno">MXN · IVA incluido</Texto>
      </View>

      <View style={{ gap: ESP[1] }}>
        <Texto variante="etiqueta">Partidas</Texto>
        {k.partidas.map((p) => (
          <View key={p.numero} style={{ gap: 2, paddingVertical: ESP[2], borderTopWidth: 1, borderTopColor: t.linea }}>
            <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md, color: t.tinta }}>{p.descripcion}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: ESP[3] }}>
              <Text style={{ flex: 1, fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave, fontVariant: ["tabular-nums"] }}>
                {formatearCantidad(p.cantidad)} {p.unidad} × {formatearImporte(p.precioUnitario)}
              </Text>
              <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta, fontVariant: ["tabular-nums"] }}>{formatearImporte(p.importe)}</Text>
            </View>
          </View>
        ))}
        <Fila etiqueta="Subtotal" valor={formatearImporte(k.subtotal)} />
        <Fila etiqueta={`${k.impuesto.nombre} ${formatearTasa(k.impuesto.tasa)}`} valor={formatearImporte(k.impuesto.importe)} />
        <Fila etiqueta="Total" valor={formatearImporte(k.total)} fuerte />
      </View>

      {c.solicitudFolio ? <Texto variante="pequeno">Preparada a partir de tu solicitud {c.solicitudFolio}.</Texto> : null}
      {errorPdf ? <Aviso tono="error" titulo="No pudimos abrir el PDF" texto={errorPdf} /> : null}
    </Pantalla>
  );
}

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  const t = useTema();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: ESP[2], borderTopWidth: fuerte ? 1 : 0, borderTopColor: t.linea }}>
      <Text style={{ fontFamily: fuerte ? FUENTE.titulo : FUENTE.texto, fontSize: TEXTO.md, color: t.tinta }}>{etiqueta}</Text>
      <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.md, color: t.tinta, fontVariant: ["tabular-nums"] }}>{valor}</Text>
    </View>
  );
}
