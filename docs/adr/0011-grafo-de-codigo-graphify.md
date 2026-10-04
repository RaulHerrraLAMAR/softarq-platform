# ADR-0011 — Grafo de código local con Graphify para Claude Code y Codex

- **Fecha:** 04/10/2026
- **Estado:** aceptada
- **Ámbito:**
  - `.graphifyignore`;
  - `scripts/grafo/grafo.mjs` y los scripts `grafo:*` de `package.json`;
  - `.claude/settings.json` (hook `SessionStart`);
  - `AGENTS.md` §12 y `CLAUDE.md`;
  - [`docs/herramientas/graphify.md`](../herramientas/graphify.md).

  Herramienta de desarrollo: no forma parte de la aplicación ni de sus dependencias.

## Contexto

Cada tarea de los agentes empieza explorando de nuevo el monorepo para encontrar los archivos de un módulo y sus relaciones. El propietario ya tenía instalado Graphify (`graphifyy` 0.8.5), que construye un grafo de código consultable. Pidió integrarlo para Claude Code y Codex con estas condiciones:
- sin llamadas a modelos ni servicios externos;
- con exclusiones verificadas;
- sin sobrescribir las reglas existentes;
- con un mantenimiento incremental que no deje procesos permanentes.

## Decisión

1. **Solo grafo estructural (AST).**
   - Se usa `graphify update` a través de `scripts/grafo/grafo.mjs`, que retira del entorno las variables de proveedores.
   - No se usan `extract`, la skill `/graphify`, `add` ni `watch`.
   - No se añaden claves, cuentas ni dependencias.
2. **No se usan los instaladores de Graphify.** `install --project` no existe en 0.8.5. `install` escribe en `~/.claude` (global). `claude install` y `codex install` añaden reglas en inglés que obligan a leer el informe completo y reescriben el archivo con finales CRLF. El hook de Codex no hace nada. La rutina equivalente se redactó en `AGENTS.md` §12 (común) y `CLAUDE.md` (específico).
3. **Alcance mediante `.graphifyignore`**, verificado con `pnpm grafo:archivos`:
   - incluye el código propio de API, web, contratos y scripts;
   - excluye secretos, compilaciones, cachés, datos, documentos, Office/PDF, código generado, skills de terceros, documentación y SQL.

   El SQL y `schema.prisma` no se pueden extraer en 0.8.5 y se leen directamente.
4. **Reconstrucción limpia en cada actualización.** `graphify update .` conserva los nodos del grafo anterior, así que imports y archivos eliminados persistirían (comprobado). Se aparta `graph.json` antes de reconstruir y se conserva la caché AST.
5. **Vigencia verificable.** `softarq-estado.json` guarda el SHA-256 de cada archivo indexado y de `.graphifyignore`. Además:
   - `estado` informa VIGENTE, DESACTUALIZADO, PENDIENTE o AUSENTE;
   - el estado se marca PENDIENTE antes de reconstruir, y un candado evita reconstrucciones simultáneas.
6. **Disparadores:**
   - hooks de Git `post-checkout` (cambio de rama) y `post-merge`, que lanzan **una** actualización desacoplada para no bloquear Git unos 25 s;
   - hook `SessionStart` de Claude Code que solo informa;
   - Codex sigue la rutina escrita.

   No hay reconstrucción por edición ni procesos permanentes.
7. **Salida dentro del repositorio en D:** (`graphify-out/`), ignorada por Git y regenerable con `pnpm grafo:actualizar`.

## Consecuencias

- Los agentes pueden preguntar por relaciones concretas (`query`, `explain`, `path`) sin recorrer el repositorio. Toda relación se verifica en las fuentes antes de editar.
- **Huecos conocidos**, que se cubren con `rg` o lectura directa:
  - SQL, Prisma, documentación, cadenas y comentarios (por ejemplo, los códigos BL o CR);
  - los archivos `tokens.ts`, que Graphify omite como sensibles.
- **Coste de cada actualización:** unos 15–30 s y de 5 a 30 s de CPU de Python.
- **Mantenimiento:** si se actualiza Graphify, hay que repetir las comprobaciones de [`graphify.md`](../herramientas/graphify.md) §6, porque la conservación de nodos y las opciones del CLI pueden cambiar.
- **Ahorro de tokens:** no se ha medido y por eso no se afirma.

## Alternativas descartadas

- **Instaladores de Graphify:** escritura global, reglas contradictorias y CRLF.
- **`graphify hook install`:** registros en C:, `SIGALRM` inexistente en Windows y el problema de conservación de nodos.
- **`graphify watch`:** proceso permanente.
- **Extracción semántica con modelos:** coste y envío de código a terceros.
