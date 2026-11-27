/**
 * Reglas que limitan el inicio de sesión de desarrollo (sin contraseña) a este computador.
 * Funciones puras para poder probarlas.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Variables que indican que la aplicación corre en un hosting y no en un equipo local. */
const HOSTED_ENV_VARS = ['NETLIFY', 'VERCEL', 'AWS_LAMBDA_FUNCTION_NAME', 'K_SERVICE', 'RENDER', 'FLY_APP_NAME'] as const;

/** Nombre de host sin puerto: «127.0.0.1:3000» → «127.0.0.1», «[::1]:3000» → «[::1]». */
export function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith('[')) return trimmed.slice(0, trimmed.indexOf(']') + 1);
  return trimmed.split(':')[0] ?? '';
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  return host != null && LOOPBACK_HOSTS.has(hostnameOf(host));
}

/**
 * Devuelve el motivo por el que el inicio de desarrollo no está permitido, o null si lo está:
 * - la aplicación no corre en un hosting conocido;
 * - la base de datos es local (nunca contra Supabase ni otra base remota);
 * - la petición llega a una dirección local de este equipo.
 */
export function devAuthProblem(env: Readonly<Record<string, string | undefined>>, requestHost: string | null): string | null {
  const hosted = HOSTED_ENV_VARS.find((name) => env[name]);
  if (hosted) return 'El inicio de sesión de desarrollo no se permite en un servidor publicado.';
  let databaseHost: string | null = null;
  try {
    databaseHost = new URL(env['DATABASE_URL'] ?? '').hostname;
  } catch {
    return 'La base de datos no está configurada.';
  }
  if (!isLoopbackHost(databaseHost)) {
    return 'El inicio de sesión de desarrollo solo se permite con la base de datos local.';
  }
  if (!isLoopbackHost(requestHost)) {
    return 'El inicio de sesión de desarrollo solo se permite desde este computador (127.0.0.1).';
  }
  return null;
}
