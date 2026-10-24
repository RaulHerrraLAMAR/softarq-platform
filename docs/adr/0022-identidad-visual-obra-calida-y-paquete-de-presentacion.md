# ADR-0022 — Identidad visual «Obra cálida» y paquete de presentación compartido

- **Fecha:** 24/10/2026
- **Estado:** aceptada como dirección (plan aprobado el 24/10/2026); **pendiente la revisión de las muestras visuales** antes de extenderla a las pantallas (E0). No implementada.
- **Ámbito:** `apps/mobile`, `apps/web` y el nuevo `packages/presentacion` (tokens y etiquetas, sin lógica de negocio).
- **Relacionada con:** [ADR-0006](0006-cliente-web-demo.md) y `docs/web/sistema-visual.md` (estilo «Minimalism & Swiss», Fira), que esta decisión sustituye de forma gradual.

## Decisiones
- **Dirección:** «Obra cálida», elegida por el propietario entre dos propuestas: superficies de concreto claro, acento terracota, grafito, tipografía geométrica y tarjetas con profundidad. Sin motores 3D (mejora futura).
- **Paleta base:** concreto `#EDEBE7`, superficie `#FBFAF8`, grafito `#2B2B2B`, terracota `#C4532D`, ocre `#D9A441`, verde `#3F7D58`, azul acero `#3B6B8C`; modo oscuro derivado. Contraste AA comprobado por prueba.
- **Tipografía:** Manrope (títulos) e Inter (texto y cifras tabulares), ambas con licencia OFL.
- **Paquete `@softarq/presentacion`:** tokens de diseño y **diccionario único de etiquetas** (estados, eventos de bitácora, funciones, datos). Una prueba exige texto legible para cada valor de cada enumeración de contratos; ningún código técnico se muestra tal cual.
- **Componentes:** nativos de Expo; solo dependencias pequeñas y justificadas (`react-native-svg`, iconos, fuentes, `expo-sharing`). **No** se incorpora una plantilla completa. Cada dependencia se revisa por licencia, compatibilidad con SDK 58 y `minimumReleaseAge`, sin excepciones.
- **DEMO:** marca discreta en cabecera, resultado y PDF; no se repite en cada nombre de dato de presentación.
- **Accesibilidad:** objetivos de al menos 48 dp, teclado adecuado, etiquetas accesibles y texto escalable.

## Consecuencias
- Cualquier dependencia nativa nueva exige una compilación `development` nueva, justificada y única para la etapa E2.
- `.easignore` y AGENTS §13 deberán incluir `packages/presentacion` cuando exista.
