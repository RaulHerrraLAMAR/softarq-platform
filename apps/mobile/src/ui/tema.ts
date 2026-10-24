/**
 * Sistema visual móvil (mismo lenguaje que la web, `docs/web/sistema-visual.md`): sobrio, denso, alto
 * contraste. Cada par texto/fondo cumple ≥ 4.5:1 en claro y oscuro. Fuentes del sistema (sin descargas).
 */
import { useColorScheme } from "react-native";

export interface Paleta {
  fondo: string;
  tarjeta: string;
  suave: string;
  texto: string;
  atenuado: string;
  borde: string;
  accion: string;
  sobreAccion: string;
  enlace: string;
  error: string;
  errorFondo: string;
  aviso: string;
  avisoFondo: string;
  info: string;
  infoFondo: string;
  correcto: string;
  correctoFondo: string;
  demo: string;
  demoFondo: string;
}

export const CLARO: Paleta = {
  fondo: "#f8fafc",
  tarjeta: "#ffffff",
  suave: "#f1f5f9",
  texto: "#0f172a",
  atenuado: "#475569",
  borde: "#cbd5e1",
  accion: "#0369a1",
  sobreAccion: "#ffffff",
  enlace: "#0369a1",
  error: "#b91c1c",
  errorFondo: "#fef2f2",
  aviso: "#92400e",
  avisoFondo: "#fef3c7",
  info: "#075985",
  infoFondo: "#e0f2fe",
  correcto: "#166534",
  correctoFondo: "#dcfce7",
  demo: "#7c2d12",
  demoFondo: "#ffedd5",
};

export const OSCURO: Paleta = {
  fondo: "#0b1220",
  tarjeta: "#131d33",
  suave: "#1a2640",
  texto: "#e2e8f0",
  atenuado: "#a3b2c7",
  borde: "#334155",
  accion: "#0369a1",
  sobreAccion: "#ffffff",
  enlace: "#7dd3fc",
  error: "#fca5a5",
  errorFondo: "#3b1212",
  aviso: "#fcd34d",
  avisoFondo: "#3a2a07",
  info: "#7dd3fc",
  infoFondo: "#0c2a40",
  correcto: "#86efac",
  correctoFondo: "#0f2e1a",
  demo: "#fdba74",
  demoFondo: "#3a1a09",
};

export const useTema = (): Paleta => (useColorScheme() === "dark" ? OSCURO : CLARO);

/** Espaciado base 4 dp. */
export const ESP = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;
/** Objetivo táctil mínimo (Material: 48 dp). */
export const OBJETIVO_MINIMO = 48;
export const RADIO = 8;

export const TEXTO = { xs: 13, sm: 14, md: 16, lg: 20, xl: 24 } as const;
