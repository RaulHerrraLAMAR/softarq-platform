# ADR-0021 — Cliente externo en la app móvil: solicitud, estimación preliminar y cotización formal

- **Fecha:** 24/10/2026
- **Estado:** aceptada. **E1 (servidor) y E2 (app del cliente) implementadas** el 24/10/2026: migración `20261024200000_cliente_solicitudes`, API, contratos, pruebas y la app (sin verificar aún en el teléfono). Las pantallas del panel (E3) **no** están implementadas: lo que sigue de este ADR sobre ellas es el diseño aprobado, no código existente.
- **Ámbito:** `apps/api` (módulo `cliente`: identidad, solicitudes, estimación, atención, referencias y trabajos), `packages/contracts` (`@softarq/contracts/cliente`), y más adelante `apps/mobile` y `apps/web`.
- **Sustituye en parte a:** ADR-0020 §3 (la app deja de ser una consulta interna de solo lectura), `docs/modelo-conceptual.md` («el cliente no tiene cuenta») y la fila «Portal del cliente» de `docs/cobertura-demo.md` (solo la app del cliente entra en el alcance; sin correo, firma ni portal web).
- **Conserva:** ADR-0013 (el Preparador sigue registrando la respuesta del cliente a una cotización emitida), ADR-0008 a ADR-0010 (versiones, revisión, emisión) y el motor de cálculo (ADR-0003), que no cambió.

## Contexto

La app solo consultaba registros internos. El producto es otro: la **app es del cliente** que quiere su cotización y el **panel es del equipo** que la prepara, revisa y emite. Comparten negocio y datos, pero no pantallas. El motor no calcula sin un precio elegido por insumo (BL-08), y esa regla se conserva.

## Decisiones

### 1. Identidad del cliente (implementado)
- La cuenta de un cliente es un `usuario` con una `membresia` de función **exclusiva `CLIENTE`** y un `acceso_cliente` que la vincula con **un** Cliente (y un Cliente, una cuenta). *Desviación del borrador del plan:* no es una identidad aparte de la pertenencia, porque las sesiones se ligan por clave foránea compuesta a la pertenencia y así se reutilizan, sin cambios, la sesión, la contraseña temporal y la desactivación. La exclusividad se impone en la base: un CHECK impide mezclar `CLIENTE` con funciones internas, y disparadores diferidos exigen que toda pertenencia `CLIENTE` tenga su acceso y que toda cuenta con acceso conserve solo esa función (ni el rol migrador puede romperlo).
- Capacidades propias (`cliente.solicitudes`, `cliente.cotizaciones`) que ninguna función interna recibe; `CLIENTE` no recibe ninguna interna. La API las calcula; el teléfono no decide permisos.
- **Propiedad:** el cliente sale siempre de la base (`softarq_exigir_cliente`: cuenta, pertenencia y cliente activos con función exclusiva `CLIENTE`), recalculado en cada operación; no viaja del teléfono. Los contratos son estrictos: un cuerpo con `clienteId`, `organizacionId`, `estado` o funciones se rechaza (400). Un registro ajeno, o de otra organización, responde 404 igual que uno inexistente. Si la cuenta pierde el acceso con la sesión abierta, la siguiente operación responde 403 (o 401 si se revocaron sus sesiones).
- **Acceso por invitación del equipo**, sin autorregistro: el Administrador del sistema lo crea desde el Cliente (`POST /clientes/{id}/acceso`) con contraseña temporal de 72 h y cambio obligatorio; la contraseña se entrega una sola vez (sin caché) y en la base queda su hash Argon2id. Puede desactivarse (revoca sus sesiones) y restablecerse (idempotente). La app cambia la contraseña con el mismo `POST /auth/contrasena` de siempre.
- **Aislamiento de canales:** una cuenta de cliente no abre sesión web (responde como credencial inválida) y una cuenta interna no abre sesión móvil: con la contraseña correcta recibe `403 CUENTA_INTERNA_USE_PANEL` con la dirección del panel (`API_PANEL_URL`, por omisión el primer origen permitido) y sin sesión. Una sesión que cambia de tipo de cuenta se revoca en la siguiente solicitud. Las rutas internas (clientes, proyectos, cotizaciones, versión, catálogo) dejan de estar marcadas `@PermitidaEnMovil()`: con Bearer responden 403 `RUTA_NO_DISPONIBLE_EN_MOVIL`.
- La administración de personas no lista ni edita cuentas de cliente y no puede asignar la función `CLIENTE`.

