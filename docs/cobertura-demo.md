# Cobertura del DEMO local frente al Excel y al alcance documentado

- Fecha: 18/10/2026, al cerrar el módulo 14 (antes: 17/10/2026, módulo 13).
- **Fuentes:**
  - Word maestro v1.3: §1.3 incluido, §1.4 excluido, §1.6 funciones, §3 reglas y §5 uso;
  - ADR-0001 a ADR-0018;
  - código comprobado con búsquedas dirigidas, sin suponer lo que no se ve en él.
- **Leyenda:**
  - **V**: implementado y verificado con pruebas automatizadas;
  - **P**: implementado parcialmente;
  - **—**: pendiente;
  - **A**: adaptación autorizada;
  - **F**: fuera del alcance acordado.
- **Verificado** significa pruebas automatizadas, no la ejecución formal de la guía manual ni PR-41/PR-44 del Excel, que siguen pendientes.

## 1. Matriz

| Bloque (fuente) | Estado | Evidencia o nota |
|---|---|---|
| Motor CR-01 a CR-16, redondeo, decimales (W §3.3–3.7) | V | Módulo 1; los 4 totales de referencia en unitarias, integración y E2E |
| Cotización: partidas, medición, adicionales, elección explícita de precio (W §1.3, CR-07) | V | Módulos 4 y 6 |
| Excepciones motivadas B-22, autorización por el Revisor, AV-04 (W §3.10) | V | Módulo 10, ADR-0014 |
| Bloqueos BL-01 a BL-20 y avisos AV-01 a AV-05 (W §3.11) | P | Todos menos la parte de **trazabilidad** de BL-05 (fuente, fecha y responsable técnico del componente), que depende de editar el catálogo |
| Revisión humana, Revisor ≠ preparador (D-13, BL-17) | V | Módulo 7 |
| Emisión inmutable, PDF sin datos internos (W §3.13) | V | Módulo 8 |
| Quién emite: también el Preparador | A | ADR-0010 §2 |
| Textos por versión (alcance, condiciones y exclusiones) | A | ADR-0010; desde el módulo 13 las plantillas TEXTO_* son parámetros editables que se copian a cotizaciones nuevas (ADR-0017 §2.2) |
| Vista previa del PDF marcada BORRADOR (W §1.3, `BTN_VistaPrevia`) | — | La web muestra la vista previa comercial en pantalla; no genera un PDF BORRADOR |
| Versiones con motivo e historial | V | Módulos 6 a 9 |
| Nueva versión con «modo de precios» y precios anteriores (B-34/B-35) | — | Sin modo de precios: la versión nueva siempre calcula con el catálogo vigente |
| Duplicar cotización (B-33) | — | No existe |
| Descarte (B-37) | V | Módulo 8 |
| Respuesta del cliente y vencimiento (B-36) | A | Módulo 9: registro interno por emisión, vigencia derivada sin escritura automática, captura tardía con recepción en plazo (ADR-0013) |
| Folio WEB DEMO propio | A | ADR-0008 |
| Catálogos: lectura y carga DEMO | V | Módulo 2 y API de catálogos |
| Catálogos (1): proveedores, productos (presentación, contenido, venta fraccionada), precios con vigencia, anulación con motivo y tarifas de mano de obra (Administrador del catálogo, W §1.6, RF-03/05/06/07) | V | Módulo 11, ADR-0015. Web «Catálogo», API `/admin`, funciones con bitácora, disparadores y permisos mínimos |
| Bloqueo técnico del producto con precios | A | ADR-0015 §2.1 (el libro edita todos los campos) |
| Cerrar vigencia y registrar sucesor | A | ADR-0015 §2.2; **P3 pendiente con el cliente** |
| Asignar tarifa a un concepto (W §3.5) | V | Módulo 11; desde el módulo 12, en el detalle del concepto. Conserva la aprobación |
| Catálogos (2): tipos de estructura, insumos, conversiones, conceptos y componentes; aprobar conceptos (W §1.6, RF-04, RF-08, RF-09) | V | Módulo 12, ADR-0016. Web «Catálogo» (Insumos y conversiones, Tipos de estructura, Conceptos y componentes), API `/admin`, funciones, disparadores y permisos por columna |
| BL-05 de trazabilidad (fuente, fecha y responsable del componente) | V | Módulo 12: al calcular (`Validar`) y como requisito de aprobación |
| Conceptos personalizados creados en la web y cotizados con su excepción | V | Módulo 12; no se aprueban: exigen la excepción CONCEPTO_PERSONALIZADO (ADR-0014) |
| Conceptos heredados de la carga anterior sin tipo ni regla | A | ADR-0016 §2.3: marca transitoria; siguen calculando; editarlos exige completarlos. Mapeo documentado, no ejecutado |
| Conversión editable que devuelve a Borrador; unidad base bloqueada también con componentes | A | ADR-0016 §2.1 y §3.1 |
| Tipos de costo adicional (alta y edición) | — | Siguen solo con la carga DEMO |
| Parámetros restringidos con motivo, personas y funciones (Administrador del sistema, B-38, B-39) | V | Módulo 13, ADR-0017. Web «Administración» (Parámetros, Personas y funciones), API `/admin/parametros` y `/admin/personas`, funciones SECURITY DEFINER, regla del último administrador, contraseña temporal con cambio obligatorio |
| Ambiente editable, CONSOLIDAR_PREDETERMINADO, DEMO_* aparte | A | ADR-0017 §6 y §8: ambiente de solo lectura, elección explícita del consolidado, un juego de valores por organización |
| `db:migrar` solo tras un respaldo verificado; permisos efectivos del rol de la aplicación reducidos | V | ADR-0017 §3 y §4. Límite documentado: las funciones confían en el usuario que reciben |
| Detalle interno de solo lectura: 12 COMPRAS, 13 DETALLE e indicadores internos de la versión (W §1.3, RF-16, §3.4–3.6, §3.14, §5.5) | V | Módulo 14, ADR-0018. Capacidad `salidas.consultar` (Preparador y Revisor; decisión del propietario), `GET /cotizaciones/{id}/versiones/{n}/salidas-internas`, web «Salidas internas». Solo la versión congelada; las versiones anteriores al módulo muestran solo códigos (sin nombres) |
| Margen equivalente k/(1+k) de 13 A5 | A | ADR-0018 §5: no se muestra para no confundirlo con el margen real; recargo y margen se muestran por separado |
| Contadores operativos de 00 INICIO (borradores, en revisión, aprobadas por emitir, vencidas, precios por vencer, último folio, avisos) | — | Pendiente por decisión del propietario (ADR-0018 §2.2). Fuente: hoja 00 INICIO; reglas por definir (si cuentan cotizaciones o versiones y con qué fecha) |
| Exportación de informes internos (compras, detalle) | F | Mejora opcional fuera del alcance acordado (ADR-0018 §2.3); ninguna fuente la define (D-19). No es un requisito incumplido |
| Bitácora | P | Eventos en `bitacora` e historial por cotización; sin consulta general |
| Respaldo y restauración | A | `pg_dump` con PDF y prueba de restauración (ADR-0012) en lugar del respaldo del libro |
| Exportación CSV UTF-8 (W §1.3) | — | Su motivo era migrar a PostgreSQL, que ya es la base. Exportarla para usuarios queda por decidir |
| Maestro sin datos DEMO | — | Se resolverá con la carga de datos reales (capítulo 8 del Word) |
| Recorrido guiado con «Siguiente paso» (W §4.12) | P | La web ofrece los tres ejemplos y la guía manual; no tiene un asistente paso a paso |
| Autenticación, sesiones, organizaciones y permisos reales | V | Módulo 5 (no existían en el Excel) |
| App móvil con React Native y Expo | — | Ni instalada ni iniciada |
| Facturación, contabilidad, órdenes de compra, inventario y control de obra | F | W §1.4. «Compras» del libro es solo el cálculo de presentaciones (12 COMPRAS), que pertenece al detalle interno |
| Portal del cliente, correo, firma | F | ADR-0010 y ADR-0013 |
| Cálculo estructural, planos | F | W §1.4 |
| Despliegue en Railway, TLS, almacén compartido | F | Fuera del DEMO local; preparación aparte |

