#!/usr/bin/env node
// Genera el cliente de Prisma en src/generated/prisma (excluido de Git). No necesita base de datos.
import { prisma } from "./prisma-seguro.mjs";

prisma(["generate"]);