### 2. Estimación preliminar frente a cotización formal (implementado)

| | Estimación preliminar | Cotización formal |
|---|---|---|
| Quién | Cliente, en la app | Equipo, en el panel |
| Precios | Referencias designadas | Elegidos y confirmados por el Preparador, por insumo |
| Revisión y aprobación | No | Sí (revisor distinto, BL-17) |
| Identificador | `SOL-AAAA-NNNNN` (solicitud) | `COT-AAAA-NNNNN`; PDF emitido |
| Rótulo | «Estimación preliminar, no es una cotización» | Estado y vigencia formales |

### 3. Precios de referencia para estimaciones (implementado)
- El Administrador del catálogo **designa explícitamente** una referencia por insumo, con motivo y bitácora (`REFERENCIA_DESIGNADA/RETIRADA`). La base exige que el precio sea de un producto de ese insumo, esté vigente a la fecha de negocio, no esté anulado y tenga producto y proveedor activos. Una activa por insumo (índice parcial); las sustituidas quedan como historial.
- La estimación **vuelve a comprobarlo** a su fecha de cálculo: una referencia que dejó de ser válida (anulada, vencida, producto o proveedor inactivo) no se usa ni se sustituye por otra.
- La API arma `preciosElegidos` con esas referencias y llama al motor **sin cambios**: BL-08 y las demás validaciones siguen; nunca se elige el precio menor; los parámetros ausentes bloquean. Verificado: la estimación coincide con la calculadora del Preparador aplicada a las mismas medidas y precios.
- Si falta una referencia válida o el motor bloquea, **no hay importe**: la estimación queda `SIN_ESTIMACION` con un motivo comprensible (`FALTA_REFERENCIA`, `PARAMETROS`, `CONFIGURACION`, `MEDIDAS`), nunca un cero. Los avisos del cálculo (que mencionan precios y compras) no se envían al cliente.
- Cada estimación es una instantánea **inmutable** (disparador): captura, referencias usadas, parámetros, fecha, huella y proyección comercial; `entrada` y `resultado` (con costos) se guardan para explicar el resultado y **nunca** salen de la API. Al cliente solo llega la proyección comercial (D-16). Si se edita la captura, la estimación anterior queda `desactualizada`.

