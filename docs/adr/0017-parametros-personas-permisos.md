# ADR-0017 — Parámetros y personas, migración protegida, permisos efectivos e impacto en versiones

- **Fecha:** 17/10/2026.
- **Estado:** aceptado para el DEMO local. Plan aprobado por el propietario en esta sesión (módulo 13), con dos decisiones explícitas (§2).
- **Commits:** A, correcciones previas (`b3b785d`: §3 a §5); B, módulo 13 (§6 a §9).
- **Relación con otros ADR:**
  - continúa el ADR-0007 (sesiones, Argon2id, CSRF): no lo sustituye;
  - continúa el ADR-0012 (respaldo): `db:migrar` exige un respaldo verificado;
  - continúa los ADR-0015 y ADR-0016 (administración de catálogos): reutiliza revisión optimista, idempotencia, bitácora e impacto;
  - no cambia BL-17 (ADR-0009), la emisión sin recalcular (ADR-0010) ni las excepciones por versión (ADR-0014).

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar (copia del libro en `_work\tmp\m12`). El MD5 del libro coincide antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

| Fuente | Qué aporta |
|---|---|
| VBA `modConfig.bas`: `Param`, `ParamEf`, `BTN_Parametros`, `Param_Guardar`, `Cfg_AyudaTipo` | Parámetros editables, tipos (PCT 0..1, ENTERO > 0, TEXTO_LARGO, LISTA) y motivo obligatorio |
| `BTN_Personas`, `Persona_Guardar`, `Req_Funcion FN_ADMSIS` | Alta, cambio de funciones, baja y reactivación con motivo, solo el Administrador del sistema |
| `tblParametros`, `tblPersonas`, `tblContadores` | Claves (RECARGO_PCT, IMP_*, VIGENCIA_DIAS, TEXTO_*, DEMO_*, AMBIENTE, MONEDA, RUTA_*), personas y contadores |
| Word v1.3 §1.3, §3.6, B-38, B-39, D-09, D-11, D-16, D-18 | Funciones, parámetros, plantillas de texto, moneda fija |

## 2. Decisiones del propietario

1. **Contraseña temporal y cambio obligatorio.**
   - El servidor genera la contraseña (`generarContrasena`: 18 bytes aleatorios, 24 caracteres base64url) y guarda solo su hash Argon2id (ADR-0007).
   - Se muestra **una sola vez**, en la respuesta del alta o del restablecimiento (`Cache-Control: no-store`, como toda la API). Nunca aparece en listados, detalles, bitácora, registros, almacenamiento del navegador ni respuestas de idempotencia.
   - **Caducidad: 72 horas** (`LIMITES_ADMINISTRACION.horasContrasenaTemporal`). Plazo suficiente para una entrega manual en días hábiles y corto para limitar una temporal olvidada. Caducada: 401 `CONTRASENA_TEMPORAL_CADUCADA` (solo tras comprobar la contraseña, para no revelar nada a quien no la conoce).
   - **Reintento con la misma `Idempotency-Key`:** devuelve la persona con `contrasenaTemporal: null` y `contrasenaEntregada: true`. No genera otra. No existe ninguna operación para recuperarla: si se perdió, hace falta un restablecimiento explícito.
   - **Restablecer:** invalida la temporal anterior (hash nuevo) y revoca **todas** las sesiones de la persona (motivo `RESTABLECIMIENTO`). Nadie restablece su propia contraseña por esta vía (`AUTOPROTECCION`).
   - **Sesión restringida:** con la temporal vigente, la guardia de la API (no la web) solo admite `GET /auth/sesion`, `POST /auth/contrasena` y `DELETE /auth/sesion`; el resto responde 403 `CAMBIO_CONTRASENA_REQUERIDO`. Las capacidades de esa sesión se reducen a `sesion.propia`.
   - **Cambio propio** (`POST /auth/contrasena`): contraseña actual, nueva y confirmación; nueva de al menos 12 caracteres y distinta de la actual (sin reglas de composición, como recomienda NIST SP 800-63B); CSRF y limitadores existentes. Al terminar borra la temporal y revoca todas las sesiones (motivo `CAMBIO_CONTRASENA`), también la actual; hay que volver a entrar.
   - **Sin migración de cuentas:** ni la migración ni la carga DEMO cambian contraseñas existentes ni fuerzan restablecimientos. Entrega manual; sin correo, registro público, recuperación pública ni servicios externos.
