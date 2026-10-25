import type { ProyectoCliente } from "@softarq/contracts/cliente";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { esFalloApi, mensajeDeFallo } from "../../src/api/errores";
import { useConsulta } from "../../src/consultas/usar-consulta";
import { rutas } from "../../src/navegacion/rutas";
import { servicios } from "../../src/servicios/instancia";
import { Aviso, BarraAccion, Boton, Campo, Cargando, ErrorConsulta, Pantalla, Texto } from "../../src/ui/componentes";
import { Encabezado } from "../../src/ui/componentes-captura";
import { Icono } from "../../src/ui/iconos";
import { ESP, FUENTE, OBJETIVO_MINIMO, RADIO, TEXTO, useTema } from "../../src/ui/tema";

type CampoNuevo = "nombre" | "municipio" | "entidadFederativa" | "descripcion";

/**
 * Paso 1 · Proyecto. Una solicitud es de un solo proyecto; si la obra es otra, es otra solicitud. Se elige uno de los
 * proyectos propios o se registra la obra nueva aquí mismo. Al continuar se crea el borrador en el servidor.
 */
export default function NuevaCotizacion() {
  const t = useTema();
  const router = useRouter();
  const { estado, reintentar } = useConsulta("proyectos", (senal) => servicios.proyectos({ senal }));
  const proyectos = estado.datos ?? [];

  const [elegido, setElegido] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [valores, setValores] = useState<Record<CampoNuevo, string>>({ nombre: "", municipio: "", entidadFederativa: "", descripcion: "" });
  const [errores, setErrores] = useState<Partial<Record<CampoNuevo | "general", string>>>({});
  const [ocupado, setOcupado] = useState(false);
  // Si el proyecto ya se creó pero falló el borrador, el reintento usa ese proyecto y no crea otro.
  const creado = useRef<ProyectoCliente | null>(null);
  const enCurso = useRef(false);

  const poner = (campo: CampoNuevo) => (v: string) => {
    creado.current = null; // cambió lo que se iba a registrar
    setValores((x) => ({ ...x, [campo]: v }));
    setErrores((e) => {
      const resto = { ...e };
      delete resto[campo];
      delete resto.general;
      return resto;
    });
  };

  const hayEleccion = nueva ? true : elegido !== null;

  const continuar = async () => {
    if (enCurso.current) return;
    setErrores({});
    let proyectoId = elegido;
    if (nueva) {
      const locales: typeof errores = {};
      if (valores.nombre.trim() === "") locales.nombre = "Escribe un nombre para la obra.";
      if (valores.municipio.trim() === "") locales.municipio = "Indica el municipio.";
      if (valores.entidadFederativa.trim() === "") locales.entidadFederativa = "Indica la entidad federativa.";
      // El equipo necesita la descripción para emitir la cotización formal (BL-02); una frase basta.
      if (valores.descripcion.trim() === "") locales.descripcion = "Describe la obra en una frase.";
      if (Object.keys(locales).length > 0) {
        setErrores(locales);
        return;
      }
    } else if (proyectoId === null) {
      return;
    }
    enCurso.current = true;
    setOcupado(true);
    try {
      if (nueva) {
        if (!creado.current) {
          creado.current = await servicios.crearProyecto({ nombre: valores.nombre.trim(), municipio: valores.municipio.trim(), entidadFederativa: valores.entidadFederativa.trim(), descripcion: valores.descripcion.trim() });
        }
        proyectoId = creado.current.id;
      }
      const solicitud = await servicios.crearSolicitud(proyectoId!);
      router.replace(rutas.elegirTrabajo(solicitud.id));
    } catch (e) {
      if (esFalloApi(e) && e.tipo === "cancelada") return;
      const delServidor: typeof errores = {};
      if (esFalloApi(e)) {
        for (const c of e.detalle.campos ?? []) {
          const campo = c.ruta as CampoNuevo;
          if (["nombre", "municipio", "entidadFederativa", "descripcion"].includes(campo) && !delServidor[campo]) delServidor[campo] = c.mensaje;
        }
      }
      if (Object.keys(delServidor).length === 0) delServidor.general = esFalloApi(e) ? mensajeDeFallo(e) : "No pudimos crear tu solicitud. Intenta de nuevo.";
      setErrores(delServidor);
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  };

  return (
    <Pantalla
      formulario
      encabezado={<Encabezado titulo="Nueva cotización" alVolver={() => router.back()} paso={1} total={5} etiquetaPaso="Proyecto" />}
      pie={
        <BarraAccion>
          <Boton texto="Continuar" alPulsar={() => void continuar()} deshabilitado={!hayEleccion} cargando={ocupado} />
          {!hayEleccion ? <Texto variante="pequeno" centrado accessibilityLiveRegion="polite">Elige un proyecto o registra una obra nueva para continuar</Texto> : null}
        </BarraAccion>
      }
    >
      <View style={{ gap: ESP[1] }}>
        <Texto variante="titulo">¿Para qué obra es?</Texto>
        <Texto variante="atenuado">Cada solicitud es de una sola obra. Si cotizas otra, será otra solicitud.</Texto>
      </View>

      {estado.fase === "cargando" && !estado.datos ? <Cargando texto="Buscando tus proyectos…" /> : null}
      {estado.fase === "error" && estado.error && !estado.datos ? <ErrorConsulta fallo={estado.error} alReintentar={reintentar} /> : null}

      <View accessibilityRole="radiogroup" style={{ gap: ESP[3] }}>
        {proyectos.map((p) => {
          const activo = !nueva && elegido === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: activo }}
              accessibilityLabel={`${p.nombre}${p.municipio ? `, ${p.municipio}` : ""}`}
              onPress={() => {
                setNueva(false);
                setElegido(p.id);
              }}
              style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: ESP[3], borderRadius: RADIO.medio, borderWidth: 2, borderColor: activo ? t.petroleo : t.linea, backgroundColor: activo ? t.petroleoTinte : t.papel, padding: ESP[3] }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }}>{p.nombre}</Text>
                <Text style={{ fontFamily: FUENTE.texto, fontSize: TEXTO.sm, color: t.suave }}>{[p.municipio, p.entidadFederativa].filter(Boolean).join(", ") || "Sin ubicación"}</Text>
              </View>
              {activo ? <Icono nombre="check" tam={22} color={t.petroleo} grosor={3} /> : null}
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: nueva }}
          accessibilityLabel="Registrar una obra nueva"
          onPress={() => {
            setNueva(true);
            setElegido(null);
          }}
          style={{ minHeight: OBJETIVO_MINIMO + 8, flexDirection: "row", alignItems: "center", gap: ESP[3], borderRadius: RADIO.medio, borderWidth: 2, borderStyle: nueva ? "solid" : "dashed", borderColor: nueva ? t.petroleo : t.linea, backgroundColor: nueva ? t.petroleoTinte : "transparent", padding: ESP[3] }}
        >
          <Icono nombre="mas" tam={20} color={t.enlace} grosor={2.6} />
          <Text style={{ flex: 1, fontFamily: FUENTE.titulo, fontSize: TEXTO.md + 1, color: t.tinta }}>Registrar una obra nueva</Text>
        </Pressable>
      </View>

      {nueva ? (
        <View style={{ gap: ESP[3] }}>
          <Campo etiqueta="Nombre de la obra" valor={valores.nombre} alCambiar={poner("nombre")} textoLibre maximo={80} editable={!ocupado} error={errores.nombre} ayuda="Por ejemplo: Casa Tlalpan" />
          <Campo etiqueta="Municipio" valor={valores.municipio} alCambiar={poner("municipio")} textoLibre maximo={120} editable={!ocupado} error={errores.municipio} />
          <Campo etiqueta="Entidad federativa" valor={valores.entidadFederativa} alCambiar={poner("entidadFederativa")} textoLibre maximo={120} editable={!ocupado} error={errores.entidadFederativa} />
          <Campo etiqueta="Descripción de la obra" valor={valores.descripcion} alCambiar={poner("descripcion")} textoLibre multilinea maximo={500} editable={!ocupado} error={errores.descripcion} ayuda="Una frase basta. Por ejemplo: casa de dos niveles." />
        </View>
      ) : null}

      {errores.general ? <Aviso tono="error" texto={errores.general} /> : null}
    </Pantalla>
  );
}
