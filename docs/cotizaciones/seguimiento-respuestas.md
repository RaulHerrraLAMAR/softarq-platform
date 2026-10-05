# Módulo 9 — Seguimiento de cotizaciones emitidas (DEMO local)

Decisiones: [ADR-0013](../adr/0013-seguimiento-respuestas-vigencia.md). La fase 1 se consultó en solo lectura: `D:\Proyecto_SoftArq\entrega\Cotizador_Estructuras_F1.xlsm` y `Documentacion_maestra_Cotizador_Estructuras_F1.docx` v1.3. No se modificaron ni se ejecutaron nuevas pruebas del Excel.

## Fuentes verificadas

| Regla/campo | Ubicación concreta | Aplicación en este módulo |
|---|---|---|
| Vigencia comercial | Word §3.7 «Vigencias»: CR-16, emisión + VIGENCIA_DIAS; §4.7 parámetros: VIGENCIA_DIAS = 15; anexo C PC-41 y PC-42. `modCalculo.bas`, `CR16_VigenteHasta` (línea 142) | Se lee la fecha guardada de la emisión; no se recalcula su plazo ni importes |
| Último día completo | Word §3.7, A-01; `modHistorial.bas`, `His_MarcarVencidas` (línea 433): solo Emitida, `vigente_hasta < Hoy()` | VIGENTE hasta el día final inclusive; VENCIDA desde el siguiente día, según servidor |
| Aceptada / Rechazada | Word §5.7 «Versiones, respuesta del cliente y descarte»; §6 RF-23 → TI-144, TI-156 y TI-157. `modHistorial.bas`, `BTN_Respuesta` (línea 337) y `His_Respuesta` (línea 369) | Dos resultados comerciales, sobre una emisión existente. B-36 aparece en TI-156 como restricción a versiones emitidas |
| Persona autorizada | Word §1.6, fila Preparador; `BTN_Respuesta`: `Req_Funcion FN_PREP` | Preparador registra. El servidor usa su sesión y muestra «Registrada internamente por…» |
| Fecha recibida obligatoria y nota opcional | `BTN_Respuesta`: campos `fecha` y `nota`; `His_Respuesta`: fecha no anterior a emisión ni posterior a Hoy. Excel `DATA_VERSIONES`, `tblVersiones`, rango A1:AY18 (table17.xml): `respuesta_fecha` AU, `respuesta_nota` AV | Fecha real obligatoria; nota opcional. Se conserva también quién/cuándo registró el equipo |
| Emisión y plazo originales | La misma `tblVersiones`: estado D, `fecha_emision` K, `vigencia_dias` L, `vigente_hasta` M | La FK a emisión fija su versión y fechas; nunca se modifica el original |
| Sustitución | Word §3.9 «Versiones»: al emitir vN+1 la anterior pasa a Sustituida con datos/PDF intactos; tabla de acciones de §3.9 | Una primera respuesta solo sobre emisión no sustituida. No se hereda el resultado a la emisión nueva |
| Historial | Excel `BITACORA`, `tblBitacora`, A1:G218 (table25.xml: id_evento, fecha_hora, persona, accion, entidad, id_entidad, detalle); `His_Respuesta` llama a `Bit_Registrar` | Eventos comerciales inmutables más bitácora mínima con referencias de emisión/versión |
| Registro posterior al vencimiento | Word §3.7 marca Emitida sin respuesta a Vencida al abrir; `His_Respuesta` exige estado Emitida, pero no comprueba fecha recibida > vigente_hasta | **Decisión del propietario:** permite captura tardía si recepción en vigencia; bloquea recepción fuera de plazo |
| Corrección y su autorización | Word y VBA no definen una corrección del resultado ya registrado | **Decisión del propietario:** Preparador añade corrección con motivo e historial; también de una respuesta histórica sobre documento sustituido |

Las referencias PC-41/PC-42 son resultados previos del anexo, no pruebas ejecutadas en esta sesión. PR-41…PR-44 del Excel continúan pendientes. Los límites de longitud y la paginación son decisiones técnicas del DEMO, sin inventar BL ni AV.

## Cómo se presenta

| Documento | Vigencia consultada | Registro comercial | Significado |
|---|---|---|---|
| Emitido | Vigente | Sin respuesta | Preparador puede registrar respuesta recibida dentro del plazo |
| Emitido | Vencida | Sin respuesta | Puede capturarse una recepción histórica válida; después del último día se bloquea |
| Emitido | Vigente/Vencida | Aceptada/Rechazada | Se conserva el resultado y su fecha recibida; Preparador puede corregir con motivo |
| Emitido, sustituido | Vigente/Vencida | Sin respuesta | No admite primer registro; consultar la emisión posterior |
| Emitido, sustituido | Vigente/Vencida | Aceptada/Rechazada | Historia de esa emisión; corrección explícita permitida, sin efecto en otras emisiones |

APROBADA es decisión interna del Revisor. En la web «Registro vigente» significa la última captura/corrección comercial; no significa que el documento siga vigente. El paso del tiempo no elimina respuestas, cambia estados de preparación ni modifica PDF.

En Cotizaciones, abrir un folio emitido o una versión de su historial muestra el documento y su seguimiento. «Registrar respuesta del cliente» solicita resultado, fecha recibida y nota; «Corregir registro interno» añade motivo. Siempre se confirma la versión exacta. Ante una carrera, comparar el registro vigente antes de aplicar la captura conservada como corrección.

## API y base

| Método/ruta `/api/v1` | Capacidad | Resultado |
|---|---|---|
| GET `/emisiones/{id}/seguimiento?antesDe=N` | `cotizaciones.consultar` | Documento, fecha/zona del servidor, vigencia, cabeza, página de historial y acciones/motivos |
| POST `/emisiones/{id}/respuestas` | `respuestas.registrar` | Evento inicial, 201 |
| POST `/emisiones/{id}/respuestas/{eventoId}/correcciones` | `respuestas.corregir` | Evento corrector de la cabeza citada, 201 |

POST exige CSRF e Idempotency-Key. 409 CONFLICTO_RESPUESTA / EMISION_SUSTITUIDA; 422 FECHA_RESPUESTA_INVALIDA / RESPUESTA_FUERA_VIGENCIA; 404 ante emisión/respuesta inexistente o ajena. Contratos/OpenAPI describen campos estrictos; no se aceptan identidad, organización, estado, nombre del registrador ni fechas del registro desde la web.

Tabla `respuesta_cliente_evento`, migración `20261005150000_respuestas_cliente`. Solo alta, restricciones y disparadores descritos en ADR-0013. El motor queda exclusivamente en la API y no se invoca para registrar/corregir.

## Verificación

Pruebas unitarias de límites y medianoche en México; web de confirmación, errores y captura conservada; integración real de flujo, aislamiento, permisos, fechas, reintentos/carreras, sustitución, cadena, paginación e inmutabilidad. E2E en secuencia después de integración, un worker, softarq_test y almacenamiento aislado. Referencias de cálculo conservadas: 54,190.68; 43,312.16; 22,405.28; 4,911.79.

`pnpm --filter @softarq/api respaldo:probar-concurrencia` añade **dos folios DEMO propios** en softarq_dev, mantiene PDF originales y respaldo en carpetas persistentes y restaura solo en softarq_restauracion. Exige accesos DEMO locales existentes en `_work\secrets`, sin restablecerlos ni imprimirlos. `respaldo:probar-restauracion` verifica después todos los eventos íntegros. Resultados reales y rutas: HANDOFF §18.
