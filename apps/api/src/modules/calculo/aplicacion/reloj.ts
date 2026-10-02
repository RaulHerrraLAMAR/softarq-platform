/**
 * Origen de la fecha de cálculo (política de la capa de aplicación, ADR-0005).
 *
 * La fecha que evalúa vigencias es la fecha civil del servidor en la zona configurada
 * (SOFTARQ_ZONA_HORARIA, por omisión America/Mexico_City). El cliente no puede enviarla y el
 * dominio no lee el reloj: la recibe como `fechaCalculo`. Las pruebas usan `RelojFijo`.
 */
import type { FechaISO } from "@softarq/contracts";

export interface Reloj {
  hoy(): FechaISO;
}

export class RelojDelSistema implements Reloj {
  private readonly formato: Intl.DateTimeFormat;

  constructor(zonaHoraria: string) {
    // en-CA produce AAAA-MM-DD.
    this.formato = new Intl.DateTimeFormat("en-CA", {
      timeZone: zonaHoraria,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  hoy(): FechaISO {
    return this.formato.format(new Date());
  }
}

export class RelojFijo implements Reloj {
  constructor(private readonly fecha: FechaISO) {}
  hoy(): FechaISO {
    return this.fecha;
  }
}
