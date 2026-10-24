/**
 * Punto de entrada de la app del cliente (módulo 17, ADR-0021): `@softarq/contracts/cliente`.
 *
 * Solo lo que la app del cliente usa: sesión y errores, el cambio de contraseña, la proyección comercial
 * y los contratos de trabajos, proyectos propios, solicitudes, estimaciones y cotizaciones emitidas.
 * NO incluye contratos internos (catálogos, personas, revisiones, emisiones, excepciones, salidas).
 */
export * from "./decimal.js";
export * from "./vista-comercial.js";
export * from "./api/esquemas.js";
export * from "./api/contrasena.js";
export * from "./api/cliente.js";
