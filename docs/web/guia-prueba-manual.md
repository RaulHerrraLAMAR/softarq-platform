# Guía para probar la web DEMO en persona

Esta guía es para la **prueba de la web hecha por una persona**. Distingue tres cosas:

| Qué | Estado |
|---|---|
| **Revisión personal del propietario** | **Declarada.** El propietario declaró que revisa manualmente los resultados de la web (registrado el 03/10/2026). Es una declaración: no detalla recorridos, casos, fechas ni evidencias, y no se le atribuye ninguno |
| **Ejecución formal de esta guía** (A1–A9, 1–14, C1–C15, R1–R10, E1–E12) | **Sin registro.** No hay constancia de casos ejecutados uno por uno con su resultado. Al hacerlo, anota fecha, caso, resultado y observaciones en la §5 |
| **Seguimiento del módulo 9** (S1–S10) | **Sin registro formal.** Las evidencias de navegador en HANDOFF son automatizadas |
| **Pruebas automatizadas** (Vitest y Playwright) | En `HANDOFF.md` §5. **No sustituyen** esta prueba |

Ninguna de las tres equivale a PR-41 ni a PR-44 de la fase 1, que son pruebas del libro de Excel y siguen pendientes.

Todos los datos son DEMO y no tienen validez comercial.

## 1. Preparar (una vez)

