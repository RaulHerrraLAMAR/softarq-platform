/**
 * Punto de entrada mínimo para la app móvil (módulo 16, ADR-0020): `@softarq/contracts/movil`.
 *
 * Solo lo que la app consulta: sesión móvil y errores, clientes, proyectos y cotizaciones (versiones,
 * estados e historial), la proyección comercial y el cambio de contraseña. NO incluye los contratos
 * internos (administración de catálogos, parámetros y personas, excepciones, salidas internas,
 * emisiones, revisiones ni respuestas), para que no viajen al teléfono definiciones que no usa.
 *
 * Cualquier cosa nueva que la app necesite se añade aquí de forma explícita.
 */
export * from "./decimal.js";
export * from "./vista-comercial.js";
export * from "./api/esquemas.js";
export * from "./api/cotizaciones.js";
export * from "./api/contrasena.js";
