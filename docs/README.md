# docs

| Documento | Contenido |
|---|---|
| [`fase1-estado-verificado.md`](fase1-estado-verificado.md) | Inspección de solo lectura de la entrega de la fase 1: versiones, huellas MD5, diferencias entre documentos y decisiones del propietario. |
| [`modelo-conceptual.md`](modelo-conceptual.md) | Organización, usuarios, pertenencias, clientes, proyectos y cotizaciones, contrastado con las tablas del Excel; matriz de permisos vigente. |
| [`calculo/matriz-reglas.md`](calculo/matriz-reglas.md) | Reglas CR-01 a CR-16 y BL del motor: fuente, implementación y prueba; fuera de alcance; discrepancias. |
| [`adr/0001-monorepo-y-stack.md`](adr/0001-monorepo-y-stack.md) | Monorepo y stack. |
| [`adr/0002-demo-local-antes-del-piloto.md`](adr/0002-demo-local-antes-del-piloto.md) | DEMO local antes del piloto PR-44 (aclara el alcance de ADR-0001). |
| [`adr/0003-motor-de-calculo.md`](adr/0003-motor-de-calculo.md) | decimal.js, Vitest, precisión, dominio puro y persistencia aplazada. |
| [`adr/0004-persistencia-catalogos.md`](adr/0004-persistencia-catalogos.md) | PostgreSQL + Prisma: roles, precisión, migraciones, aislamiento por organización y pruebas. |
| [`adr/0005-api-http-local.md`](adr/0005-api-http-local.md) | API HTTP local con NestJS: contratos Zod, errores, límites, CORS, rate limit, contexto DEMO y fecha. |
| [`adr/0006-cliente-web-demo.md`](adr/0006-cliente-web-demo.md) | Cliente web DEMO (React + Vite): estado, huella, sin preselección, configuración, pruebas de navegador. |
| [`adr/0007-autenticacion-sesiones.md`](adr/0007-autenticacion-sesiones.md) | Usuarios DEMO, sesiones opacas en PostgreSQL, Argon2id, cookie, CSRF, límites de acceso, matriz de permisos y aislamiento por organización. |
| [`adr/0008-cotizaciones-versiones-folios.md`](adr/0008-cotizaciones-versiones-folios.md) | Clientes, proyectos y cotizaciones: folios WEB DEMO, borrador con revisión, versiones inmutables en dos fases, idempotencia, estados y permisos. |
| [`adr/0009-revision-aprobacion.md`](adr/0009-revision-aprobacion.md) | Revisión y aprobación: contraste con el libro, estados por revisión, verificación vigente sin recalcular, BL-17 por identidad, concurrencia, idempotencia e historial de solo alta. |
| [`adr/0010-emision-pdf-anulacion-descarte.md`](adr/0010-emision-pdf-anulacion-descarte.md) | Emisión de versiones aprobadas (quién emite: adaptación autorizada), textos por versión, registro inmutable, PDF DEMO con PDFKit, carpeta persistente, consistencia base y disco, recuperación, anulación de la aprobación y descarte. |
| [`adr/0011-grafo-de-codigo-graphify.md`](adr/0011-grafo-de-codigo-graphify.md) | Grafo de código local con Graphify para Claude Code y Codex: solo AST, sin instaladores, reconstrucción limpia, vigencia verificable y hooks. |
| [`adr/0012-respaldo-y-restauracion-local.md`](adr/0012-respaldo-y-restauracion-local.md) | Respaldo coherente de softarq_dev y sus PDF (instantánea compartida), rol de solo lectura, restauración solo en un destino aislado y prueba de recuperación real. |
| [`adr/0013-seguimiento-respuestas-vigencia.md`](adr/0013-seguimiento-respuestas-vigencia.md) | Seguimiento interno por emisión: respuesta recibida, vigencia derivada y correcciones con historial. |
| [`adr/0014-excepciones.md`](adr/0014-excepciones.md) | Excepciones B-22: registro en el borrador, congeladas en la versión, autorización del Revisor, AV-04, BL-04/05/09 con excepción y contrato interno. |
| [`adr/0015-administracion-catalogos.md`](adr/0015-administracion-catalogos.md) | Administración de proveedores, productos, precios y tarifas: bloqueo técnico del producto con precios, cierre de vigencia con sucesor (P3 pendiente), asignación de tarifa, historial, permisos y efecto en el cotizador. |
| [`cobertura-demo.md`](cobertura-demo.md) | Matriz de cobertura del DEMO frente al Excel y al alcance documentado, bloques restantes y estimación. |
| [`operacion/respaldo-y-restauracion.md`](operacion/respaldo-y-restauracion.md) | Comandos de respaldo, verificación y restauración; manifiesto; tratamiento de roles, permisos y sesiones; conservación; resultados verificados. |
| [`api/README.md`](api/README.md) | Endpoints, errores, límites y ejemplos `curl` de la API v1 ([`openapi.json`](api/openapi.json)). |
| [`web/sistema-visual.md`](web/sistema-visual.md) | Sistema visual de la web: tokens, contraste medido, componentes y estados. |
| [`web/guia-prueba-manual.md`](web/guia-prueba-manual.md) | Guía para probar la web en persona (distinta de las pruebas automatizadas). |
| [`herramientas/skills.md`](herramientas/skills.md) | Skills de Claude Code y Codex: fuentes, versiones, activación, adaptaciones y comprobaciones. |
| [`herramientas/graphify.md`](herramientas/graphify.md) | Grafo de código local (Graphify 0.8.5, solo AST): alcance, exclusiones, comandos, vigencia, hooks, comprobaciones y limitaciones. |

La especificación funcional completa sigue siendo el Word maestro v1.3 de la fase 1 (fuera del repositorio). Aquí se enlaza por sección; no se copia.
