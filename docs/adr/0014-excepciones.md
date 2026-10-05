# ADR-0014 — Excepciones B-22 en el borrador, la versión y la revisión

- Fecha: 05/10/2026.
- Estado: aceptado para el DEMO local; plan aprobado por el propietario en esta sesión (módulo 10).
- Complementa ADR-0008 (borrador y versiones), ADR-0009 (revisión), ADR-0010 (emisión) y ADR-0012 (respaldo). Sustituye en esos documentos las frases «la web no tiene excepciones: BL-09 siempre bloquea» y «AV-04 no aplica».

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar (MD5 del libro antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`).

| Abreviatura | Fuente | Qué aporta |
|---|---|---|
| W §3.10 | Word maestro v1.3, «Revisión y excepciones: regla aplicada» | Tres tipos; registrada con motivo basta para enviar; autorizada para aprobar y emitir; la de rendimiento pendiente o autorizada se aplica al calcular; rechazada deja de aplicarse; el catálogo no cambia; personalizado en Borrador exige excepción |
| W §3.11 | Bloqueos y avisos | BL-04, BL-05 y BL-09 «salvo excepción autorizada»; AV-04 «la versión tiene excepciones autorizadas» |
| W §1.6, D-04, D-11, D-13, RF-14 | Funciones y decisiones | Preparador registra; Revisor ≠ preparador autoriza o rechaza; «excepciones por versión»; precio vencido bloquea salvo excepción |
| W §3.13, RNF-10 | PDF | Sin excepciones ni datos internos |
| VBA `modRevision.bas` | `BTN_RegistrarExcepcion`, `Exc_Registrar`, `BTN_AutorizarExcepcion`, `Exc_Resolver` | Campos, rangos, duplicados, motivo, decisión única con comentario opcional, bitácora |
| VBA `modValidacion.bas` | `Validar` (ENVIAR / estricto), `Avisos` | Códigos de bloqueo por tipo; AV-04 |
| VBA `modMotor.bas`, `modCotizacion.bas`, `modHistorial.bas` | `Motor_Modelo`, `Partida_Quitar`, `Ver_CopiarContenido` | Aplicación al calcular; quitar la partida quita sus excepciones; una versión nueva no las copia |
| `evidencias_pruebas/fase1.csv` | TI-068 a TI-074, TI-088, TI-090 a TI-093, TI-338, TI-339 | Casos de referencia; TI-339: block 24.66 × **13** × 1.05 = 336.609 → **337 piezas** |
| `Guia_de_demostracion.md` | Recorrido 3 | La excepción opcional «block, con 13 pza/m² y un motivo» |

## 2. Reglas implementadas

| Regla | Fuente | Dónde |
|---|---|---|
| Tipos RENDIMIENTO (campo RENDIMIENTO o DESPERDICIO), PRECIO_VENCIDO y CONCEPTO_PERSONALIZADO; no hay otros (ni de precio, impuesto o permisos) | W §3.10, RF-14 | `contracts/src/api/excepciones.ts` |
| Motivo obligatorio | W §3.10, TI-090 | Contrato (10–500 caracteres con alguna letra: límite técnico del DEMO, igual que ADR-0013) |
| Rangos: rendimiento > 0; 0 ≤ desperdicio < 1; componente activo del concepto de esa partida; sin duplicados (tipo, referencia, partida, campo) | `Exc_Registrar` | `dominio/excepciones.ts` `validarExcepciones` al guardar el borrador (422 `EXCEPCION_INVALIDA`); contrato (duplicados) |
| Referencia huérfana (partida quitada, precio no elegido, concepto ausente) | `Partida_Quitar` | Servidor: 422. Web: se quitan con la partida o al cambiar el precio |
| Aplicación al calcular: pendiente o autorizada; el catálogo no cambia | W §3.10, TI-091/092 | `calculo-demo.aSolicitudCalculo` → `construir-entrada` → motor (sin un segundo mecanismo de cálculo) |
| Personalizado activo en Borrador se calcula solo con su excepción registrada; si no, BL-04 | W §3.10, TI-088, `BTN_AgregarConcepto` | `construir-entrada.ts`; la búsqueda incluye personalizados activos con su `clase` |
| Enviar: basta registrada con motivo | W §3.10, TI-069 | `ServicioRevisiones.verificar(…, estricto = false)` |
| Aprobar, verificar en revisión y emitir: todas AUTORIZADAS; pendiente → BL-05, BL-09 o BL-04 según el tipo | W §3.10, TI-070/093 | `bloqueosExcepciones` en modo estricto; además `softarq_decidir_revision` rechaza APROBAR (`EXCEPCIONES_SIN_AUTORIZAR`) dentro del bloqueo de la revisión |
| BL-09 eximido para el precio con PRECIO_VENCIDO (registrada al enviar, autorizada al aprobar y emitir) | D-11, W §3.4, TI-068 a TI-073 | `bl09(…, eximidos)` con `preciosConExcepcion` |
| AV-04 por excepción autorizada | W §3.11, TI-072 | `av04` en la verificación (revisión y validación de emisión) |
| Autorizar o rechazar: Revisor ≠ autor y preparador, revisión PENDIENTE de esa versión, una decisión inmutable por excepción, comentario opcional, bitácora | `Exc_Resolver`, D-13, TI-074 | `softarq_decidir_excepcion`, tabla `excepcion_decision` (CHECK BL-17, disparadores) |
| PDF y contenido comercial sin excepciones | W §3.13, RNF-10, D-16 | Sin cambios en `construirDocumento` (lista blanca); comprobado en integración |

## 3. Decisiones y diferencias frente al libro

1. **Viven en el borrador y se congelan en la versión.** `captura.excepciones` (opcional, como `textos`): las capturas anteriores siguen válidas y su solicitud de cálculo no cambia (misma huella). La versión guarda las excepciones en `captura`, las de cálculo en `solicitud_calculo` (para que la verificación recalcule igual y BL-16 no salte en falso) y su efecto en `entrada_calculo` y `resultado_interno`.
2. **Identidad de la partida.** El borrador no tiene identificadores estables; la excepción cita la partida por su **número y su concepto**, y el servidor exige que coincidan. Dentro de la versión, la excepción N es su posición en `captura.excepciones` (inmutable).
3. **Decisión ligada a la versión (como el libro).** La decisión se toma durante una revisión PENDIENTE de esa versión, y se conserva el `revision_id` en que se tomó. Si la misma versión vuelve a enviarse, las autorizaciones siguen valiendo, porque el contenido es idéntico. Una versión nueva exige decisiones nuevas, porque `Ver_CopiarContenido` no copia excepciones (D-04, «excepciones por versión»).
4. **Rechazada en una versión inmutable.** En el libro, la rechazada deja de aplicarse y el sello queda sin calcular (BL-16) hasta recalcular la *misma* versión. Aquí la versión es inmutable: una rechazada **bloquea esa versión** al enviar, aprobar y emitir, con el código de su tipo. El Revisor solicita cambios y el Preparador corrige el borrador, lo que da lugar a vN+1 y a una revisión nueva. Es el mismo efecto con otra mecánica; no es una regla nueva.
5. **Registrar después de aprobar.** En el libro, editar una versión aprobada anula la aprobación. Aquí la excepción entra en el borrador; la versión aprobada no cambia y su emisión queda bloqueada por deriva del borrador (BL-19/BL-16, ADR-0010). Hace falta vN+1 con su revisión: **ninguna aprobación se conserva en silencio**.
6. **Sin flujo de autorización paralelo.** Se reutilizan la revisión existente y la capacidad `revisiones.decidir`. La única capacidad nueva es `excepciones.consultar` (Preparador y Revisor), para el **contrato interno** con datos técnicos.
7. **Datos técnicos fuera de lo compartido.** Las rutas de versión y de revisión, la proyección comercial, la validación de emisión, el contenido emitido y el PDF **no** llevan excepciones. El detalle del borrador solo las incluye con `excepciones.consultar`. Los textos de los bloqueos y de AV-04 usan una etiqueta neutra («ajuste técnico de la partida N»), sin componente, valores ni motivo, porque también los ven funciones sin la capacidad.
8. **Vista previa.** La solicitud de cálculo admite `excepciones` opcionales; el editor las envía y la vista previa coincide con la versión. La calculadora sin cotización no las usa.
9. **Dos BL-09.** En modo estricto, con una PRECIO_VENCIDO pendiente, aparecen dos bloqueos BL-09 (el de la excepción y el del precio), igual que en `Validar` del VBA.

## 4. Datos y permisos

- **Migración `20261005165028_excepciones`:**
  - tabla `excepcion_decision` (FK compuesta a `revision(organizacion, id, version)` y a `membresia`; UNIQUE por organización, versión y número; CHECK de decisión, número, comentario, nombre y BL-17);
  - disparadores `excepcion_decision_inmutable_trg` (UPDATE/DELETE prohibidos también al propietario) y `excepcion_decision_validar_trg` (Revisor vigente, revisión PENDIENTE, número existente y autor ≠ quien decide);
  - función `softarq_decidir_excepcion` (idempotencia, bloqueo `FOR UPDATE` de la revisión, decisión y bitácora en una sentencia);
  - `softarq_decidir_revision` reemplazada con la misma firma, que conserva sus privilegios;
  - `idempotencia_recurso_ck` admite `excepcion`.
- **`softarq_app`:** SELECT e INSERT en la tabla y EXECUTE de la función, con EXECUTE revocado a PUBLIC; sin UPDATE, DELETE ni DDL. `permisos-app.sql` añade un bloque condicional para poder restaurar respaldos anteriores.
- **`softarq_respaldo`:** lee la tabla por los privilegios por defecto del migrador. `probar-restauracion.mjs` comprueba relaciones, BL-17, permisos, función, disparadores y filas íntegras.
- **Corrección de deriva (módulo 9):** las FK de `respuesta_cliente_evento` llevan `map:` en `schema.prisma`. Sin ello, `migrate dev` proponía renombrarlas en esta migración. Una prueba de integración (`migrate diff --exit-code`) lo vigila.

## 5. Consecuencias

- El catálogo DEMO no tiene conceptos personalizados (no se inventan datos de catálogo). Los personalizados están cubiertos por la API y probados con un concepto creado en la prueba; en el DEMO aparecerán con la administración de catálogos.
- Las versiones calculadas antes de este módulo no tienen excepciones y su comportamiento no cambia. Los cuatro totales de referencia no cambian.
- La web solo admite términos técnicos en `src/excepciones/` (excepción documentada de la prueba `sin-datos-internos`); costos, consumos, márgenes, recargos, tarifas y traslapes siguen prohibidos en toda la web.
