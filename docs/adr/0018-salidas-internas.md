# ADR-0018 — Salidas internas de solo lectura: compras calculadas, detalle del cálculo e indicadores

- **Fecha:** 18/10/2026 (cierre el 19/10/2026).
- **Estado:** aceptado para el DEMO local. Plan aprobado por el propietario en esta sesión (módulo 14), con tres decisiones explícitas (§2).
- **Commit:** módulo 14 (ver `HANDOFF.md` §8).
- **Relación con otros ADR:**
  - **cambia de forma intencionada la protección de costos del ADR-0009** (pantalla de revisión): el Revisor ya consulta costos e indicadores internos, en un contrato aparte. El ADR-0009 no se edita; se conserva como historial y la decisión vigente es esta (§2.1);
  - continúa el ADR-0008 (versiones inmutables): amplía la instantánea **solo para versiones nuevas** (§4);
  - continúa el ADR-0014 (excepciones) y el ADR-0017 (permisos efectivos), sin cambiar sus reglas;
  - no cambia BL-17, la emisión sin recalcular (ADR-0010), los textos por versión, las respuestas por emisión (ADR-0013) ni el PDF.

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar (en memoria, sin copiar). MD5 del libro antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

| Fuente | Qué aporta |
|---|---|
| Word v1.3 §1.3, RF-16 | «Detalle interno de solo lectura» (13 DETALLE_CALCULO, CR-08, CR-11) |
| Word §3.4 (CR-05 a CR-08), D-09, D-10 | Consolidar por versión; presentación completa o fraccionable; sobrante informativo que no se descuenta; prorrateo proporcional con remanente en la última partida |
| Word §3.5, §3.6 (CR-09 a CR-15), D-07, anexo D | Mano de obra, adicionales, P.U., importe, impuesto, total; **recargo sobre costo** frente a **margen sobre precio (solo indicador)** |
| Word §3.14 (ejemplo ilustrativo) | Tablas de compras y prorrateo; «el prorrateo se muestra con cuatro decimales truncados; se calcula con precisión completa»; sin consolidar, «3 bultos para P001 y 17 para P002, es decir, 20 bultos y $2,900.00» |
| Word §5.5 | «Verificar bloqueos» muestra precios elegidos frente al menor, **indicadores internos** e historial |
| Libro: hojas 12 COMPRAS (B60:N64), 13 DETALLE_CALCULO (A6:M6, B18:L23), 10 COTIZAR (Q6:R19), 14 REVISION (A7), 00 INICIO | Columnas y totales de cada salida; contadores operativos de inicio |
| Word D-19, §5.8 (RF-26) | La única salida es el PDF; el CSV exporta tablas completas para migrar, no informes |
| Word §1.6, D-20 | Las funciones del libro son un registro operativo; **ninguna fuente restringe quién ve 12, 13 o 14** |

## 2. Decisiones del propietario

1. **Permiso propio `salidas.consultar` para Preparador y Revisor.**
   - El Preparador prepara y usa 12 y 13; el Revisor revisa con los indicadores internos de 14 (§5.5).
   - **Cambio intencionado frente al ADR-0009:** allí la revisión mostraba solo la proyección comercial («protección de costos»). Ahora el Revisor también consulta costos e indicadores, siempre en este contrato interno; la revisión y su proyección comercial no cambian.
   - El Administrador del catálogo y el Administrador del sistema **no** la reciben. Conservan sus accesos administrativos (precios, tarifas, parámetros, personas). Una persona con varias funciones recibe la unión de las capacidades de sus funciones activas. No se añadieron funciones a cuentas DEMO.
   - Consultar no concede calcular, aprobar ni emitir: esas operaciones conservan sus capacidades y reglas, incluida BL-17.
