# ADR-0016 — Catálogo técnico: insumos, conversiones, tipos de estructura, conceptos y componentes, con aprobación de conceptos

- **Fecha:** 17/10/2026.
- **Estado:** aceptado para el DEMO local. Plan aprobado por el propietario en esta sesión (módulo 12), con cuatro decisiones explícitas (§2).
- **Relación con otros ADR:**
  - continúa el ADR-0015 (administración de catálogos) y usa sus piezas: capacidad `catalogos.administrar`, `softarq_normalizar`, contador con salto de códigos, revisión optimista, idempotencia y bitácora;
  - complementa el ADR-0004 (persistencia de catálogos), el ADR-0009 (revisión; BL-17 no cambia), el ADR-0012 (respaldo) y el ADR-0014 (excepciones; concepto personalizado).

## 1. Fuentes

Todas en `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar (copia del libro en `_work\tmp\m12`). El MD5 del libro coincide antes y después: `b60debc121957b8d8e3f2c2edd9a5b4f`.

| Fuente | Qué aporta |
|---|---|
| VBA `modCatalogos.bas`: `Cat_Campos`, `Cat_Guardar`, `Cat_Duplicado` | Campos y botones de insumo, conversión, tipo de estructura, concepto y componente; duplicados con `Normalizar` |
| `Val_Insumo`, `Val_Conversion`, `Val_TipoEst`, `Val_Concepto`, `Val_Componente` | Validaciones y mensajes (§3) |
| `Concepto_Problemas`, `Concepto_Aprobar`, `Concepto_ABorrador`, `BTN_ConceptoActivo`, `BTN_ConceptoAprobar` (`Req_Funcion FN_ADMCAT`) | Requisitos y operación de aprobación; vuelta a Borrador; reactivación |
| `modValidacion.bas` (`Validar`) | BL-04 y **BL-05 de trazabilidad**: componente activo sin fuente, fecha o responsable técnico |
| `tblTiposEstructura`, `tblListas.FAMILIA` | Seis familias y seis tipos genéricos `TES-00001`…`TES-00006` («Genérico - <familia>») |
| `tblConceptos`, `tblInsumos` | `id_tipo`, `regla_medicion`, `criterios_especiales`, `especificacion` de los datos DEMO |
| Word v1.3 §1.3, §3.5, RF-04, RF-08, RF-09 | Funciones del Administrador del catálogo; tarifa; conceptos y componentes con trazabilidad |

## 2. Decisiones del propietario

1. **Conversión en uso: «Editar y volver a Borrador».**
   - Se editan el factor y la fuente, con motivo obligatorio. La unidad de origen y el insumo no cambian (la conversión se identifica por insumo y origen).
   - Antes de confirmar, la pantalla lista los conceptos con un componente activo de ese insumo medido en esa unidad.
   - En la misma sentencia, los conceptos **aprobados** afectados vuelven a Borrador y pierden la aprobación, con `CONCEPTO_A_BORRADOR` en su bitácora y `CONVERSION_EDITADA` (factor anterior, nuevo, motivo y conceptos) en la de la conversión.
2. **Tipos de estructura (dependencia del módulo).**
   - **Datos base, no DEMO:** las seis familias y los seis genéricos del libro, con sus códigos. La carga es idempotente: solo crea los ausentes y nunca sobrescribe ediciones administrativas.
   - **Administración:** crear, editar y activar o desactivar. Duplicado: (familia, `softarq_normalizar(nombre)`).
   - **Familia bloqueada con conceptos** (API y disparador): una clasificación distinta exige otro tipo; los conceptos no se trasladan solos.
   - **Desactivar** (como `Lista_Tipos` y `Concepto_Problemas`): conserva sus conceptos y las referencias históricas; deja de ofrecerse para conceptos nuevos o para reclasificar; impide **aprobar** sus conceptos («tipo inactivo»); **no** bloquea el cálculo.
   - **«Compatible con su familia»:** el libro no define relación entre la clase del concepto y la familia del tipo (CON-00006, PERSONALIZADO, está en TES-00006, pero no hay regla). No se inventa: la compatibilidad exigida es **misma organización** (FK compuesta) y **tipo activo** (API y disparador). Si se quiere «PERSONALIZADO solo en Conceptos personalizados», se añadirá como adaptación.
   - **Unicidad del concepto:** (organización, tipo, `softarq_normalizar(descripción)`), igual que `Cat_Duplicado` por (`id_tipo`, `descripcion`). `softarq_normalizar` es la copia de `Normalizar` del módulo 11: minúsculas, sin acentos, puntuación `. , ; : - _ ' "` como espacio y espacios simples.
