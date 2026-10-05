# Cobertura del DEMO local frente al Excel y al alcance documentado

- Fecha: 05/10/2026, al cerrar el módulo 10.
- **Fuentes:**
  - Word maestro v1.3: §1.3 incluido, §1.4 excluido, §1.6 funciones, §3 reglas y §5 uso;
  - ADR-0001 a ADR-0014;
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
| Textos por versión (alcance, condiciones y exclusiones) | A | ADR-0010 |
| Vista previa del PDF marcada BORRADOR (W §1.3, `BTN_VistaPrevia`) | — | La web muestra la vista previa comercial en pantalla; no genera un PDF BORRADOR |
| Versiones con motivo e historial | V | Módulos 6 a 9 |
| Nueva versión con «modo de precios» y precios anteriores (B-34/B-35) | — | Sin modo de precios: la versión nueva siempre calcula con el catálogo vigente |
| Duplicar cotización (B-33) | — | No existe |
| Descarte (B-37) | V | Módulo 8 |
| Respuesta del cliente y vencimiento (B-36) | A | Módulo 9: registro interno por emisión, vigencia derivada sin escritura automática, captura tardía con recepción en plazo (ADR-0013) |
| Folio WEB DEMO propio | A | ADR-0008 |
| Catálogos: lectura y carga DEMO | V | Módulo 2 y API de catálogos |
| Catálogos: altas y ediciones de proveedores, productos, precios, tarifas, insumos, conversiones, conceptos, componentes y tipos adicionales; aprobar conceptos (Administrador del catálogo, W §1.6) | — | Clientes y proyectos sí (módulo 6). Para el resto no hay rutas de escritura; los conceptos personalizados solo existen en pruebas |
| Parámetros restringidos con motivo, personas y funciones (Administrador del sistema) | P | Emisor y logotipo DEMO (módulo 8); sin parámetros (recargo, impuesto, vigencia), sin altas de usuarios ni cambio de funciones |
| Detalle interno de solo lectura: 12 COMPRAS, 13 DETALLE e indicadores internos en revisión (W §1.3, §5.5) | — | El servidor guarda `resultado_interno`; ninguna pantalla lo muestra (requiere su permiso y contrato propios) |
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
- **Administración** se divide en tres: precios y proveedores; conceptos y componentes; parámetros y personas.
- **Nuevo bloque detectado:** duplicar cotización, nueva versión con modo de precios y vista previa del PDF BORRADOR.

| # | Bloque | Tamaño estimado |
|---|---|---|
| 1 | Catálogos (1): proveedores, productos, precios con vigencia (anular en lugar de borrar) y tarifas | 1 módulo |
| 2 | Catálogos (2): insumos y conversiones, conceptos y componentes con trazabilidad (BL-05), aprobación de conceptos y personalizados | 1 módulo |
| 3 | Parámetros restringidos con motivo, personas y funciones (Administrador del sistema) | 1 módulo |
| 4 | Salidas internas de solo lectura (compras calculadas, detalle e indicadores), con permiso propio; exportación si se decide | 1 módulo |
| 5 | Duplicar, modo de precios y vista previa del PDF BORRADOR | 1 módulo |
| 6 | App Expo: alcance por decidir (consulta, revisión y decisión; captura) | 2 a 3 módulos |
| 7 | Cierre integral del DEMO: ejecución formal de la guía, recorrido completo y documentación | 1 módulo |

**Total para el DEMO local completo:** de 8 a 9 módulos. La preparación para Railway (TLS, cookie `Secure`/`__Host-`, proxy, limitadores y documentos compartidos, variables y respaldo remoto) es aparte: de 1 a 2 módulos.

**Siguiente módulo recomendado:** el **1 (catálogos de precios y proveedores)**. Es la condición para cargar los datos reales del capítulo 8 (precios, proveedores y tarifas) y desbloquea PR-41 a PR-44. Hace que el DEMO deje de depender de la carga fija. Le siguen el 2, que habilita los conceptos personalizados y la trazabilidad de BL-05 en pantalla, y el 4. Expo conviene después de fijar su alcance.
