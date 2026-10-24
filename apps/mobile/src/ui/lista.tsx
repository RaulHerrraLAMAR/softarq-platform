import type { ReactNode } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FalloApi } from "../api/errores";
import { mensajeDeFallo } from "../api/errores";
import { Aviso, Boton, Cargando, ErrorConsulta, Vacio } from "./componentes";
import { ESP, useTema } from "./tema";

interface PropsLista<T> {
  items: readonly T[] | null;
  cargando: boolean;
  actualizando: boolean;
  error: FalloApi | null;
  alReintentar: () => void;
  claveDe: (x: T) => string;
  renderItem: (x: T) => ReactNode;
  textoVacio: string;
  textoCargando?: string;
  /** Encabezado estable (búsqueda, filtros): se pasa como elemento para no perder el foco al renderizar. */
  encabezado?: ReactNode;
  /** Pie (por ejemplo «hay más resultados: use la búsqueda»). */
  pie?: ReactNode;
}

/**
 * Lista de consulta con los estados que exige la app: cargando, vacío, error con reintento, actualización
 * (arrastrar para refrescar) y error al actualizar CONSERVANDO lo que ya se veía, avisando que puede estar
 * desactualizado.
 */
export function ListaConsulta<T>({ items, cargando, actualizando, error, alReintentar, claveDe, renderItem, textoVacio, textoCargando, encabezado, pie }: PropsLista<T>) {
  const t = useTema();
  const sinDatos = items === null;
  return (
    <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: t.fondo }}>
      <FlatList
        data={items ?? []}
        keyExtractor={claveDe}
        renderItem={({ item }) => <>{renderItem(item)}</>}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: ESP[4], gap: ESP[3], flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={actualizando} onRefresh={alReintentar} colors={[t.accion]} />}
        ListHeaderComponent={
          <View style={{ gap: ESP[3], marginBottom: ESP[1] }}>
            {encabezado}
            {error && !sinDatos ? (
              <View style={{ gap: ESP[2] }}>
                <Aviso tono="aviso" texto={`No se pudo actualizar (${mensajeDeFallo(error)}). Lo que ve puede estar desactualizado.`} />
                <Boton texto="Reintentar" alPulsar={alReintentar} variante="secundario" />
              </View>
            ) : null}
          </View>
        }
        {...(pie ? { ListFooterComponent: <View style={{ marginTop: ESP[3] }}>{pie}</View> } : {})}
        ListEmptyComponent={
          cargando ? <Cargando texto={textoCargando ?? "Cargando…"} /> : error && sinDatos ? <ErrorConsulta fallo={error} alReintentar={alReintentar} /> : <Vacio texto={textoVacio} />
        }
      />
    </SafeAreaView>
  );
}
