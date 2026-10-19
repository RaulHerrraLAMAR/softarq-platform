# ADR-0019 — Duplicar cotización, modo de precios de la versión nueva y vista previa PDF BORRADOR

- **Fecha:** 19/10/2026.
- **Estado:** aceptado para el DEMO local. Plan aprobado por el propietario en esta sesión (módulo 15), con cuatro decisiones explícitas (§2).
- **Commit:** módulo 15 (ver `HANDOFF.md` §8).
- **Relación con otros ADR:**
  - continúa el ADR-0008 (folios, borrador y versiones inmutables);
  - continúa el ADR-0010 (emisión y PDF), cuyo documento emitido no cambia (§5);
  - continúa el ADR-0014 (excepciones por versión): no se copian;
  - no cambia BL-17, la revisión, la emisión sin recalcular, las respuestas por emisión (ADR-0013) ni las salidas internas (ADR-0018).

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar. MD5 del libro antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

| Fuente | Qué aporta |
|---|---|
| `modHistorial.bas`: `BTN_Duplicar`, `His_Duplicar`, `Ver_CopiarContenido`, `BTN_NuevaVersion`, `His_NuevaVersion` | B-35 y B-34: qué se copia, qué se reinicia, estados permitidos, `Req_Funcion FN_PREP`, bitácora `DUPLICAR` y `NUEVA_VERSION` |
| `modPdf.bas`: `BTN_VistaPrevia`, `Pdf_Generar(idv, "BORRADOR")` | B-25: estados, sello de cálculo vigente, marca «BORRADOR — NO VÁLIDO COMO COTIZACIÓN», datos vivos, bitácora `VISTA_PREVIA`, sin `Validar` |
| `modCompras.bas` (`Sel_Estado`), `modValidacion.bas`, `modMotor.bas` | BL-07, BL-08, BL-09, AV-01, AV-02; recargo, impuesto y tarifa siempre vigentes |
| Word v1.3 §1.6, §3.8, §3.9, §3.11 (BL-15, BL-16, BL-19), §3.12, §3.13, D-17, RF-20, RF-21, RF-22 | Reglas y estados |
| Pruebas TI-130 a TI-137 (PR-27), TI-155 (PR-30), TI-058 (PR-32), TI-324 | Comportamiento esperado |

## 2. Decisiones del propietario

1. **Duplicar desde una versión concreta o desde el borrador guardado**, con el origen explícito.
   - Versiones en cualquier estado (§3.9), también Sustituida y Descartada. El borrador guardado es una **ampliación frente al Excel**: se duplica la revisión indicada y, si cambió, 409.
   - Se copian partidas, mediciones, textos **del origen** y consolidación. No se copian selecciones de precio, excepciones (ni sus valores técnicos), aprobaciones, emisiones ni respuestas.
   - El destino debe tener proyecto y cliente activos de la organización: se propone el mismo; si no es válido, hay que elegir otro.
2. **Modo de precios en un paso «Preparar la versión nueva»**, solo cuando la última versión está emitida, con modo y motivo obligatorios.
   - **CONSERVAR** toma las selecciones de la versión emitida; **ELEGIR_DE_NUEVO** las vacía.
   - No se repite en el mismo ciclo. Un borrador divergente no cambia sin una confirmación explícita. La API lo exige.
   - Antes de la primera emisión, el flujo no cambia.
3. **Vista previa**:
   - permiso `cotizaciones.consultar` (las cuatro funciones, como el libro, que no la restringe);
   - estados Borrador, En revisión y Aprobada;
   - cálculo vigente (BL-16, sin recalcular en silencio).
4. **Datos de la vista previa**:
   - **congelados** de la versión: partidas, mediciones, precios, importes y textos;
   - **actuales** (B-25): emisor, cliente, proyecto, contacto y días de vigencia;
   - lo que falta, indicado («[EMISOR PENDIENTE]», «Sin emitir», sin textos);
   - **auditoría `VISTA_PREVIA`**, una vez por clave y solo tras generar bien.

## 3. Duplicar (B-35)

- `POST /cotizaciones/{id}/duplicados` (`cotizaciones.preparar`, `Idempotency-Key`), con cuerpo `{origen: {tipo: VERSION, numero} | {tipo: BORRADOR, revision}, proyectoId}`.
- El servidor lee el origen de la base: la `captura` de la versión o el borrador en esa revisión. `capturaDuplicada()` copia y reinicia; el contrato estricto rechaza cualquier captura enviada por el navegador.
- Una sola sentencia, `softarq_duplicar_cotizacion` (INVOKER):
  - origen de la organización (si es borrador, en la revisión esperada con `FOR SHARE`; si no, `BORRADOR_DESACTUALIZADO`);
  - destino activo;
  - folio nuevo con `softarq_siguiente`;
  - columnas `duplicada_de_id`, `duplicada_de_version` y `duplicada_de_revision` (CHECK: exactamente un origen);
  - borrador en revisión 0;
  - bitácora `COTIZACION_DUPLICADA` (folio, origen, versión o revisión) con la persona.
