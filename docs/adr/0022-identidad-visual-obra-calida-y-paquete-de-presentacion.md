# ADR-0022 — Identidad visual «Obra cálida» y paquete de presentación compartido

- **Fecha:** 24/10/2026 (iteración 2 el mismo día)
- **Estado:** **aprobada por el propietario** (iteración 2, 24/10/2026) y **aplicada a la app del cliente** en E2. El panel web (`packages/presentacion`, E3) sigue pendiente. La comprobación en el teléfono (contraste real, texto ampliado, movimiento reducido, rendimiento) sigue abierta.
- **Ámbito:** `apps/mobile`, `apps/web` y el nuevo `packages/presentacion` (tokens y etiquetas, sin lógica de negocio).
- **Prototipo revisable:** https://claude.ai/artifact/FJMrePv1dTRoJzTZkWivfU (copia en [`docs/movil/prototipo/obra-calida-iteracion-2.html`](../movil/prototipo/obra-calida-iteracion-2.html)). Datos ficticios; los importes son constantes de ejemplo.
- **Relacionada con:** [ADR-0006](0006-cliente-web-demo.md) y `docs/web/sistema-visual.md` (estilo «Minimalism & Swiss», Fira), que esta decisión sustituiría de forma gradual.

## Propuesta de la iteración 2

### Paleta (función de cada color)
| Color | Valor claro | Función |
|---|---|---|
| Terracota | `#C8451E` (borde `#8E2D0F`, luz `#E36A40`) | Acción principal y lo pendiente. El borde inferior oscuro da volumen al botón. |
| **Verde petróleo** (complemento recomendado) | `#14535A` | Estructura: cabecera del inicio, navegación del panel, selección y cotas. |
| Cal / Papel / Concreto | `#EFE8DC` / `#FFFDF9` / `#E5DCCD` | Fondo, superficies elevadas y zonas hundidas (campos, croquis, desactivado). |
| Tinta | `#22201C` (suave `#5C554A`) | Texto. |
| Ocre | `#E2A62A` | Atención y rótulo de estimación preliminar, siempre con texto oscuro. |
| Verde obra | `#2C7A4C` | Cotización lista y confirmaciones. |
| Rojo | `#B3261E` | Solo errores de captura, con icono y texto. |

- **Complemento:** se recomienda verde petróleo; el azul profundo (`#1F3F76`) queda como alternativa comparable en el prototipo. Motivo: complementario natural del terracota, menos corporativo, contraste 8.7:1 con blanco (azul: 10.3:1).
- **Contrastes calculados (WCAG 2):** tinta sobre cal 13.35; texto suave sobre papel 7.24; blanco sobre terracota 4.85 (botón principal); terracota como **texto** sobre cal solo 3.99, por lo que los enlaces usan el terracota oscuro (6.8); petróleo sobre papel 8.56; rojo sobre papel 6.43. Modo oscuro derivado con los mismos criterios. La prueba automática de contraste se construirá con la implementación.
- Degradados: ninguno en controles; la profundidad sale de capas sólidas, bordes inferiores y caras isométricas.

### Tipografía
- Títulos: **Bricolage Grotesque** 600–800 (carácter, de cartel de obra). Texto, formularios y cifras tabulares: **Inter** (legibilidad). Ambas con licencia OFL. Sustituye a Manrope de la iteración 1.

### Movimiento y profundidad
- Botón principal con volumen: cara y borde inferior; se hunde al pulsar y se recupera con una salida suave y breve.
- Tarjetas de selección que se elevan y muestran una marca; ilustraciones isométricas propias (cubierta, losa, muro) con capas que se separan al elegir.
- Transición lateral entre pasos, barra de progreso que se llena, aparición escalonada del resultado, desglose desplegable y confirmación con trazo animado. **Sin** conteo de importes, objetos que giran continuamente, rebotes ni parallax.
- Respeto al movimiento reducido: los mismos estados sin animación.
- Croquis isométrico ligado a los campos: muestra los valores escritos, resalta la cota del campo activo, marca pendientes (`?`) y errores (`!`) y se anima entre valores. Es una ayuda de captura, fuera de escala, y lo dice en pantalla; no es un plano ni valida la estructura.

