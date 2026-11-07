# ADR-0023 — Clasificación de registros, exportación CSV de tablas (RF-26) y contadores de inicio

- **Fecha:** 01/11/2026
- **Estado:** aceptada y implementada en local. Las reglas de los contadores y la lista de tablas exportables son **propuestas aplicadas** que el propietario confirma en la revisión final (§5).
- **Contexto:** módulo 17 (E3/E4). Cierra tres puntos comprometidos que seguían pendientes: la separación entre datos de presentación, de QA y restos de humo; RF-26 (exportación de tablas para migración); y los contadores operativos de la hoja «00 INICIO». Referencias: [ADR-0018](0018-salidas-internas.md) §2.2 y §2.3, [ADR-0021](0021-cliente-externo-solicitud-y-estimacion-preliminar.md), [ADR-0012](0012-respaldo-y-restauracion-local.md), `docs/cobertura-demo.md`.

## 1. Clasificación de clientes (presentación, QA o humo)

**Problema.** `softarq_dev` mezcla lo que se enseña, lo que crean las automatizaciones y lo que quedó de pruebas de humo de módulos anteriores. Antes solo se distinguía por el nombre (`[DEMO]`, `[QA]`).

**Decisión.**
- Tabla aditiva `clasificacion_cliente` (una fila por cliente): `categoria` ∈ {`PRESENTACION`, `QA`, `HUMO`}, `motivo` obligatorio, quién y cuándo. Migración `20261101000000_clasificacion_clientes`, sin tocar ninguna fila existente.
- **Una fila es una decisión explícita**, no una inferencia: sin fila, el cliente está «sin clasificar». Llevar `[DEMO]` en el nombre **no** lo vuelve desechable. Los proyectos, cotizaciones y solicitudes **heredan** la categoría de su cliente (no se clasifican por separado).
- **Nada se oculta por defecto.** Las listas (clientes, cotizaciones y solicitudes del equipo) muestran todo con su etiqueta; el filtro `clasificacion=PRESENTACION|QA|HUMO|SIN_CLASIFICAR` identifica y consulta cada grupo.
- **Quién y cómo:** `PUT /clientes/{id}/clasificacion` `{categoria|null, motivo}` con `personas.administrar` (Administrador del sistema). La base lo vuelve a exigir: la aplicación solo **lee** la tabla y escribe con `softarq_clasificar_cliente` (SECURITY DEFINER, exige `ADMIN_SISTEMA`), que deja `CLASIFICADO` o `CLASIFICACION_RETIRADA` en la bitácora con la categoría anterior. Reversible: se puede cambiar o retirar.
- **Aplicación a lo existente** (`scripts/demo/clasificar-clientes.mjs`, modo de prueba por omisión y reglas explícitas con evidencia): 4 de **presentación** (Laura Méndez, Constructora Ríos y Asociados, Despacho Aranda Arquitectos —los tres de `db:cargar-clientes-demo— y «[DEMO] Raul Herrera»), 1 de **QA** (nombre «[QA] …») y 43 de **humo** (nombres que dicen ser restos de pruebas de los módulos 8, 10, 12, 14 y 15: humo, curl, respaldo, comprobación, excepción de prueba, acentos). 48 de 48 clasificados, con motivo y bitácora; **ninguna otra fila cambió**. Lo que no tenga evidencia se deja sin clasificar. Las cuentas nuevas (`acceso-presentacion.mjs --perfil raul|qa`) se clasifican al crearlas.
- **Respaldo y restauración:** la tabla nueva entra en el volcado completo (`pg_dump`) y en la restauración sin cambios de procedimiento; se comprobó con `respaldo:probar-restauracion` (guía de operación).

**No hecho a propósito:** no se creó una categoría para cotizaciones sueltas ni se clasifican emisiones o documentos (históricos inmutables); la clasificación vive en el cliente.

## 2. Exportación CSV de tablas para migración (RF-26)

**Definición.** Salida de **datos maestros**, no informes (las compras y el detalle son las salidas internas del módulo 14; ADR-0018 §2.3 sigue vigente) ni sustituto del respaldo.

| Tabla | Capacidad (ya existente) | Columnas |
|---|---|---|
| `clientes` | `personas.administrar` | codigo, nombre, contacto_nombre, contacto_telefono, contacto_correo, activo, clasificacion, creado_en, modificado_en |
| `proyectos` | `personas.administrar` | codigo, cliente_codigo, nombre, municipio, entidad_federativa, descripcion, activo, creado_en, modificado_en |
| `cotizaciones` | `personas.administrar` | folio, cliente_codigo, proyecto_codigo, origen, estado_folio, ultima_version, solicitud_folio, creado_en |
| `personas` | `personas.administrar` | correo, nombre, funciones, activa, es_demo, creada_en |
| `proveedores`, `productos`, `precios`, `insumos`, `tarifas` | `catalogos.administrar` | ver `GET /exportaciones` (catálogos con sus importes internos, que esa función ya ve) |
| `conversiones`, `tipos_estructura`, `conceptos`, `componentes`, `tipos_adicional` | `catalogos.administrar` | catálogo técnico con códigos como llaves (añadido el 07/11/2026: el libro exporta estas tablas) |
| `parametros` | `parametros.administrar` | una fila: recargo, impuesto, vigencia y textos (añadido el 07/11/2026) |

**Manifiesto (07/11/2026).** `GET /exportaciones/manifiesto` devuelve un CSV `tabla, archivo, filas, columnas` solo de lo que la sesión puede exportar, como el manifiesto con conteos del libro (Word §5.8).

**Alcance, sin ambigüedad:** esta exportación cubre los **datos maestros** (15 tablas) con sus códigos para migrar. **No es una migración completa del sistema.** Quedan fuera, y la pantalla y `GET /exportaciones` lo declaran: versiones y todo su detalle, revisiones, excepciones y emisiones (inmutables, con huella), PDF emitidos, bitácora, solicitudes y accesos de clientes, y todo secreto. La recuperación completa es el respaldo de PostgreSQL y documentos (ADR-0012). El libro exporta además versiones, partidas, mediciones, consumos, compras, bitácora y casos; en el DEMO se dejan fuera por ser inmutables y recuperarse con el respaldo: si el propietario pide su CSV, es un cambio acotado en `servicio-exportaciones.ts`.

- **API:** `GET /exportaciones` (tablas que la sesión puede exportar) y `GET /exportaciones/{tabla}` (CSV; 404 si no existe, 403 si falta la capacidad de esa tabla). Solo canal web. Sin caché.
- **Aislamiento:** toda consulta filtra por la organización de la sesión, nunca por un parámetro del cliente.
- **Lo que nunca se exporta:** contraseñas, hashes, credenciales temporales, sesiones, tokens, idempotencia, bitácora, versiones, emisiones ni PDF (de eso se encarga el respaldo). Una prueba exige que ninguna columna declarada coincida con contraseña, hash, token, sesión, secreto o clave.
- **Formato:** CSV UTF-8 con BOM, RFC 4180 (comas, comillas dobles, CRLF), fechas ISO 8601 en UTC, importes y cantidades como texto decimal exacto, listas con `|`. **Defensa contra inyección de fórmulas:** una celda de texto que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro se antepone con un apóstrofo.
- **Pantalla:** `Exportaciones` (solo con `catalogos.administrar` o `personas.administrar`), que muestra solo lo que la API ofrece a esa sesión.

## 3. Contadores de 00 INICIO

**Decisión.** `GET /cotizaciones/contadores` (`cotizaciones.consultar`), solo lectura, y un bloque «Estado de las cotizaciones» en `Mi trabajo`. **No sustituye** a las tarjetas de bandeja de cada persona: estos cuentan la organización completa. La respuesta incluye `reglas` y la fecha del servidor; la pantalla las muestra («Cómo se cuenta»).

Reglas aplicadas (cada cotización con folio activo cuenta una sola vez, por el estado de su **última** versión):
- **Borradores:** sin versión guardada o con la última versión aún sin enviar a revisión. **En revisión:** la última versión espera al Revisor. **Aprobadas por emitir:** aprobada y sin emisión.
- **Emitidas vigentes / vencidas:** la última versión está emitida y su vigencia termina hoy o después / ya terminó (fecha del servidor).
- **Precios por vencer:** precios no anulados cuya vigencia termina en los próximos 30 días (**adaptación aprobada por el propietario el 07/11/2026 frente a la referencia anterior de 7 días**: solo cambia la anticipación del indicador; no amplía la vigencia de ningún precio ni modifica cotizaciones históricas; constante `DIAS_PRECIOS_POR_VENCER` en `packages/contracts/src/api/inicio.ts`). **Último folio:** el más alto asignado, incluidos los descartados.
- **Avisos:** INI-01 (aprobadas esperando emisión), INI-02 (emitidas vencidas) e INI-03 (precios por vencer).

## 4. Enlace cotización → solicitud de origen

`ResumenCotizacion.solicitud` (`{id, folio}`, opcional): la cotización que nació de una solicitud muestra «Solicitud de origen» con enlace (la ruta exige `solicitudes.atender`; otras funciones ven el folio y, si lo abren, «Sin permiso»).

## 5. Lo que queda para confirmar en la revisión final (una sola decisión)

El Word v1.3 cita RF-26 y la hoja 00 INICIO, pero no fija **cuáles tablas** se exportan ni **cómo se cuentan** vencidas y aprobadas. Se aplicó lo de arriba por ser la lectura más conservadora (maestros, sin secretos, con las capacidades que ya existen; contadores por última versión). **Recomendación: aprobarlo tal cual.** Si el propietario quiere otra regla (por ejemplo, contar versiones en lugar de cotizaciones, o añadir las emisiones al CSV), es un cambio acotado en `servicio-exportaciones.ts` o en `contadoresInicio`.

## Consecuencias

- Migración aditiva aplicada a `softarq_dev` con respaldo previo creado y verificado por el procedimiento (`db:migrar`).
- Capacidades nuevas: ninguna. Contratos: `Clasificacion`, `EsquemaClasificarCliente`, `EsquemaRespuestaExportaciones` y `EsquemaContadoresInicio` (índice completo; no entran en `@softarq/contracts/cliente`).
- Pruebas: integración `clasificacion.integracion` (8) y `exportaciones-inicio.integracion` (10), unitarias de la web, y Playwright `panel-clasificacion-exportaciones.spec`.