### 4. Solicitud y atención (implementado)
- **Una solicitud = un proyecto u obra, con varios trabajos.** Obras distintas son solicitudes independientes.
- «Calcular» nunca envía. El cliente guarda su progreso (control de concurrencia por revisión; admite capturas incompletas pero no inválidas), estima cuantas veces quiera mientras sea borrador y envía con o sin estimación, pero no con la captura incompleta. **Enviar es idempotente**: un reintento o un doble toque simultáneo devuelve la solicitud ya enviada con `repetida: true` y no repite el evento. Puede retirarse mientras no la atienda el equipo (también idempotente). Enviada, su captura es inmutable también en la base.
- Estados: BORRADOR, ENVIADA, EN_PREPARACION, RETIRADA; «cotizada» **se deriva** de que su cotización ya tenga una emisión (no se guarda, para no tocar la emisión).
- **Huecos** (ventanas, tragaluces…): renglones de medición con signo «−» que se restan de la cantidad; no son descuentos comerciales. Solo se admiten si el concepto permite descuentos (`permiteDescuento`); lo decide el catálogo. Las validaciones de captura del motor se conservan.
- El Preparador **atiende** la solicitud (`POST /solicitudes/{id}/atencion`, idempotente): se crea una cotización con las medidas del cliente y **sin precios elegidos ni compras consolidadas** (`consolidarCompras: null`, `seleccion: []`); las referencias de la estimación **no se heredan**. Los textos iniciales salen de las plantillas de la organización. *Desviación del borrador del plan:* la cotización conserva `origen = WEB_DEMO` (lo exigen los CHECK de la emisión) y su vínculo con la solicitud es `cotizacion.solicitud_id`, que además es único.
- **Consulta de cotizaciones del cliente:** todas las **emitidas** vinculadas a su Cliente dentro de su organización, aunque se hayan preparado desde el panel sin solicitud (decisión del propietario, 24/10/2026). Se muestra la última emisión de cada cotización activa, con su proyección comercial y su PDF (los mismos bytes registrados). Nunca borradores, versiones de trabajo, costos, márgenes, la bitácora técnica ni quién preparó, aprobó y emitió. El solicitante no puede alterar la relación cuenta–Cliente: sale del acceso creado por el equipo y se recalcula en cada petición.

### 5. Trabajos para clientes (implementado)
Cada trabajo (Cubierta, Losa, Muro) y opción apunta a **un** concepto aprobado y fija `consolidarCompras` para la estimación. Las medidas que se piden salen de la fórmula del concepto: por área, largo y **una** segunda medida (ancho o alto, nunca ambas); por volumen, largo, ancho y alto; el Administrador del catálogo no puede guardar una opción incoherente, y una opción que deje de serlo se oculta. El teléfono no duplica el motor: recibe las medidas, etiquetas y ayudas del servidor. Con varios trabajos en una solicitud, `consolidarCompras` de la estimación es verdadero solo si todas las opciones lo tienen así (el motor admite un único valor por cálculo).

## Consecuencias
- Migración aditiva y probada; no modifica datos, versiones, emisiones ni documentos existentes. Las pruebas de la etapa 1 que probaban a una cuenta interna en la consulta móvil se **sustituyen** por «cuenta interna → `CUENTA_INTERNA_USE_PANEL`» y «rutas internas no disponibles en móvil»; se conservan y amplían las de aislamiento.
- La app de la etapa 1 (consulta interna) **ya no funciona** contra esta API (sus cuentas internas reciben 403); se reemplaza en E2.
- **Pendiente para publicar en Railway (no incluido):** TLS, cookie `Secure`/`__Host-`, `EXPO_PUBLIC_API_URL` https y APK `preview` nueva, límites contra abuso (el alta de proyectos y solicitudes de un cliente no tiene tope por cuenta), restablecimiento de contraseña por el propio cliente (hoy solo por el Administrador), identidad de las funciones SQL (ADR-0017 §4: las funciones de cliente reciben el usuario desde la API; la base lo recomprueba pero no autentica por sí misma), respaldos y CORS. El acceso local no resuelve nada de esto.
- Abierto: respuesta del cliente (aceptar o rechazar) desde la app, etapa posterior; separación de datos de presentación frente a los de humo (propuesta: `registro_de_pruebas` aditivo, E4); edición de un proyecto propio desde la app.

## Implementación de la app del cliente (E2, 24/10/2026)

**Recorrido:** acceso → inicio → nueva cotización (proyecto) → trabajo → medidas → resumen editable → estimación → envío → seguimiento → cotización formal y PDF. Cada solicitud es de **un proyecto** (se elige uno propio o se registra una obra nueva con su descripción) y de **varios trabajos** (Cubierta, Losa, Muro, tal como los ofrece el servidor); los huecos existen solo donde la opción los admite. El borrador se crea en el servidor al continuar del primer paso y se guarda solo.

**Reglas que el controlador de la solicitud (`apps/mobile/src/captura/controlador.ts`) hace cumplir:**

