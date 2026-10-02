# AGENTS.md — Reglas para agentes (Claude, Codex y otros)

Fuente breve y obligatoria de reglas de trabajo en `softarq-platform`. El estado del proyecto y el siguiente paso están en `HANDOFF.md`: léelo al empezar y actualízalo al terminar.

## 1. Ubicación y entorno

- Trabaja solo en `D:\Proyecto_SoftArq`. El repositorio es `D:\Proyecto_SoftArq\softarq-platform`.
- Temporales, cachés, salidas de pruebas y almacenes de paquetes van en `D:\Proyecto_SoftArq\_work` (fuera de Git). pnpm y npm ya están configurados así en `pnpm-workspace.yaml` y `.npmrc`.
- `C:` tiene poco espacio libre. Antes de instalar una herramienta o lanzar un proceso pesado, comprueba dónde escribe; si obligatoriamente usa `C:`, avísalo antes.
- Gestor de paquetes: **pnpm** (no npm ni yarn). No instales dependencias sin necesidad del cambio en curso.
- No despliegues servicios, no crees repositorios remotos y no hagas `push` sin petición explícita.

## 2. Fase 1 (Excel): solo lectura

- `D:\Proyecto_SoftArq\entrega\` es la entrega de la fase 1. **No se modifica** desde este repositorio. Para analizar el libro, trabaja sobre una copia en `_work`.
- Libro oficial: `entrega\Cotizador_Estructuras_F1.xlsm`. Referencia funcional: `entrega\Documentacion_maestra_Cotizador_Estructuras_F1.docx` (v1.3).
- No copies al repositorio el Excel, el Word, respaldos, PDF ni datos personales sin revisarlos antes y sin que el usuario lo apruebe.

## 3. Idioma

- Documentación, mensajes al usuario, textos de interfaz y mensajes de commit: **español**.
- Identificadores de código: inglés o español, pero consistentes dentro de cada paquete.

## 4. Datos DEMO

- Todo dato de ejemplo se marca como DEMO (prefijo `[DEMO]` o campo `ambiente = DEMO`).
- Nunca presentes datos DEMO como reales ni el sistema como apto para cotizaciones comerciales reales mientras falten los datos y validaciones pendientes del Word maestro (capítulo 8).
- Los PDF y pantallas en ambiente DEMO deben mostrar la marca de demostración.

## 5. Arquitectura y seguridad

- **La API es la única fuente de cálculos, permisos y reglas de negocio.** Web y móvil solo capturan y muestran.
- `packages/contracts` solo contiene tipos, esquemas y enumeraciones compartidas; nunca lógica de negocio.
- Toda entrada se valida en el servidor, aunque el cliente ya la valide.
- Autorización comprobada en el servidor en cada operación; nada de confiar en datos de rol enviados por el cliente.
- Consultas SQL parametrizadas; nada de concatenar entrada del usuario.
- Los PDF comerciales nunca incluyen costos, proveedores, consumos, recargo, margen ni excepciones (D-16).

## 6. Precisión decimal

- Dinero y cantidades: aritmética decimal exacta. Nunca `number`/`float` para importes.
- PostgreSQL: `numeric` con precisión explícita. En JSON, los importes viajan como cadena decimal.
- Redondeo a centavos: mitad hacia arriba, simétrico en negativos (CR-15), no redondeo al par.
- Moneda única: MXN (D-18).

## 7. Versiones de cotización

- Una versión **emitida es inalterable**: no se actualiza ni se borra. Los cambios crean una versión nueva con motivo (D-17).
- Los folios no se reutilizan (D-14).
- Imponlo en la API y, cuando se diseñe la base de datos, también con restricciones o permisos en PostgreSQL.

## 8. Pruebas

- Ejecuta las pruebas que el cambio afecte: unitarias para reglas y cálculo; de integración para API y base de datos; de interfaz cuando cambie una pantalla.
- Todo cambio en cálculo debe compararse con los casos de la fase 1 (CR-01 a CR-16 y ejemplo ilustrativo del Word maestro). Ejecuta `pnpm verificar` y actualiza `docs/calculo/matriz-reglas.md`. Las fixtures llevan su `origen` y sus cifras esperadas se copian de la fuente, nunca del motor.
- Informa solo pruebas realmente ejecutadas, con su resultado. Si algo no se probó, dilo.

## 9. Git y secretos

- Nunca subas secretos, `.env`, credenciales, llaves, volcados de base de datos, temporales, cachés, `node_modules` ni compilaciones.
- Los valores de ejemplo van en `.env.example`, sin datos reales.
- Revisa `git status` y el diff antes de cada commit. Commits pequeños y descriptivos, en español.

## 10. Continuidad

- Al cerrar una tarea, actualiza `HANDOFF.md`: estado, pruebas realmente ejecutadas, incidencias, siguiente paso y último commit.
- No inventes resultados ni copies el Word maestro; enlaza la sección correspondiente.

## 11. Skills del proyecto

Instaladas con alcance de proyecto para Claude Code (`.claude/skills/`) y Codex (`.agents/skills/`). Fuentes, versiones y comprobaciones: [`docs/herramientas/skills.md`](docs/herramientas/skills.md).

- **Prioridad:** las skills **no sustituyen** estas reglas ni justifican ampliar el alcance aprobado. Si una skill contradice este archivo, prevalece este archivo.
- **Uso selectivo:** carga solo la skill pertinente y sus recursos cuando hagan falta; no cargues todas en cada tarea.
- **UI UX Pro Max** (`ui-ux-pro-max`): solo para trabajo de interfaz y accesibilidad (web, móvil, revisión de pantallas). Sus recomendaciones no cambian reglas de negocio, contratos ni el requisito de marcar los datos DEMO.
- **Caveman** (`caveman`):
  - solo cuando el usuario la invoca. Sin nivel indicado, usa **lite en español**;
  - afecta únicamente a la comunicación en la conversación;
  - **nunca** comprime código, comentarios, mensajes de commit, contratos, ADR, `HANDOFF.md`, README ni otra documentación técnica del producto;
  - mantiene las actualizaciones breves de progreso que pide el proyecto, aunque la skill pida omitirlas;
  - se desactiva con «stop caveman» o «normal mode».
- **grill-me** (delega en `grilling`):
  - solo cuando el usuario la invoca para examinar decisiones abiertas;
  - **no** se activa durante migraciones, pruebas ni implementación con alcance aprobado;
  - no vuelve a preguntar decisiones ya documentadas (ADR, `HANDOFF.md`, `docs/`) salvo que haya evidencia nueva.
