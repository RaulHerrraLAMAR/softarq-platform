import type { DimensionCliente } from "@softarq/contracts/cliente";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, type ElementRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { agregarRenglon, buscarOpcion, buscarTrabajo, cambiarOpcion, cambiarRenglon, estadoDeMedida, etiquetaDe, leerPiezas, quitarRenglon, type TipoRenglon } from "../../../../src/captura/modelo";
import { textoDeFaltantes } from "../../../../src/captura/resumen";
import { Croquis } from "../../../../src/croquis/Croquis";
import { rutas } from "../../../../src/navegacion/rutas";
import { BarraAccion, Boton, Campo, Desplegable, Enlace, Insignia, Pantalla, Texto } from "../../../../src/ui/componentes";
import { CampoMedida, Encabezado, IndicadorGuardado } from "../../../../src/ui/componentes-captura";
import { useTecladoVisible } from "../../../../src/ui/teclado";
import { ESP, FUENTE, OBJETIVO_MINIMO, RADIO, TEXTO, useTema } from "../../../../src/ui/tema";

/**
 * Paso 3 · Medidas de un trabajo. El croquis muestra la medida que se escribe y cada cota es un botón que lleva a su
 * campo. Una «sección» es una parte del trabajo con sus medidas; un «hueco» (ventana, puerta, tragaluz) se resta de la
 * medición y solo existe donde el trabajo lo admite. Todo se guarda solo.
 */
