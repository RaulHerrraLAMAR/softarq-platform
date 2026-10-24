/**
 * Fallos de la API tal como los ve la app (ADR-0020). La API decide siempre: la app solo los clasifica
 * para mostrar el estado adecuado (reintento, sesión vencida, cambio de contraseña, etc.).
 */
export type TipoFallo =
  | "red" //                   sin conexión, tiempo agotado o la API no responde
  | "sesion" //                401 con token: sesión vencida, cerrada, revocada o cuenta/pertenencia desactivada
  | "credenciales" //          401 al iniciar sesión (mensaje único de la API)
  | "temporal_caducada" //     la contraseña temporal caducó
  | "cambio_contrasena" //     403: hay que cambiar la contraseña temporal
  | "sin_permiso" //           403: su función no permite la operación (o no existe en la app móvil)
  | "no_encontrado" //         404 (también las de otra organización)
  | "invalido" //              400/422: la solicitud no es válida (con campos)
  | "limite" //               429
  | "servidor" //             5xx o error inesperado de la API
  | "respuesta_invalida" //    la respuesta no coincide con el contrato (versiones distintas de app y API)
  | "cancelada"; //            descartada: otra cuenta, otra pantalla o la persona la canceló

export interface CampoInvalido {
  ruta: string;
  mensaje: string;
}

export class FalloApi extends Error {
  constructor(
    readonly tipo: TipoFallo,
    mensaje: string,
    readonly detalle: { estado?: number; codigo?: string; reintentarEnSegundos?: number; campos?: CampoInvalido[] } = {},
  ) {
    super(mensaje);
    this.name = "FalloApi";
  }
}

export const esFalloApi = (e: unknown): e is FalloApi => e instanceof FalloApi;

/** Texto para la persona. Nunca incluye cuerpos, tokens ni datos de la respuesta. */
export function mensajeDeFallo(f: FalloApi): string {
  switch (f.tipo) {
    case "red":
      return "No hay conexión con el servidor. Compruebe el cable USB y que la API esté en marcha, y reintente.";
    case "sesion":
      return "La sesión venció o se cerró. Inicie sesión de nuevo.";
    case "credenciales":
      return "Correo o contraseña incorrectos.";
    case "temporal_caducada":
      return "La contraseña temporal caducó. Pida al Administrador del sistema un restablecimiento.";
    case "cambio_contrasena":
      return "Cambie su contraseña temporal antes de continuar.";
    case "sin_permiso":
      return "Su función no permite consultar esto.";
    case "no_encontrado":
      return "No se encontró el registro. Puede haberse eliminado o no pertenecer a su organización.";
    case "invalido":
      return f.message;
    case "limite":
      return f.detalle.reintentarEnSegundos
        ? `Demasiados intentos. Espere ${f.detalle.reintentarEnSegundos} s antes de volver a intentarlo.`
        : "Demasiados intentos. Espere un momento antes de volver a intentarlo.";
    case "respuesta_invalida":
      return "La respuesta del servidor no es la esperada. Puede que la app y la API sean de versiones distintas.";
    case "cancelada":
      return "La operación se canceló.";
    case "servidor":
      return "El servidor tuvo un problema. Reintente en un momento.";
  }
}
