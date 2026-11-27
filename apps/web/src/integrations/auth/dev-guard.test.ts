import { describe, expect, it } from 'vitest';
import { devAuthProblem, hostnameOf, isLoopbackHost } from './dev-guard';

const LOCAL_DB = { DATABASE_URL: 'postgres://usuario:clave@localhost:5432/base' };

describe('inicio de sesión de desarrollo', () => {
  it('reconoce las direcciones locales con y sin puerto', () => {
    expect(hostnameOf('127.0.0.1:3000')).toBe('127.0.0.1');
    expect(hostnameOf('[::1]:3000')).toBe('[::1]');
    expect(isLoopbackHost('localhost:3100')).toBe(true);
    expect(isLoopbackHost('erp.empresa.ec')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.nip.io')).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });

  it('solo se permite con base local, petición local y fuera de un hosting', () => {
    expect(devAuthProblem(LOCAL_DB, '127.0.0.1:3000')).toBeNull();
    expect(devAuthProblem({ DATABASE_URL: 'postgres://u:c@127.0.0.1/base' }, 'localhost:3000')).toBeNull();
    expect(devAuthProblem(LOCAL_DB, '192.168.1.20:3000')).toMatch(/este computador/);
    expect(devAuthProblem({ DATABASE_URL: 'postgres://u:c@db.proyecto.supabase.co:5432/postgres' }, '127.0.0.1')).toMatch(/base de datos local/);
    expect(devAuthProblem({ ...LOCAL_DB, NETLIFY: 'true' }, '127.0.0.1')).toMatch(/servidor publicado/);
    expect(devAuthProblem({}, '127.0.0.1')).toMatch(/no está configurada/);
  });
});