export default function Medidas() {
  const t = useTema();
  const router = useRouter();
  const { id, t: tid } = useLocalSearchParams<{ id: string; t: string }>();
  const { controlador, catalogo, estado } = useSolicitud();
  const teclado = useTecladoVisible();
  const [seccion, setSeccion] = useState(0);
  const [activa, setActiva] = useState<DimensionCliente | null>(null);
  const refs = {
    largo: useRef<ElementRef<typeof TextInput>>(null),
    ancho: useRef<ElementRef<typeof TextInput>>(null),
    alto: useRef<ElementRef<typeof TextInput>>(null),
  };

  const trabajoLocal = estado.local.trabajos.find((x) => x.id === tid);
  const trabajo = trabajoLocal ? buscarTrabajo(catalogo, trabajoLocal.trabajoCodigo) : undefined;
  const opcion = trabajoLocal ? buscarOpcion(catalogo, trabajoLocal.trabajoCodigo, trabajoLocal.opcionCodigo) : undefined;
  if (!id || !tid) return null;
  if (!trabajoLocal || !trabajo || !opcion) return <Redirect href={rutas.resumen(id)} />;

  const indice = Math.min(seccion, trabajoLocal.secciones.length - 1);
  const renglon = trabajoLocal.secciones[Math.max(indice, 0)];
  if (!renglon) return <Redirect href={rutas.resumen(id)} />;
  const claves = opcion.medidas.map((m) => m.clave);
  const etiquetaAlto = etiquetaDe(opcion, "alto");

  const cambiar = (tipo: TipoRenglon, i: number, campo: "largo" | "ancho" | "alto" | "piezas" | "nombre", v: string) => controlador.modificar((c) => cambiarRenglon(c, tid, tipo, i, campo, v));
  const enfocarSiguiente = (clave: DimensionCliente) => {
    const sig = claves[claves.indexOf(clave) + 1];
    if (sig) refs[sig].current?.focus();
    else refs[clave].current?.blur();
  };

  return (
    <Pantalla
      formulario
      relleno={false}
      encabezado={<Encabezado titulo={trabajo.nombre} alVolver={() => router.back()} paso={3} total={5} etiquetaPaso="Medidas" />}
      pie={
        <BarraAccion>
          <View style={{ flexDirection: "row", gap: ESP[3], alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Boton texto="Atrás" variante="secundario" alPulsar={() => router.back()} />
            </View>
            <View style={{ flex: 1.7 }}>
              <Boton texto="Continuar al resumen" alPulsar={() => router.dismissTo(rutas.resumen(id))} />
            </View>
          </View>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.xs + 1, color: t.suave, textAlign: "center" }}>
            {textoDeFaltantes(estado.local, catalogo, tid)}
          </Text>
        </BarraAccion>
      }
    >
      <Croquis
        tipo={trabajo.ilustracion}
        pide={claves}
        renglon={renglon}
        etiquetaAlto={etiquetaAlto}
        activa={activa}
        alTocarCota={(clave) => refs[clave].current?.focus()}
        compacto={teclado}
      />

      <View style={{ padding: ESP[4], gap: ESP[4] }}>
        <View style={{ gap: ESP[2] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: ESP[2] }}>
            <Insignia texto={`${trabajo.nombre}${trabajo.opciones.length > 1 ? ` · ${opcion.nombre}` : ""}`} tono="info" />
            <IndicadorGuardado estado={estado.guardado} alReintentar={() => void controlador.guardarAhora()} />
          </View>
          <Enlace texto="Cambiar el tipo de trabajo" alPulsar={() => router.push(rutas.elegirTrabajo(id, tid))} />
        </View>

        {trabajo.opciones.length > 1 ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Opción del trabajo" style={{ gap: ESP[2] }}>
            <Texto variante="etiqueta">Opción</Texto>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ESP[2] }}>
              {trabajo.opciones.map((o) => {
                const elegida = o.codigo === opcion.codigo;
                return (
                  <Pressable
                    key={o.codigo}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: elegida }}
                    accessibilityLabel={`${o.nombre}. ${o.descripcion}`}
                    onPress={() => controlador.modificar((c) => cambiarOpcion(c, tid, o.codigo))}
                    style={{ minHeight: OBJETIVO_MINIMO, justifyContent: "center", paddingHorizontal: ESP[4], borderRadius: RADIO.pildora, borderWidth: 2, borderColor: elegida ? t.petroleo : t.linea, backgroundColor: elegida ? t.petroleoTinte : t.papel }}
                  >
                    <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm + 1, color: t.tinta }}>{o.nombre}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ gap: ESP[2] }}>
          <Texto variante="etiqueta">Secciones del trabajo</Texto>
          <Texto variante="pequeno">Una sección es una parte del trabajo con sus propias medidas, por ejemplo cada faldón de un techo.</Texto>
          <View accessibilityRole="radiogroup" accessibilityLabel="Secciones del trabajo" style={{ flexDirection: "row", flexWrap: "wrap", gap: ESP[2], alignItems: "center" }}>
            {trabajoLocal.secciones.map((_, i) => (
              <Pressable
                key={i}
                accessibilityRole="radio"
                accessibilityState={{ checked: i === indice }}
                accessibilityLabel={`Sección ${i + 1}`}
                onPress={() => setSeccion(i)}
                style={{ minHeight: OBJETIVO_MINIMO, justifyContent: "center", paddingHorizontal: ESP[4], borderRadius: RADIO.pildora, borderWidth: 2, borderColor: i === indice ? t.petroleo : t.linea, backgroundColor: i === indice ? t.petroleoTinte : t.papel }}
              >
                <Text style={{ fontFamily: FUENTE.textoFuerte, fontSize: TEXTO.sm + 1, color: t.tinta }}>Sección {i + 1}</Text>
              </Pressable>
            ))}
            <Enlace
              texto="+ Agregar sección"
              alPulsar={() => {
                controlador.modificar((c) => agregarRenglon(c, tid, "secciones"));
                setSeccion(trabajoLocal.secciones.length);
              }}
            />
            {trabajoLocal.secciones.length > 1 ? (
              <Enlace
                texto="Quitar esta sección"
                alPulsar={() => {
                  controlador.modificar((c) => quitarRenglon(c, tid, "secciones", indice));
                  setSeccion(Math.max(0, indice - 1));
                }}
              />
            ) : null}
          </View>
        </View>

        <View style={{ gap: ESP[4] }}>
          {opcion.medidas.map((m, k) => (
            <CampoMedida
              key={`${tid}-${indice}-${m.clave}`}
              clave={m.clave}
              etiqueta={etiquetaDe(opcion, m.clave)}
              ayuda={m.ayuda}
              valor={renglon[m.clave]}
              estado={estadoDeMedida(renglon, m.clave)}
              alCambiar={(v) => cambiar("secciones", indice, m.clave, v)}
              alEnfocar={() => setActiva(m.clave)}
              alDesenfocar={() => setActiva((a) => (a === m.clave ? null : a))}
              referencia={refs[m.clave]}
              alEnviar={() => enfocarSiguiente(m.clave)}
              ultimo={k === opcion.medidas.length - 1}
            />
          ))}
        </View>

        <Desplegable titulo="Nombre y piezas iguales (opcional)">
          <View style={{ gap: ESP[3] }}>
            <Campo etiqueta="Nombre de la sección" valor={renglon.nombre} alCambiar={(v) => cambiar("secciones", indice, "nombre", v)} textoLibre maximo={80} ayuda="Por ejemplo: Faldón norte" enterKey="next" />
            <Campo etiqueta="Piezas iguales" valor={renglon.piezas} alCambiar={(v) => cambiar("secciones", indice, "piezas", v)} teclado="number-pad" maximo={4} ayuda="1 si es una sola. Pon más si hay varias secciones idénticas." enterKey="done" error={estadoPiezas(renglon.piezas)} />
          </View>
        </Desplegable>

        {opcion.admiteHuecos ? (
          <View style={{ gap: ESP[3], borderTopWidth: 1, borderTopColor: t.linea, paddingTop: ESP[4] }}>
            <View style={{ gap: ESP[1] }}>
              <Texto variante="subtitulo">Huecos</Texto>
              <Texto variante="atenuado">Ventanas, puertas o tragaluces. Se restan de la medición de este trabajo; no son un descuento en el precio.</Texto>
            </View>
            {trabajoLocal.huecos.map((h, i) => (
              <View key={i} style={{ gap: ESP[3], padding: ESP[3], borderRadius: RADIO.medio, backgroundColor: t.papel, borderWidth: 1, borderColor: t.linea }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }}>Hueco {i + 1}</Text>
                  <Enlace texto="Quitar" ayuda={`Quita el hueco ${i + 1}`} alPulsar={() => controlador.modificar((c) => quitarRenglon(c, tid, "huecos", i))} />
                </View>
                {opcion.medidas.map((m) => (
                  <CampoMedida key={m.clave} clave={m.clave} etiqueta={etiquetaDe(opcion, m.clave)} ayuda={m.ayuda} valor={h[m.clave]} estado={estadoDeMedida(h, m.clave)} alCambiar={(v) => cambiar("huecos", i, m.clave, v)} />
                ))}
                <Campo etiqueta="Piezas iguales" valor={h.piezas} alCambiar={(v) => cambiar("huecos", i, "piezas", v)} teclado="number-pad" maximo={4} error={estadoPiezas(h.piezas)} />
              </View>
            ))}
            <Enlace texto="+ Agregar hueco" alPulsar={() => controlador.modificar((c) => agregarRenglon(c, tid, "huecos"))} />
          </View>
        ) : null}
      </View>
    </Pantalla>
  );
}

function estadoPiezas(texto: string): string | undefined {
  return leerPiezas(texto).estado === "ok" ? undefined : "Escribe un número mayor que 0 y de hasta 1000.";
}
