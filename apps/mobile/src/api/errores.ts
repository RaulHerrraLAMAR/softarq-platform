/**
 * Fallos de la API tal como los ve la app del cliente (ADR-0020, ADR-0021). La API decide siempre: la app
 * solo los clasifica para mostrar el estado adecuado (reintento, sesión vencida, cambio de contraseña, etc.).
 */
export type TipoFallo =
  | "red" //                   sin conexión, tiempo agotado o la API no responde
  | "sesion" //                401 con token: sesión vencida, cerrada, revocada o acceso desactivado
  | "credenciales" //          401 al iniciar sesión (mensaje único de la API)
  | "temporal_caducada" //     la contraseña temporal caducó
  | "cambio_contrasena" //     403: hay que cambiar la contraseña temporal
  | "cuenta_interna" //        403 al iniciar sesión: la cuenta es del equipo y usa el panel web
  | "sin_permiso" //           403: la cuenta ya no permite la operación
  | "no_encontrado" //         404 (también lo que pertenece a otro cliente)
  | "invalido" //              400/422: la solicitud no es válida (con campos)
  | "conflicto" //             409: revisión obsoleta, solicitud ya enviada o estado que no lo permite
  | "limite" //               429
  | "servidor" //             5xx o error inesperado de la API
  | "respuesta_invalida" //    la respuesta no coincide con el contrato (versiones distintas de app y API)
  | "cancelada"; //            descartada: otra cuenta, otra pantalla o la persona la canceló

export interface CampoInvalido {
  ruta: string;
  mensaje: string;
}

export interface DetalleFallo {
  estado?: number;
  codigo?: string;
  reintentarEnSegundos?: number;
  campos?: CampoInvalido[];
  /** Solo `cuenta_interna`: dirección del panel del equipo, para mostrarla como texto. */
  panelUrl?: string;
}

export class FalloApi extends Error {
  constructor(
    readonly tipo: TipoFallo,
    mensaje: string,
    readonly detalle: DetalleFallo = {},
  ) {
    super(mensaje);
    this.name = "FalloApi";
  }
}

export const esFalloApi = (e: unknown): e is FalloApi => e instanceof FalloApi;

/** Códigos de 409 que significan «ya no se puede editar» (no un simple desfase de revisión). */
export const CODIGOS_NO_EDITABLE = ["SOLICITUD_NO_EDITABLE", "ESTADO_SOLICITUD_NO_PERMITE"] as const;

export const esConflictoDeEdicion = (f: FalloApi): boolean => f.tipo === "conflicto" && f.detalle.codigo === "CONFLICTO_EDICION";
export const esNoEditable = (f: FalloApi): boolean => f.tipo === "conflicto" && (CODIGOS_NO_EDITABLE as readonly string[]).includes(f.detalle.codigo ?? "");

/** Texto para la persona. Nunca incluye cuerpos, tokens ni datos de la respuesta. */
export function mensajeDeFallo(f: FalloApi): string {
  switch (f.tipo) {
    case "red":
      return f.message.includes("tardó") ? "El servidor tardó demasiado en responder. Intente de nuevo." : "No hay conexión con el servidor. Revise la conexión e intente de nuevo.";
    case "sesion":
      return "Su sesión venció o se cerró. Inicie sesión de nuevo.";
    case "credenciales":
      return "Correo o contraseña incorrectos.";
    case "temporal_caducada":
      return "La contraseña temporal caducó. Pida al equipo de SoftArq que la restablezca.";
    case "cambio_contrasena":
      return "Cambie su contraseña temporal antes de continuar.";
    case "cuenta_interna":
      return "Esta cuenta es del equipo de SoftArq y no se usa en la app. Entre al panel web para trabajar con ella.";
    case "sin_permiso":
      return "Su cuenta ya no permite esta acción.";
    case "no_encontrado":
      return "No encontramos lo que busca. Puede que ya no esté disponible.";
    case "invalido":
      return f.message;
    case "conflicto":
      return f.message;
    case "limite":
      return f.detalle.reintentarEnSegundos
        ? `Demasiados intentos. Espere ${f.detalle.reintentarEnSegundos} s antes de volver a intentarlo.`
        : "Demasiados intentos. Espere un momento antes de volver a intentarlo.";
    case "respuesta_invalida":
      return "No pudimos leer la respuesta del servidor. Puede que la app necesite actualizarse.";
    case "cancelada":
      return "La operación se canceló.";
    case "servidor":
      return "El servidor tuvo un problema. Intente de nuevo en un momento.";
  }
}
