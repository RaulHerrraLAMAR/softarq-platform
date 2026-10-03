/** Tokens de inyección: toda dependencia se inyecta con @Inject(TOKEN), sin depender de metadatos de tipos. */
export const CONFIGURACION = Symbol("CONFIGURACION");
export const BASE_DE_DATOS = Symbol("BASE_DE_DATOS");
export const REPOSITORIO_CATALOGOS = Symbol("REPOSITORIO_CATALOGOS");
export const RELOJ = Symbol("RELOJ");
export const SERVICIO_AUTENTICACION = Symbol("SERVICIO_AUTENTICACION");
export const RELOJ_SESIONES = Symbol("RELOJ_SESIONES");