2. **Indicadores solo de la versión**, sin agregados entre cotizaciones (§5). Los contadores operativos de 00 INICIO quedan **pendientes**, con su fuente y sus reglas por definir.
3. **Sin exportación.** Solo pantalla. Sin CSV, PDF interno ni formato de impresión. La exportación de informes queda como mejora opcional fuera del alcance acordado (no es un requisito incumplido). RF-26 (CSV de tablas para migrar) es otra cosa y conserva su propio estado.

## 3. Contrato y API

- `GET /api/v1/cotizaciones/{id}/versiones/{n}/salidas-internas` (`SalidasInternasController`, `ServicioSalidasInternas`). Exige `cotizaciones.consultar` **y** `salidas.consultar`.
- `GuardiaSesion` relee la pertenencia en cada petición: persona o pertenencia desactivada → 401 (sesión revocada); función retirada → 403 en la petición siguiente; contraseña temporal pendiente → 403 `CAMBIO_CONTRASENA_REQUERIDO` (el endpoint no lleva `@PermitidaConCambioPendiente`). Otra organización, otra versión o identificadores inválidos → 404 idéntico, sin datos.
- **Solo lectura:** una transacción `READ ONLY` en `REPEATABLE READ` lee la versión con su instantánea, su estado derivado (`estadoDeVersion`) y las decisiones de sus excepciones. Consultas fijas por versión, nunca una por fila. No escribe versiones, estados, selecciones, folios, bitácora ni idempotencia. No se pagina: el volumen lo acota la propia versión (partidas, consumos y compras de un cálculo).
- **Contrato** `packages/contracts/src/api/salidas-internas.ts` (`EsquemaSalidasInternasVersion`), solo esquemas:
  - `encabezado`: origen WEB_DEMO, ambiente, folio, número, estado, si es la última, fecha del cálculo, modalidad de compras, versión del motor, autor e instante;
  - `disponibilidad`: `COMPLETO`, `SIN_NOMBRES` o `NO_DISPONIBLE`, con motivo (§4);
  - `compras[]` (12 COMPRAS), con su prorrateo por partida;
  - `partidas[]` (13 DETALLE_CALCULO): medición, consumos con valores del catálogo copiados en la versión frente a los aplicados y sus excepciones, mano de obra o subcontrato, adicional, costos, P.U. e importe;
  - `indicadores` (§5), `conciliacion` y avisos internos (AV-01, AV-03).
- La proyección comercial (`EsquemaVersion`, `aVistaComercial`), la verificación, la emisión, el PDF y sus metadatos **no cambian**: las pruebas comprueban que no contienen ninguno de estos campos.

## 4. Instantánea y detalle histórico

**Qué guardaba ya cada versión:** `entrada_calculo` y `resultado_interno` completos (comprobado en las 10 versiones de `softarq_dev`, todas con la misma forma). Con eso se reconstruyen compras, consumos, prorrateo, costos, totales y margen **sin leer el catálogo**. Faltaban los **nombres y vigencias** (solo había códigos).

**Ampliación mínima, solo para versiones nuevas** (migración `20261020120000_salidas_internas`):
- columna `cotizacion_version.referencias_internas JSONB NULL`, con CHECK de objeto. Columna aparte para no cambiar `entrada_calculo` ni la huella del cálculo (BL-16);
- contenido (`esquema: 1`): descripción y unidad base de insumos; descripción, presentación y unidad de compra de productos; nombre de proveedores; vigencia de los precios elegidos; descripción de tarifas, conceptos y tipos de adicional;
- se lee en la **misma transacción de la fase A** del cálculo (`RepositorioCatalogos.leerReferencias`, consultas fijas por tipo) y se guarda en la sentencia única `softarq_crear_version` (`CREATE OR REPLACE`, misma firma, mismo SECURITY INVOKER y mismas comprobaciones);
- la inmutabilidad la siguen imponiendo el disparador `cotizacion_version_inmutable_trg` y la ausencia de UPDATE para `softarq_app`.