- **Idempotencia:** un reintento con la misma clave devuelve la misma cotización; dos claves dan dos folios.
- **Referencias no disponibles** (concepto en Borrador, tipo de adicional inactivo…): se copian, el borrador las marca no disponibles y calcular exige resolverlas. **No se sustituyen.**
- Un concepto personalizado se conserva sin autorizar: calcular exige registrar de nuevo su excepción (BL-04).
- **Textos:** los del origen; si no tiene, la copia tampoco (no se usan las plantillas actuales).
- **Fechas y vigencia:** la versión nueva se calcula con la fecha y los parámetros vigentes. Motivo: el libro escribe «Duplicado de …»; aquí la trazabilidad está en las columnas de origen y en la bitácora.
- El original no cambia (huella de cotización, borrador, versiones, revisiones y emisiones, y SHA-256 del PDF).

## 4. Modo de precios de la versión nueva (B-34)

### 4.1 Adaptación al modelo de la web

- **En el libro**, la vN+1 se crea copiando la versión emitida y luego se edita.
- **En la web**, el borrador sigue vivo y cada cálculo crea una versión. El **ciclo** de la versión nueva vive en el borrador (`ciclo_version_origen`, `ciclo_modo_precios`, `ciclo_motivo`, `ciclo_preparado_por` y `ciclo_preparado_en`). Se exige preparar cuando la última versión es la emitida y el ciclo no corresponde a esa emisión (`softarq_requiere_nueva_version`).
- Mientras falte, `PUT borrador` y `POST versiones` responden 409 `NUEVA_VERSION_SIN_PREPARAR`. Lo comprueban la API y las funciones de la base.
- Preparar (`POST /cotizaciones/{id}/nueva-version`, `softarq_preparar_nueva_version`) **solo cambia las selecciones de precio** del borrador. Partidas, mediciones y textos se conservan, también los editados antes del módulo.
- Las versiones del ciclo guardan `modo_precios` y `version_origen`; la primera, además, el motivo del ciclo si no llega otro. Al emitir la versión siguiente, la anterior pasa a Sustituida (TI-136) y el ciclo vuelve a pedirse.

### 4.2 Semántica exacta

| Concepto | Qué significa aquí |
|---|---|
| **Conservar una selección** (CONSERVAR) | El borrador toma los **mismos códigos de precio** que la versión emitida. Como un precio no se edita (código = importe), conservar la selección **conserva el importe histórico de ese precio**. No hace falta copiar `precio_copia` |
| **Conservar el importe histórico de una versión** | No existe como modo: el total de una versión emitida no se transfiere. La versión nueva recalcula con el **recargo, el impuesto y la tarifa vigentes** (como `Motor_Modelo`), así que su total puede cambiar aunque se conserven los precios |
| **Consultar las opciones disponibles** (ELEGIR_DE_NUEVO) | Las selecciones quedan vacías; el Preparador elige entre las opciones vigentes. El menor se señala (AV-01) pero **nunca se elige automáticamente** |
| **Recalcular con reglas vigentes** | Lo hace siempre el cálculo de la versión nueva, en ambos modos. Nunca reemplaza versiones anteriores |

- **Bloqueos:** un precio conservado que se anuló, o cuyo producto o proveedor se desactivó, bloquea al calcular (BL-08, TI-133). Uno vencido se calcula, pero bloquea al enviar, aprobar y emitir (BL-09, TI-134), salvo la excepción PRECIO_VENCIDO existente. La disponibilidad de hoy se ve en el detalle (`referencias`).
- **Borrador divergente** (selecciones distintas de las emitidas; solo puede ocurrir en borradores anteriores al módulo, porque guardar exige el ciclo): 409 `SELECCIONES_DIVERGENTES` con las actuales y las propuestas, sin cambios hasta enviar `reemplazarSeleccionesDelBorrador: true`.
- No se heredan aprobaciones ni autorizaciones de excepciones: la versión nueva tiene su revisión.

## 5. Vista previa PDF BORRADOR (B-25)

- `POST /cotizaciones/{id}/versiones/{n}/vista-previa` (`cotizaciones.consultar`, `Idempotency-Key`, CSRF; limitador de cálculo). Es POST porque registra la auditoría.
- Responde los bytes directamente (`application/pdf`, `attachment; filename="COT-…-vN-BORRADOR.pdf"`, `private, no-store`, `nosniff`). **No se guarda en disco** ni en la carpeta de emitidos, no crea emisión, no consume folio y no cambia estados ni versiones.
- **Estados (BL-19):** solo versión Borrador, En revisión o Aprobada de un folio activo. Una emitida o sustituida se descarga como original (no se regenera).
- **Cálculo vigente (BL-16)** = la versión es la última, corresponde al borrador guardado (misma revisión) y el motor reproduce su entrada con el catálogo y los parámetros de hoy (`bl16`; los bloqueos del motor se informan tal cual).
  - **Invalidan:** parámetros del cálculo, precios, consumos, conversiones, tarifas, conceptos y el borrador guardado.
  - **No invalidan:** emisor, cliente, proyecto, contacto y vigencia, que se toman actuales.
  - No se exige `Validar`: ni emisor completo (BL-15), ni revisor (BL-17), ni textos (BL-20).
