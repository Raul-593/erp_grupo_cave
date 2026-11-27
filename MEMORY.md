# MEMORY.md — erp_v1

## 1. Estado actual
- Tarea «Operación › Requerimiento» (prototipo CAVE-ERP-v3) aprobada. Etapas A (base, shell, Proyectos/Requerimiento/Trabajadores) y B (carga privada de PDF, verificada con el TDR real) completas. Etapa C lista **sin proveedor**: contrato `tdr-v1`, prompt `tdr-extraccion-v1`, interfaz común, servicio, estados y pantalla; falta el adaptador. Etapa D (matriz editable + responsable) pendiente.
- AGENTS.md (2026-11-26): proyecto/contratante/empresa, guía visual, ficha con monto transcrito, rubro › producto › subproducto, un responsable por ítem.
- Sin commits: todo el trabajo está en el árbol de trabajo.

## 2. Decisiones aprobadas
- BD local `grupo_cave_v1`, usuario `grupo_cave` (propietario), PostgreSQL 18.4; esquemas `erp` (dev) y `erp_test` (pruebas).
- pnpm workspace + TypeScript; migraciones SQL con node-pg-migrate + `pg`; nada se instala sin aprobación del usuario, paquete por paquete.
- Estados de extracción: pending, processing, processed, failed, confirmed, superseded; una confirmada y un procesamiento activo por documento; FK RESTRICT; triggers de inmutabilidad.
- IA multiproveedor; proveedor y modelo **solo en `.env`** (`AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY`); cada intento guarda proveedor, modelo, versión de prompt y de esquema.
- «Valor del proyecto» = `projects.contract_amount` (+ moneda, IVA); componentes reutilizables `ProjectValueFields` / `ProjectValueForm`.
- Procesamiento en el proceso del servidor local (cola, concurrencia, tiempo máximo); reevaluar antes de Netlify.
- Evitar funciones exclusivas de PostgreSQL 18 (Supabase).

## 3. Componentes creados
- `@erp/db`: config, pool, `withTransaction`, SQLSTATE, repositorios (clients, projects, workers, documents, extractions).
- `apps/web`: shell visual; formularios; carga/visor/eliminación de PDF; almacenamiento `FileStorage` local; contrato `domain/tdr-extraction/contract.ts`; prompt `prompts/tdr-extraccion/v1.ts`; IA en `integrations/ai/` (types, config, registry); `server/services/tdr-extraction.ts` + `server/extraction-runner.ts`.

## 4. Archivos relevantes
- `packages/db/migrations/0001`–`0006` (aplicadas; no editarlas).
- `.env` lo mantiene el usuario; nunca versionarlo ni mostrar su contenido. `.env.example` documenta todas las variables.
- `storage/` (PDF privados, ignorado por Git).

## 5. Tareas y bloqueos
- **AL ELEGIR PROVEEDOR DE IA HAY QUE INSTALAR SU SDK OFICIAL** (con aprobación del usuario): `@anthropic-ai/sdk`, `openai` o `@google/genai` en `apps/web`. Luego crear su adaptador en `apps/web/src/integrations/ai/` (PDF como documento + `EXTRACTION_JSON_SCHEMA` como salida estructurada + errores con `AiProviderError`), registrarlo en `registry.ts` y verificar en la documentación vigente PDF, salida estructurada y límites. Sin eso, «Procesar TDR con IA» queda deshabilitado.
- El usuario debe autorizar enviar el TDR real al proveedor elegido (AGENTS.md §10).
- No crear datos de prueba en `erp`: el usuario usa su TDR real.

## 6. Aprendizajes
- Migraciones sin esquema fijo; funciones con `SET search_path FROM CURRENT`. RESTRICT lanza 23001.
- `pg` devuelve `date` y `numeric` como texto. Servidor en America/Bogota (= Guayaquil).
- TypeScript 7 no sirve a Next.js/typescript-eslint: `apps/web` fija TS 6.0.3 y ESLint 9.39.5.
- En Windows, pnpm a veces falla al renombrar carpetas: `--config.child-concurrency=1`.
- zod 4: campo ausente en FormData con `z.unknown().transform()` da «nonoptional»; usar `z.string().default('')`.
- Valores importados de un módulo `'use client'` llegan como referencia al servidor: constantes compartidas en `lib/`.

## 7. Próximos pasos
- Elegir proveedor → instalar SDK → adaptador → primera prueba con el TDR real; ajustar el prompt creando `v2.ts`.
- Etapa D: importar la propuesta a `tdr_items`, edición, responsable por ítem, «Aplicar» ficha y confirmar.
- El prototipo contiene nombres y montos ilustrativos: no usarlos como datos ni versionarlos sin permiso.
