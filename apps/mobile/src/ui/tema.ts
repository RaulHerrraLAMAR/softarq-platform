/**
 * Tema de la app (ADR-0022): los valores están en `paletas.ts` (puros, comprobados en Node); aquí solo se elige
 * la paleta según el esquema de color del teléfono.
 */
import { useColorScheme } from "react-native";
import { CLARO, OSCURO, type Paleta } from "./paletas";

export * from "./paletas";
export const useTema = (): Paleta => (useColorScheme() === "dark" ? OSCURO : CLARO);
