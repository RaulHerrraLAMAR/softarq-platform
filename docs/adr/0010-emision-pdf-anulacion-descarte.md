# ADR-0010 — Emisión de versiones aprobadas, PDF DEMO, anulación de aprobación y descarte

- **Fecha:** 03/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/api/src/modules/cotizaciones/` (`aplicacion/servicio-emisiones.ts`, `dominio/emision.ts`, `dominio/textos.ts`, `dominio/pdf/`, `infraestructura/almacen-documentos.ts`, `infraestructura/repositorio-emisiones.ts`, `mantenimiento/revisar-documentos.ts`, `demo/cargar-emisor-demo.ts`);
  - `apps/api/recursos/pdf/` (fuentes Fira Sans con licencia OFL y logotipo DEMO);
  - la migración `20261003200000_emision` y `scripts/db/permisos-app.sql`;
  - `packages/contracts/src/api/emisiones.ts` y los cambios de `cotizaciones.ts`, `revisiones.ts` y `esquemas.ts`;
  - `apps/web/src/cotizaciones/emision.tsx`, `EditorCotizacion.tsx`, `revisiones.tsx` y los formularios de cliente;
  - `scripts/http/api-json.mjs`.

## Contexto

Hasta el módulo 7, una versión podía quedar APROBADA, pero no se podía emitir ni generar su documento. Tampoco existían la anulación de una aprobación ni el descarte de cotizaciones.

Este módulo añade lo siguiente, sin recalcular ni modificar versiones:
- la emisión explícita de la última versión aprobada;
- un registro de emisión inmutable;
- el PDF comercial DEMO (PDFKit), guardado en una carpeta persistente y descargado con la sesión;
- la anulación de una aprobación antes de emitir;
- el descarte de cotizaciones con motivo.

**Fuera de alcance:** correo o envío al cliente, facturación fiscal, firma electrónica, anulación de documentos ya emitidos, respuesta del cliente (Aceptada o Rechazada), vencimiento automático, excepciones (B-22), Expo y despliegue.

**El documento es DEMO:**
- dice «DEMOSTRACIÓN» en cada página y usa datos ficticios;
- no sirve como cotización comercial real.

## Decisiones

### 1. Contraste con las fuentes (solo lectura)

**Código VBA consultado:** `modRevision.bas` (`BTN_Emitir`, `Rev_Emitir`, `Rev_Observar`), `modValidacion.bas` (`Validar(…, "EMITIR")`, `Emisor_Faltantes`, `avisos`), `modPdf.bas` (`Pdf_Datos`, `Pdf_Llenar`), `modHistorial.bas` (`His_Descartar`, B-37), `modBuild.bas` (`DEMO_*`) y `modCotizacion.bas` (`Ver_Crear`).

**Word maestro:** §3.2, 3.8, 3.9, 3.11, 3.12, 3.13, 5.5 y 5.7.

| Regla | En las fuentes | En la web |
|---|---|---|
| BL-01 | Cliente activo con nombre, nombre de contacto y teléfono o correo | Datos **actuales**. Se añadieron las columnas de contacto al cliente. Además, el nombre actual debe coincidir con la copia de la versión (§4) |
| BL-02 | Proyecto activo, del cliente, con nombre, municipio, entidad y descripción | Datos actuales que coincidan con las copias de la versión (§4) |
| BL-09 | Precio no vigente **a la fecha de emisión**, salvo excepción autorizada | Verificación vigente del módulo 7 con la fecha de emisión. Sin excepciones en la web: siempre bloquea |
| BL-15 | Emisor (nombre, domicilio, teléfono, correo) y logotipo existente; solo impide emitir | Tabla `emisor`; el logotipo es un recurso local comprobado en disco |
| BL-17 | Al emitir: aprobada, con revisor registrado y revisor ≠ preparador | Aprobación vigente de **esa** versión, con `resuelta_por` ≠ autor. Quién emite: §2 |
| BL-19 | El estado no permite emitir (ya emitida, descartada…) | Folio activo, versión última, sin revisión pendiente y sin emitir. Un borrador posterior sin calcular se informa como BL-16 |
| BL-20 | Alcance, condiciones o exclusiones vacíos; son **campos de la versión** | Textos de la versión (§3). Se comprueban al enviar, al aprobar y al emitir |
| AV-02 | El precio vence antes del fin de la vigencia comercial | Aviso con la fecha de emisión + `VIGENCIA_DIAS` (CR-16); no bloquea |
| CR-16 | Vigente hasta = emisión + `VIGENCIA_DIAS` días naturales | `cr16VigenteHasta`; se guarda en la emisión con su `CHECK` |

**Emisión (§3.12):**
- reevalúa BL-01 a BL-20;
- escribe la fecha de emisión y la vigencia;
- copia los datos del cliente, del proyecto y del emisor, y los textos;
- si falla a medias, se revierte.

**Sustitución:** al emitir vN+1, la anterior pasa a Sustituida con su PDF intacto. En la web es un estado derivado (§6).

**PDF (§3.13):**
- incluye emisor y logotipo, folio, versión, fechas, cliente, contacto, proyecto, partidas, totales, textos, leyenda técnica, preparó y revisó, y «Página X de Y»;
- lleva «DEMOSTRACIÓN» en DEMO;
- sin autor ni título en los metadatos;
- **nunca** incluye costos, proveedores, consumos, recargo, margen, excepciones ni bitácora.

**Descarte (B-37):** lo hace el Preparador, con motivo y solo sobre versiones en Borrador. El folio no se reutiliza.

### 2. Quién emite (adaptación autorizada por el propietario)

**Diferencia con el libro:** en el libro emite el **Revisor** distinto del preparador (`BTN_Emitir` exige `FN_REV` y `Rev_Emitir` compara a la persona con el preparador). El propietario autorizó la regla siguiente:

**Puede emitir:**
- un **Preparador** activo de la organización;
- o un **Revisor** activo que **no** sea el autor de la versión.

**Condiciones que no cambian:**
- Siempre hace falta una aprobación vigente de **esa** versión, hecha por una persona distinta de quien la preparó (BL-17 sobre la aprobación).
- Poder emitir no concede aprobar: el Preparador nunca obtiene `revisiones.decidir`.
- Emitir no modifica, recalcula ni sustituye nada aprobado.

**Dónde se aplica:**
- **Capacidad:** `emisiones.emitir`, para Preparador y Revisor.
- **Identidad:** la regla se comprueba en `puedeEmitirPersona` (dominio), en `softarq_exigir_emisor` (base) y en la sentencia de emisión. Un Revisor que fue autor de la versión responde 403 con BL-17.
- **Registro:** quedan por separado `preparado_por`, `aprobado_por` y `emitido_por`, con sus nombres copiados.

### 3. Textos de la versión (BL-20; decisión del propietario)

En el libro, alcance, condiciones y exclusiones son campos de cada versión: se copian de `TEXTO_*`, o de `DEMO_TEXTO_*` en DEMO, al crearla. El revisor los ve.

**En la web:**
- **Dónde viven:** en `captura.textos` del borrador, que es opcional en el contrato para que las capturas anteriores sigan siendo válidas. Se copian a la versión dentro de `captura` (inmutable).
- **Al crear la cotización** (también con «Guardar como cotización»), el servidor **copia** los `DEMO_TEXTO_*` si la captura no trae textos. No es una referencia dinámica. Los valores son los del libro con los acentos restaurados (el VBA los guarda en ASCII) y conservan la marca [DEMO]. En PRODUCCION no hay valores predeterminados.
- **Edición:** el Preparador los edita; «Restablecer textos DEMO…» los reemplaza solo por decisión explícita. No se introduce ninguna función de administración para ellos.
- **No tocan el cálculo:** no entran en la solicitud de cálculo, la huella ni los importes; los cuatro totales de referencia no cambian. Cambiarlos cambia la revisión del borrador: la versión deja de coincidir y hace falta vN+1, con su propia aprobación. El resumen de cambios informa `textosCambiados`.
- **Quién los ve:** el revisor, en la revisión; el PDF usa **exactamente** los de la versión aprobada.

**Versiones anteriores sin textos** (incluidas `COT-2026-00001/00002/00003` de `softarq_dev`):
- quedan intactas;
- BL-20 impide enviarlas, aprobarlas o emitirlas;
- para emitir hace falta una vN+1 con textos y una aprobación nueva;
- nada se completa ni se aprueba a posteriori.

### 4. Datos descriptivos: qué sale de la versión y qué se captura al emitir

| Origen | Datos |
|---|---|
| Versión aprobada (copias del cálculo) | Folio, número, partidas, subtotal, impuesto (nombre y tasa), total, textos, nombre y código del cliente, nombre, ubicación y descripción del proyecto, autor |
| Aprobación | Quién aprobó y cuándo |
| Datos actuales, **congelados en la emisión** | Contacto del cliente (nombre, teléfono y correo), emisor (nombre, domicilio, teléfono, correo y logotipo), fecha de emisión, vigencia, quién emite y versión de la plantilla |

**Sin mezclas en silencio:** si el nombre actual del cliente o los datos actuales del proyecto difieren de las copias de la versión, la emisión se **bloquea** (BL-01 o BL-02: «cambiaron después de calcular vN; genere una versión nueva»). Así no se emite un documento con nombres históricos y un contacto actual de otra época. El contacto no está en la versión: se muestra en la validación y en la confirmación, y se congela al emitir.

### 5. Modelo y base de datos (migración `20261003200000_emision`)

**`cliente`:** `contacto_nombre`, `contacto_telefono` y `contacto_correo`. Son anulables, con `CHECK`, y se editan con `clientes.gestionar`. El alta pasa a recibir un objeto: se elimina la firma anterior de `softarq_crear_cliente`.

**`emisor`**
- Una fila por organización; los campos pueden faltar (BL-15).
- `logo_clave IN ('DEMO')`, con recurso local.
- `es_demo` sale de la organización.
- **Carga y edición:** la carga DEMO lo crea si falta y nunca lo sobrescribe (`modificado_por` nulo). Lo edita el Administrador del sistema (`emisor.configurar`), con motivo, ficha de concurrencia (409) y bitácora `EMISOR_ACTUALIZADO`.
- **Cuenta DEMO:** se añade `[DEMO] Administrador` (FN_ADMCAT y FN_ADMSIS en el libro). Es una función existente, no una administración de usuarios.

**`emision` (inmutable)**
- Columnas:
  - organización, cotización, folio, versión (id y número) y aprobación usada (`revision_id`);
  - `origen='WEB_DEMO'` y ambiente;
  - quién preparó, aprobó y emitió (ids y nombres copiados);
  - `emitido_en`, `fecha_emision`, `vigencia_dias` y `vigente_hasta`;
  - total;
  - `contenido` (jsonb con **la estructura comercial exacta** entregada al generador);
  - `plantilla_version`;
  - `archivo_clave`, `archivo_bytes` y `archivo_sha256`.
- **Restricciones:**
  - UNIQUE(`version_id`) y UNIQUE(`archivo_clave`);
  - FK compuestas a la versión y a la revisión (organización, id y versión), con un UNIQUE nuevo en `revision`;
  - `CHECK` de BL-17 (`aprobado_por` ≠ `preparado_por`), de CR-16, de origen, de folio y de clave de archivo (solo uuids del servidor).
- **Triggers:**
  - `emision_inmutable_trg`: sin UPDATE ni DELETE, también para el propietario;
  - `emision_validar_trg`: con inserciones directas también exige aprobación vigente de esa versión, versión última de un folio activo y las personas y el total de la versión. Bloquea la fila de la revisión.

**Anulación**
- Es un **evento nuevo** `APROBACION_ANULADA` (de APROBADA a ANULADA, con motivo obligatorio) en `revision_evento`.
- Un índice único parcial admite una sola anulación por revisión.
- El trigger `revision_evento_validar_trg` la rechaza si la versión ya se emitió.
- La fila `revision` y su evento APROBADA **no cambian**.

**Descarte**
- `cotizacion` gana `descartada_por`, `descartada_en` y `motivo_descarte`, con un `CHECK` de coherencia.
- `cotizacion_transicion_trg`:
  - sin DELETE;
  - un folio DESCARTADO no cambia más;
  - la única transición es de ACTIVO a DESCARTADO;
  - sin transición, solo cambia `ultima_version`.

**Funciones de una sentencia** (`SECURITY INVOKER`), que comprueban pertenencia y función vigentes, estado y ficha con las filas bloqueadas:
- `softarq_emitir_version`;
- `softarq_anular_aprobacion` (Revisor);
- `softarq_descartar_cotizacion` (Preparador; con emisión, revisión PENDIENTE o aprobación vigente responde DESCARTE_*);
- `softarq_guardar_emisor` (Administrador del sistema);
- `softarq_exigir_emisor` (regla del §2).

Además se reemplazan funciones existentes:
- `softarq_guardar_borrador` y `softarq_crear_version`: FOLIO_NO_ACTIVO;
- `softarq_enviar_revision`: una aprobación anulada ya no impide reenviar y una versión emitida no se envía;
- `softarq_editar_cliente`: contacto.

**Orden de bloqueo:** siempre borrador y después revisión. La anulación solo bloquea la revisión, así que no hay ciclos.

**Idempotencia:** `recurso_tipo` admite `emision`.

**Permisos de `softarq_app`:**
- `emision`: SELECT e INSERT;
- `emisor`: SELECT, INSERT y UPDATE de sus columnas editables;
- `cotizacion`: UPDATE de `estado_folio` y de las columnas de descarte;
- `cliente`: UPDATE de las columnas de contacto;
- EXECUTE de las funciones nuevas;
- sin DELETE.

### 6. Estados derivados (nunca se escriben en la versión)

| Condición | Estado de la versión |
|---|---|
| Tiene emisión | `EMITIDA`, o `SUSTITUIDA` si después se emitió una versión posterior de la misma cotización (su registro y su PDF siguen intactos) |
| Su última revisión está APROBADA y sin anular | `APROBADA` |
| Su última revisión está PENDIENTE | `EN_REVISION` |
| Lo demás: sin revisión, cambios solicitados, retirada o **aprobación anulada** | `BORRADOR` |

El folio puede estar `ACTIVO` o `DESCARTADO`.

### 7. Emisión: consistencia entre la base y el disco

La base y el sistema de archivos no comparten transacción. **Orden de las operaciones:**

1. **Idempotencia.** Una clave ya registrada reproduce la emisión (`Idempotent-Replayed`, mismos bytes). En el mismo proceso, la misma clave en vuelo espera a la primera (doble clic).
2. **Fase A, de solo lectura:**
   - verificación vigente del módulo 7 con la fecha de emisión;
   - reglas de §1 y §2;
   - si hay bloqueos: 422 `EMISION_BLOQUEADA` y bitácora `EMISION_BLOQUEADA`;
   - si la versión o la aprobación confirmadas ya no son las vigentes: 409 `CONFLICTO_EMISION`.
3. **Generación** del PDF en memoria desde la estructura comercial, validada con su contrato estricto. No hay ninguna transacción abierta.
4. **Archivo:**
   - temporal exclusivo `tmp/<uuid>.part`, sincronizado con el disco;
   - se vuelve a leer y se valida: `%PDF-`, `%%EOF`, páginas y tamaño;
   - SHA-256 de lo escrito;
   - `link` al nombre definitivo `emisiones/<org>/<emisión>.pdf`, que **no sobrescribe** (EEXIST);
   - se borra el temporal.
5. **Registro:** una sentencia (`softarq_emitir_version`) vuelve a comprobar todo con las filas bloqueadas y registra tamaño y hash.
   - Si falla (anulación o descarte simultáneos, borrador cambiado, otra emisión, caída), **se borra el archivo creado** y se responde el error.
   - **Solo después del COMMIT se responde 201.**

**Fallos y respuesta:**

| Fallo | Respuesta | Estado |
|---|---|---|
| Generación o escritura | 500 `DOCUMENTO_NO_GENERADO` | La versión sigue aprobada; se reintenta con la misma clave |
| Interrupción del proceso entre el paso 4 y el 5 | — | Queda un archivo propio sin registro, que `documentos:revisar` informa y limpia (§8) |
| Descarga con archivo ausente o dañado (tamaño o SHA-256) | 500 `DOCUMENTO_NO_DISPONIBLE` | **Nunca se regenera** con datos actuales ni se sustituye |

**Descarga** (`GET /emisiones/{id}/documento`, con `cotizaciones.consultar` en la organización de la sesión):
- `application/pdf`, `Content-Disposition: attachment; filename="COT-AAAA-NNNNN-vN.pdf"` (solo el folio validado), `Repr-Digest`, `nosniff` y `no-store`;
- no hay carpeta pública ni URL que eluda la sesión.

### 8. Carpeta de documentos, respaldo y recuperación

**`SOFTARQ_DIR_DOCUMENTOS`:**
- es obligatoria para arrancar `main.ts`;
- ruta absoluta, escribible y **fuera de cualquier repositorio** (la API se niega si encuentra `pnpm-workspace.yaml` o `.git` en un ancestro).

| Uso | Carpeta |
|---|---|
| Desarrollo | `D:\Proyecto_SoftArq\datos\softarq_dev\documentos` (fuera de `_work`, que es temporal) |
| Integración | `D:\Proyecto_SoftArq\_work\pruebas\documentos-integracion` |
| E2E | `D:\Proyecto_SoftArq\_work\pruebas\documentos-e2e` |

- Las pruebas solo vacían carpetas `documentos-*` bajo `_work\pruebas`; cualquier otra ruta se rechaza.
- `.gitignore` excluye `*.pdf`, `datos/` y `documentos-*/`.

**Los PDF son originales, no caché.**
- **Respaldo:** la carpeta se respalda **junto con** la base (`pg_dump` de `softarq_dev`). Primero la base y después la carpeta: un archivo sin registro se limpia; un registro sin archivo no se puede reconstruir.
- **Restauración:** se restauran ambas y se ejecuta `documentos:revisar`.

**`pnpm --filter @softarq/api documentos:revisar [-- --limpiar] [--antiguedad-minutos=60]`:**
- informa los temporales, los archivos propios sin registro, los registros con archivo ausente o dañado y los archivos ajenos;
- con `--limpiar`, borra solo temporales y archivos propios sin registro con la antigüedad mínima;
- nunca toca archivos registrados ni ajenos y nunca regenera;
- termina con código 2 si hay archivos ausentes o dañados, que deben restaurarse desde el respaldo.

### 9. PDF (PDFKit 0.20.2, MIT)

- **Generador:** `generarPdf(DocumentoCotizacion)` recibe solo la estructura comercial (lista blanca, contrato `strictObject`).
- **Recursos locales:**
  - Fira Sans 400, 600 y 700 (subconjunto latin de `@fontsource/fira-sans` 5.3.0) con su licencia OFL;
  - `logo-demo.png`, copiado sin modificar de `entrega\recursos\logo_demo.png` (MD5 `8a21af47…`).
- **Glifos:** antes de dibujar se comprueba que todos los caracteres tienen glifo. Si falta alguno, no se genera (nunca «tofu»).
- **Diseño** (paleta de `docs/web/sistema-visual.md`, UI UX Pro Max: jerarquía por peso y cifras tabulares):
  - carta vertical; encabezado del emisor; bloque de identificación; recuadro de cliente y proyecto;
  - tabla de partidas con el encabezado repetido en cada página y filas que no se cortan;
  - totales que no se dividen; secciones de texto que continúan en la página siguiente;
  - leyenda técnica y registro operativo (preparó, aprobó y emitió);
  - en cada página, la leyenda DEMO, la marca de agua «DEMOSTRACIÓN» y el pie con «COT-…-vN · WEB DEMO» y «Página X de Y».
- **Metadatos:** sin autor ni título (como el libro); la fecha de creación es la de emisión. Sin adjuntos ni JavaScript.
- **Plantilla:** `cotizacion-web-demo/1`. Un cambio de diseño cambia esta versión; los documentos ya emitidos no se tocan.

### 10. Anulación y descarte: reglas

**Anulación:**
- solo un Revisor (`revisiones.decidir`, como `Rev_Observar` sobre una versión Aprobada);
- con motivo (10 caracteres o más y alguna letra), sobre la ficha vista, y solo si no hay emisión;
- doble anulación: 409; con emisión: 409 `VERSION_EMITIDA`;
- **después:** la versión vuelve a BORRADOR; si sigue coincidiendo con el borrador se puede reenviar y necesita otra aprobación.
- Editar el borrador no anula la aprobación (en el libro sí), pero la deja inservible para emitir (BL-16 y versión nueva).

**Descarte:**
- solo un Preparador, con motivo útil;
- solo con el folio ACTIVO, sin emisiones, sin revisión PENDIENTE (hay que retirarla antes) y sin aprobación vigente en ninguna versión (antes la anula un Revisor);
- nada se elude con el descarte;
- conserva folio, versiones, revisiones y eventos; el folio no se reutiliza;
- después, guardar, calcular, enviar y emitir responden 409 `FOLIO_NO_ACTIVO` o se bloquean (BL-19).

### 11. API y web

**Endpoints:**

| Endpoint | Capacidad |
|---|---|
| `GET/PUT /emisor` | Consultar / `emisor.configurar` |
| `GET /cotizaciones/{id}/versiones/{n}/emision/validacion` | Consultar |
| `POST /cotizaciones/{id}/versiones/{n}/emision` | `emisiones.emitir` |
| `GET /emisiones/{id}` | Consultar |
| `GET /emisiones/{id}/documento` | Consultar |
| `POST /revisiones/{id}/anulacion` | `revisiones.decidir` |
| `POST /cotizaciones/{id}/descarte` | `cotizaciones.preparar` |

- Contratos en `packages/contracts/src/api/emisiones.ts`; OpenAPI regenerado.
- Los cuerpos estrictos rechazan identidad u organización.
- Errores nuevos:
  - 409: `VERSION_EMITIDA`, `APROBACION_NO_VIGENTE`, `CONFLICTO_EMISION`, `FOLIO_NO_ACTIVO`;
  - 422: `EMISION_BLOQUEADA`, `DESCARTE_BLOQUEADO`;
  - 500: `DOCUMENTO_NO_GENERADO`, `DOCUMENTO_NO_DISPONIBLE`.

**Web:**
- **Clientes:** campos de contacto.
- **Editor:**
  - «Textos de la cotización» en la columna principal, con contador y «Restablecer textos DEMO…»;
  - BL-20 visible antes de enviar.
- **Revisión:** los textos de la versión aparecen antes de aprobar, y el Revisor puede «Anular la aprobación…» con motivo.
- **«Emisión»:**
  - validación con lo que falta, los bloqueos (con cómo corregirlos) y los avisos;
  - confirmación con folio, versión, destinatario (cliente y contacto), fecha, vigencia y total;
  - «Generando el documento…»: éxito solo tras el 201; los errores conservan el contexto y se reintenta con la misma clave;
  - tarjeta EMITIDA (distinta de APROBADA) con quién preparó, aprobó y emitió, tamaño, SHA-256 y «Descargar PDF» (fetch con la sesión).
- **Descarte:** «Descartar la cotización…» con motivo; descartada, la cotización queda en solo lectura con su aviso.
- **Sección «Emisor».**
- No hay correo ni envío al cliente.

### 12. Pruebas con acentos (corrección del proceso)

En los módulos 6 y 7, pasar JSON como argumento de `curl` en Git Bash dañó nombres (U+FFFD).

`scripts/http/api-json.mjs` evita el problema:
- lee el JSON de archivos UTF-8 o lo construye dentro del script; nada viaja por la línea de comandos;
- recorre el mismo flujo que el navegador (cookie, CSRF y `Origin`);
- `comprobar-acentos` hace una ida y vuelta con «Construcción Peñasco — Ñandú, Mérida «UTF-8»» y compara los puntos de código. Es obligatoria antes de crear datos de prueba.

Los históricos dañados (`COT-2026-00001` y la copia de la v1 de `COT-2026-00003`) **no se reparan**: son datos DEMO de prueba documentados.

## Cambios en pruebas existentes (intencionados)

- **Capacidades:**
  - el Preparador y el Revisor reciben `emisiones.emitir`;
  - `capacidadesDe(["REVISOR","PREPARADOR"])` ya no es «todas», porque `emisor.configurar` es del Administrador del sistema;
  - la sesión del Preparador incluye `emisiones.emitir`.
- **Configuración:** incluye `dirDocumentos: null` por omisión.
- **OpenAPI:** la lista de rutas añade las 7 nuevas.
- **Resumen de cambios:** añade `textosCambiados: []`.
- **Captura al crear:** dos pruebas de integración de la corrección del borrador comparan ahora la captura con los textos DEMO copiados al crear (antes no existían).
- **Permisos de `softarq_app`:** se añaden las columnas de descarte de `cotizacion` y las de contacto de `cliente`, y las funciones nuevas al inventario.
- Ninguna expectativa se cambió para ocultar un defecto.

## Consecuencias

- **Se puede emitir:** una versión aprobada por otra persona se emite y descarga como PDF DEMO, con el contenido congelado. Cambiar después cliente, emisor, catálogo, textos o plantilla no altera el registro ni los bytes.
- **Versiones anteriores sin textos** necesitan una vN+1 para emitirse.
- **API iniciada antes de este cambio:** debe recompilarse y reiniciarse con `SOFTARQ_DIR_DOCUMENTOS`. Tras la migración, la versión anterior de la API ya no puede crear clientes (firma de `softarq_crear_cliente`).
- **Pendiente:**
  - respuesta del cliente, vencimiento y anulación de documentos emitidos;
  - excepciones (BL-09 con excepción y AV-04);
  - envío por correo;
  - almacenamiento compartido para varias instancias y respaldo automatizado.
