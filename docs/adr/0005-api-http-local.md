# ADR-0005 — API HTTP local (NestJS) para catálogos y cálculo DEMO

- **Fecha:** 02/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `apps/api/src/http`, `apps/api/src/config` y `apps/api/src/main.ts`;
  - las consultas y el caso de uso en `src/modules/*/aplicacion`;
  - los contratos HTTP de `packages/contracts/src/api`.

## Contexto

El motor (ADR-0003) y la persistencia (ADR-0004) existían sin interfaz de red. Este módulo expone, **solo en local**:
- la consulta de los catálogos necesarios para preparar una cotización DEMO;
- su cálculo con datos de PostgreSQL, devolviendo únicamente la proyección comercial.

No hay autenticación, usuarios, guardado de cotizaciones, folios, aprobación ni PDF.

## Decisiones

### 1. NestJS 12 en ESM, compilado con `tsc`

| Paquete | Versión |
|---|---|
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` | 12.1.2 |
| `@nestjs/throttler` | 6.7.1 |
| `helmet` | 8.3.0 |
| `express` | 5.2.1 (la misma que trae Nest) |
| `reflect-metadata` | 0.2.2 |
| `rxjs` | 7.8.2 |
| `zod` | 4.6.5 |

- **Instalación:** pnpm no pidió excepciones ni scripts de instalación; las políticas siguen intactas.
- **Compilación:**
  - TypeScript 7 emite decoradores heredados (`experimentalDecorators`) y `emitDecoratorMetadata`;
  - no se usa `nest build`, porque depende de la API del compilador que TypeScript 7 no ofrece;
  - Vitest 5 (Vite 8 y Oxc) transforma los decoradores correctamente (comprobado).
- **Inyección:** toda dependencia se inyecta con `@Inject(TOKEN)`, sin depender de los metadatos de tipos.
- **Pruebas:** las sustituciones (fecha fija, contexto sin base) se pasan como opciones explícitas a `crearAplicacion`; no hace falta `@nestjs/testing`.

### 2. Zod como definición única de los contratos HTTP

- **Fuente única:** los esquemas de `packages/contracts/src/api/esquemas.ts` son la única definición. Los tipos se derivan con `z.infer`, Nest valida en ejecución con su `StandardSchemaValidationPipe` (`@Body({ schema })` y `@Query({ schema })`), y el documento OpenAPI 3.1 se genera desde ellos (`z.toJSONSchema`).
- **Tipos compartidos con el motor:** `RenglonMedicion` y `CotizacionComercial` pasan a derivarse de esos mismos esquemas, de modo que el motor y la API comparten la definición.
- **Validador del motor:** se conserva como defensa en profundidad sobre `EntradaCalculo` y usa las mismas constantes (`PATRON_DECIMAL_TEXTO`). Una prueba compara ambos validadores con los mismos casos.
- **Objetos estrictos:** se rechazan campos no permitidos en todos los niveles. Los decimales son siempre texto y nunca `number`. Los mensajes de validación están en español (`z.locales.es`).
- **El cliente puede enviar:**
  - medidas;
  - códigos de concepto, de tipo adicional y de precio elegido;
  - descripciones;
  - cantidad y monto de los costos adicionales (el monto es un costo capturado, CR-10);
  - `consolidarCompras`.
- **El cliente no puede enviar:** fecha de cálculo, precios, consumos, parámetros, excepciones ni la organización.

### 3. Endpoints

| Método y ruta | Uso |
|---|---|
| `GET /health` | Servicio y PostgreSQL |
| `GET /api/v1/catalogos/conceptos` | Conceptos activos y aprobados; búsqueda y límite de 1 a 100 |
| `GET /api/v1/catalogos/opciones-precio?conceptos=…` | Hasta 20 conceptos |
| `GET /api/v1/catalogos/tipos-adicional` | Tipos de costo adicional |
| `POST /api/v1/calculos/demo` | Cálculo DEMO |
| `GET /api/v1/openapi.json` | Especificación OpenAPI 3.1 |

Detalle y ejemplos en [`docs/api/README.md`](../api/README.md).

- **Construcción de respuestas:** todas se construyen por lista explícita de campos.
- **Opciones de precio:** no publican precio ni contenido; `esMenorPrecio` reproduce el marcador «(*)» del libro.
- **Avisos del cálculo:** AV-01 y AV-03 se reescriben sin importes ni datos de compra.

### 4. Mapa de errores

Todas las respuestas de error usan el mismo sobre: `{ error: { codigo, mensaje, solicitudId, campos? | faltantes? | problemas? } }`.

| HTTP | `codigo` | Origen |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA` | Contrato (Zod), JSON mal formado o reglas de captura del motor (`ENTRADA_INVALIDA`) |
| 404 | `NO_ENCONTRADO` | Ruta, o códigos que no existen en la organización. Los de otra organización reciben la misma respuesta |
| 413 | `CUERPO_DEMASIADO_GRANDE` | Límite `API_LIMITE_CUERPO_KB` |
| 415 | `TIPO_DE_CONTENIDO_NO_ADMITIDO` | POST sin `application/json` |
| 422 | `CALCULO_BLOQUEADO` | Bloqueos del motor o del ensamblador (BL-xx), sin importes. Una cotización vacía (BL-03) o con parámetros ausentes (BL-12/BL-13) llega aquí, no a 400 |
| 429 | `DEMASIADAS_SOLICITUDES` | Limitador, con `Retry-After` |
| 503 | `SERVICIO_NO_DISPONIBLE` | PostgreSQL inaccesible (Prisma P1001 y similares, códigos de red y 57P0x/08xxx) |
| 500 | `ERROR_INTERNO` | Cualquier otro error. Mensaje genérico; el detalle solo va al registro del servidor con el `solicitudId` |

