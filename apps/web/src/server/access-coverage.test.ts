/**
 * Cobertura de permisos (PLAN.md, parte U): toda acción de servidor exportada y todo manejador
 * de ruta de API debe comprobar el permiso con `authorize(...)` antes de tocar datos. Una acción
 * nueva sin esa llamada hace fallar esta prueba.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Acciones que no necesitan sesión previa: entrar y salir. */
const PUBLIC_ACTIONS = new Set(['signInAsDev', 'signOut']);

function filesUnder(dir: string, name: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path, name);
    return name.test(entry) ? [path] : [];
  });
}

/** Cuerpo de cada función exportada: desde su declaración hasta la siguiente. */
function exportedFunctions(source: string): { name: string; body: string }[] {
  const pattern = /export async function (\w+)/g;
  const starts = [...source.matchAll(pattern)];
  return starts.map((match, index) => ({
    name: match[1] ?? '',
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }));
}

describe('cobertura de permisos', () => {
  const actionFiles = filesUnder(join(SRC, 'server', 'actions'), /\.ts$/);
  const routeFiles = filesUnder(join(SRC, 'app', 'api'), /^route\.ts$/);

  it('encuentra las acciones y las rutas', () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(10);
    expect(routeFiles.length).toBeGreaterThanOrEqual(4);
  });

  it('cada acción de servidor exportada llama a authorize', () => {
    const missing: string[] = [];
    for (const file of actionFiles) {
      for (const fn of exportedFunctions(readFileSync(file, 'utf8'))) {
        if (!PUBLIC_ACTIONS.has(fn.name) && !fn.body.includes('authorize(')) missing.push(fn.name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('cada manejador de ruta de API llama a authorize', () => {
    const missing: string[] = [];
    for (const file of routeFiles) {
      for (const fn of exportedFunctions(readFileSync(file, 'utf8'))) {
        if (!fn.body.includes('authorize(')) missing.push(`${file.slice(SRC.length)} ${fn.name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