3. **Conceptos heredados de la carga anterior.**
   - **Identificación:** la migración marca `heredado = true` en los conceptos que existen al migrar sin tipo ni regla (en `softarq_dev`: CON-00001, CON-00002 y CON-00007 a CON-00009) y lo informa con `RAISE NOTICE`. No rellena ningún dato ni cambia su cálculo; conservan su estado y su aprobación anterior (sin fecha registrada).
   - **La marca no la escribe la aplicación:** sin privilegio de columna para `softarq_app`; el disparador impide marcar un concepto nuevo o volver a marcar uno ya completado. Solo pasa de true a false al completar el concepto.
   - **Editar exige completar:** toda edición técnica del concepto o de sus componentes exige tipo y regla (`CONCEPTO_INCOMPLETO`, 422, con los campos que faltan) y retira la aprobación hasta una nueva.
   - **Pantalla:** «Datos incompletos de la carga anterior» y qué falta; sigue calculando como antes.
   - **Conceptos nuevos:** cumplen todos los requisitos (CHECK `concepto_completo_ck`). Las organizaciones nuevas reciben los conceptos con tipo, regla y criterios del libro, aprobados por la carga base solo al crearlos.
   - **Regla de medición frente a fórmula:** la regla es texto descriptivo para quien mide; el motor calcula con `tipo_formula` y no la interpreta.
   - **Carga repetida:** no completa, no restaura aprobaciones ni sobrescribe ediciones.
   - **Mapeo documentado, no ejecutado** (de `tblConceptos.id_tipo`, sin asignaciones ambiguas), para la regularización explícita del Administrador:

     | Concepto | Tipo genérico |
     |---|---|
     | CON-00001 | TES-00004 Mampostería reforzada |
     | CON-00002 | TES-00002 Concreto reforzado |
     | CON-00007 | TES-00005 Cubiertas ligeras |
     | CON-00008 | TES-00002 Concreto reforzado |
     | CON-00009 | TES-00004 Mampostería reforzada |

   - **Límites del tratamiento transitorio:** un heredado no puede aprobarse de nuevo sin completarse; si una conversión que usa cambia, pierde la aprobación aunque siga incompleto (no es una edición del concepto). Desaparece cuando el Administrador regulariza los cinco conceptos.
4. **Aprobación como en el libro.**
   - Cualquier Administrador del catálogo, **también quien creó o editó el concepto** (se conserva la regla del Excel; no hay otra cuenta ni otro flujo). BL-17 (revisión de cotizaciones) no cambia.
   - El servidor comprueba la función (en la guardia y en la base), la organización y la lista completa de requisitos (§3.6) en la misma sentencia.
   - La aprobación corresponde a la **revisión técnica** revisada (`revision_tecnica`, que sube con cada cambio técnico del concepto, de sus componentes o de una conversión que usan). Si cambió, 409 `CONFLICTO_APROBACION` con el detalle vigente y no se aprueba.
   - Se registran quién creó (`creado_por/en`), quién hizo el último cambio técnico (`cambio_tecnico_por/en`) y quién aprobó (`aprobado_por/en`).

## 3. Reglas implementadas