**Cómo llega cada error al filtro global:**
- El parser JSON y el control de `Content-Type` son middleware de Nest, así que sus errores pasan por el filtro.
- El JSON mal formado se traduce en el propio middleware, porque el adaptador Express de Nest convertiría el `SyntaxError` en un `BadRequestException` con el mensaje técnico.

### 5. Controles del transporte

- **Red:**
  - escucha solo en `127.0.0.1`: `API_HOST` con otro valor hace fallar el arranque;
  - `trust proxy` desactivado, de modo que `X-Forwarded-For` se ignora;
  - sin `X-Powered-By`; query `simple`.
- **CORS:**
  - lista explícita de orígenes locales (`API_CORS_ORIGINS`); `*` y orígenes no locales se rechazan al arrancar;
  - sin credenciales;
  - un origen no permitido recibe la respuesta **sin** `Access-Control-Allow-Origin`, y es el navegador quien la bloquea.
  - CORS no es un mecanismo de autenticación.
- **Helmet:** valores por omisión, con HSTS desactivado (HTTP local).
- **Rate limiting en memoria por IP del socket:**
  - `general`, 120 por minuto, en todas las rutas;
  - `calculo`, 30 por minuto, solo en el cálculo.

  En un despliegue con varias instancias hará falta un almacén compartido (por ejemplo Redis) y revisar la IP del cliente detrás del proxy.
- **Límites:**

  | Elemento | Límite |
  |---|---|
  | Cuerpo | 128 KB |
  | Partidas | 100 |
  | Renglones por partida | 200 |
  | Renglones en total | 1000 |
  | Precios elegidos | 100 |
  | Descripciones | 200 caracteres |
  | Búsqueda | 60 caracteres |
  | Listados | 100 |
  | Conceptos por consulta | 20 |

- **Registro:** id de solicitud generado por el servidor (cabecera `X-Request-Id`; no se confía en el del cliente), método, ruta sin query, estado y duración. Nunca cuerpos, costos ni secretos. Los errores 500 y 503 registran su detalle técnico solo en el servidor.
- **Cierre:** `enableShutdownHooks`. Ante `SIGINT`/`SIGTERM`, Prisma se desconecta (comprobado: registro «Conexiones con PostgreSQL cerradas (SIGINT)» y puerto liberado).

### 6. Configuración validada al arrancar

`src/config/entorno.ts` valida las variables con Zod y falla con mensajes que nunca incluyen valores secretos.

- **`DATABASE_URL`:** debe ser local y no puede usar `postgres` ni `softarq_migrator`.
- **Comprobación adicional contra PostgreSQL** (por si se saltara la validación del entorno): el rol no puede tener privilegios especiales, ni `CREATE` en `public`, ni ser propietario de la base.

### 7. Organización y fecha

- **Organización:**
  - `SOFTARQ_ORGANIZACION_DEMO` (por omisión `DEMO`) se resuelve al arrancar y debe existir, ser DEMO y tener parámetros en ambiente DEMO; si no, el arranque falla;
  - el contexto vive encapsulado en `ContextoSolicitud.de(req)` y **no** procede del cliente;
  - no es autenticación: es el punto que sustituirá el contexto del usuario autenticado.
- **Fecha de cálculo:**
  - es la fecha civil del servidor en `SOFTARQ_ZONA_HORARIA` (por omisión `America/Mexico_City`), obtenida con `Reloj` en la capa de aplicación;
  - llega al motor como `fechaCalculo` y la respuesta la incluye;
  - el dominio no lee el reloj y el cliente no puede enviarla;
  - las pruebas usan `RelojFijo`.

## Consecuencias

- La capa HTTP valida, coordina y presenta; las reglas siguen en el motor y en el ensamblador. El cálculo no escribe en la base (comprobado: los conteos no cambian).
- Cambiar un contrato obliga a regenerar `docs/api/openapi.json` (`openapi:generar`); una prueba lo exige.
- Para exponer la API fuera de `127.0.0.1` (red local, Expo o despliegue) hará falta un ADR nuevo con autenticación, TLS, un limitador compartido y una política de proxy.
