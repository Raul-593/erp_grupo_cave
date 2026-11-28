import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Renueva la sesión de Supabase Auth en cada petición (solo con AUTH_PROVIDER=supabase): los
 * Server Components no pueden escribir cookies, así que el token se refresca aquí. No decide
 * permisos: cada página y acción los comprueba en el servidor (`server/auth.ts`).
 */
export async function proxy(request: NextRequest) {
  const url = process.env['SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (process.env['AUTH_PROVIDER']?.trim() !== 'supabase' || !url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  // Verifica el token y, si caducó, lo renueva con el de refresco (escribe las cookies nuevas).
  await client.auth.getClaims();
  return response;
}

export const config = {
  // Todo menos archivos estáticos, imágenes optimizadas y el ícono.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