- **Composición:**
  - congelado: partidas, importes, textos y quién preparó;
  - actual: emisor (o «[EMISOR PENDIENTE]»), cliente, proyecto, contacto y días de vigencia;
  - fijo: fecha de emisión «Sin emitir» y «Emitió: (sin emitir)»;
  - aprobó: el nombre si la versión está aprobada, «(pendiente)» si no.

  Dos vistas previas de la misma versión pueden diferir en los datos actuales; la versión no cambia.
- **Marcas en cada página:**
  - franja «BORRADOR — NO VÁLIDO COMO COTIZACIÓN» y leyenda DEMOSTRACIÓN;
  - marca de agua «BORRADOR» de baja opacidad, detrás del texto;
  - pie «COT-…-vN · WEB DEMO · BORRADOR · Página X de Y»;
  - subtítulo «Vista previa sin emitir…».
- **Metadatos:** sin autor ni título; fecha de creación = fecha de generación.
- **Generador:** el mismo (PDFKit, fuentes y logotipo locales), con un tipo `DocumentoBorrador` aparte. **El documento EMITIDO se genera byte a byte igual:** `pdf.test.ts` compara el SHA-256 de una entrada fija con el calculado antes del cambio.
- **Auditoría:** `softarq_registrar_vista_previa` (INVOKER) registra la idempotencia (`vista_previa`) y la bitácora `VISTA_PREVIA` (versión y número; nunca el PDF), **después** de generar. Un reintento con la misma clave devuelve el documento sin otro evento. No afirma que el usuario lo leyera.

## 6. Permisos

| Operación | Capacidad | Funciones |
|---|---|---|
| Duplicar | `cotizaciones.preparar` | Preparador (B-35 `FN_PREP`) |
| Preparar la versión nueva | `cotizaciones.preparar` | Preparador (B-34 `FN_PREP`) |
| Calcular la versión nueva | `cotizaciones.preparar` + `calculo.ejecutar` | Preparador |
| Vista previa | `cotizaciones.consultar` | Las cuatro (B-25 no exige función) |
| Emitir | `emisiones.emitir` | Sin cambios (ADR-0010) |

La guardia relee la sesión en cada petición: desactivada → 401; función retirada → 403; temporal pendiente → 403; otra organización → 404.

## 7. Seguridad (ADR-0017 §4, ADR-0018 §7)

Las tres funciones nuevas son SECURITY INVOKER y reciben `p_usuario` como las existentes. No amplían la capacidad residual de una credencial de aplicación comprometida, que ya podía insertar cotizaciones, borradores y bitácora. Permisos nuevos: UPDATE de las columnas `ciclo_*` y EXECUTE de las funciones. El límite de identidad de las funciones SQL sigue **sin resolver**, como tarea separada (ADR-0018 §7).

## 8. Diferencias con el libro

| Libro | Web DEMO | Motivo |
|---|---|---|
| Duplicar solo desde una versión | También desde el borrador guardado (revisión exacta) | Decisión del propietario (§2.1) |
| Cliente y proyecto se cambian después en la v1 | Proyecto destino al duplicar | La web no cambia el proyecto de una cotización |
| Motivo «Duplicado de …» | Origen en columnas y bitácora | Trazabilidad consultable |
| vN+1 copia la emitida | Ciclo en el borrador vivo; solo cambian las selecciones | Modelo de versiones de la web (ADR-0008) |
| `precio_copia` y vigencias copiadas | Mismo código de precio (inmutable) | El importe ya está fijado por el código |
| Vista previa guarda `…-BORRADOR.pdf` en `RUTA_PDF` | Respuesta directa, sin archivo | No mezclar borradores con emitidos ni acumular archivos |
| Vista previa del borrador en curso (guarda antes) | De una versión calculada, igual al borrador guardado | La versión es la unidad calculada; nada se guarda al consultar |

## 9. Persistencia, respaldo y restauración

- Migración `20261021120000_duplicar_modo_vista_previa`: columnas, FK, tres CHECK, `idempotencia_recurso_ck` ampliado, cinco funciones nuevas y dos reemplazadas con su misma firma. Bloque condicional en `permisos-app.sql`.
- `probar-restauracion.mjs`: origen coherente, CHECK, funciones INVOKER, permisos mínimos y datos de duplicados, ciclos, modos y auditoría idénticos al origen.

## 10. Consecuencias

- Tras emitir, editar exige un paso explícito; los borradores emitidos de `softarq_dev` lo pedirán al abrirlos.
- Los PDF emitidos no cambian; la vista previa nunca se confunde con un emitido (marcas, nombre y ausencia en las emisiones).
- Pendientes: contadores de 00 INICIO, RF-26 y exportación de informes (sin cambios); identidad de las funciones SQL; los cinco conceptos heredados y P3.
