import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { useSolicitud } from "../../../../src/captura/ProveedorSolicitud";
import { agregarTrabajo, cambiarTrabajo, etiquetaDe, nuevoIdTrabajo } from "../../../../src/captura/modelo";
import { rutas } from "../../../../src/navegacion/rutas";
import { BarraAccion, Boton, Insignia, Pantalla, Texto } from "../../../../src/ui/componentes";
import { Encabezado, IndicadorGuardado, NotaInfo, TarjetaTrabajo } from "../../../../src/ui/componentes-captura";
import { ESP } from "../../../../src/ui/tema";

/** «largo, ancho y espesor» a partir de las medidas que pide la primera opción del trabajo. */
function pideTexto(etiquetas: string[]): string {
  const e = etiquetas.map((x) => x.toLowerCase());
  const lista = e.length > 1 ? `${e.slice(0, -1).join(", ")} y ${e[e.length - 1]}` : (e[0] ?? "");
  return `Te pediremos ${lista} de cada sección.`;
}

/**
 * Paso 2 · Trabajo. Tarjetas ilustradas con lo que ofrece el servidor. Elegir uno agrega el trabajo a la solicitud (o
 * cambia el que se está corrigiendo) y lleva a sus medidas. Si se vuelve atrás desde las medidas y se elige otro tipo, se
 * cambia ese mismo trabajo en lugar de agregar uno más.
 */
export default function ElegirTrabajo() {
  const { id, cambiar } = useLocalSearchParams<{ id: string; cambiar?: string }>();
  const router = useRouter();
  const { controlador, catalogo, estado } = useSolicitud();
  const existente = cambiar ? estado.local.trabajos.find((t) => t.id === cambiar) : undefined;
  const [eleccion, setEleccion] = useState<string | null>(existente?.trabajoCodigo ?? null);
  // Trabajo agregado desde esta pantalla: si se regresa y se elige otro tipo, se cambia ese mismo.
  const agregado = useRef<string | null>(null);
  const hayVariasOpciones = catalogo.some((t) => t.opciones.length > 1);
  if (!id) return null;

  const objetivo = existente?.id ?? agregado.current;

  const continuar = () => {
    if (!eleccion) return;
    const trabajo = catalogo.find((t) => t.codigo === eleccion);
    const primera = trabajo?.opciones[0];
    if (!trabajo || !primera) return;
    let destino = objetivo && estado.local.trabajos.some((t) => t.id === objetivo) ? objetivo : null;
    if (destino) {
      const actual = estado.local.trabajos.find((t) => t.id === destino);
      if (actual && actual.trabajoCodigo !== trabajo.codigo) controlador.modificar((c) => cambiarTrabajo(c, destino!, trabajo.codigo, primera.codigo));
    } else {
      destino = nuevoIdTrabajo(controlador.obtenerEstado().local);
      agregado.current = destino;
      controlador.modificar((c) => agregarTrabajo(c, trabajo.codigo, primera.codigo).captura);
    }
    router.push(rutas.medidas(id, destino));
  };

  return (
    <Pantalla
      encabezado={
        <Encabezado
          titulo="Nueva cotización"
          alVolver={() => router.back()}
          paso={2}
          total={5}
          etiquetaPaso="Trabajo"
        />
      }
      pie={
        <BarraAccion>
          <Boton texto="Continuar" alPulsar={continuar} deshabilitado={!eleccion} />
          <Texto variante="pequeno" centrado accessibilityLiveRegion="polite">
            {eleccion ? " " : "Elige una opción para continuar"}
          </Texto>
        </BarraAccion>
      }
    >
      <View style={{ gap: ESP[2] }}>
        {estado.solicitud ? <Insignia texto={`Proyecto: ${estado.solicitud.proyecto.nombre}`} tono="info" /> : null}
        <Texto variante="titulo">¿Qué vas a construir?</Texto>
        <Texto variante="atenuado">Elige un tipo de trabajo. Podrás agregar otro después.</Texto>
        <IndicadorGuardado estado={estado.guardado} alReintentar={() => void controlador.guardarAhora()} />
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de trabajo" style={{ gap: ESP[6], paddingTop: ESP[5] }}>
        {catalogo.map((t, i) => (
          <TarjetaTrabajo
            key={t.codigo}
            tipo={t.ilustracion}
            nombre={t.nombre}
            descripcion={t.descripcion}
            pide={pideTexto(t.opciones[0]?.medidas.map((m) => etiquetaDe(t.opciones[0]!, m.clave)) ?? [])}
            seleccionado={eleccion === t.codigo}
            invertida={i % 2 === 1}
            alPulsar={() => setEleccion(t.codigo)}
          />
        ))}
      </View>

      {hayVariasOpciones ? <NotaInfo>Algunos trabajos tienen varias opciones, por ejemplo el tipo de lámina. Si es tu caso, te lo preguntamos en el paso siguiente.</NotaInfo> : null}
    </Pantalla>
  );
}