## 2. Bloques restantes y estimación

Hipótesis inicial: excepciones; administración de catálogos y parámetros; compras y salidas internas; app Expo; cierre integral. Ajustes tras revisar el código y las fuentes:

- **«Compras»** se divide. Las órdenes de compra y el inventario están **fuera de alcance**. Las salidas internas de solo lectura (compras calculadas y detalle) sí son del libro.
- **Administración** se divide en tres: precios y proveedores (**hecho en el módulo 11**); conceptos y componentes (**hecho en el módulo 12**); parámetros y personas (**hecho en el módulo 13**).
- **Nuevo bloque detectado:** duplicar cotización, nueva versión con modo de precios y vista previa del PDF BORRADOR.

| # | Bloque | Tamaño estimado |
|---|---|---|
| 1 | ~~Catálogos (1): proveedores, productos, precios con vigencia (anular en lugar de borrar) y tarifas~~ | Hecho (módulo 11) |
| 2 | ~~Catálogos (2): insumos y conversiones, conceptos y componentes con trazabilidad (BL-05), aprobación de conceptos y personalizados~~ | Hecho (módulo 12) |
| 3 | ~~Parámetros restringidos con motivo, personas y funciones (Administrador del sistema)~~ | Hecho (módulo 13) |
| 4 | ~~Salidas internas de solo lectura (compras calculadas, detalle e indicadores), con permiso propio~~ | Hecho (módulo 14) |
| 5 | Duplicar, modo de precios y vista previa del PDF BORRADOR | 1 módulo |
| 6 | App Expo: alcance por decidir (consulta, revisión y decisión; captura) | 2 a 3 módulos |
| 7 | Cierre integral del DEMO: ejecución formal de la guía, recorrido completo y documentación | 1 módulo |

**Total restante para el DEMO local completo:** de 4 a 5 módulos (antes 5 a 6). La preparación para Railway (TLS, cookie `Secure`/`__Host-`, proxy, limitadores y documentos compartidos, variables y respaldo remoto) es aparte: de 1 a 2 módulos.

**Siguiente módulo recomendado:** el **5 (duplicar, modo de precios y vista previa del PDF BORRADOR)**. Antes conviene que el Administrador regularice los cinco conceptos heredados de `softarq_dev` con el mapeo del ADR-0016 §2.3. Expo conviene después de fijar su alcance. Quedan además, fuera de los bloques: los contadores de 00 INICIO y la tarea de seguridad «identidad de las funciones SQL» (ADR-0018 §7).

Con los módulos 11 y 12 ya se pueden capturar en la web precios, proveedores, tarifas, insumos, conversiones, conceptos y componentes reales cuando el cliente los entregue (capítulo 8). Siguen pendientes la política de vigencias (P3) y la carga real, que no se hace en el DEMO.
