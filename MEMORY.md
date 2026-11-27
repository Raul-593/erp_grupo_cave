# MEMORY.md — erp_v1

## 1. Estado actual
- **Parte U «usuarios, roles y permisos» completada el 2026-11-27** (migración `0009` en `erp` y `erp_test`); espera la revisión final del usuario. Sin commits desde `17b1186`.
- `erp` tiene 18 usuarios de ejemplo (`pnpm db:users:example --admin=… --accounting=…`): 1 superusuario y 1 de contabilidad (dos trabajadores sin ítems), 7 de campo (resto de trabajadores) y 9 proveedores (todos menos el de nómina). Los reales se cargan en Supabase.
- Proyecto 1 («Prueba 1»): datos del prototipo como extracción `demo` confirmada (solo local).
- Pendiente en PLAN.md: parte S (Supabase, propuesta) y Requerimiento en pausa (proveedor de IA y etapa D).

## 2. Decisiones aprobadas
- BD local `grupo_cave_v1`, usuario `grupo_cave`, PostgreSQL 18.4; esquemas `erp` (dev) y `erp_test`. Evitar funciones exclusivas de PG 18.
- pnpm workspace + TypeScript; migraciones SQL con node-pg-migrate + `pg`; nada se instala sin aprobación.
- IA multiproveedor; proveedor y modelo solo en `.env`. El usuario aún no tiene clave de API.
- Demostración solo en el proyecto 1 local, rotulada; indicadores calculados de las filas. Pagos: lo pagado = suma de `payment_allocations` (la base impide escribirlo).
- Usuarios (2026-11-27, AGENTS.md §2): un tipo por usuario (admin, field, accounting, supplier); permisos en código (`domain/access/permissions.ts`); campo = ítems de su trabajador, edita proveedor y costo en Planificación, sube fotos y borra solo las suyas, cambia el montaje de sus ítems (`mount.update`) y marca cumple/no cumple en los controles previos que tiene a cargo (`checks.update`); contabilidad solo lee; proveedor solo ve «Portal en preparación». Ingreso local `dev` sin contraseña; Supabase Auth en la parte S. Historial `audit_log` en la misma transacción que cada cambio.

## 3. Componentes creados
- `@erp/db`: repositorios (clients, projects, workers, documents, extractions, matrix, operations, suppliers, ediciones, evidences) y `users`, `access` (alcance por trabajador), `audit`; `getMatrixTotals(..., { workerId })` filtra indicadores; `demo/`.
- `apps/web`: shell con módulos y pestañas por rol (`lib/navigation.ts`), `components/access.tsx` (`useCan`), `server/auth.ts` (`requirePageUser`, `authorize`, `audit`, `visibleProjectIds`), `integrations/auth/` (`AuthProvider`, adaptador `dev`, `dev-guard`), páginas `/entrar`, `/proveedor`, Administración › Usuarios; `server/matrix.ts` con alcance; resto: carga de PDF, IA sin adaptador, Planificación/Abastecimiento/Ejecución, fotos, pagos.

## 4. Archivos relevantes
- `packages/db/migrations/0001`–`0009` (aplicadas; no editarlas). `packages/db/scripts/example-users.ts`.
- `apps/web/scripts/local/demo-cave-v3.ts`: datos del prototipo, ignorado por Git.
- `dumps/erp_antes_0007…`, `…0008…`, `…conversion…`, `erp_antes_0009_2026-11-27.dump` (ignorados por Git).
- `.env` lo mantiene el usuario; nunca versionarlo ni mostrarlo. `storage/` (raíz) ignorado.

## 5. Tareas y bloqueos
- Parte S (Supabase): espera aprobación y respuestas S-D1…S-D8; el usuario crea la cuenta y los proyectos. Publicar la web es otro plan (S-D8).
- Al elegir proveedor de IA: instalar su SDK con aprobación, adaptador en `apps/web/src/integrations/ai/`. El usuario debe autorizar enviar TDR reales.
- La demostración y `audit_log` no se borran por medios normales.

## 6. Aprendizajes
- `.gitignore`: usar `/storage/`. Tablas de `0007` solo aceptan ítems de una matriz confirmada del mismo proyecto.
- Scripts de Node: importaciones relativas con `.ts`, sin alias `@/`. Migraciones sin esquema fijo; funciones con `SET search_path FROM CURRENT`.
- `pg` devuelve `date` y `numeric` como texto: sumar en SQL o con `lib/money.ts`, nunca con coma flotante.
- `apps/web` fija TS 6.0.3 y ESLint 9.39.5. En Windows, pnpm: `--config.child-concurrency=1` si falla al renombrar.
- Los componentes `'use client'` solo importan **tipos** de `@erp/db`: un valor arrastra `pg` al navegador y rompe el build (por eso `ROLES` está copiado en `permissions.ts`).
- Toda acción o ruta nueva: `authorize(...)` primero y `audit(tx, ...)` en la misma transacción (`server/access-coverage.test.ts` lo exige). La numeración 1.1… se calcula sobre la matriz completa antes de filtrar por alcance.
- Probar en `web-verificacion` (puerto 3100, tras `pnpm build`); el usuario usa el 3000. En pantalla, los campos de texto solo guardan con escritura real; `window.confirm` se puede sustituir por JS para pruebas.
- El usuario también edita datos: no «restaurar» lo que no cambié yo; repetir simulaciones antes de ejecutar.
- En Bash de esta máquina, heredocs largos con comillas fallan («unexpected EOF»): escribir scripts con la herramienta Write y ejecutarlos.

## 7. Próximos pasos
- Revisión del usuario de la parte U; commit cuando lo pida. Reiniciar su servidor del puerto 3000 para ver el ingreso.
- Después: aprobar la parte S o retomar el proveedor de IA y la etapa D.
