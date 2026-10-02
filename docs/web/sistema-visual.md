# Sistema visual de la web DEMO

- **Fecha:** 02/10/2026
- **Código:** `apps/web/src/estilos/tokens.css` (fuente única) y `base.css`.
- **Decisiones:** [ADR-0006](../adr/0006-cliente-web-demo.md).

Es una herramienta de trabajo para arquitectos e ingenieros: sobria y densa, con números alineados y estados explícitos. Debe ser legible en obra (pantalla estrecha) y en escritorio.

## Origen (UI UX Pro Max)

Se consultó la skill del repositorio con su buscador local (`.claude/skills/ui-ux-pro-max/scripts/search.py`, sin `--persist`).

| Consulta | Resultado aplicado |
|---|---|
| `--design-system` «construction estimating quote tool for architects engineers B2B form-heavy professional», variación 3, movimiento 2, densidad 8 | Estilo «Minimalism & Swiss»: azul marino y gris corporativo, acento solo en la acción principal, contraste alto y movimiento mínimo |
| `--domain typography` «technical engineering dashboard tabular numbers data dense» | Pareja «Dashboard Data»: Fira Sans y Fira Code |
| `--domain ux` «form validation inline error stale data table responsive» | Resumen de errores enfocable con enlaces, errores junto al campo con `aria-describedby`, `role="alert"`, tablas responsive y estado de envío visible |
| `--stack react` «form state async race stale request» | Errores asíncronos siempre gestionados y estado local con `useState` y `useReducer` |

**Lo que se descartó de las recomendaciones:**
- la tipografía serif «legal» (EB Garamond y Lato) que propuso el *design system*, porque no encaja con una herramienta técnica;
- las secciones de página de venta (logotipos, testimonios);
- las animaciones al desplazar (GSAP);
- las fuentes cargadas desde Google Fonts: aquí se empaquetan en local con `@fontsource`.

## Color

| Token | Valor | Uso |
|---|---|---|
| `--color-primario` | `#0f172a` | Encabezado y texto principal |
| `--color-secundario` | `#334155` | Texto secundario |
| `--color-accion` | `#0369a1` | Botón primario, enlaces y foco |
| `--color-fondo` / `--color-tarjeta` | `#f8fafc` / `#ffffff` | Fondo y superficies |
| `--color-texto-atenuado` | `#475569` | Ayudas y detalles |
| `--color-borde` / `--color-borde-fuerte` | `#cbd5e1` / `#64748b` | Separadores y bordes de campos |
| `--color-error` sobre `--color-error-fondo` | `#b91c1c` / `#fef2f2` | Errores y bloqueos |
| `--color-aviso` sobre `--color-aviso-fondo` | `#92400e` / `#fef3c7` | Pendiente de recalcular y opciones no disponibles |
| `--color-info` sobre `--color-info-fondo` | `#075985` / `#e0f2fe` | Avisos AV e insignia «Menor precio vigente» |
| `--color-correcto` sobre `--color-correcto-fondo` | `#166534` / `#dcfce7` | «Calculado» y «Elegida» |
| `--color-demo` sobre `--color-demo-fondo` | `#7c2d12` / `#ffedd5` | Insignia y leyenda DEMO |

**Contraste medido (WCAG 2.x).** Lo comprueba `src/estilos/__tests__/contraste.test.ts` con los valores de `tokens.css`:

| Par | Colores | Contraste |
|---|---|---|
| Texto / fondo | `#0f172a` / `#f8fafc` | 17.06:1 |
| Texto atenuado / tarjeta | `#475569` / `#ffffff` | 7.58:1 |
| Secundario / tarjeta | `#334155` / `#ffffff` | 10.35:1 |
| Botón primario | `#ffffff` / `#0369a1` | 5.93:1 |
| Botón primario (hover) | `#ffffff` / `#075985` | 7.56:1 |
| Enlace / fondo | `#0369a1` / `#f8fafc` | 5.67:1 |
| Error / tarjeta | `#b91c1c` / `#ffffff` | 6.47:1 |
| Error / fondo de error | `#b91c1c` / `#fef2f2` | 5.91:1 |
| Texto / fondo de aviso | `#0f172a` / `#fef3c7` | 16.03:1 |
| Insignia DEMO | `#7c2d12` / `#ffedd5` | 8.18:1 |
| Insignia «Menor precio vigente» | `#075985` / `#e0f2fe` | 6.59:1 |
| Insignia «Elegida» / «Calculado» | `#166534` / `#dcfce7` | 6.49:1 |
| Encabezado | `#ffffff` / `#0f172a` | 17.85:1 |
| Leyenda del encabezado | `#e2e8f0` / `#0f172a` | 14.48:1 |
| Borde de campo / tarjeta (no textual, ≥ 3:1) | `#64748b` / `#ffffff` | 4.76:1 |
| Foco / tarjeta (no textual, ≥ 3:1) | `#0369a1` / `#ffffff` | 5.93:1 |