2. **Textos: plantillas editables por el Administrador del sistema.**
   - `TEXTO_ALCANCE`, `TEXTO_CONDICIONES` y `TEXTO_EXCLUSIONES` pasan a columnas de `parametros_calculo`. La migración guarda en las organizaciones DEMO **exactamente** los textos DEMO que ya usaba el código (`TEXTOS_DEMO`).
   - **Relación plantilla → borrador → versión:**
     - al crear una cotización, la plantilla se **copia** a su captura (copia independiente);
     - el Preparador sigue editando los textos de su borrador;
     - la versión calculada los congela (BL-20);
     - cambiar la plantilla solo afecta a cotizaciones creadas después; ningún borrador, versión ni PDF existente cambia.
   - Texto plano, sin vacíos, máximo 2000 caracteres; los tres juntos o ninguno (CHECK `parametros_textos_ck`).
   - La carga DEMO repetida no sobrescribe plantillas editadas; una organización nueva recibe los valores iniciales.

## 3. Migración protegida (commit A)

- `scripts/db/secuencia-migracion.mjs` (`migrarConRespaldo`, dependencias inyectadas): crear el respaldo, verificarlo y solo entonces migrar. Cualquier fallo o resultado incompleto detiene el proceso con código distinto de 0 **sin** llamar a la migración.
- `db:migrar` (sin `--test`, `softarq_dev`) usa `crearRespaldo` y `exigirRespaldoValido`; no hay opción para saltarlo. `softarq_test` sigue con `preparar-base.ts`, y la prueba de restauración mantiene su procedimiento aislado (`softarq_restauracion`).
- La prueba con datos reales trabaja sobre una **copia** del último respaldo en `_work\tmp`, con un byte alterado: el SHA-256 falla y la migración no se llama. Los respaldos reales no se tocan.
- **Límite:** protege `db:migrar`. No impide `prisma migrate deploy` manual ni SQL administrativo.

## 4. Permisos efectivos (commit A y módulo 13)

**Cambios acotados en `softarq_app`:**
- sin UPDATE en `organizacion` y `tipo_adicional`, que la aplicación no usaba;
- en `parametros_calculo`, UPDATE solo de las columnas editables (nunca organización, ambiente ni moneda);
- sin UPDATE de `estado`, `aprobado_por` ni `aprobado_en` de `concepto`. Aprobar solo ocurre dentro de `softarq_aprobar_concepto` (SECURITY DEFINER) y el disparador rechaza el paso a Aprobado si el usuario de base es `softarq_app`. Desaparece la marca GUC del ADR-0016 §5, que cualquiera podía fijar con `set_config`;
- la carga DEMO aprueba con `softarq_aprobar_carga_base` (DEFINER): solo organizaciones `es_demo`, solo conceptos insertados en la transacción en curso, con los requisitos completos;
- identidad: sin INSERT ni UPDATE en `usuario` y `membresia`. Escribe solo con las funciones DEFINER del §7.

Las funciones DEFINER pertenecen al rol migrador, tienen `search_path = public, pg_temp`, no se ejecutan desde PUBLIC y exigen función y organización. No se concede DDL, propiedad, DELETE ni TRUNCATE.

**Matriz de garantías:**