**Versiones anteriores:** quedan con NULL. **No se rellenan** ni se reconstruyen con el catálogo, los precios, las tarifas o los rendimientos actuales. Se muestran con sus cifras congeladas y solo los códigos, con el aviso `SIN_NOMBRES`. Si la instantánea no tuviera la forma esperada, el detalle entero es `NO_DISPONIBLE`: no se muestran cifras parciales como si fueran el informe.

Ninguna escritura ocurre al consultar: la información técnica nueva solo se escribe al crear la versión.

## 5. Indicadores de la versión

Todos se leen de la versión congelada, nunca del catálogo ni de los parámetros vigentes. Unidad: MXN (D-18) o fracción. Período: el de la versión (su fecha de cálculo). Base: una versión; no cuentan cotizaciones, versiones ni emisiones.

| Indicador | Fórmula y base (fuente) | Redondeo |
|---|---|---|
| Materiales | Σ por partida del prorrateo de compras (CR-08; COT_R_MAT) | Precisión completa; la web muestra centavos |
| Mano de obra | Σ por partida, modalidades UNIDAD y JORNADA (CR-09; COT_R_MO) | Igual |
| Subcontrato | Σ por partida, modalidad SUBCONTRATO (CR-09; COT_R_SUB) | Igual |
| Costos adicionales | Σ de montos capturados, también por categoría en el orden de su primera partida (CR-10; COT_R_TRA, MAQ, OTR) | Igual |
| Costo directo | `totales.costoDirecto` y `costoDirectoRedondeado` del motor (COT_R_CD) | El del motor (CR-15) |
| Subtotal, impuestos y total | `totales` del motor (CR-12 a CR-14), con nombre, tasa y base del impuesto de la versión | El del motor |
| Recargo sobre costo | `parametros.recargoSobreCosto` de la versión: fracción k que **se suma al costo** (CR-11) | Sin redondeo; la web muestra % con 2 decimales |
| Margen sobre precio | `totales.margen` del motor: (subtotal de venta − costo directo) ÷ subtotal de venta; **solo indicador** (D-07) | Igual |

- Las sumas por categoría se hacen en el servidor con la aritmética decimal del motor (`Dec`, 40 cifras), sin cambiar el cálculo original ni ningún importe.
- **Conciliación:** materiales + mano de obra + subcontrato + adicionales = costo directo; Σ importes = subtotal; en cada compra, Σ prorrateo = costo de compra. Si no cuadra, se muestra un aviso y no se corrige nada.
- **Denominador cero:** margen con venta 0 → «No aplica». **Datos ausentes:** «No disponible». Ninguno se sustituye por 0.
- **Recargo y margen no son equivalentes:** se muestran por separado con su fórmula. No se muestra el «margen equivalente k ÷ (1 + k)» de la hoja 13 (A5), porque con importes redondeados no coincide con el margen real y sugeriría que son la misma medida.
- No hay margen por partida, utilidad en pesos, costo por m², metas ni alertas de margen: ninguna fuente los define.

## 6. Web

- Ruta `#/cotizaciones/{id}/v/{n}/interno/{compras|detalle|indicadores}`, con subnavegación por enlaces (`aria-current`), como el catálogo. La versión se elige en la ruta o en el selector «Versión consultada»: nunca se cambia en silencio a la última.
- Enlace «Salidas internas» en la versión y «Indicadores internos de la versión» en la revisión, solo con `salidas.consultar`. Por ruta directa sin permiso: página «Sin permiso».
- Encabezado siempre visible (origen WEB DEMO, folio y versión, estado, fecha, modalidad, alcance) y marca «Uso interno: no es un documento para el cliente», distinta del resumen comercial.
- Estados: carga, vacío (versión sin compras), error con «Reintentar» (solo repite la lectura), «no disponible» y 404. Respuestas atrasadas descartadas (`useCarga` cancela la anterior). Ante un 403 se descartan los datos, se explica y se vuelve a pedir la sesión (`refrescar()` en `ProveedorSesion`), de modo que la navegación deja de ofrecer el enlace.
- Formato sin `number`: `redondearDecimales` y `truncarDecimales` operan sobre el texto. Prorrateo con cuatro decimales truncados (§3.14); importes en centavos (CR-15) solo al mostrar; cantidades hasta 4 decimales (§3.3).
- Tablas `tabla-registros` (tarjetas a 390 px), `caption` para lectores de pantalla, foco visible y teclado.
- `sin-datos-internos.test.ts`: excepción acotada a la carpeta `salidas-internas/` (un archivo); fuera de ella no cambia nada.

