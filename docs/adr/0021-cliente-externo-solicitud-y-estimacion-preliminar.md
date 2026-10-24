# ADR-0021 — Cliente externo en la app móvil: solicitud, estimación preliminar y cotización formal

- **Fecha:** 24/10/2026
- **Estado:** aceptada como dirección de producto (plan aprobado por el propietario el 24/10/2026). **Aún no implementada**: se construye por etapas (E1 servidor, E2 app, E3 panel, E4 presentación). Este ADR se actualiza al cerrar cada etapa.
- **Ámbito:** `apps/api` (módulo `cliente`, referencias y trabajos, atender solicitud), `packages/contracts` (`@softarq/contracts/cliente`), `apps/mobile`, `apps/web` (bandeja, solicitudes, accesos, referencias, trabajos).
- **Sustituye en parte a:** ADR-0020 §3 (la app deja de ser una consulta interna de solo lectura), `docs/modelo-conceptual.md` («el cliente no tiene cuenta») y la fila «Portal del cliente» de `docs/cobertura-demo.md` (solo la app del cliente entra en el alcance; sin correo, firma ni portal web).
- **Conserva:** ADR-0013 (el Preparador sigue registrando la respuesta del cliente a una cotización emitida), ADR-0008 a ADR-0010 (versiones, revisión, emisión) y el motor de cálculo (ADR-0003).

## Contexto

La app solo consultaba registros internos. El producto es otro: la **app es del cliente** que quiere su cotización y el **panel es del equipo** que la prepara, revisa y emite. Comparten negocio y datos, pero no pantallas. El motor no calcula sin un precio elegido por insumo (BL-08), y esa regla se conserva.

## Decisiones

### 1. Identidad del cliente
- Tabla `acceso_cliente` (usuario ↔ cliente de una organización). Un usuario es **interno (membresía) o cliente, nunca ambos**. El cliente no recibe las funciones Preparador, Revisor ni Administrador.
- Capacidades propias (`cliente.*`), calculadas solo en la API. `cliente_id` y `organizacion_id` salen siempre de la sesión, nunca del teléfono. Un identificador ajeno responde 404.
- Acceso: **por invitación del equipo**, sin autorregistro. El Administrador del sistema crea el acceso desde la ficha del Cliente, con contraseña temporal de 72 h y cambio obligatorio (ADR-0017). El cliente cambia su contraseña desde la app. Sin correo ni enlaces de invitación.
- La app admite **solo** cuentas cliente. Una cuenta interna recibe una explicación y la dirección del panel; no se crea sesión.
- Las rutas internas dejan de marcarse `@PermitidaEnMovil()`; el panel conserva sus capacidades y endpoints.

### 2. Estimación preliminar frente a cotización formal

| | Estimación preliminar | Cotización formal |
|---|---|---|
| Quién | Cliente | Equipo |
| Precios | Referencias designadas | Elegidos y confirmados por el Preparador, por insumo |
| Revisión y aprobación | No | Sí (revisor distinto, BL-17) |
| Identificador | `SOL-AAAA-NNNNN` (solicitud) | `COT-AAAA-NNNNN`; PDF emitido |
| Rótulo | «Estimación preliminar, no es una cotización» | Estado y vigencia formales |

### 3. Precios de referencia para estimaciones
- El Administrador del catálogo **designa explícitamente** una referencia por insumo (motivo y bitácora). Debe ser compatible con el insumo, de producto y proveedor activos, con precio vigente y no anulado; se revalida al estimar.
- La API arma `preciosElegidos` con esas referencias y usa el motor sin cambios. **No** se elimina BL-08 y **nunca** se elige el precio menor. Los parámetros ausentes bloquean; no se sustituyen.
- Si falta una referencia válida o el motor bloquea: «El equipo completará la valoración». Sin cero ni importe inventado.
- Cada estimación es una instantánea inmutable con captura, referencias usadas, parámetros, fecha y huella. Al cliente solo se le entrega la proyección comercial (sin costos, proveedores, consumos, recargo, margen ni excepciones, D-16).

### 4. Solicitud y atención
- «Calcular» nunca envía. El cliente revisa y pulsa «Enviar solicitud», con o sin estimación. Puede editar y recalcular mientras es borrador, y retirarla mientras no se atienda.
- El equipo «atiende» la solicitud: se crea una cotización con origen `APP_CLIENTE`, con conceptos y medidas del cliente y **sin precios elegidos**. Las referencias de estimación **no se heredan**: el Preparador confirma explícitamente cada precio.
- Estados de la solicitud: BORRADOR, ENVIADA, EN_PREPARACION, COTIZADA, RETIRADA.
- El cliente ve la cotización formal y descarga su PDF **solo** cuando está emitida (versión EMITIDA de una cotización de su Cliente).

### 5. Decisiones técnicas que no se trasladan al cliente
Los «trabajos para clientes» (Cubierta, Losa, Muro…) traducen la decisión técnica: cada trabajo y opción apunta a un concepto aprobado y fija `consolidarCompras`. El cliente solo ve nombres comprensibles y las medidas que la fórmula exige.

## Consecuencias
- Migración aditiva; las versiones emitidas y los datos históricos no cambian.
- Las pruebas del canal móvil de la etapa 1 (interno en móvil) se sustituyen por «interno rechazado con indicación del panel». Se conservan y amplían las de aislamiento entre clientes.
- **Pendiente para publicar en Railway (no incluido en esta etapa):** TLS, cookie `Secure`/`__Host-`, `EXPO_PUBLIC_API_URL` https y APK `preview` nueva, límites contra abuso, restablecimiento de contraseña, identidad de las funciones SQL (ADR-0017 §4), respaldos y CORS. El acceso local no resuelve nada de esto.
- Abierto (no bloquea E0–E1): respuesta del cliente (aceptar o rechazar) desde la app; separación de datos de presentación (propuesta: `registro_de_pruebas` aditivo); visibilidad de cotizaciones formales no originadas en una solicitud (recomendado: sí, las emitidas de su Cliente).