- **Autoguardado de un solo vuelo**, con pausa de ~800 ms y siempre con la revisión vigente; nunca hay dos guardados a la vez. Una medida mal escrita no se rechaza: viaja como «sin capturar» (el servidor la cuenta pendiente) y el campo conserva lo escrito.
- **Conflicto (409 `CONFLICTO_EDICION`):** no se sobrescribe en silencio. La app detiene el guardado, trae la versión del servidor y la persona elige «usar la guardada» o «conservar mis cambios» (que se guardan sobre la versión más reciente). Si la versión del servidor ya es idéntica a la que se iba a guardar (respuesta perdida), se adopta sin preguntar.
- **Estimación vigente solo para la captura que la produjo.** El importe lo calcula la API; la app no calcula nada. Si cambia algo que afecta al cálculo (o ya se guardó otra revisión), la estimación pasa a «hace falta recalcular» y **no se muestra el importe anterior**; una respuesta que llega tarde de otra captura se descarta. Sin referencia de precio no hay importe (`SIN_ESTIMACION`, nunca un cero) y la solicitud se puede enviar igual.
- **Envío:** calcular y enviar son acciones separadas; una sola acción de envío en curso (doble toque); la hoja de confirmación explica que después ya no se edita. Si se pierde la respuesta, la app consulta la solicitud y, si ya está enviada, lo da por hecho; el reintento es idempotente en el servidor (`repetida`).
- **Descripción de la obra obligatoria** al registrar un proyecto desde la app: la emisión del equipo la exige (BL-02) y el cliente no podría saberlo.

**Diferencias con el prototipo aprobado (por rendimiento y accesibilidad):** el croquis ya no interpola las medidas cuadro a cuadro (se redibuja al asentarse lo escrito); las cotas son botones nativos encima del dibujo; el número de líneas de detalle tiene un tope fijo que no depende de la medida; la barra inferior no lleva la muesca superior. Detalle en [ADR-0022](0022-identidad-visual-obra-calida-y-paquete-de-presentacion.md).

**Pendiente o abierto tras E2:** panel del equipo por tareas (E3), con la bandeja de solicitudes y el restablecimiento de contraseñas de cliente en pantalla; las contraseñas temporales de los tres accesos demo caducan el 27/10/2026 y hoy solo se restablecen por la API; verificación en el teléfono (guía §10); aceptar o rechazar la cotización desde la app (etapa posterior).


## Implementación del panel (E3, 31/10/2026)

- **Panel:** `Mi trabajo` por función; `Solicitudes` (bandeja con filtros Por atender, En preparación, Cotizadas y Retiradas; detalle con lo capturado y la estimación rotulada «Estimación preliminar, no es una cotización»; «Atender» idempotente que lleva a la cotización en borrador **sin precios elegidos**); acceso del cliente a la app desde su ficha (`personas.administrar`: crear, desactivar o reactivar y restablecer, con motivo; la contraseña temporal se ve una sola vez); y «Precios de referencia» en el catálogo (`catalogos.administrar`: designar, reemplazar y retirar con motivo).
- **Cambio de API:** `GET /solicitudes` admite `estado=COTIZADA` y `GET /solicitudes/{id}` la devuelve **derivada**, con la misma regla que ve el cliente (la cotización de la solicitud ya tiene una emisión). `EN_PREPARACION` solo trae las que aún no se emitieron. No se guarda ningún estado nuevo ni hay migración.
- **Paso de precios:** el editor existente ya exige la elección explícita (indicador «Opciones disponibles — falta elegir N» y cálculo bloqueado); no se duplicó.
- **Pendiente de E3:** definición de trabajos para clientes en pantalla (solo API), enlace desde la cotización hacia su solicitud de origen (hoy solo del lado de la solicitud), separación de datos de presentación frente a QA/humo (E3.8/E4: propuesta `registro_de_pruebas` aditivo).
