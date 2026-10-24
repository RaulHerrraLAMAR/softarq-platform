// Lo que NUNCA debe viajar en el bundle de la app (ADR-0020 §6): código del servidor, credenciales de base
// de datos, rutas de la laptop, tokens y definiciones de contratos internos. Lo usan
// `comprobar-bundle.mjs` (sobre el bundle real) y su prueba unitaria.
export const PROHIBIDOS = [
  // Servidor y base de datos
  { grupo: "servidor", patron: /@prisma\/|PrismaClient|@nestjs\/|@node-rs\/|argon2/i },
  { grupo: "servidor", patron: /postgres(?:ql)?:\/\/|DATABASE_URL|SHADOW_DATABASE_URL|MIGRATION_DATABASE_URL|RESPALDO_DATABASE_URL|pg_dump|pg_restore/ },
  { grupo: "servidor", patron: /softarq_(?:migrator|app|respaldo|restauracion|test|shadow)\b/ },
  { grupo: "motor", patron: /decimal\.js|Decimal\.set\(/ },
  // Rutas y datos de la laptop
  { grupo: "rutas", patron: /Proyecto_SoftArq|softarq-platform[\\/]+apps|[A-Za-z]:\\\\?Users\\\\|\/Users\/|\/home\/[a-z]+\//i },
  // Credenciales y sesiones
  { grupo: "secretos", patron: /Bearer [A-Za-z0-9_-]{30,}/ },
  { grupo: "secretos", patron: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|EXPO_TOKEN|keystore_password|key_password/i },
  { grupo: "web", patron: /softarq_sesion/ },
  // Contratos internos (costos, márgenes, proveedores de compra): no deben ni definirse en el teléfono
  { grupo: "interno", patron: /costoCompra|costoProrrateado|consumoBase|costoMateriales|costoDirectoRedondeado|recargoSobreCosto|referenciasInternas|resultadoInterno|SalidasInternas/ },
  // Contratos del equipo y la administración (accesos, referencias de estimación, definición de trabajos,
  // bandeja): viven en `cliente-equipo.ts`, fuera de `@softarq/contracts/cliente`. Se buscan sus claves
  // exclusivas; `proveedor`, `insumoCodigo` y similares también existen en los esquemas generales de
  // `esquemas.ts` (límite conocido, ADR-0021), así que no pueden usarse como señal.
  { grupo: "equipo", patron: /contrasenaTemporal|temporalExpiraEn|designadaEn|folioCotizacion|SolicitudEquipo|DefinicionTrabajo|ReferenciaEstimacion/ },
];

/** Devuelve los hallazgos (grupo + coincidencia) de un texto de bundle; vacío si está limpio. */
export function buscarProhibidos(texto) {
  const hallazgos = [];
  for (const { grupo, patron } of PROHIBIDOS) {
    const m = patron.exec(texto);
    if (m) hallazgos.push({ grupo, coincidencia: m[0].slice(0, 60) });
  }
  return hallazgos;
}
