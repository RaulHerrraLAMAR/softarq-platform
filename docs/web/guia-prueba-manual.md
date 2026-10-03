# Guía para probar la web DEMO en persona

Esta guía es para una **prueba futura hecha por una persona**; **todavía no se ha ejecutado**. Las verificaciones automatizadas de los módulos 4 y 5 (Vitest y Playwright) están en `HANDOFF.md` §5 y **no sustituyen** esta prueba ni cuentan como PR-41 o PR-44 de la fase 1 (que son pruebas del libro de Excel).

Todos los datos son DEMO y no tienen validez comercial.

## 1. Preparar (una vez)

Requiere PostgreSQL con `softarq_dev` y el catálogo DEMO cargado: [`apps/api/README.md`](../../apps/api/README.md#preparar-el-entorno-desde-cero).

```
pnpm install --frozen-lockfile
pnpm --filter @softarq/contracts build
pnpm --filter @softarq/api db:migrar               # aplica la migración de usuarios y sesiones
pnpm --filter @softarq/api db:cargar-usuarios-demo # cuentas DEMO (Preparador y Revisor)
```

**Accesos:** abre `D:\Proyecto_SoftArq\_work\secrets\accesos-demo-softarq_dev.json` (archivo local, fuera del repositorio) y usa el correo y la contraseña de `preparador.demo@softarq.test` o `revisor.demo@softarq.test`. No los copies a documentos ni capturas compartidas.

## 2. Abrir

Usa dos terminales, ambas desde la raíz del repositorio:

```
# Terminal 1: API (solo 127.0.0.1:3000, base softarq_dev)
pnpm --filter @softarq/api build
pnpm --filter @softarq/api start

# Terminal 2: web
pnpm --filter @softarq/web dev
```

1. Abre **http://localhost:5173** en el navegador (usa `localhost`, no `127.0.0.1`: la cookie de sesión depende de ello).
2. Para cerrar, pulsa Ctrl+C en cada terminal.

**Si la web no conecta**, comprueba que:
- la API responda en `http://127.0.0.1:3000/health`;
- `apps/web/.env.local` no exista o tenga `VITE_API_URL=http://localhost:3000`;
- la API se haya compilado y reiniciado después de actualizar el repositorio (una API anterior al módulo 5 no tiene `/api/v1/auth` y la web muestra «No se pudo comprobar la sesión»).

## 3. Recorridos sugeridos

Anota lo que observes en cada paso. La fecha de cálculo es la de hoy; con el catálogo DEMO actual, los totales de los ejemplos deben coincidir.

**Acceso y sesión (módulo 5)**

| # | Acción | Qué esperar |
|---|---|---|
| A1 | Abre la web | Pantalla «Iniciar sesión»; ningún ejemplo visible ni datos precargados |
| A2 | Escribe el correo del Preparador y una contraseña incorrecta | «Correo o contraseña incorrectos…» (el mismo mensaje con un correo inexistente) |
| A3 | Usa «Mostrar» en la contraseña y vuelve a ocultarla | El texto se ve y se oculta; pegar y el gestor de contraseñas funcionan |
| A4 | Entra con el Preparador | Barra con «[DEMO] Preparador 1 · Preparador · [DEMO] Organización…» y «Cerrar sesión» |
| A5 | Recarga la página | Sigues dentro sin volver a escribir la contraseña |
| A6 | Carga el Ejemplo 1, calcula y pulsa «Cerrar sesión» | «Sesión cerrada»; al volver a entrar no queda la captura ni el resultado |
| A7 | Entra con el Revisor y carga un ejemplo | Puedes ver y editar la captura, pero «Calcular» está deshabilitado y explica que esa función no calcula |
| A8 | Deja la página abierta más de 30 minutos sin usarla y pulsa «Calcular» | «Su sesión terminó»; hay que entrar de nuevo y la captura no se conserva |
| A9 | Falla la contraseña 5 veces seguidas | «Demasiados intentos»: espera unos 15 minutos (no es un bloqueo permanente) |

**Cotizador**

| # | Acción | Qué esperar |
|---|---|---|
| 1 | Pulsa «Cargar ejemplo» en el Ejemplo 1 | Se rellena la captura con 3 renglones, las opciones elegidas y el transporte; «Sin calcular» y ningún importe |
| 2 | Pulsa «Calcular» | Total **$54,190.68**, leyenda DEMO, aviso AV-03 y «Detalle de la cotización» con 2 partidas |
| 3 | Cambia el largo del «Faldón norte» a 12 | «Pendiente de recalcular»; desaparece el total |
| 4 | Pulsa «Calcular» | Nuevo total distinto; si vuelves a 10 y calculas, otra vez $54,190.68 |
| 5 | Vuelve al inicio y carga los ejemplos 2, 3 y la cotización propia | $43,312.16, $22,405.28 y $4,911.79 |
| 6 | «Iniciar captura propia», busca «CON-00001» y agrégalo | Ninguna opción ni la consolidación vienen elegidas; «Menor precio vigente» solo como marca |
| 7 | Pulsa «Calcular» sin completar | Lista «Faltan datos para calcular» con enlaces; los campos se marcan |
| 8 | Captura largo 4 y ancho 2.5, elige «Consolidar compras», PRE-000001 y PRE-000002, y calcula | **$4,911.79** |
| 9 | Escribe `4,5` en una medida | Mensaje junto al campo: usar punto decimal |
| 10 | En el Ejemplo 1, pon el monto del transporte en 0 y calcula | «Cálculo bloqueado» con BL-11 y ningún importe |
| 11 | Agrega y quita renglones, conceptos y costos adicionales | La numeración de partidas se ajusta y el resultado queda pendiente |
| 12 | Recorre la página solo con Tab, Mayús+Tab, Enter, espacio y flechas | Foco siempre visible; todo control es alcanzable |
| 13 | Reduce la ventana a un ancho de teléfono | Una columna, tablas apiladas, sin desplazamiento horizontal |
| 14 | Detén la API y pulsa «Calcular» | «No hay conexión…» y la captura intacta; al reanudarla, «Reintentar» funciona |

## 4. Qué no hace todavía

- No guarda la captura: se pierde al recargar o cerrar la página.
- Sin registro de usuarios, recuperación de contraseña, folios, revisión ni aprobación, emisión, PDF ni app móvil.
- Solo punto decimal (por ejemplo, `0.12`).
