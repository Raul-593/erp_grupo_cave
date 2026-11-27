# MEMORY.md — erp_v1

## 1. Estado actual
- **Proyecto «Graduaciones UNEMI» cargado en `erp` el 2026-11-27** (migración `0011` en `erp` y `erp_test`): 3 eventos (Quito, Cuenca, Guayaquil), 593 ítems desde Excel, matriz por evento, estado operativo, responsable en bloque y fotos desde celular. Espera la revisión del usuario (decisiones G-1…G-8 de PLAN.md); sin commit (último commit del usuario: `8b833e2`; la etapa D tampoco está en un commit).
- `erp`: además, proyecto 1 «Prueba 1» (demostración) y «PRUEBA etapa D»; 18 usuarios de ejemplo. Graduaciones UNEMI aún sin responsables asignados.
- Pendiente en PLAN.md: parte S (Supabase, ahora prioritaria para este proyecto) y adaptador de IA (falta clave).

## 2. Decisiones aprobadas
- BD local `grupo_cave_v1`, usuario `grupo_cave`, PostgreSQL 18.4; esquemas `erp` (dev) y `erp_test`. Evitar funciones exclusivas de PG 18.
- pnpm workspace + TypeScript; migraciones SQL con node-pg-migrate + `pg`; nada se instala sin aprobación.
- IA multiproveedor; proveedor y modelo solo en `.env`. El usuario aún no tiene clave de API.
- Demostración solo en el proyecto 1 local, rotulada. Pagos: lo pagado = suma de `payment_allocations`.
- Usuarios (AGENTS.md §2): admin, field, accounting, supplier; permisos en código; campo = ítems de su trabajador (proveedor y costo, montaje `mount.update`, fotos propias, controles previos a su cargo `checks.update`); contabilidad solo lee. Ingreso local `dev`; `audit_log` en la misma transacción que cada cambio.
- Eventos (AGENTS.md §2, «Proyectos con varios eventos»): `project_events`, pestañas `?evento=`, carga con `pnpm db:import:matrix` (proveedor `excel`), saldo = subtotal − anticipos (calculado), estado operativo aparte del montaje.
- Etapa D (AGENTS.md §7, «Política vigente»): borrador = `tdr_items` de un intento `processed`; propuesta copiada al completar; matriz manual (proveedor `manual`); guardado celda a celda; violeta = sin cambiar respecto a la IA; una matriz confirmada por proyecto (no se reprocesa ni se empieza otra); `matrix.edit` solo superusuario.

## 3. Componentes creados
- `@erp/db`: repositorios (clients, projects, workers, documents, extractions, matrix, operations, suppliers, ediciones, evidences, users, access, audit) y `matrix-draft.ts` (importar, manual, añadir, editar, mover, eliminar, confirmar; `normalizeOrder`); `demo/`.
- `apps/web`: shell por rol, `server/auth.ts`, `integrations/auth/`; Requerimiento con `components/requerimiento/MatrixEditor.tsx` y `FichaProposal.tsx` (+ `StartManualButton`), `server/requerimiento-view.ts`, `lib/draft.ts`, acciones `server/actions/matrix.ts`; resto: carga de PDF, IA sin adaptador, Planificación/Abastecimiento/Ejecución, fotos, pagos, Usuarios.

## 4. Archivos relevantes
- `packages/db/migrations/0001`–`0011` (aplicadas; no editarlas). `packages/db/scripts/example-users.ts`.
- `apps/web/scripts/local/` (ignorado por Git): `demo-cave-v3.ts`, `graduaciones-unemi.json` y su conversor `xlsx-graduaciones-a-json.py` (Python sin dependencias).
- `apps/web/src/components/operacion/events.tsx`, `event-checklist.tsx`, `bulk-assign.tsx`; `lib/events.ts`; `packages/db/src/import/cost-matrix.ts`.
- `dumps/erp_antes_0007…` a `erp_antes_0011_2026-11-27.dump` (ignorados por Git).
- `.env` lo mantiene el usuario; nunca versionarlo ni mostrarlo. `storage/` (raíz) ignorado.

## 5. Tareas y bloqueos
- Adaptador de IA: el usuario debe elegir proveedor y tener clave; instalar su SDK con aprobación; autorizar envío de TDR reales. La importación de la propuesta solo se probó con una propuesta simulada.
- Parte S (Supabase): pospuesta hasta tener todo listo para las primeras pruebas; proyecto creado, vacío y sin conectar.
- Lo confirmado, la demostración y `audit_log` no se borran por medios normales.

## 6. Aprendizajes
- `.gitignore`: usar `/storage/`. Tablas de `0007` solo aceptan ítems de una matriz confirmada del mismo proyecto.
- Scripts de Node: importaciones relativas con `.ts`, sin alias `@/` (también desde la carpeta temporal con ruta relativa al repo).
- `pg` devuelve `date` y `numeric` como texto: sumar en SQL o con `lib/money.ts`, nunca con coma flotante.
- `apps/web` fija TS 6.0.3 y ESLint 9.39.5. En Windows, pnpm: `--config.child-concurrency=1` si falla al renombrar.
- Componentes `'use client'`: solo **tipos** de `@erp/db` (un valor arrastra `pg` al navegador).
- Toda acción o ruta nueva: `authorize(...)` y `audit(tx, ...)` en la misma transacción (`server/access-coverage.test.ts`). Mover filas intercambia `item_number`: siempre dentro de `withTransaction` (unicidad diferida).
- Probar en `web-verificacion` (puerto 3100, tras `pnpm build`). Campos de texto: escritura real; `window.confirm` se sustituye por JS. Las acciones se pueden llamar directo con el encabezado `Next-Action` (id en los scripts de la página) para probar rechazos del servidor.
- Bash de esta máquina: heredocs largos con comillas fallan o los bloquea la comprobación de seguridad; escribir scripts con Write y ejecutarlos. `pg_dump` desde Bash con la URL de `.env` se queda colgado: lanzarlo desde Node con `PGPASSWORD` y `-w`.
- Tras `pnpm build` hay que reiniciar `web-verificacion` para ver los cambios.
- El usuario también edita datos: no «restaurar» lo que no cambié yo.

## 7. Próximos pasos
- Revisión del usuario de Graduaciones UNEMI (G-1…G-8) y de la etapa D; commit cuando lo pida.
- Asignar responsables por evento (Requerimiento › «Responsable en bloque») y crear los trabajadores y usuarios reales.
- Parte S (Supabase) y publicación: necesarias para usar el sistema desde celulares; requieren aprobación de S-D1…S-D8.
- Después: adaptador de IA cuando haya clave; «operación mínima» (crear actividades y controles previos).