### Implementación prevista en Expo (no hecha)
- Movimiento con la API `Animated` de React Native y controlador nativo para escala y posición: **no se añade `reanimated`**. Botón y tarjetas: dos capas con `transform`, sin depender de la sombra de Android. Reducir movimiento: `AccessibilityInfo`.
- Ilustraciones y croquis con `react-native-svg` (módulo nativo incluido en Expo; entra en la única compilación `development` nueva). La proyección isométrica será una función pura con pruebas.
- Iconos: se definirán sin librería adicional si basta con SVG propios; si hiciera falta una, se revisa licencia, compatibilidad con SDK 58 y `minimumReleaseAge` sin excepciones. Fuentes: `@expo-google-fonts` (OFL).
- **Sin motores 3D** ni plantillas completas. El modelado 3D real de estructuras queda como mejora futura.
- Panel: mismas tokens y tipografía, movimiento más discreto, riel de navegación y bandeja por función. Cada función ve solo sus secciones (el Preparador no ve Catálogo ni Administración).

### Pendiente de diseño
Descuentos (ventanas, tragaluces), varias obras en una solicitud, paso «Opción» cuando un trabajo tiene variantes, y si debe existir un paso «Resumen» antes de calcular cuando hay varios trabajos.

## Paquete `@softarq/presentacion` (sin cambios respecto a la iteración 1)
Tokens de diseño y **diccionario único de etiquetas** (estados, eventos de bitácora, funciones, datos), con una prueba que exige texto legible para cada valor de cada enumeración de contratos. Ningún código técnico se muestra tal cual.

## Consecuencias
- Cualquier dependencia nativa nueva exige una compilación `development` nueva, justificada y única para la etapa E2.
- `.easignore` y AGENTS §13 deberán incluir `packages/presentacion` cuando exista.
- Los contrastes y la comparación petróleo/azul deben revisarse en el teléfono real antes de fijar la paleta.

## Implementación en la app (E2, 24/10/2026)

- **Tokens:** `apps/mobile/src/ui/paletas.ts` (valores puros) y `tema.ts` (elige claro u oscuro según el teléfono). Los contrastes se comprueban con `ui/__tests__/contraste.test.ts` en ambos temas (texto ≥ 4.5:1, interfaz ≥ 3:1). Esa prueba detectó dos usos que no llegaban y se corrigieron en el diseño: el texto de los avisos «correcto» pasa a tinta (el verde queda como indicador) y las medidas se rotulan en tinta con la terracota como marca (no como texto).
- **Fuentes:** Bricolage Grotesque (600/700/800) e Inter (400/500/600), TTF estáticos de `@expo-google-fonts` incluidos en la app mediante el plugin `expo-font`, con sus textos OFL y su procedencia en `assets/fonts/`. No se añadió `@expo-google-fonts` como dependencia ni se descarga nada en tiempo de ejecución.
- **Iconos e ilustraciones:** propios, en `react-native-svg` (`ui/iconos.tsx`, `ui/ilustraciones.tsx`); la geometría isométrica es una función pura probada (`croquis/geometria.ts`). Sin `@expo/vector-icons`, sin reanimated y sin 3D.
- **Movimiento:** `Animated` con controlador nativo (botón y tarjetas hunden una cara sobre un borde sólido, progreso, hoja inferior, palomita); con «Quitar animaciones» del sistema (`AccessibilityInfo`) todo cambia de estado sin animar.
- **Croquis y rendimiento:** el número de caras, líneas de detalle y cotas **no depende de las medidas** (prueba con valores de 0.01 a 500). En el prototipo, las líneas de detalle crecían con la medida (519 nodos con largo 500 en la cubierta y 1018 con alto 500 en el muro, medido el 24/10/2026). Medición en Edge de escritorio con Playwright, también con la CPU ralentizada 6 veces: el peor marco fue de unos 67 ms al escribir 500, y la mayor demora fue de 100–230 ms en la **primera** escritura tras abrir las medidas, no por la cantidad de elementos. **No se reprodujo el congelamiento de varios segundos** observado en el teléfono; su causa sigue sin determinar (no se atribuye a ningún elemento sin evidencia) y las mediciones de escritorio no sustituyen a las del dispositivo (guía §10, C7).
- **Fuera de lo prototipado:** la barra inferior no lleva la muesca superior; el croquis se redibuja al asentarse lo escrito (~120 ms) en vez de interpolar; las cotas son botones nativos accesibles.
