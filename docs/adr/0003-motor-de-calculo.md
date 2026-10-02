# ADR-0003 — Motor de cálculo del servidor

- **Fecha:** 02/10/2026
- **Estado:** aceptada
- **Ámbito:** `apps/api/src/modules/calculo/domain` y `packages/contracts`

## Contexto

El motor del libro (`modCalculo.bas`) ya separaba funciones puras (CR-01 a CR-16) del acceso a hojas. La plataforma necesita el mismo cálculo en el servidor, con precisión decimal exacta, sin depender todavía de base de datos ni HTTP, y verificable contra cifras obtenidas fuera del motor nuevo.

## Decisiones

### 1. Dominio puro y separado

- El dominio está en `apps/api/src/modules/calculo/domain`, con una función por regla (`medicion`, `consumo`, `compras`, `mano-obra`, `precio-venta`, `vigencias`) y un orquestador `calcularCotizacion(entrada)`.
- No usa PostgreSQL, HTTP, archivos, reloj del sistema ni estado global mutable. Las fechas se reciben explícitamente (`fechaCalculo`), no muta la entrada y la misma entrada da el mismo resultado.
- Se recibe `unknown` y se valida antes de calcular. El resultado es una unión discriminada:
  - `CALCULADO`: con importes;
  - `BLOQUEADO`: con códigos BL y **sin importes parciales**, como el libro, que no escribe resultados parciales;
  - `ENTRADA_INVALIDA`: con la ruta de cada campo.

### 2. Contratos compartidos

- `packages/contracts` define los tipos de entrada y salida, las constantes (fórmulas, modalidades y códigos BL/AV) y el formato `DecimalTexto`. No contiene cálculos.
- El resultado `CALCULADO` es **interno**, porque contiene costos, proveedores y margen. Web y móvil solo recibirán `CotizacionComercial`, que se construye por lista blanca en `aVistaComercial` (D-16).

### 3. Aritmética: decimal.js 10.6.0

- Se usa una instancia local con `Decimal.clone`: 40 cifras significativas para resultados intermedios no exactos, con redondeo interno mitad al par. No se toca la configuración global de la biblioteca.
- El redondeo de negocio (CR-15) es explícito, `toDecimalPlaces(2, ROUND_HALF_UP)`: mitad hacia arriba y simétrico. Solo se aplica en el P.U. (CR-11), el importe (CR-12) y los impuestos (CR-13). Los consumos, compras, prorrateos y costos directos conservan precisión completa.
- Entradas y salidas viajan como texto decimal; nunca hay conversión a `number`. Formato de entrada: `^-?(0|[1-9]\d{0,14})(\.\d{1,10})?$`, sin exponentes, comas ni espacios.
- Diferencia con el libro: el Decimal de VBA tiene unas 28 cifras. Solo podría cambiar un centavo ante un empate exacto por debajo de 1e-28; no ocurre en ninguna fixture.

### 4. Pruebas: Vitest 5.0.3

- Las pruebas están junto al dominio, en `__tests__`. Las fixtures llevan `origen` (archivo, escenario y caso) y expectativas copiadas de la fuente: Word §3.14, guía de demostración, casos PC del libro, evidencias TI/TE/UI y versiones del libro oficial.
- Vitest 5 exige `vite` como dependencia par; se instala explícitamente (8.3.2).

### 5. Herramientas y formato de módulos

- TypeScript 7.0.2 (`tsc` nativo) y `@types/node` 24.19.0 (Node 24.11.1 instalado). Se descartó 24.19.1 porque no cumplía la antigüedad mínima de pnpm; no se añadieron excepciones a esa política.
- Paquetes ESM (`"type": "module"`, `module: nodenext`). `contracts` se compila a `dist` y `pnpm -r` lo construye antes que `api`.
- **NestJS no se inicializa todavía:** no hay endpoints. Se añadirá con el módulo HTTP y se revisará entonces la compatibilidad ESM.

### 6. Persistencia aplazada

Prisma, las migraciones, los usuarios y las bases de PostgreSQL quedan para el módulo de persistencia. No se tocó el servicio `postgresql-x64-18`.

## Alcance excluido del motor

- Bloqueos de catálogo, revisión y emisión: BL-01, BL-02, BL-04, BL-07, BL-09, BL-14 a BL-17, BL-19 y BL-20.
- Trazabilidad del componente (fuente, fecha y responsable) para BL-05.
- Avisos AV-02, AV-04 y AV-05.
- Sello del cálculo (BL-16), folios, estados y PDF.

El motor expone `cr07Vigente` y `cr16VigenteHasta` para esos módulos. Detalle en [`docs/calculo/matriz-reglas.md`](../calculo/matriz-reglas.md).

## Consecuencias

- El cálculo existe una sola vez, en el servidor; los clientes no pueden producir importes oficiales.
- El orden de partidas y componentes forma parte de la entrada, porque define a quién se asigna el remanente del prorrateo (CR-08). La persistencia deberá conservarlo.
- Cambiar una regla obliga a actualizar la matriz y las fixtures con su fuente.