## Tipografía y espaciado

- **Texto:** Fira Sans 400, 500 y 600. **Códigos** (CON-…, INS-…, PRE-…, BL-…, AV-…): Fira Code 400. Solo el subconjunto latino, local.
- **Escala:** 13 (solo etiquetas secundarias), 14, 16, 20, 24 y 32 px. El total usa 32 px (24 px en móvil).
- **Números:** `font-variant-numeric: tabular-nums`, alineados a la derecha.
- **Espaciado:** base de 4 px (4, 8, 12, 16, 24 y 32). Radio de 6 px y sombra mínima.

## Componentes y estados

| Componente | Comportamiento |
|---|---|
| Botón | Primario (una acción principal por zona: «Calcular», «Cargar ejemplo», «Agregar»), secundario, peligro («Quitar») y enlace. Alto mínimo de 44 px; deshabilitado mientras calcula |
| Campo | Etiqueta visible, unidad como sufijo (m, pza, MXN, unidad del tipo), ayuda y error enlazados con `aria-describedby`; `aria-invalid` y borde de 2 px al haber error |
| Tabla de medidas | Columnas según la fórmula (`DIMENSIONES_POR_FORMULA`). En pantallas estrechas cada renglón es una tarjeta con etiquetas visibles; los roles ARIA de tabla se conservan |
| Opción de precio | Tarjeta-radio comparable: producto, presentación, unidad de compra, proveedor, vigencia y código. Insignias «Menor precio vigente» y «Elegida»; foco en toda la tarjeta |
| Aviso | Información, aviso, error y correcto, siempre con icono, título y texto (nunca solo color). `role="alert"` solo para errores que exigen atención |
| Esqueleto | Carga de catálogos y del cálculo, con `role="status"` y texto para lectores. Sin animación con `prefers-reduced-motion` |
| Progreso | Cuatro pasos con icono y texto de estado: «completo», «falta elegir N», «opcional», «calculado», «bloqueado», «pendiente de recalcular» |
| Resultado | `aria-live="polite"`. Total destacado, subtotal, impuesto con nombre y tasa, fecha de los catálogos, leyenda DEMO, avisos y «Detalle de la cotización» desplegable; en un panel estrecho, la tabla se apila (*container query*) |

**Estados del resultado:**
- sin calcular;
- faltan datos, con un resumen enfocable y enlaces a los campos;
- calculando;
- calculado;
- bloqueado, sin importes;
- pendiente de recalcular, sin importes;
- datos rechazados por el servidor, con mensajes junto al campo;
- elementos que ya no están en el catálogo;
- error de conexión, servicio o límite, con «Reintentar»;
- respuesta incompatible.

## Disposición

| Ancho | Disposición |
|---|---|
| Más de 1100 px | Dos columnas: la captura a la izquierda y el resultado fijo a la derecha, con desplazamiento propio |
| Hasta 1100 px | Una columna; el resultado debajo de la captura |
| Hasta 720 px | Márgenes compactos, progreso en dos columnas, enlace «Ir a Calcular y resultado» y tablas apiladas |

**Verificación automatizada** (Playwright a 1440 × 900 y 390 × 844), sin que equivalga a una revisión hecha por una persona:
- sin desplazamiento horizontal;
- objetivos de 44 px o más;
- foco visible;
- navegación completa con teclado;
- movimiento reducido.

Las capturas están en `D:\Proyecto_SoftArq\_work\evidencias\modulo4\`.
