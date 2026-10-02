import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin variables globales de Vitest, Testing Library no limpia sola: se desmonta tras cada prueba.
afterEach(() => cleanup());
