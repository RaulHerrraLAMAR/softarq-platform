# docs

| Documento | Contenido |
|---|---|
| [`fase1-estado-verificado.md`](fase1-estado-verificado.md) | Inspección de solo lectura de la entrega de la fase 1: versiones, huellas MD5, diferencias entre documentos y decisiones del propietario. |
| [`modelo-conceptual.md`](modelo-conceptual.md) | Organización, usuarios, clientes, proyectos y cotizaciones, contrastado con las tablas del Excel (sin implementar). |
| [`calculo/matriz-reglas.md`](calculo/matriz-reglas.md) | Reglas CR-01 a CR-16 y BL del motor: fuente, implementación y prueba; fuera de alcance; discrepancias. |
| [`adr/0001-monorepo-y-stack.md`](adr/0001-monorepo-y-stack.md) | Monorepo y stack. |
| [`adr/0002-demo-local-antes-del-piloto.md`](adr/0002-demo-local-antes-del-piloto.md) | DEMO local antes del piloto PR-44 (aclara el alcance de ADR-0001). |
| [`adr/0003-motor-de-calculo.md`](adr/0003-motor-de-calculo.md) | decimal.js, Vitest, precisión, dominio puro y persistencia aplazada. |
| [`adr/0004-persistencia-catalogos.md`](adr/0004-persistencia-catalogos.md) | PostgreSQL + Prisma: roles, precisión, migraciones, aislamiento por organización y pruebas. |
| [`adr/0005-api-http-local.md`](adr/0005-api-http-local.md) | API HTTP local con NestJS: contratos Zod, errores, límites, CORS, rate limit, contexto DEMO y fecha. |
| [`adr/0006-cliente-web-demo.md`](adr/0006-cliente-web-demo.md) | Cliente web DEMO (React + Vite): estado, huella, sin preselección, configuración, pruebas de navegador. |
| [`api/README.md`](api/README.md) | Endpoints, errores, límites y ejemplos `curl` de la API v1 ([`openapi.json`](api/openapi.json)). |
| [`web/sistema-visual.md`](web/sistema-visual.md) | Sistema visual de la web: tokens, contraste medido, componentes y estados. |
| [`web/guia-prueba-manual.md`](web/guia-prueba-manual.md) | Guía para probar la web en persona (distinta de las pruebas automatizadas). |
| [`herramientas/skills.md`](herramientas/skills.md) | Skills de Claude Code y Codex: fuentes, versiones, activación, adaptaciones y comprobaciones. |

La especificación funcional completa sigue siendo el Word maestro v1.3 de la fase 1 (fuera del repositorio). Aquí se enlaza por sección; no se copia.