| Garantía | PostgreSQL | API | Capacidad residual de una credencial de aplicación comprometida |
|---|---|---|---|
| Organización | FK compuestas; funciones filtran por organización | La organización sale de la sesión | Lee todas las organizaciones (SELECT) |
| Función o permiso | `softarq_exigir_funcion` en cada función | Capacidades en cada petición | Las funciones confían en el `p_usuario` recibido: puede actuar como cualquier miembro |
| Aprobar concepto | Solo dentro de la función DEFINER, con requisitos | Revisión técnica y requisitos | Aprobar, como otro Administrador, un concepto que cumpla los requisitos |
| Parámetros | Columnas editables por UPDATE; CHECK de rangos | `parametros.administrar`, revisión, motivo | Cambiar recargo, impuesto, vigencia o textos sin pasar por la función (sin bitácora) |
| Versiones, emisiones, respuestas | Inmutables (disparadores; sin UPDATE ni DELETE) | — | Insertar filas válidas para esos disparadores |
| Bitácora | Solo INSERT | — | Insertar eventos falsos |
| Sesiones | INSERT y columnas de revocación | Hash del token, CSRF | Crear una sesión para cualquier usuario: **límite de arquitectura**. La aplicación autentica, así que una credencial comprometida equivale a suplantar |
| Identidad | Sin escritura directa; funciones DEFINER; disparador del último administrador | `personas.administrar` | Llamar a esas funciones afirmando ser un Administrador del sistema |
| DDL, DELETE, propiedad | No concedidos | — | Ninguna |

**No resuelto (tarea posterior propuesta):** que las funciones resuelvan la identidad desde el hash del token de sesión en lugar de `p_usuario`, y separar la autenticación en otro rol. Es un rediseño amplio; aquí no se presenta como resuelto. Tampoco hay RLS.

## 5. Impacto en versiones (commit A)

- `impacto-versiones.ts`: una consulta de solo lectura sobre cotizaciones `ACTIVO` y su **última** versión (`entrada_calculo` y `captura`), por organización y con la capacidad que corresponda.
- Clasifica: `borradores` (el borrador guardado usa el registro), `sinEnviar` (última versión calculada sin revisión pendiente ni aprobada; incluye devueltas y retiradas), `enRevision` (PENDIENTE), `aprobadasSinEmitir` (BL-16 bloquea emitir) y `cotizaciones` (distintas, sin repetir). Las emitidas no cuentan.
- Concepto, precio, tarifa, insumo y conversión usan sus criterios; los parámetros afectan a todas las cotizaciones abiertas.
- Consultar no cambia nada; el servidor revalida al enviar, aprobar y emitir.

## 6. Parámetros (B-38)

| Campo | Fuente | Decisión |
|---|---|---|
| RECARGO_PCT | PCT 0..1 o vacío (BL-12) | Editable; vacío = no definido (bloquea el cálculo), distinto de 0 |
| IMP_TASA, IMP_BASE, IMP_TRATAMIENTO, IMP_NOMBRE | PCT; LISTA_BASE (SUBTOTAL_VENTA); TEXTO (BL-13) | Editables como grupo: los cuatro o ninguno |
| VIGENCIA_DIAS | ENTERO > 0 (D-11) | Editable (1 a 3650) |
| TEXTO_* | TEXTO_LARGO (D-16) | Plantillas (§2.2) |
| AMBIENTE | LISTA_AMBIENTE | **Solo lectura:** una organización DEMO no pasa a PRODUCCION |
| MONEDA | FIJO (D-18) | Solo lectura (MXN) |
| EMISOR_* | 17 CONFIG | Módulo 8 (`emisor.configurar`), enlazado desde la pantalla |
| CONSOLIDAR_PREDETERMINADO | SINO (D-09) | Excluido: se mantiene la elección explícita en cada cotización |
| RUTA_*, LIBRO_VERSION | 17 CONFIG | Excluidos: infraestructura |
| DEMO_* | `ParamEf` | Sin duplicar: cada organización guarda un único juego de valores efectivos |
| Contadores | `tblContadores` | No editables |

- `softarq_editar_parametros` (INVOKER, columnas mínimas): exige ADMIN_SISTEMA y la revisión (409 con el registro vigente); bitácora `PARAMETROS_EDITADOS` con valor anterior y nuevo por campo, autor, fecha y motivo.
- **Efecto:** solo cálculos y cotizaciones nuevos. Las versiones calculadas antes quedan bloqueadas por BL-16 al enviar, aprobar o emitir (huella de parámetros); versiones y PDF no cambian.
- **Web:** el porcentaje se captura en % y se muestra la fracción que se guarda (20 % = 0.2; conversión de texto a texto, sin redondeo). Antes de guardar, el impacto; un conflicto conserva lo escrito.

