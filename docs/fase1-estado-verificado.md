# Fase 1 — Estado verificado de la entrega

- **Fecha de la inspección:** 02/10/2026
- **Método:** solo lectura. El libro y los Word se leyeron con Python (`openpyxl`, `python-docx`, `zipfile`) sin guardarlos; la huella MD5 del libro fue la misma antes y después.
- **Alcance:** `D:\Proyecto_SoftArq\entrega\` y `D:\Proyecto_SoftArq\CONTEXTO_SoftArq_Fase1.md`. Nada de esto se copió al repositorio.

## 1. Archivos fuente de verdad

| Archivo (en `D:\Proyecto_SoftArq\`) | Versión | Última modificación | MD5 |
|---|---|---|---|
| `entrega\Cotizador_Estructuras_F1.xlsm` | Libro `1.0.0-F1` (`17 CONFIG`, `LIBRO_VERSION`) | 25/09/2026 18:35 | `b60debc121957b8d8e3f2c2edd9a5b4f` |
| `entrega\Documentacion_maestra_Cotizador_Estructuras_F1.docx` | Documento v1.3 (control de versiones), 49 páginas según metadatos | 25/09/2026 17:04 | `2bad59c07fdf4f33a0a1d259c461f3bc` |
| `entrega\Guia_de_demostracion.md` | Sin número de versión | 25/09/2026 17:07 | — |
| `entrega\Informe_recorrido_guiado_cambios_y_pruebas.md` | Sin número de versión; cita el Word v1.3 | 25/09/2026 17:09 | — |
| `CONTEXTO_SoftArq_Fase1.md` | Fecha de corte 25/09/2026 | 25/09/2026 17:10 | — |

Documentos superados (historial): `Informe_de_pruebas.docx`, `Guia_de_uso_y_requisitos.docx`, `Matriz_de_cumplimiento.docx`, `Datos_pendientes_del_cliente.docx` (23/09/2026, libro 1.0.0-F1, todavía con 150 casos de integración) y la especificación `Cotizador_estructuras_fase1_Excel_v0.2.docx` en la raíz.

**`H.xlsm`:** no existe ningún archivo con ese nombre en `D:\Proyecto_SoftArq`. Los `.xlsm` que hay fuera de `entrega\` son copias de prueba en `pruebas\` y respaldos en `entrega\Respaldos\`.

## 2. Coincidencias comprobadas

Entre el libro, el Word v1.3, el CONTEXTO, la guía y el informe coinciden:

- versión del libro `1.0.0-F1`, `AMBIENTE = DEMO`, `MONEDA = MXN`, `VIGENCIA_DIAS = 15`;
- `RECARGO_PCT` e `IMP_TASA` vacíos (bloquean la emisión en PRODUCCION);
- 31 hojas (19 visibles y 12 muy ocultas) en el archivo; el Word y el CONTEXTO dicen lo mismo;
- pruebas declaradas: 193/193 de integración, TE-01 a TE-10 en 11 registros, 46/46 internos;
- 12 defectos corregidos (11 del libro y 1 del script), una incidencia abierta (cierre de Excel) y una observación abierta de interfaz;
- `COT-2026-00001-v1` Emitida, total 18 790.94 MXN (DEMO), vigente hasta 08/10/2026.

Estas cifras de pruebas son las **declaradas** por los documentos; no se volvieron a ejecutar en esta inspección.

## 3. Diferencias encontradas

### D1. El libro oficial se usó después del cierre documental

El Word (17:04), la guía (17:07), el informe (17:09) y el CONTEXTO (17:10) describen el libro antes de las 18:12. La bitácora del libro registra después:

| Hora (25/09/2026) | Evento |
|---|---|
| 18:12:55 | Apertura del libro oficial |
| 18:13–18:15 | `COT-2026-00016` creada con el **Ejemplo 1 (cubierta ligera)**, calculada, aprobada por `[DEMO] Revisor 1`, **emitida** (total 44 865.23, DEMO) y PDF `entrega\PDF\COT-2026-00016-v1.pdf` |
| 18:26–18:28 | `COT-2026-00017` creada otra vez con el **Ejemplo 1**, con otro proveedor para INS-00006, **emitida** (total 45 491.87, DEMO) y PDF `entrega\PDF\COT-2026-00017-v1.pdf` |
| 18:35 | Último guardado del libro |

Consecuencias:

- Los documentos dicen que el libro tiene un solo folio emitido (`COT-2026-00001`); el libro tiene **tres** (00001, 00016 y 00017). Hay 17 folios, no 15.
- Persona en turno: los documentos dicen `[DEMO] Preparador 1` (corrección del defecto 10 del CONTEXTO / 6 del informe); el libro quedó con **`[DEMO] Revisor 1`**. Es estado, no código: los botones de ejemplo ofrecen el cambio, pero la guía de demostración (paso 3) ya no se cumple al abrir.
- La carpeta `entrega\PDF\` tiene dos PDF que ningún documento menciona.
- `COT-2026-00001-v1` sigue intacta en los datos (Emitida, mismo total).

### D2. Los folios 00016 y 00017 significan cosas distintas según el documento

En el informe del recorrido por la interfaz (sección 8, sobre una **copia**), `COT-2026-00016` es el Ejemplo 1 (cubierta) y `COT-2026-00017` el Ejemplo 2 (losa). En el Anexo A del Word, TI-021 y TI-027 citan partidas de `COT-2026-00017` de las copias de prueba. En el **libro oficial**, ambos folios son el Ejemplo 1. Al citar un folio hay que indicar de qué archivo es.

### D3. Cifras que solo están en algunos documentos

- «247 pasos (110 clics y 56 entradas de teclado)» del recorrido por la interfaz figura en el informe y en el CONTEXTO, no en el Word.
- El Word declara 49 páginas en sus metadatos; no se renderizó para confirmarlo.

### D4. Orden de fases

El Word (10.3) coloca la compuerta hacia la fase 2 después del piloto de la fase 1 (PR-44). La fase 2 empieza el 02/10/2026 con esas validaciones aún pendientes (ver ADR-0001).

### D5. Vigencias próximas

`COT-2026-00001-v1` vence el 08/10/2026; `00016` y `00017`, el 10/10/2026. Al abrir el libro después, pasarán a «Vencida» (comportamiento esperado, D-11).

## 4. Pendiente de decidir (autor)

- Si `COT-2026-00016`/`00017` y la persona en turno se dejan así, se documentan en una v1.4 del Word o se restaura el libro desde un respaldo. **No se tocó nada.**
- Fuera de `entrega\` hay archivos ajenos o de trabajo que no deben entrar al repositorio: `Sistema de control escolar v12.xlsm` (otro proyecto), `pruebas\` (55 MB de copias y evidencias) y `src\` (igual a `entrega\fuentes\` salvo `build.log`, `excel.pid` y `__pycache__`).
