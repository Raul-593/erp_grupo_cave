# MEMORY.md — erp_v1

## 1. Estado actual
- **Tarea «datos de demostración y fotografías» completada el 2026-11-27** (PLAN.md E7–E9): demostración cargada, Planificación/Abastecimiento/Ejecución con edición en pantalla, y fotos por ítem. Espera la revisión final del usuario.
- El proyecto 1 («Prueba 1») tiene cargados los datos del prototipo como extracción `demo` confirmada: 10 ítems, 5 órdenes, 4 pagos, 10 actividades, 6 controles previos, 5 cotizaciones.
- Tarea «Operación › Requerimiento» en pausa: etapas A–C hechas (C sin proveedor de IA; falta SDK y adaptador), D pendiente.
- Commits hasta `d039613` (todo confirmado y subido por el usuario, incluidas las fotos con botón «Guardar»).

## 2. Decisiones aprobadas
- BD local `grupo_cave_v1`, usuario `grupo_cave`, PostgreSQL 18.4; esquemas `erp` (dev) y `erp_test` (pruebas). Evitar funciones exclusivas de PG 18.
- pnpm workspace + TypeScript; migraciones SQL con node-pg-migrate + `pg`; nada se instala sin aprobación, paquete por paquete.
- Extracción: pending, processing, processed, failed, confirmed, superseded; una confirmada y un procesamiento activo por documento; FK RESTRICT; triggers de inmutabilidad.
- IA multiproveedor; proveedor y modelo solo en `.env`. El usuario aún no tiene clave de API.
- Demostración (AGENTS.md §2): solo proyecto 1 local; rotulada «Datos de demostración»; indicadores calculados de las filas; fotos reales; archivo de datos fuera de Git; sin acceso desde celular hasta tener autenticación. Edición en pantalla aprobada (2026-11-27): guardado al cambiar, con control de versión; sin historial hasta la Fase 3.
- Pagos (2026-11-27): lo pagado por ítem = suma de `payment_allocations`; nunca se escribe (la base lo impide). Reparto parcial permitido («Sin repartir»); a un ítem no se le paga más que su costo (aviso: primero subir el costo); pago o ítem con reparto no cambia de orden; propuesta en el orden de la matriz hasta el saldo.
- Fotos: JPEG/PNG/WebP por contenido, 15 MB (`EVIDENCE_MAX_BYTES`), clave `evidencias/<proyecto>/<ítem>/<uuid>`, sin miniaturas ni limpieza de EXIF (sin dependencias nuevas).

## 3. Componentes creados
- `@erp/db`: config, pool, `withTransaction`; repositorios clients, projects, workers, documents, extractions, `matrix` (matriz confirmada, ítems, totales) y `operations` (proveedores, actividades, pagos, checklist, cotizaciones); `demo/` (`seedDemo`, tipos).
- `apps/web`: shell; Proyectos, Requerimiento, Trabajadores; carga de PDF y `FileStorage` local; contrato `tdr-v1`, prompt `tdr-extraccion-v1`, IA (types, config, registry), servicio y orquestador de extracción; `lib/simple-pdf.ts`; `scripts/seed-demo.ts`; pestañas Planificación (4 vistas), Abastecimiento y Ejecución en lectura (`server/matrix.ts`, `components/operacion/shared.tsx`, `lib/labels.ts`, `money.ts`, `gantt.ts`); cotizaciones y comparativo en Requerimiento; fotos: `lib/image.ts`, `services/evidence-upload.ts`, rutas `api/items/[id]/evidencias` y `api/evidencias/[id]`, página `operacion/ejecucion/[itemId]`; pagos: `lib/allocation.ts`, `components/operacion/payment-form.tsx`, `scripts/convert-paid.ts`.

## 4. Archivos relevantes
- `packages/db/migrations/0001`–`0008` (aplicadas en `erp` y `erp_test`; no editarlas).
- `apps/web/scripts/local/demo-cave-v3.ts`: datos del prototipo, ignorado por Git. `pnpm db:seed:demo [--dry-run]`.
- `dumps/erp_antes_0007_…` y `erp_antes_0008_2026-11-27.dump`: respaldos previos a cada migración (ignorados por Git).
- `.env` lo mantiene el usuario; nunca versionarlo ni mostrarlo. `storage/` (raíz) ignorado.

## 5. Tareas y bloqueos
- **«Reparto de pagos» implementado y verificado el 2026-11-27** (PLAN.md P9; migración `0008` en `erp` y `erp_test`). Conversión de lo pagado a mano ejecutada el mismo día (pagos $18.615 = pagado $15.515 + sin repartir $3.100). Sin cambios confirmados en Git todavía. Otros candidatos: etapa D; adaptador de IA; alta y reprogramación de actividades; usuarios y permisos.
- Al elegir proveedor de IA: instalar su SDK oficial con aprobación, escribir el adaptador en `apps/web/src/integrations/ai/` y registrarlo. El usuario debe autorizar enviar TDR reales.
- La demostración está confirmada: no se puede borrar por medios normales; quitarla exige un script aparte con autorización.

## 6. Aprendizajes
- `.gitignore`: usar `/storage/` (con barra inicial); `storage/` ignoraba también el código del adaptador.
- Las tablas de `0007` solo aceptan ítems de una matriz confirmada y del mismo proyecto (triggers).
- Filas creadas en una misma transacción comparten `created_at`: ordenar por otra columna (`sort_order`, nombre).
- No hay historial de cambios ni de borrados: para «cuántas subí/eliminé» solo existen los contadores de `pg_stat_user_tables` (aproximados, sin fechas).
- Scripts de Node sin empaquetador: importaciones relativas con extensión `.ts`, sin alias `@/`.
- Migraciones sin esquema fijo; funciones con `SET search_path FROM CURRENT`. RESTRICT lanza 23001.
- `pg` devuelve `date` y `numeric` como texto: sumar en SQL o con `lib/money.ts` (centavos, BigInt), nunca con coma flotante.
- TypeScript 7 no sirve a Next.js: `apps/web` fija TS 6.0.3 y ESLint 9.39.5. En Windows, pnpm: `--config.child-concurrency=1` si falla al renombrar.
- El usuario suele tener su servidor de desarrollo en el puerto 3000: navegar ahí en lugar de iniciar otro. Si no recarga un archivo (pasó con `server/storage.ts`), no reiniciarlo: compilar y usar `web-verificacion` (`next start`, puerto 3100) de `.claude/launch.json`.
- Edición en línea: `components/operacion/inline.tsx` y `procurement.tsx` + acciones que devuelven `InlineResult`; reglas de negocio con `BusinessRuleError`. Probar en el navegador (los campos de texto solo guardan con escritura real, no con JS) y restaurar la demostración al terminar. El usuario también edita datos: no «restaurar» lo que no cambié yo.
- Formularios con `useActionState`: React restablece el formulario tras cada envío; una lista `<select>` necesita `key` con el valor enviado o vuelve a su primera opción. Funciones de un módulo `'use client'` no se llaman desde páginas de servidor.
- Pagos con reparto: `createPayment`/`updatePayment`/`deletePayment` van dentro de `withTransaction`. Probar en una orden sin pagos previos y borrar el pago de prueba.
- El prototipo se contradice en totales y órdenes (detalle en PLAN.md E1 y E7): no «corregir» sus datos.

## 7. Próximos pasos
- Reparto de pagos: revisión final del usuario; commit cuando lo pida. Antes de ejecutar algo aprobado sobre una simulación, repetir la simulación: el usuario edita datos mientras tanto.
- Pendiente aparte: proveedor de IA y etapa D (matriz editable).
