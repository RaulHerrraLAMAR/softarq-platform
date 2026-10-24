# API del cliente (módulo 17, etapa E1)

Referencia para quien construya la app del cliente (E2) y el panel (E3). Decisiones y motivos: [ADR-0021](../adr/0021-cliente-externo-solicitud-y-estimacion-preliminar.md). Contratos: `@softarq/contracts/cliente`. Especificación completa: `docs/api/openapi.json`.

## Reglas que no cambian

- **El cliente sale de la sesión.** Ningún cuerpo, ruta ni cabecera lleva `clienteId`, `organizacionId`, función, estado ni importes; los contratos son estrictos y un campo extra responde 400. Un registro ajeno (de otro cliente o de otra organización) responde **404**.
- **Sesión móvil** (`Authorization: Bearer`) solo de cuentas `CLIENTE`. Una cuenta interna que intenta entrar recibe **403 `CUENTA_INTERNA_USE_PANEL`** con `panelUrl`; una cuenta de cliente no entra por la web. Con Bearer, las rutas internas responden 403 `RUTA_NO_DISPONIBLE_EN_MOVIL`.
- **Estimación ≠ cotización.** Calcular no envía; se puede enviar sin estimación. La estimación siempre lleva el rótulo `ROTULO_ESTIMACION` («Estimación preliminar, no es una cotización») y la app lo muestra antes del importe. Sin referencia válida no hay importe (`estado: SIN_ESTIMACION`, `comercial: null`): la app muestra el mensaje y deja enviar; **nunca** un cero.
- **Nada interno al cliente:** ni costos, márgenes, proveedores, consumos, excepciones, bitácora técnica ni quién preparó, aprobó y emitió.
- Las medidas que se piden, sus etiquetas y ayudas, y si un trabajo admite huecos las dicta el servidor (`GET /cliente/trabajos`); la app no duplica el motor.

## Rutas de la app (`/api/v1/cliente/…`)

| Método y ruta | Qué hace |
|---|---|
| `GET /trabajos` | Trabajos y opciones disponibles con sus medidas (`largo`, `ancho`, `alto`; el espesor de una losa viaja como `alto` con etiqueta «Espesor»). |
| `GET /proyectos`, `POST /proyectos` | Proyectos propios; alta de uno propio. |
| `GET /solicitudes`, `POST /solicitudes` | Lista (estado y total estimado vigente); crea un borrador `{proyectoId, captura}`. |
| `GET /solicitudes/{id}` | Detalle con `captura`, `revision`, `pendientes` (lo que falta o es inválido), última estimación y cotización formal si ya se emitió. |
| `PUT /solicitudes/{id}` | Guarda el progreso `{revision, captura}` (409 si la revisión cambió). Admite capturas incompletas; rechaza las inválidas (422 `VALOR_INVALIDO`). |
| `POST /solicitudes/{id}/estimaciones` | Calcula `{revision}`. 201 con la estimación. 422 `SOLICITUD_INCOMPLETA` si falta algo. Usa el limitador de cálculo. |
| `POST /solicitudes/{id}/envio` | Envía `{revision}`. **Idempotente**: 200 con `repetida`. |
| `POST /solicitudes/{id}/retiro` | Retira mientras no la atienda el equipo (idempotente). |
| `GET /cotizaciones`, `GET /cotizaciones/{id}`, `GET /cotizaciones/{id}/documento` | Cotizaciones **emitidas** de su Cliente (aunque las haya preparado el equipo sin solicitud); el `id` es el de la emisión. El PDF es el registrado. |

La captura (`EsquemaCapturaSolicitud`) agrupa `trabajos[]` (varios por solicitud, un proyecto por solicitud), cada uno con `secciones[]` y `huecos[]`. Un hueco se resta de la medición y solo se admite si el trabajo lo permite.

Errores propios: `SOLICITUD_NO_EDITABLE` (409, ya enviada), `SOLICITUD_INCOMPLETA` (422, con `campos`), `ESTADO_SOLICITUD_NO_PERMITE` (409), `CONFLICTO_EDICION` (409), `CAMBIO_CONTRASENA_REQUERIDO` (403, contraseña temporal pendiente: solo `/auth/contrasena`, `/auth/sesion` y `/auth/movil/sesion`).

## Rutas del equipo

| Función | Ruta |
|---|---|
| Preparador (`solicitudes.atender`) | `GET /solicitudes`, `GET /solicitudes/{id}`, `POST /solicitudes/{id}/atencion` (crea la cotización en borrador **sin precios elegidos ni compras consolidadas**; idempotente: 201 la primera vez, 200 después). |
| Administrador del sistema (`personas.administrar`) | `GET`/`POST /clientes/{id}/acceso` (la contraseña temporal de 72 h viaja solo en el alta), `PUT /admin/accesos-cliente/{usuarioId}/estado`, `POST /admin/accesos-cliente/{usuarioId}/contrasena` (idempotente). |
| Administrador del catálogo (`catalogos.administrar`) | `GET /admin/referencias-estimacion` (con los insumos sin referencia), `PUT /admin/referencias-estimacion/{insumo}`, `POST …/{insumo}/retiro`, `GET`/`PUT /admin/trabajos-cliente`. |

## Datos de presentación

`pnpm --filter @softarq/api db:cargar-clientes-demo` (solo `softarq_dev`, tras un respaldo verificado) carga tres trabajos (Cubierta, Losa y Muro), los precios de referencia de los ejemplos de la fase 1, tres clientes ficticios con sus proyectos y su acceso. Es idempotente y no restablece contraseñas existentes. Las credenciales nuevas van a `_work\secrets\accesos-clientes-demo-softarq_dev.json` (fuera de Git); nunca se muestran en consola.
