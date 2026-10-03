# apps/web — Cliente web DEMO de SoftArq

- **Estado (03/10/2026):** módulo 4, cliente web DEMO sobre la API local ([ADR-0006](../../docs/adr/0006-cliente-web-demo.md)); módulo 5, acceso con sesión ([ADR-0007](../../docs/adr/0007-autenticacion-sesiones.md)); módulo 6, clientes, proyectos y cotizaciones guardadas con versiones ([ADR-0008](../../docs/adr/0008-cotizaciones-versiones-folios.md)).
- **Tecnología:** React 19.3, TypeScript 7 (solo tipos), Vite 8.3, Zod 4.6 (los esquemas de `@softarq/contracts`), Vitest 5 con jsdom y Playwright 1.63 con Edge.

## Qué hace

0. **Acceso:** correo y contraseña de una cuenta DEMO; la sesión se restaura al recargar consultando al servidor. La barra muestra nombre, función y organización y permite cerrar sesión. Al cerrar, vencer o cambiar de usuario se descartan la captura, los resultados y las consultas pendientes.
1. **Inicio:** cuatro ejemplos verificados y una captura propia.
2. **Partidas y medidas:** búsqueda de conceptos y renglones con los campos que usa cada fórmula, con unidades visibles y punto decimal.
3. **Opciones disponibles:** selección explícita por insumo, sin preselección; la marca «Menor precio vigente» solo informa. Incluye la consolidación de compras.
4. **Costos adicionales** (opcionales).
5. **Resultado:** cálculo en el servidor, con total, subtotal, impuesto, avisos, detalle, bloqueos y estados de error. Con la función Revisor, «Calcular» aparece deshabilitado con su motivo (la API responde 403 de todos modos).
6. **Navegación (módulo 6):** Calculadora DEMO (página inicial) · Cotizaciones · Clientes · Proyectos, con una URL por pantalla (`#/cotizaciones/{id}`…); al recargar se vuelve a la misma pantalla con lo guardado en el servidor.
7. **Clientes y proyectos:** buscar, crear, editar, desactivar y reactivar (sin borrar).
8. **Cotizaciones:** nueva cotización (cliente → proyecto → folio WEB DEMO), «Guardar como cotización» desde la calculadora sin perder la captura, borrador con «Guardar borrador» y aviso de cambios sin guardar, vista previa (no se guarda), «Calcular y guardar versión» (lo calcula y guarda el servidor), historial de versiones y eventos, consulta de cada versión tal como se guardó y resolución de conflictos entre pestañas sin pérdida. El Revisor solo consulta.

**Lo que no hace:**
- no calcula importes;
- no conoce costos, precios de proveedor, consumos ni parámetros;
- no guarda la captura por su cuenta: el borrador lo guarda el servidor y la calculadora sigue sin guardarse;
- no guarda tokens: la cookie de sesión es HttpOnly y el token CSRF vive solo en memoria (sin `localStorage` ni `sessionStorage`);
- no contiene credenciales ni accesos automáticos.

## Comandos

Desde la raíz del repositorio, con la API en marcha (`pnpm --filter @softarq/api start`):

```
pnpm --filter @softarq/contracts build   # la web usa contracts compilado
pnpm --filter @softarq/web dev           # http://localhost:5173 (escucha en 127.0.0.1, strictPort)
pnpm --filter @softarq/web build         # tipos + compilación en dist/
pnpm --filter @softarq/web preview       # sirve dist/ en 127.0.0.1:4173
pnpm --filter @softarq/web test          # Vitest: estado, cliente HTTP y componentes
pnpm verificar:e2e                       # Playwright: web compilada + API real + softarq_test
```

- **Configuración pública:** `VITE_API_URL` (ver `.env.example`). Por omisión es `http://localhost:3000`. Debe ser `http://localhost` con puerto, sin ruta ni credenciales; si no, la compilación o el arranque fallan. Nunca contiene secretos.
- **Por qué `localhost`:** la web se abre en `http://localhost:5173`; con la API en `127.0.0.1`, el navegador la trataría como otro *site* y no enviaría la cookie `SameSite=Strict`. La API sigue escuchando solo en `127.0.0.1`.
- **Sin proxy:** la web llama a la API directamente con credenciales, y la API permite el origen exacto `http://localhost:5173` por CORS.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/api/` | Cliente HTTP centralizado (validación con esquemas, clasificación de errores, cancelación, cookie con credenciales, CSRF en memoria y descarte por generación de sesión) y funciones por endpoint |
| `src/sesion/` | Proveedor de sesión (restauración, acceso, cierre, vencimiento), pantalla de acceso, barra de sesión y raíz |
| `src/catalogos/` | Consultas con `AbortController` y «la última gana» |
| `src/captura/` | Reducer de la captura, armado y validación de la solicitud, huella, secciones de captura; `usarCaptura` y `VistaCaptura` (un solo formulario para calculadora y cotización); `borrador.ts` (captura ↔ borrador, cambios sin guardar y diferencias) |
| `src/navegacion/` | Enrutador por hash con guarda de cambios sin guardar |
| `src/clientes/`, `src/cotizaciones/` | Pantallas de clientes, proyectos, cotizaciones, editor del borrador y versiones |
| `src/calculo/` | Estado del cálculo (sin duplicados, descarte de respuestas atrasadas) y panel de resultado |
| `src/ejemplos/` | Entradas públicas de los 4 escenarios (copia de `docs/api/ejemplos`, sin totales) |
| `src/inicio/`, `src/comunes/`, `src/estilos/`, `src/config/` | Inicio, componentes comunes y formato es-MX, sistema visual, configuración |
| `e2e/` | Pruebas Playwright |

Sistema visual: [`docs/web/sistema-visual.md`](../../docs/web/sistema-visual.md). Guía de prueba manual: [`docs/web/guia-prueba-manual.md`](../../docs/web/guia-prueba-manual.md).

## Pruebas de navegador

`pnpm verificar:e2e`:
1. compila contracts y el arranque de pruebas de la API (`apps/api` `build:e2e`);
2. Playwright levanta la API en `127.0.0.1:3101` sobre **softarq_test**, con fecha fija 2026-09-25, el DEMO recién cargado y cuentas de prueba nuevas en cada corrida (`_work\secrets\accesos-e2e.json`), y la web compilada en `127.0.0.1:4173`. El navegador abre `http://localhost:4173` y llama a `http://localhost:3101`; cada prueba inicia sesión con el formulario;
3. se ejecuta con un solo worker y el Edge instalado (sin descargar navegadores).

**Salidas:** en `D:\Proyecto_SoftArq\_work\`:
- `playwright\informe`: informe HTML;
- `playwright\resultados`: trazas de los fallos;
- `evidencias\modulo4`, `evidencias\modulo5` y `evidencias\modulo6`: capturas de escritorio y móvil.

No lo ejecutes a la vez que `pnpm verificar:integracion`: ambos usan `softarq_test`.

## Reglas

- Solo se importa `@softarq/contracts`; nunca `apps/api`, Prisma, el motor ni fixtures. Una prueba lo vigila.
- Decimales siempre como texto, nunca `number`.
- Ningún importe se muestra si el resultado no corresponde a la captura actual o si el cálculo está bloqueado.
- Textos recibidos como texto (sin HTML interpretado). Sin recursos de CDN.
