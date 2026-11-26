# MEMORY.md — erp_v1

## 1. Estado actual
- Fase 1, subfase 1.1 (base de datos) completada el 2026-11-26. Tablas creadas en `erp` y `erp_test`.
- AGENTS.md actualizado: IA multiproveedor con conexión común (interfaz + adaptador por proveedor).
- 1.0b aprobado: 14 paquetes instalados en `apps/web` (solo `package.json`, sin código por indicación del usuario).
- `apps/web` fija `typescript` 6.0.3 y `eslint` 9.39.5 (exactas) por compatibilidad con Next.js 16.4.6; sin problemas de peers.
- Sin commits: todo el trabajo está en el árbol de trabajo.

## 2. Decisiones aprobadas
- BD local `grupo_cave_v1`, usuario `grupo_cave` (propietario, no superusuario), `localhost:5432`, PostgreSQL 18.4.
- pnpm workspace (`packages/*`, `apps/*`) y TypeScript; Node 24 ejecuta `.ts` con eliminación de tipos; `tsc --noEmit`.
- Nada se instala sin aprobación explícita del usuario, paquete por paquete.
- Migraciones SQL con node-pg-migrate + `pg`; esquema `erp` (dev) y `erp_test` (pruebas) en la misma base.
- Tablas/columnas en inglés, salvo columnas del contrato TDR en español; estados con CHECK:
  pending, processing, processed, failed, confirmed, superseded.
- Una extracción confirmada y un procesamiento activo por documento; FK RESTRICT; triggers de inmutabilidad.
- IA multiproveedor: no restringir a un modelo ni compañía; `provider` + `model` por intento (D13).
- Evitar funciones exclusivas de PostgreSQL 18 (compatibilidad con Supabase).

## 3. Componentes creados
- `@erp/db`: config (valida env y esquemas), pool con search_path, `withTransaction`, códigos SQLSTATE, constantes de dominio.
- Scripts: `db:check`, `db:migrate`, `db:migrate:test`, `db:status`, `test:db`, `typecheck`.

## 4. Archivos relevantes
- `packages/db/migrations/0001`–`0005` (aplicadas; no editarlas: crear nuevas migraciones).
- `packages/db/src/*`, `scripts/*`, `tests/schema.test.ts` (27 pruebas), `vitest.config.ts`.
- Raíz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`.
- `.env` lo mantiene el usuario; nunca versionarlo ni mostrar su contenido.

## 5. Tareas y bloqueos
- Pendiente del usuario: autorizar el inicio del código de 1.0b; pgAdmin (opcional).
- Hosting del procesamiento IA (límites de Netlify) se decide en 1.3.
- `.env.example` tiene líneas CLAUDE_* del usuario; alinear nombres (p. ej. ANTHROPIC_API_KEY, AI_PROVIDER/AI_MODEL) en 1.3.

## 6. Aprendizajes
- Migraciones sin esquema fijo; funciones con `SET search_path FROM CURRENT`.
- `ON DELETE RESTRICT` lanza `restrict_violation` (23001), no `foreign_key_violation`.
- `pg` configurado para devolver `date` y `numeric` como texto.
- Zona horaria del servidor America/Bogota (equivale a Guayaquil, UTC-5).
- pnpm 12.21 y TypeScript 7 (nativo) en `packages/db`; vitest 5 carga `.env` en `vitest.config.ts`.
- TypeScript 7 no expone la API JS clásica: Next.js y typescript-eslint necesitan TS ≤6.0.x.
- En Windows, pnpm falla a veces al renombrar carpetas grandes ("did not settle"); usar `--config.child-concurrency=1`.

## 7. Próximos pasos
- Tras aprobar 1.0b: crear `apps/web` a mano, instalar lo aprobado, CRUD de clientes/eventos, tabla editable.
- Después: 1.2 carga de PDF, 1.3 IA multiproveedor, 1.4 persistir tabla.