1. **Insumo (`Val_Insumo`):** descripción obligatoria y única normalizada; unidad base válida; especificación opcional. La unidad base no cambia con productos o conversiones (libro) **ni con componentes** (más estricto que el libro: cambiaría el sentido de los rendimientos). La salida es un insumo nuevo.
2. **Conversión (`Val_Conversion`):** destino = unidad base del insumo (lo fija la función y lo comprueba un disparador); origen distinto; factor > 0 con hasta 10 decimales (NUMERIC 20,10, sin redondeo); fuente obligatoria; una por (insumo, origen). El motor usa solo conversiones directas (`factorConversion`): no hay inversas, cadenas ni ciclos.
3. **Tipo de estructura (`Val_TipoEst`):** familia de `tblListas.FAMILIA`, nombre obligatorio, «prioritario» informativo.
4. **Concepto (`Val_Concepto`):** tipo activo; unidad de longitud, área, volumen o conteo acorde a la fórmula (`MagnitudDeFormula`); regla obligatoria; criterios opcionales; clase ESTANDAR, GENERICO o PERSONALIZADO; tarifa opcional al guardar, activa y de la misma unidad (BL-06). Siempre empieza en Borrador.
5. **Componente (`Val_Componente`):** insumo activo; rendimiento > 0 (20,6); 0 ≤ desperdicio < 1 (7,6); traslape ≥ 0 opcional (9,6; `null` distinto de 0); un componente por insumo en cada concepto; `orden` = último + 1. Fuente, fecha y responsable son **opcionales al guardar** (como el libro) y obligatorios para aprobar y calcular.
6. **Requisitos de aprobación** (`softarq_problemas_concepto`, una definición para la pantalla y para Aprobar): concepto activo; regla; tipo existente y activo; unidad acorde a la fórmula; tarifa asignada y de la misma unidad; componentes activos con fuente, fecha y responsable; al menos uno salvo GENERICO. **Añadido:** convertibilidad de la unidad de cada componente a la unidad base (el motor la exige, BL-06); y la marca de heredado.
7. **Qué devuelve a Borrador** (retira la aprobación; la bitácora conserva la anterior): tipo, descripción, unidad, fórmula, descuentos, regla, criterios o clase; alta, edición, desactivación o reactivación de un componente (`Concepto_ABorrador`); edición de una conversión usada; reactivación del concepto (`BTN_ConceptoActivo`).
8. **Qué conserva la aprobación:** asignar otra tarifa compatible (excepción del módulo 11) y desactivar el concepto (en el libro el estado pasa a «Inactivo»; aquí `activo = false` conserva el estado, y reactivar vuelve a Borrador: el efecto es el mismo).

## 4. Integración con las cotizaciones

- **Ofertas:** se mantiene «aprobados, o PERSONALIZADO activo». Un concepto que vuelve a Borrador deja de ofrecerse para cotizaciones nuevas (`REFERENCIA_NO_DISPONIBLE`); los borradores lo conservan y al calcular bloquea por BL-04 (sin cambios).
- **BL-05 de trazabilidad:** en `construirEntradaCalculo`, como `Validar`: un componente activo sin fuente, fecha o responsable bloquea. El motor, su huella y las fixtures no cambian; los componentes DEMO están completos y los cuatro totales de referencia siguen iguales (54,190.68; 43,312.16; 22,405.28; 4,911.79).
- **Verificación al enviar, aprobar y emitir:** detecta el cambio (BL-04 o BL-16). Las versiones, aprobaciones, emisiones, respuestas y PDF no cambian.
- **Concepto personalizado:** se crea en la administración (TES-00006, clase PERSONALIZADO, componentes completos y tarifa) y **no se aprueba**: se cotiza con su excepción CONCEPTO_PERSONALIZADO (registrada para calcular y enviar, autorizada por el Revisor para aprobar y emitir; AV-04). Aprobar la versión no aprueba el concepto.

## 5. Persistencia (migración `20261018120000_administracion_conceptos`)