Requiere PostgreSQL con `softarq_dev` y el catálogo DEMO cargado: [`apps/api/README.md`](../../apps/api/README.md#preparar-el-entorno-desde-cero).

```
pnpm install --frozen-lockfile
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api db:migrar               # aplica las migraciones (usuarios y sesiones; cotizaciones)
pnpm --filter @softarq/api db:cargar-usuarios-demo # cuentas DEMO (Preparador y Revisor)
```

**Accesos:** abre `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json` (archivo local, fuera del repositorio) y usa el correo y la contraseña de `preparador.demo@softarq.test` o `revisor.demo@softarq.test`. No los copies a documentos ni capturas compartidas.

## 2. Abrir

Usa dos terminales, ambas desde la raíz del repositorio:

```
# Terminal 1: API (solo 127.0.0.1:3000, base softarq_dev)
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start

# Terminal 2: web
pnpm --filter @softarq/web dev
```

1. Abre **http://localhost:5173** en el navegador (usa `localhost`, no `127.0.0.1`: la cookie de sesión depende de ello).
2. Para cerrar, pulsa Ctrl+C en cada terminal.

**Si la web no conecta**, comprueba que:
- la API responda en `http://127.0.0.1:3000/health`;
- `apps/web/.env.local` no exista o tenga `VITE_API_URL=http://localhost:3000`;
- la API se haya compilado y reiniciado después de actualizar el repositorio (una API anterior al módulo 5 no tiene `/api/v1/auth` y la web muestra «No se pudo comprobar la sesión»).

## 3. Recorridos sugeridos

Anota lo que observes en cada paso. La fecha de cálculo es la de hoy; con el catálogo DEMO actual, los totales de los ejemplos deben coincidir.

**Acceso y sesión (módulo 5)**

| # | Acción | Qué esperar |
|---|---|---|
| A1 | Abre la web | Pantalla «Iniciar sesión»; ningún ejemplo visible ni datos precargados |
| A2 | Escribe el correo del Preparador y una contraseña incorrecta | «Correo o contraseña incorrectos…» (el mismo mensaje con un correo inexistente) |
| A3 | Usa «Mostrar» en la contraseña y vuelve a ocultarla | El texto se ve y se oculta; pegar y el gestor de contraseñas funcionan |
| A4 | Entra con el Preparador | Barra con «[DEMO] Preparador 1 · Preparador · [DEMO] Organización…» y «Cerrar sesión» |
| A5 | Recarga la página | Sigues dentro sin volver a escribir la contraseña |
| A6 | Carga el Ejemplo 1, calcula y pulsa «Cerrar sesión» | «Sesión cerrada»; al volver a entrar no queda la captura ni el resultado |
| A7 | Entra con el Revisor y carga un ejemplo | Puedes ver y editar la captura, pero «Calcular» está deshabilitado y explica que esa función no calcula |
| A8 | Deja la página abierta más de 30 minutos sin usarla y pulsa «Calcular» | «Su sesión terminó»; hay que entrar de nuevo y la captura no se conserva |
| A9 | Falla la contraseña 5 veces seguidas | «Demasiados intentos»: espera unos 15 minutos (no es un bloqueo permanente) |

**Calculadora DEMO** (página inicial)

| # | Acción | Qué esperar |
|---|---|---|
| 1 | Pulsa «Cargar ejemplo» en el Ejemplo 1 | Se rellena la captura con 3 renglones, las opciones elegidas y el transporte; «Sin calcular» y ningún importe |
| 2 | Pulsa «Calcular» | Total **$54,190.68**, leyenda DEMO, aviso AV-03 y «Detalle de la cotización» con 2 partidas |
| 3 | Cambia el largo del «Faldón norte» a 12 | «Pendiente de recalcular»; desaparece el total |
| 4 | Pulsa «Calcular» | Nuevo total distinto; si vuelves a 10 y calculas, otra vez $54,190.68 |
| 5 | Vuelve al inicio y carga los ejemplos 2, 3 y la cotización propia | $43,312.16, $22,405.28 y $4,911.79 |
| 6 | «Iniciar captura propia», busca «CON-00001» y agrégalo | Ninguna opción ni la consolidación vienen elegidas; «Menor precio vigente» solo como marca |
| 7 | Pulsa «Calcular» sin completar | Lista «Faltan datos para calcular» con enlaces; los campos se marcan |
| 8 | Captura largo 4 y ancho 2.5, elige «Consolidar compras», PRE-000001 y PRE-000002, y calcula | **$4,911.79** |
| 9 | Escribe `4,5` en una medida | Mensaje junto al campo: usar punto decimal |
| 10 | En el Ejemplo 1, pon el monto del transporte en 0 y calcula | «Cálculo bloqueado» con BL-11 y ningún importe |
| 11 | Agrega y quita renglones, conceptos y costos adicionales | La numeración de partidas se ajusta y el resultado queda pendiente |
| 12 | Recorre la página solo con Tab, Mayús+Tab, Enter, espacio y flechas | Foco siempre visible; todo control es alcanzable |
| 13 | Reduce la ventana a un ancho de teléfono | Una columna, tablas apiladas, sin desplazamiento horizontal |
| 14 | Detén la API y pulsa «Calcular» | «No hay conexión…» y la captura intacta; al reanudarla, «Reintentar» funciona |

**Clientes, proyectos y cotizaciones (módulo 6)** — como Preparador salvo que se indique

| # | Acción | Qué esperar |
|---|---|---|
| C1 | En la calculadora carga el Ejemplo 1 y pulsa «Guardar como cotización» | «Nueva cotización» con el aviso «Se guardará la captura de la calculadora» |
| C2 | «Nuevo cliente» (`[DEMO] …`), «Crear cliente»; «Nuevo proyecto» con municipio y entidad; «Crear cotización» | Se abre «Cotización COT-AAAA-NNNNN» con la insignia **WEB DEMO** y «Guardado · revisión 0» |
| C3 | Recarga la página | La misma cotización y la misma captura, sin «Cambios sin guardar» |
| C4 | Pulsa «Vista previa» | Total con la etiqueta «Calculado»; la ayuda dice que no se guarda |
| C5 | Pulsa «Calcular y guardar versión» | «Versión COT-…-v1 guardada», total **$54,190.68** y v1 en la tabla de versiones |
| C6 | Cambia las piezas del «Faldón norte» | «Cambios sin guardar.» y aviso de que la vista previa y las versiones no los incluyen |
| C7 | Intenta ir a «Clientes» | «Hay cambios sin guardar»: «Seguir editando» conserva lo escrito |
| C8 | Escribe un motivo y pulsa «Calcular y guardar versión» | Se guarda el borrador (revisión 1) y se crea v2 con otro total y su motivo |
| C9 | Abre v1 desde la tabla | «Registro histórico: se muestra tal como se guardó» y $54,190.68 |
| C10 | Abre la misma cotización en otra pestaña, guarda un cambio en una y luego otro en la otra | La segunda muestra «Otra pestaña o persona guardó este borrador antes»; tus cambios siguen; «Comparar», «Recargar la versión guardada» y «Guardar mis cambios sobre la revisión N» funcionan |
| C11 | Borra un dato obligatorio, «Guardar borrador» y «Calcular y guardar versión» | Se guarda incompleto («faltan N datos»); la versión responde «Captura incompleta: no se guardó ninguna versión» |
| C12 | En «Clientes», desactiva el cliente de una cotización (confirma) | Ya no se ofrece en «Nueva cotización»; su cotización se abre y edita, pero guardar versión queda bloqueado con BL-01; al reactivarlo vuelve a funcionar |
| C13 | Entra con el Revisor y abre la cotización y sus versiones | Solo consulta: sin «Guardar borrador», sin «Calcular», sin «Nueva cotización» |
| C14 | Reduce la ventana a un ancho de teléfono en listas, cotización y versión | Una columna, tablas como tarjetas y sin desplazamiento horizontal |
| C15 | Con una cotización guardada, deja de ofrecer un concepto o una opción de precio (p. ej. desactiva el proveedor PRV-00002 en la base de pruebas), recarga, cambia otra partida y guarda; recarga otra vez | La partida, sus medidas y la opción elegida **se conservan** con el aviso «ya no está disponible»; nada se sustituye. Calcular pide decidir; «Quitar selección» o elegir otra opción es decisión tuya |

### Revisión y aprobación (R1–R10, módulo 7)

Usa dos navegadores o una ventana privada: una sesión del Preparador y otra del Revisor.

| Caso | Acción | Resultado esperado |
|---|---|---|
| R1 | Preparador: en una cotización con v1, cambia una medida sin guardar | «Enviar …-v1 a revisión…» deshabilitado: «Hay cambios sin guardar…» |
| R2 | Guarda el borrador sin calcular | Sigue deshabilitado: «El borrador guardado … cambió después de …-v1: calcule una versión nueva» |
| R3 | «Calcular y guardar versión» y luego «Enviar …-v2 a revisión…» | La confirmación muestra folio, v2 y su total; al confirmar, la cotización queda en solo lectura con «…-v2 está en revisión» |
| R4 | Revisor: «Revisiones» → abre la v2 | Contenido comercial guardado, «Verificación al …» con bloqueos y avisos, historial; sin costos internos |
| R5 | «Solicitar cambios…» con un texto corto; luego con una explicación | El texto corto se rechaza junto al campo; con la explicación: «Cambios solicitados en …-v2» |
| R6 | Preparador: recarga la cotización | Ve las observaciones y quién las hizo; corrige, calcula v3 y la envía |
| R7 | Revisor: aprueba la v3 | La confirmación dice «Va a aprobar … por $…» y que no es una emisión; tras la respuesta: «…-v3 aprobada por …» |
| R8 | Preparador: recarga | v3 «Aprobada por …», v2 «Borrador · cambios solicitados», v1 «Borrador calculado · sin enviar a revisión». Si edita y calcula v4, la v4 aparece sin aprobar |
| R9 | Revisor: abre una revisión pendiente en dos pestañas; aprueba en una y solicita cambios en la otra | La segunda muestra «La revisión cambió mientras la tenía abierta», conserva el texto y ofrece «Actualizar» |
| R10 | Preparador con revisión pendiente: «Retirar la revisión para corregir…» | Vuelve a ser editable; el historial muestra la retirada |

BL-17 (quien aprueba ≠ autor de la versión) solo se ve con una cuenta que tenga las dos funciones; las cuentas DEMO de `softarq_dev` tienen una cada una.

### Emisión, anulación y descarte (E1–E12, módulo 8)

Antes de empezar: API recompilada y reiniciada con `SOFTARQ_DIR_DOCUMENTOS` y `db:cargar-demo` ejecutado (emisor DEMO). Usa las sesiones del Preparador y del Revisor; para E10, la del Administrador (`administrador.demo@softarq.test`).

| Caso | Acción | Resultado esperado |
|---|---|---|
| E1 | Preparador: «Nuevo cliente» con nombre y contacto (nombre y teléfono o correo); proyecto con municipio, entidad y descripción; cotización y v1 | La cotización trae «Textos de la cotización» con los textos [DEMO]; el cliente muestra su contacto |
| E2 | Cambia el alcance, guarda y mira «Enviar …» | Pide calcular una versión nueva (los textos son de la versión); el total de la v2 no cambia por los textos |
| E3 | Envía la última versión; Revisor: abre la revisión | Ve «Textos de la versión» antes de aprobar; aprueba |
| E4 | Preparador: recarga; sección «Emisión» | Fecha de emisión, vigencia (15 días naturales), aprobación, destinatario con contacto y emisor DEMO; sin bloqueos. «Emitir …» abre una confirmación con folio, versión, destinatario y total |
| E5 | Confirma la emisión | «Generando el documento…» y después la tarjeta **Emitida** (distinta de Aprobada) con preparó, aprobó, emitió y SHA-256; la versión aparece «Emitida» |
| E6 | «Descargar PDF» y ábrelo | `COT-AAAA-NNNNN-vN.pdf`: «DEMOSTRACIÓN» en cada página, emisor, folio, versión, fechas, cliente, contacto, proyecto, partidas, total igual al de la versión, textos y «Página 1 de 1»; ningún costo, proveedor ni margen. Descargarlo otra vez da el mismo archivo |
| E7 | Con otra cotización aprobada cuyo cliente no tiene contacto | «Emisión» muestra BL-01 con cómo corregirlo y «Emitir» deshabilitado; al completar el contacto en el cliente y «Volver a validar», se emite |
| E8 | Revisor: en una versión aprobada sin emitir, «Anular la aprobación…» con motivo corto y luego útil | El corto se rechaza; con el útil, «Aprobación anulada por …»; el historial conserva «Aprobada» y añade «Aprobación anulada». El Preparador ya no ve «Emisión» y puede reenviar |
| E9 | Revisor: con una aprobación nueva, abre la cotización y emite | Emite un Revisor que no preparó la versión: preparó, aprobó y emitió quedan registrados por separado |
| E10 | Administrador: «Emisor» → editar con motivo | Guarda. Las emisiones anteriores y sus PDF no cambian; las nuevas usan los datos nuevos |
| E11 | Preparador: «Descartar la cotización…» en una cotización sin aprobación ni revisión pendiente | Pide motivo; tras confirmar, «… está descartada», solo lectura y folio conservado. Con revisión pendiente, aprobación o emisión no se ofrece y se explica por qué |
| E12 | Ancho de teléfono en «Emisión», la tarjeta emitida y «Emisor» | Una columna y sin desplazamiento horizontal |

### Excepciones (X1–X8, módulo 10; pendiente de ejecución formal)

Recorrido 3 del libro con la excepción opcional de la guía de demostración: «block, con 13 pza/m² y un motivo». Sesiones del Preparador y del Revisor. Fuentes y decisiones: [ADR-0014](../adr/0014-excepciones.md).

| Caso | Acción | Resultado esperado |
|---|---|---|
| X1 | Preparador: Calculadora → Ejemplo 3 → «Guardar como cotización»; en «Excepciones», «Registrar excepción…» | Ningún tipo preseleccionado; cada tipo explica qué cambia. Sin tipo ni motivo, «Revisar excepción» lleva el foco al resumen de errores |
| X2 | Tipo «Rendimiento o desperdicio…», partida 1, componente CMP-00011 (muestra 12.5 pza del catálogo), «Desperdicio» con valor 1 | Se rechaza junto al campo: «0 <= d < 1». La captura se conserva |
| X3 | «Rendimiento» con 13 y un motivo; «Revisar excepción» → «Agregar al borrador» | Aparece «Registrada · pendiente de autorización» y «Cambios sin guardar». «Calcular y guardar versión» da un total distinto del de referencia ($22,405.28 del ejemplo) |
| X4 | Envía la versión a revisión | Se envía (la excepción registrada con motivo basta, TI-069) |
| X5 | Revisor: abre la revisión | «Excepciones de la versión» muestra 12.5 pza del catálogo, 13 aplicado y el motivo; la verificación muestra BL-05 «no está autorizada». «Aprobar» se bloquea con BL-05 |
| X6 | «Autorizar excepción 1…» con comentario opcional y confirma | «Excepción 1 autorizada», AV-04 en avisos, el bloqueo anterior desaparece; ahora se aprueba |
| X7 | En otra cotización, el Revisor rechaza la excepción | La versión no se puede aprobar (bloqueo «fue rechazada»); se solicitan cambios; el Preparador corrige y calcula una versión nueva, cuya excepción vuelve a «Pendiente» |
| X8 | Emitir la versión aprobada y abrir el PDF; ancho de 390 px en el editor y en la revisión | El PDF no menciona excepciones, rendimientos ni motivos. Una columna, sin desplazamiento horizontal, foco visible con teclado |

En `softarq_dev` no hay conceptos personalizados ni otra forma de reproducir un precio vencido sin manipular fechas; esos casos están cubiertos por las pruebas automatizadas (no por esta guía).

## 4. Qué no hace todavía

- La calculadora DEMO no guarda su captura (para conservarla, «Guardar como cotización»).
- La aprobación **no es una emisión** ni una entrega al cliente. La emisión (módulo 8) genera un PDF **DEMO**: no se envía por correo ni al cliente y no es una cotización comercial real.
- Sin duplicar cotizaciones, correo ni app móvil. Respuesta y vigencia: módulo 9; excepciones: módulo 10.
- Sin administración de catálogos: no se crean conceptos personalizados desde la web.
- Sin registro de usuarios ni recuperación de contraseña.
- Solo punto decimal (por ejemplo, `0.12`).

## 5. Registro de la prueba en persona

### Seguimiento interno de respuestas (S1–S10; pendiente de ejecución formal)

Usar la misma emisión DEMO del recorrido E1–E12; las capturas se realizan por el equipo, sin sesión de cliente. [Fuentes y decisiones](../cotizaciones/seguimiento-respuestas.md).

| Caso | Acción y resultado esperado |
|---|---|
| S1 | Preparador abre una cotización emitida: versión/documento exactos, fecha/zona del servidor, vigencia y «Sin respuesta registrada» |
| S2 | «Registrar respuesta del cliente»: Aceptada, fecha recibida válida y nota con acentos; revisar y confirmar. Debe mostrar persona interna, fecha recibida y fecha/instante del registro |
| S3 | Revisor y administradores consultan el seguimiento y su historial; sin acciones de registro/corrección, con motivos visibles |
| S4 | Una cotización aprobada sin emitir carece de seguimiento comercial; aprobación interna no significa aceptación |
| S5 | Corregir a Rechazada con motivo: conserva evento anterior y nota, y muestra un evento corrector nuevo |
| S6 | Dos pestañas abren la misma cabeza: la segunda recibe conflicto, conserva su captura y compara antes de elegir «Corregir el registro vigente con mi captura» |
| S7 | Error de conexión al confirmar: nota/fecha/motivo permanecen; al reintentar no hay eventos duplicados |
| S8 | Consultar versión emitida desde el historial: el seguimiento coincide con esa emisión y no con otra posterior; el PDF original conserva sus bytes |
| S9 | En entorno de prueba con reloj de servidor controlado: último día vigente; día posterior vencido; recepción en último día admitida aun con registro posterior; recepción después del plazo bloqueada. No cambiar fecha del navegador para simular servidor ni alterar relojes de desarrollo |
| S10 | Teclado y 390 px: etiquetas, foco visible, explicación enfocada tras error, historial legible, sin desplazamiento horizontal |

Registrar debajo solo casos realmente realizados por una persona. Las pruebas automatizadas no rellenan esta tabla ni PR-41…PR-44 del Excel.

| Fecha | Persona | Casos ejecutados | Resultado | Observaciones |
|---|---|---|---|---|
| — | Propietario | Revisión personal declarada (sin casos detallados) | — | Registrada el 03/10/2026 como declaración; no es la ejecución formal de los casos |
