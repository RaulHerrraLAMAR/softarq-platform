# Matriz de reglas del motor de cálculo

- **Fecha:** 02/10/2026
- **Implementación:** `apps/api/src/modules/calculo/domain/` (abreviado `domain/`)
- **Pruebas:** `domain/__tests__/` (163 pruebas, Vitest 5.0.3)

**Fuentes** (rutas bajo `D:\Proyecto_SoftArq\entrega\`, leídas sin modificar):

| Abreviatura | Archivo |
|---|---|
| W | `Documentacion_maestra_Cotizador_Estructuras_F1.docx` v1.3 |
| VBA | `fuentes\vba\*.bas` |
| G | `Guia_de_demostracion.md` |
| PC | Casos internos de `fuentes\vba\modPruebas.bas` |
| TI/TE | `evidencias_pruebas\fase1.csv`, `fase2.csv` y `externas.csv` |
| UI | `evidencias_pruebas\recorrido_ui\registro_ui.csv` |

Los identificadores CR-01 a CR-16 están presentes en W v1.3 (§3.3 a §3.7) y en `modCalculo.bas`.

## 1. Reglas del motor

| Regla | Fuente | Implementación | Pruebas |
|---|---|---|---|
| CR-01 Medición: renglón = signo × piezas × dimensiones; cantidad = suma > 0 | W §3.3; VBA `modCalculo.CR01_Renglon`, `modMedicion.Med_Guardar` | `medicion.ts` (`cr01Renglon`, `validarRenglon`, `cantidadDePartida`) | `reglas.test.ts` PC-07 a PC-10 y reglas de captura; `bloqueos.test.ts` BL-03 y renglones inválidos |
| CR-02 Neto = cantidad × rendimiento × (1 + traslape) | W §3.4; VBA `CR02_Neto` | `consumo.ts` | PC-11 a PC-15 |
| CR-03 Con desperdicio = neto × (1 + desperdicio), 0 ≤ d < 1 | W §3.4; VBA `CR03_ConDesperdicio`, `modCatalogos:702` | `consumo.ts`; rango en `motor.ts` (BL-05) | PC-11 a PC-14; BL-05 |
| CR-04 Conversión a unidad base; sin conversión, BL-06 | W §3.4; VBA `CR04_Convertir`, `modCatalogos.Conv_Factor` | `consumo.ts` (`factorConversion`) | PC-16; TI-305 (larguero 382.851 kg); TI-315 (acero 46.4003 kg); BL-06 |
| CR-05 Consolidar compras por producto y proveedor, o por partida | W §3.4; VBA `Calc_Ejecutar` | `compras.ts` (`claveCompra`), `motor.ts` | PC-22 y PC-39 (20 bultos, $2,900) |
| CR-06 Presentación: ⌈c ÷ contenido⌉ o ⌈c ÷ incremento⌉ × incremento; sobrante AV-03 | W §3.4; VBA `CR06_Compra` | `compras.ts` (`cr06Compra`) | PC-17 a PC-23; TI-305, TI-311, TI-313, TI-315 |
| CR-07 Selección explícita por insumo, sin elección automática; vigencia desde ≤ f ≤ hasta | W §3.4 y §3.7; VBA `modCompras`, `CR07_Vigente` | `motor.ts` (BL-08, AV-01); `vigencias.ts` (`cr07Vigente`) | PC-43; TI-309 (AV-01); BL-08; selección duplicada inválida |
| CR-08 Prorrateo proporcional; el último recibe el remanente | W §3.4; VBA `Calc_Ejecutar` | `compras.ts` (`cr08Prorratear`) | PC-24; prueba de suma exacta |
| CR-09 Mano de obra UNIDAD, JORNADA (fraccionaria) o SUBCONTRATO (aparte) | W §3.5; VBA `CR09_ManoObra`, `Motor_Modelo` | `mano-obra.ts`; tarifa vigente en `motor.ts` | PC-25 a PC-27; TI-306 ($6,726); TI-313 (0.9257 jornadas); BL-10 y BL-06 |
| CR-10 Costo adicional = monto capturado (> 0) | W §3.5; VBA `Calc_Ejecutar`, `modCotizacion:404-405` | `motor.ts` | PC-30; BL-11; BL-03 con cantidad 0 |
| CR-11 P.U. = redondear(CD × (1 + k) ÷ cantidad, 2) | W §3.6; VBA `CR11_PU` | `precio-venta.ts` | PC-28 a PC-30, PC-37 |
| CR-12 Importe = redondear(cantidad × P.U., 2); subtotal = suma | W §3.6; VBA `CR12_Importe` | `precio-venta.ts`, `motor.ts` | PC-28 a PC-32 |
| CR-13 Impuestos = redondear(subtotal × tasa, 2) | W §3.6; VBA `CR13_Impuestos`, `Motor_Modelo` | `precio-venta.ts`; base y rango en `motor.ts` | PC-33; BL-13 |
| CR-14 Total = subtotal + impuestos | W §3.6; VBA `CR14_Total` | `precio-venta.ts` | PC-34 y todos los escenarios |
| CR-15 Redondeo mitad hacia arriba, simétrico | W §3.6; VBA `modRedondeo.RedondearMA` | `decimal.ts` (`redondearMA`) | PC-01 a PC-06; prueba de mutación (al cambiarlo por mitad al par fallan 4 pruebas) |
| CR-16 Vigente hasta = emisión + N días naturales | W §3.7; VBA `CR16_VigenteHasta` | `vigencias.ts` (`cr16VigenteHasta`) | PC-41 y PC-42 |
| Margen (venta − costo) ÷ venta; k ÷ (1 + k) | W §3.6; VBA `Margen`, `MargenDeRecargo` | `precio-venta.ts` | PC-35 y PC-36 |
| Excepción de rendimiento o desperdicio (no rechazada) | W §3.10; VBA `Motor_Modelo` | `motor.ts` | `bloqueos.test.ts` (excepciones) |
| BL-03 Sin partidas, sin medición o cantidad ≤ 0 | W §3.11; VBA `Motor_Modelo`, `Calc_Ejecutar` | `motor.ts` | `bloqueos.test.ts` |
| BL-05 Rendimiento ≤ 0 o desperdicio fuera de [0,1) (rangos) | W §3.11; VBA `modValidacion:102` | `motor.ts` | `bloqueos.test.ts` |
| BL-06 Conversión faltante, tarifa en otra unidad o unidad del concepto que no corresponde a la fórmula | W §3.11; VBA `Calc_Ejecutar`, `Motor_Modelo`, `modValidacion:97`; unidades de `fuentes\build\modBuild.bas` | `motor.ts`, `unidades.ts` | `bloqueos.test.ts` |
| BL-08 Insumo sin selección | W §3.11; VBA `Calc_Ejecutar` | `motor.ts` | `bloqueos.test.ts` |
| BL-08 Selección inválida (precio anulado, producto o proveedor inactivo), sin sustituirla | W §3.11; VBA `modCompras.Sel_Estado`, `modValidacion` | `calculo/aplicacion/construir-entrada.ts` (módulo 2) | `calculo-desde-base.integracion.test.ts` |
| BL-04 Concepto no aprobado o inactivo | W §3.11; VBA `modValidacion` | `calculo/aplicacion/construir-entrada.ts` (módulo 2) | `calculo-desde-base.integracion.test.ts` |
| CR-07 Menor precio vigente para AV-01 (no elige) | W §3.4; VBA `Compras_MenorPrecio` | `repositorio-catalogos.ts` (`obtenerPreciosVigentesDeProductos`) y `construir-entrada.ts` | `calculo-desde-base.integracion.test.ts` (TI-309) |
| Precios sin vigencias solapadas por producto y proveedor | VBA `modCatalogos.Val_Precio` | Restricción de exclusión en la migración 0001 | `catalogos.integracion.test.ts` |
| BL-10 Tarifa faltante, inactiva o no vigente a `fechaCalculo` | W §3.11; VBA `Motor_Modelo` | `motor.ts` | `bloqueos.test.ts` |
| BL-11 Adicional sin monto | W §3.11; VBA `Calc_Ejecutar` | `motor.ts` | `bloqueos.test.ts` |
| BL-12 Recargo no definido o fuera de [0,1]; el 0 es válido | W §3.6 y §3.11; VBA `Calc_Ejecutar`, `modConfig:208` | `motor.ts` (`parametrosDeVenta`) | PC-40; `bloqueos.test.ts` |
| BL-13 Impuesto no definido, tasa fuera de [0,1] o base desconocida | W §3.6 y §3.11; VBA `Motor_Modelo`, `modValidacion:166` | `motor.ts` | PC-40; `bloqueos.test.ts` |
| BL-18 Verificación cruzada | W §3.11; VBA `modPruebas` PC-38 | `motor.ts` | PC-38 |
| D-16 Vista comercial sin datos internos | W §3.13 | `vista-comercial.ts`; tipo `CotizacionComercial` | `pureza.test.ts` |
| RNF-02 Precisión decimal | W (RNF-02); VBA `modRedondeo.Dec` | `decimal.ts` | `reglas.test.ts`; `pureza.test.ts` (sin `number`) |

## 2. Escenarios verificados de extremo a extremo

Todos con datos DEMO, recargo 0.20, tasa 0.16, base SUBTOTAL_VENTA y compras consolidadas. Las cifras esperadas proceden de las fuentes, no del motor nuevo.

| Fixture | Total MXN | Fuente principal | Corroboración |
|---|---|---|---|
| Ejemplo §3.14 | 18,790.94 | W §3.14 | PC-21 a PC-38; libro oficial COT-2026-00001-v1 |
| GUIA-R1-LAMINA-362 | 43,648.92 | G, tabla de referencia | TI-304, TI-305, TI-306 |
| GUIA-R1-LAMINA-385 | 44,865.23 | G | TI-308, TI-309; libro oficial COT-2026-00016-v1 |
| **GUIA-R1-FALDONES-10M** | **54,190.68** | G | TI-311; TE-09; UI paso 37 (copia `Recorrido_UI.xlsm`) |
| LIBRO-COT-2026-00017-v1 (larguero $640) | 45,491.87 | Libro oficial, DATA_VERSIONES | BITACORA BIT-0000210 |
| GUIA-R2-ESPESOR-010 | 35,508.15 | G | TI-313 |
| **GUIA-R2-ESPESOR-012** | **43,312.16** | G | TI-314; TI-352 (`fase2.csv`); UI paso 107 |
| GUIA-R3-BLOCK-1390 | 20,688.24 | G | TI-315 |
| GUIA-R3-BLOCK-1450 | 20,958.85 | G | TI-316 |
| **GUIA-R3-SIN-VENTANA** | **22,405.28** | G | TI-317; UI paso 175 |
| **GUIA-PROPIA-CON-00001** | **4,911.79** | G | UI paso 245 (sin caso TI) |

Las medidas, precios y parámetros completos de cada escenario están en `domain/__tests__/fixtures/escenarios.ts` y `catalogo-demo.ts`.

## 3. Fuera del alcance del motor (módulos posteriores)

| Regla | Módulo previsto |
|---|---|
| BL-01 y BL-02 (cliente y proyecto), BL-04 para conceptos personalizados con excepción autorizada y BL-07 (producto activo) | Cotizaciones y revisión (BL-04 de estado y BL-08 de selección inválida ya están en el ensamblador del módulo 2) |
| BL-05 en su parte de trazabilidad (fuente, fecha y responsable técnico) | Catálogos (aprobación de conceptos) |
| BL-09 (vigencia del precio a la emisión, con excepción autorizada) y AV-02 | Emisión |
| BL-14 (vigencia comercial), BL-15 (emisor), BL-17 (revisor ≠ preparador), BL-19 (estado) y BL-20 (textos) | Revisión y emisión |
| BL-16 (sello del cálculo) | Persistencia de versiones |
| AV-04 y AV-05 | Revisión |
| Folios, estados, inmutabilidad de lo emitido y PDF | Cotizaciones y emisión |

## 4. Discrepancias entre fuentes y decisión

| # | Diferencia | Decisión y justificación |
|---|---|---|
| 1 | El VBA cita «sección 9.13» (especificación v0.2) para el ejemplo que W v1.3 numera §3.14. | Mismos datos. Se cita §3.14, la referencia vigente. |
| 2 | El `.xlsm` guarda `contenido` como double (`2.1960000000000002`, `2.9769999999999999`); `Dec()` del VBA lo reconstruye a 15 cifras. | El motor recibe texto decimal exacto; las fixtures usan 2.196 y 2.977, lo mismo que calculaba el libro. |
| 3 | Decimal de VBA (unas 28 cifras) frente a decimal.js (40 cifras). | Se conservan 40 cifras. Solo podría variar un centavo ante un empate exacto por debajo de 1e-28; las 11 fixtures coinciden al centavo. |
| 4 | W §3.6 remite la base del impuesto a la «definición fiscal», pero el VBA siempre aplica la tasa al subtotal y solo existe `SUBTOTAL_VENTA`. | Solo se admite `SUBTOTAL_VENTA`; cualquier otra base es BL-13. No se inventan bases. |
| 5 | El rango del recargo [0,1] procede de la validación de parámetros `PCT` (`modConfig.bas:208`); W no lo fija. | Se conserva el comportamiento del libro; fuera de rango es BL-12. Habrá que confirmarlo con la política comercial real (dato 6). |
| 6 | `CR01_Renglon` usaría el ancho si llegan ancho y alto en AREA; `Med_Guardar` y W §3.3 lo prohíben. | Se rechaza («ancho o alto, no ambos»). |
| 7 | El VBA aplica como rendimiento cualquier excepción cuyo campo no sea DESPERDICIO. | El motor exige `RENDIMIENTO` o `DESPERDICIO` explícitos; cualquier otro valor es entrada inválida. |
| 8 | El VBA asume «Consolidar compras = Sí» si el campo está vacío. | El motor exige un booleano explícito (sin valores por omisión silenciosos). Las versiones de referencia usan «Sí». |
| 9 | W §3.14 muestra los materiales de P001 como «1,804.1945…» (valor exacto 1804.194475…, redondeado a 4 decimales), pero el prorrateo de K02 como «343.9944…» (343.994475…, truncado). | Solo afecta a la presentación del Word. El motor guarda la precisión completa; las pruebas comparan cada cifra con la convención que usa su tabla. |
| 10 | TI-315 y la guía reportan el acero como «46.4003 kg» y «46.40 kg»; el valor exacto es 46.400256 kg. | Son presentaciones redondeadas (formato de 4 y 2 decimales). La prueba verifica el valor exacto y su redondeo a 4 decimales. |

## 5. Límites técnicos de la entrada

Definidos en `LIMITES_ENTRADA_CALCULO` (`packages/contracts`). Son protección del servidor, no reglas del Excel, salvo los 200 renglones (cuadrícula de 11 MEDICION).

| Concepto | Límite |
|---|---|
| Partidas | 500 |
| Renglones por partida | 200 |
| Componentes por partida | 50 |
| Insumos | 1000 |
| Selecciones | 1000 |
| Conversiones | 1000 |
| Excepciones | 500 |
| Textos | 500 caracteres |
| Decimales | 15 enteros y 10 decimales |