## 7. Personas y funciones (B-39)

- **Modelo:** `usuario` global (correo único, no editable: otro correo es otra persona); `membresia` por organización con funciones, `activa` y revisión. La administración actúa sobre la pertenencia de su organización. Un correo ya registrado responde 409 `CORREO_EXISTENTE` sin revelar la organización.
- **Capacidad `personas.administrar`:** solo ADMIN_SISTEMA. ADMIN_CATALOGO no la recibe y el Administrador del sistema no administra el catálogo.
- **Funciones DEFINER** `softarq_crear_persona`, `softarq_editar_persona`, `softarq_restablecer_contrasena` y `softarq_cambiar_contrasena_propia`: exigen ADMIN_SISTEMA activo (salvo el cambio propio), bloquean la fila de la organización para serializar cambios concurrentes y escriben bitácora `PERSONA_*` sin credenciales.
- **Último Administrador del sistema:** la organización conserva al menos una pertenencia activa con ADMIN_SISTEMA de un usuario activo (422 `ULTIMO_ADMINISTRADOR`). Nadie se retira esa función ni se desactiva a sí mismo (422 `AUTOPROTECCION`). Un disparador AFTER sobre `membresia` lo vuelve a exigir, también ante SQL directo del migrador.
- **Revocaciones:**
  - desactivar revoca las sesiones de la persona **en esa organización** (`DESACTIVADA`);
  - retirar funciones surte efecto en la petición siguiente: la sesión relee funciones y estado en cada petición; no se revoca;
  - restablecer y cambiar la propia contraseña revocan todas sus sesiones.
- **Carga DEMO repetida:** conserva las cuentas y solo crea las que faltan; no restaura funciones, pertenencias ni contraseñas.
- **Se conservan:** BL-17 por identidad aunque una persona tenga varias funciones; aprobación de conceptos por cualquier ADMIN_CATALOGO; excepciones por versión; selección explícita de precios; emisión sin recalcular; versiones y PDF inmutables. Los cinco conceptos heredados no se tocan; P3 sigue pendiente.

## 8. Diferencias con el libro

| Libro | Web DEMO | Motivo |
|---|---|---|
| AMBIENTE editable | Solo lectura | Una organización DEMO no debe presentar datos DEMO como reales |
| CONSOLIDAR_PREDETERMINADO | No existe | La elección explícita por cotización (módulo 4) evita totales inesperados |
| DEMO_* y valores reales en la misma hoja | Un juego de valores por organización | La organización ya distingue DEMO de producción |
| `Usuario()` elige la persona en turno («no es un control de seguridad») | Identidad de la sesión autenticada | La identidad debe ser verificable |
| Alta sin contraseña | Contraseña temporal con cambio obligatorio | Hay inicio de sesión real (ADR-0007) |
| Nombre editable por organización | Nombre global de la persona | `usuario` es global; la pertenencia es por organización |
| Persona dada de baja | Pertenencia desactivada en la organización | Conserva historial y autoría |

## 9. Persistencia, respaldo y restauración

- Migración `20261019120000_parametros_personas`: columnas (`texto_*`, `revision`, `modificado_por/en`, `contrasena_temporal_expira_en`, `membresia.revision`, `modificada_por/en`), CHECK, disparador, funciones y permisos (`permisos-app.sql`, bloque condicional para restaurar respaldos anteriores).
- `probar-restauracion.mjs` comprueba: textos y autoría coherentes; sin escritura directa de identidad; columnas editables mínimas; 6 funciones DEFINER y el disparador; parámetros, personas, funciones e historial idénticos al origen (incluidos hashes y caducidades, sin mostrarlos); ninguna sesión activa; la temporal solo existe como hash y caducidad.

## 10. Consecuencias

- El Administrador del sistema gestiona parámetros y personas desde la web, sin consola.
- La entrega de la temporal es manual: si se pierde, se restablece.
- Queda documentado y sin resolver el límite de arquitectura del rol de la aplicación (§4).
