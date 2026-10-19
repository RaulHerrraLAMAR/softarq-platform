import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return n === "__tests__" || n === "pruebas" ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(n) ? [ruta] : [];
  });
}

describe("la web no contiene fórmulas ni costos internos", () => {
  // Campos internos del motor (EntradaCalculo / ResultadoCalculado) que nunca deben llegar al cliente.
  const PROHIBIDO = /costo|consumo|rendimiento|desperdicio|margen|recargo|tarifa|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;

  // Excepción explícita y acotada (módulo 10, ADR-0014): la carpeta `excepciones/` muestra, con su
  // contrato interno y su capacidad propia, el rendimiento y el desperdicio que se exceptúan. Ahí siguen
  // prohibidos costos, consumos, márgenes, recargos, tarifas, traslapes y sobrantes.
  const PROHIBIDO_EN_EXCEPCIONES = /costo|consumo|margen|recargo|tarifa|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enExcepciones = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "excepciones";

  // Excepción explícita y acotada (módulo 11, ADR-0015): la carpeta `catalogo-admin/` es la pantalla
  // del Administrador del catálogo, con contrato interno y capacidad propia (`catalogos.administrar`):
  // muestra tarifas, su rendimiento por jornada y precios de proveedor. Siguen prohibidos costos,
  // consumos, márgenes, recargos, desperdicios, traslapes y sobrantes, y nada de esto pasa a la
  // cotización comercial ni al PDF. Estar en esta carpeta no protege nada por sí solo: el acceso real lo
  // comprueba la integración de la API (`acceso-admin.integracion.test.ts`: 403 en todas las rutas /admin
  // para las demás funciones y respuestas comerciales sin datos técnicos).
  const PROHIBIDO_EN_CATALOGO = /costo|consumo|margen|recargo|desperdicio|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enCatalogo = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "catalogo-admin";

  // Excepción explícita y acotada (módulo 12, ADR-0016): la carpeta `catalogo-tecnico/` administra
  // insumos, conversiones, conceptos y componentes del Administrador del catálogo: muestra
  // rendimientos, desperdicios, traslapes, factores y tarifas. Siguen prohibidos costos, consumos,
  // márgenes, recargos y sobrantes. Igual que la anterior, el acceso real lo comprueba la API
  // (`acceso-admin.integracion.test.ts` recorre también las rutas del módulo 12).
  const PROHIBIDO_EN_TECNICO = /costo|consumo|margen|recargo|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enTecnico = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "catalogo-tecnico";

  // Excepción explícita y acotada (módulo 13, ADR-0017): la carpeta `administracion/` es la pantalla
  // del Administrador del sistema, con contrato interno y capacidades propias (`parametros.administrar`):
  // edita el recargo (RECARGO_PCT, que se suma al costo directo) como en 17 CONFIG. Siguen prohibidos
  // consumos, rendimientos, desperdicios, márgenes, tarifas, traslapes y sobrantes; ningún importe
  // interno llega a la pantalla. El acceso real lo comprueba la API (`acceso-admin.integracion.test.ts`
  // separa las rutas del sistema de las del catálogo).
  const PROHIBIDO_EN_ADMINISTRACION = /consumo|rendimiento|desperdicio|margen|tarifa|traslape|sobrante[A-Z]|precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enAdministracion = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "administracion";

  // Excepción explícita y acotada (módulo 14, ADR-0018): la carpeta `salidas-internas/` muestra, con su
  // contrato interno y su capacidad propia (`salidas.consultar`, Preparador y Revisor), las compras
  // calculadas, el detalle y los indicadores de una versión: costos, consumos, rendimientos,
  // desperdicios, traslapes, tarifas, sobrantes, recargo y margen. Siguen prohibidos los módulos de la
  // API, Prisma y las fixtures. Nada de esto pasa a la cotización comercial ni al PDF; el acceso real lo
  // comprueba la API (`salidas-internas.integracion.test.ts`: 403 para los administradores, 404 entre
  // organizaciones y contratos comerciales sin estos campos).
  const PROHIBIDO_EN_SALIDAS = /precioProveedor|@softarq\/api|prisma|apps\/api|fixtures/i;
  const enSalidas = (archivo: string) => relative(SRC, archivo).split(/[\\/]/)[0] === "salidas-internas";

  it.each(archivos(SRC).map((a) => [relative(SRC, a), a]))("%s", (_nombre, archivo) => {
    const lineas = readFileSync(archivo, "utf-8")
      .split("\n")
      // Los textos de interfaz pueden mencionar «costos adicionales» (partidas ADICIONAL del contrato).
      .filter((l) => !/costos? adicional|Costo adicional|costo que usted captura/i.test(l));
    const patron = enExcepciones(archivo)
      ? PROHIBIDO_EN_EXCEPCIONES
      : enCatalogo(archivo)
        ? PROHIBIDO_EN_CATALOGO
        : enTecnico(archivo)
          ? PROHIBIDO_EN_TECNICO
          : enAdministracion(archivo)
            ? PROHIBIDO_EN_ADMINISTRACION
            : enSalidas(archivo)
              ? PROHIBIDO_EN_SALIDAS
              : PROHIBIDO;
    expect(lineas.filter((l) => patron.test(l))).toEqual([]);
  });

  it("la excepción del módulo 10 cubre solo la carpeta excepciones/ y sus tres archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enExcepciones)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual(["excepciones/PanelExcepcionesVersion.tsx", "excepciones/SeccionExcepciones.tsx", "excepciones/modelo.ts"]);
  });

  it("la excepción del módulo 11 cubre solo la carpeta catalogo-admin/ y sus archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enCatalogo)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual([
      "catalogo-admin/PantallasCatalogo.tsx",
      "catalogo-admin/SelectorRegistro.tsx",
      "catalogo-admin/buscadores.ts",
      "catalogo-admin/campos.tsx",
      "catalogo-admin/fallos.ts",
      "catalogo-admin/fechas.ts",
      "catalogo-admin/piezas.tsx",
      "catalogo-admin/servicios.ts",
    ]);
  });

  it("la excepción del módulo 12 cubre solo la carpeta catalogo-tecnico/ y sus archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enTecnico)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual(["catalogo-tecnico/PantallasTecnicas.tsx"]);
  });

  it("la excepción del módulo 13 cubre solo la carpeta administracion/ y sus archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enAdministracion)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual(["administracion/PantallasAdministracion.tsx", "administracion/porcentaje.ts", "administracion/servicios.ts"]);
  });

  it("la excepción del módulo 14 cubre solo la carpeta salidas-internas/ y sus archivos", () => {
    const cubiertos = archivos(SRC)
      .filter(enSalidas)
      .map((a) => relative(SRC, a).split(/[\\/]/).join("/"));
    expect(cubiertos.sort()).toEqual(["salidas-internas/PantallaSalidasInternas.tsx"]);
  });

  it("no hay HTML interpretado", () => {
    for (const a of archivos(SRC)) expect(readFileSync(a, "utf-8")).not.toContain("dangerouslySetInnerHTML");
  });
});