- **Generación:** `migrate dev --create-only` no admite sin terminal los avisos de los índices únicos nuevos; el SQL se generó con `prisma migrate diff --from-migrations --to-schema --script` (base sombra) y se completó a mano. Antes de crear los índices únicos, bloques `DO` comprueban duplicados y destinos de conversión y detienen la migración con el detalle (no corrigen datos).
- **Tabla nueva `tipo_estructura`** con CHECK de las seis familias, revisión y autoría.
- **Columnas:** especificación, revisión y autoría en `insumo`; revisión y autoría en `conversion`; tipo, regla, criterios, `heredado`, `revision`, `revision_tecnica`, aprobación, último cambio técnico y autoría en `concepto`; trazabilidad opcional, revisión y autoría en `componente`.
- **Restricciones:** `concepto_completo_ck`, `concepto_aprobacion_ck` (Aprobado ⇒ fecha, salvo heredados; Borrador ⇒ sin datos de aprobación), textos no vacíos; índices únicos normalizados (insumo; tipo por familia; concepto por tipo), (concepto, insumo) y (insumo, origen).
- **Disparadores:** `tipo_estructura_proteger` (familia), `insumo_proteger` (unidad base), `conversion_proteger` (destino e identidad), `conversion_propagar` y `componente_propagar` (suben la revisión técnica de los conceptos afectados), `componente_proteger` (identidad, insumo activo) y `concepto_proteger` (§2.3, §3.7 y aprobación solo dentro de `softarq_aprobar_concepto` mediante una marca local de la transacción).
- **Límite de la marca de aprobación:** protege contra escrituras directas accidentales del rol de la aplicación; no contra quien ya puede ejecutar SQL arbitrario con ese rol (que podría fijar la marca). La aplicación no construye SQL con entradas y solo usa las funciones.
- **Funciones** (SECURITY INVOKER, una sentencia con función exigida, idempotencia, contador `TES`/`INS`/`CON`/`CMP`, revisión y bitácora): crear y editar tipo, insumo, conversión, concepto y componente; aprobar concepto; `softarq_problemas_concepto` (STABLE).
- **Permisos (`permisos-app.sql`, bloque condicional):** UPDATE solo de las columnas que escriben las funciones. Nunca `heredado`, códigos, organización, concepto u orden de un componente ni datos de alta. Sin DELETE ni DDL. `concepto`: el permiso amplio pendiente del módulo 11 queda restringido aquí.
- **Respaldo:** `softarq_respaldo` lee la tabla nueva por los privilegios por omisión. `probar-restauracion.mjs` comprueba coherencia, permisos, siete disparadores, cinco índices únicos y que tipos, insumos, conversiones, conceptos (con su marca y su aprobación) y componentes sean idénticos tras restaurar.

## 6. Separación de información

- Contrato interno `packages/contracts/src/api/catalogos-tecnicos.ts`; rutas `/api/v1/admin/...` con `catalogos.administrar`. Los contratos comerciales no cambian; `acceso-admin.integracion.test.ts` recorre todas las rutas `/admin` (403 a las demás funciones, 404 entre organizaciones) y comprueba respuestas comerciales reales sin datos técnicos.
- En la web, las pantallas técnicas están en `catalogo-tecnico/`, con su propia excepción acotada en `sin-datos-internos.test.ts` (admite rendimiento, desperdicio, traslape y tarifa; siguen prohibidos costos, consumos, márgenes, recargos y sobrantes). La excepción del módulo 11 no se amplió.

## 7. Consecuencias

- El Administrador del catálogo mantiene el catálogo técnico completo sin la carga fija, y los conceptos personalizados se recorren en la web.
- Los cinco conceptos heredados de `softarq_dev` siguen funcionando con su aprobación anterior hasta que se regularicen con el mapeo de §2.3.
- **Impacto mostrado:** cotizaciones abiertas que usan el concepto; no se cuentan aparte las versiones calculadas sin enviar (la verificación al enviar las bloquea igual).
- Si el cliente define una relación entre clase y familia, o reglas de aprobación distintas de las del libro, se cambian `concepto_proteger` y `softarq_problemas_concepto`.