## 7. Seguridad: límite del ADR-0017 §4

- El endpoint solo hace SELECT con `softarq_app`, que ya podía leer `cotizacion_version`. No se añaden funciones SQL que reciban `p_usuario`, ni concesiones, ni privilegios. La única función que cambia (`softarq_crear_version`) conserva firma, propietario, `search_path`, revocación a PUBLIC y comprobaciones. **El módulo no aumenta la capacidad residual** de una credencial de aplicación comprometida (que ya podía leer todas las organizaciones).
- El límite sigue **sin resolver** y no se presenta como resuelto: las funciones de la base confían en el `p_usuario` que les pasa la aplicación. Un identificador de sesión o una variable de conexión que fije la misma credencial **no** lo resuelve.
- **Tarea separada propuesta (no hecha): «identidad de las funciones SQL».**
  - *Objetivo:* que las funciones que escriben con autoría resuelvan la identidad en la base a partir de una prueba que la credencial de la aplicación no pueda fabricar.
  - *Límites de confianza:* la aplicación no debe poder crear sesiones ni elegir la identidad de una función; la verificación del token (hash) debe vivir en una función DEFINER de otro propietario, con un rol de autenticación separado de `softarq_app`; `SET`/`set_config` de la misma credencial no cuentan.
  - *Pruebas necesarias:* suplantación de otro miembro con la credencial de la aplicación (debe fallar); sesión revocada, caducada o de otra organización (debe fallar); temporal pendiente; regresión de todas las funciones con autoría; respaldo y restauración de los roles nuevos.
  - Es un rediseño de autenticación y roles; no forma parte de este módulo.

## 8. Diferencias con el libro

| Libro | Web DEMO | Motivo |
|---|---|---|
| Hojas 12, 13 y 14 visibles para cualquiera | Capacidad `salidas.consultar` (Preparador y Revisor) | Decisión del propietario (§2.1); el libro no tiene permisos reales (D-20) |
| La hoja 13 narra la compra en texto (columna M) | Columnas estructuradas y relación consumo → compra | Misma información, legible en tabla y en móvil |
| «Margen equivalente k/(1+k)» en 13 A5 | No se muestra | §5: evita presentarlo como el margen real |
| Detalle siempre «del último cálculo» | Detalle de la versión elegida | Versiones inmutables (ADR-0008) |
| Contadores de 00 INICIO | Pendientes | §2.2 |
| CSV de tablas (RF-26) | No se implementa aquí | §2.3 |

## 9. Persistencia, respaldo y restauración

- Migración `20261020120000_salidas_internas` aplicada a `softarq_dev` con `db:migrar` (respaldo creado y verificado **antes**). Sin cambios en `permisos-app.sql`: la tabla ya tenía SELECT e INSERT para `softarq_app` (sin UPDATE) y SELECT para `softarq_respaldo`.
- `probar-restauracion.mjs` comprueba la columna, su CHECK, que `softarq_crear_version` la escribe y que las referencias restauradas son idénticas al origen.

## 10. Consecuencias

- Preparador y Revisor consultan compras, detalle e indicadores de cualquier versión, sin recalcular ni escribir.
- Las versiones nuevas son autosuficientes también en nombres; las anteriores, solo en cifras y códigos.
- Pendientes: contadores de 00 INICIO, exportación de informes (opcional), identidad de las funciones SQL (§7), regularizar los cinco conceptos heredados y P3 con el cliente.
