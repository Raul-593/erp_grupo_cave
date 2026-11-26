# PLAN.md — erp_v1

## Índice de tareas

| Tarea | Estado |
| --- | --- |
| Fase 1 · 1.0b — Interfaz web base (Next.js) con clientes y eventos | **Aprobado; en progreso** — dependencias instaladas y compatibles; código no iniciado por indicación del usuario |
| Fase 1 · 1.1 — Conexión a PostgreSQL y creación de tablas | Completado (2026-11-26) |
| Actualización de `AGENTS.md`: IA multiproveedor con conexión común | Completado (2026-11-26, solicitado por el usuario) |

---

## Tarea actual: Fase 1 · 1.0b — Interfaz web base con clientes y eventos

| Campo | Valor |
| --- | --- |
| Estado | **Propuesto** — pendiente de aprobación del plan y, por separado, de cada instalación (§V4) |
| Fecha | 2026-11-26 |
| Fase | Cierre de 1.0 (frontend y estructura) y primera parte visible del flujo de Fase 1 |
| Fuera de alcance | Carga y almacenamiento de PDF (1.2), llamadas a IA (1.3), guardar el desglose (1.4), autenticación, despliegue en Netlify |

### V1. Objetivo

Tener una aplicación web local en español donde se puedan **registrar, listar y editar clientes y eventos** guardados en PostgreSQL (`erp`), ver el **detalle de un evento** con su sección de documentos TDR, y revisar la **tabla editable de ocho columnas** como componente terminado, para validar el diseño antes de conectarla a la IA.

### V2. Pantallas propuestas

```
┌──────────────────────────────────────────────────────────────────────┐
│ Grupo Cave · ERP                       Eventos   Clientes            │
├──────────────────────────────────────────────────────────────────────┤
│ Eventos                                            [ + Nuevo evento ]│
│ Buscar… [_____________]   Cliente: [Todos ▾]                         │
│ ┌────────────────────┬──────────────┬────────────┬─────────┬───────┐ │
│ │ Evento             │ Cliente      │ Fechas     │ Lugar   │ TDR   │ │
│ ├────────────────────┼──────────────┼────────────┼─────────┼───────┤ │
│ │ …                  │ …            │ 01–03 dic  │ …       │ 0     │ │
│ └────────────────────┴──────────────┴────────────┴─────────┴───────┘ │
└──────────────────────────────────────────────────────────────────────┘

Detalle del evento
┌──────────────────────────────────────────────────────────────────────┐
│ ← Eventos   Evento X · Cliente Y · 01–03 dic 2026        [ Editar ]  │
│ Documentos TDR                                                       │
│  ┌ Zona de carga de PDF (deshabilitada: "Disponible en la 1.2") ┐    │
│  Lista de documentos y estado de su extracción (vacía por ahora)     │
│  [ Procesar TDR con IA ]  (deshabilitado hasta la 1.3)               │
└──────────────────────────────────────────────────────────────────────┘

Tabla editable (componente para la 1.4)
┌────┬──────────┬─────────────┬──────────────┬──────┬────────┬──────┬─────────────┬───┐
│ #  │ Producto │ Subproducto │ Descripción  │ Cant │ Unidad │ Días │ Observación │ ✕ │
├────┼──────────┼─────────────┼──────────────┼──────┼────────┼──────┼─────────────┼───┤
│ 1  │ [      ] │ [         ] │ [          ] │ [  ] │ [    ] │ [  ] │ [         ] │ 🗑 │
└────┴──────────┴─────────────┴──────────────┴──────┴────────┴──────┴─────────────┴───┘
[ + Agregar fila ]   Cambios sin guardar: 2          [ Descartar ] [ Confirmar ]
```

- **Eventos** (pantalla inicial): lista con búsqueda y filtro por cliente; crear y editar.
- **Clientes**: lista; crear y editar (nombre obligatorio; RUC/cédula, correo, teléfono y notas opcionales, como en la tabla `clients`).
- **Detalle del evento**: datos del evento y sección «Documentos TDR». La carga de PDF y el botón «Procesar TDR con IA» aparecen **deshabilitados y rotulados** con la subfase en que se activan; no simulan funcionamiento.
- **Tabla editable**: editar celdas, agregar, eliminar y renumerar filas, validar cantidades y días (números ≥ 0 o vacío = desconocido), avisar de cambios sin guardar. En esta tarea solo funciona en memoria, en una página de desarrollo `/desarrollo/tabla` con filas **sintéticas rotuladas como ejemplo** (no provienen de ningún TDR). La página solo existe en modo desarrollo. Se conectará a `tdr_items` en la 1.4.
- Fechas en formato local y zona `America/Guayaquil`. Mensajes de error controlados (por ejemplo, RUC duplicado, cliente con eventos que no se puede borrar), sin detalles internos.
- Sin borrado de clientes ni eventos en esta tarea (las claves foráneas usan `RESTRICT`; el archivado se diseñará aparte).

### V3. Decisiones pendientes de aprobación (con recomendación)

| ID | Decisión | Recomendación | Alternativas y motivo |
| --- | --- | --- | --- |
| V-D1 | Framework | **Next.js 16 (App Router) + React 19** en `apps/web` | Decisión ya prevista en `AGENTS.md`. Renderizado en servidor: las credenciales de la base nunca llegan al navegador. |
| V-D2 | Dónde corre el backend de esta tarea | **En el servidor de Next.js** (Server Components y Server Actions) para operaciones cortas de clientes y eventos | Suficiente para CRUD. El procesamiento de PDF extensos con IA (1.3) puede superar los límites de las funciones de Netlify (las síncronas tienen un límite de segundos y de tamaño de carga; las *background functions* llegan a unos minutos; **valores a verificar en la documentación vigente**). Se decidirá en la 1.3 si se necesita un trabajador o backend separado; la separación por capas (V-D4) lo permite sin reescribir. |
| V-D3 | Estilos y componentes | **Tailwind CSS 4 + componentes propios** sencillos (botón, campo, tabla, diálogo nativo `<dialog>`) | Pocas dependencias y control total del diseño. **shadcn/ui** (Radix): componentes accesibles listos, pero añade 5–8 paquetes más; puede incorporarse después. **MUI/Mantine**: bibliotecas completas con más peso y estilo propio difícil de adaptar. |
| V-D4 | Capas | Repositorios SQL en `packages/db/src/repositories`; servicios y validación en `apps/web/src/server`; componentes en `apps/web/src/components`; páginas en `apps/web/src/app` | Cumple la separación de `AGENTS.md` §6. Las páginas nunca escriben SQL. |
| V-D5 | Validación | **zod**, en el servidor, para formularios (y luego para validar el JSON de la IA en 1.3) | Una sola herramienta para ambos usos; esquemas tipados. Alternativa: validación manual (más código y menos coherente). |
| V-D6 | Tabla editable | **TanStack Table** (sin estilos, ~1 paquete) | Columnas, orden y futuras funciones (ordenar, virtualizar filas largas) sin imponer diseño. **AG Grid Community**: hoja de cálculo completa pero pesada y con estilo propio. Tabla hecha a mano: viable, pero habría que reimplementar lo anterior. |
| V-D7 | Tabla en esta tarea | Construirla ya, con datos sintéticos rotulados en `/desarrollo/tabla` | Permite revisar la pantalla más importante antes de la IA. Alternativa: dejarla para la 1.4. |
| V-D8 | Autenticación | **Sin autenticación**, solo local: servidor en `127.0.0.1`, datos sintéticos o autorizados | Permitido por `AGENTS.md` §10 únicamente si lo apruebas. La autenticación es obligatoria antes de cualquier exposición externa (Fase 3 o antes). |
| V-D9 | Calidad | ESLint con la configuración de Next.js; `pnpm lint`, `pnpm typecheck`, `pnpm build` y pruebas con vitest | `AGENTS.md` §4 exige lint y build al finalizar. |
| V-D10 | Tipografía | Fuentes del sistema (sin `next/font` con Google Fonts) | Evita descargas externas en el build y en el navegador. |

### V4. Instalaciones (requieren tu aprobación antes de ejecutarse)

Todas en `apps/web`. Se instalará la versión estable vigente al aprobar e informaré las versiones exactas.

| Paquete | Tipo | Para qué |
| --- | --- | --- |
| `next` | producción | Framework web (servidor y enrutamiento) |
| `react`, `react-dom` | producción | Interfaz de usuario |
| `zod` | producción | Validación de datos en el servidor |
| `@tanstack/react-table` | producción | Lógica de la tabla editable |
| `tailwindcss`, `@tailwindcss/postcss`, `postcss` | desarrollo | Estilos |
| `@types/react`, `@types/react-dom` | desarrollo | Tipos de React |
| `typescript` | desarrollo | Verificación de tipos (ver riesgo de versión en V7) |
| `eslint`, `eslint-config-next` | desarrollo | Lint |
| `vitest` | desarrollo | Pruebas de validación y servicios de `apps/web` |

Los repositorios nuevos de `packages/db` no requieren paquetes adicionales. Pruebas de componentes en navegador (`@testing-library/react`, `jsdom`) o de extremo a extremo (Playwright) quedan para la 1.4, con aprobación aparte.

### V5. Pasos ordenados

| # | Paso | Responsable | Verificación |
| --- | --- | --- | --- |
| 1 | Aprobar este plan, las decisiones V-D1 a V-D10 y la lista de instalación | Tú | Aprobación explícita |
| 2 | Crear `apps/web` a mano (sin `create-next-app`, para no instalar nada no aprobado): `package.json`, `next.config.ts`, `tsconfig.json`, PostCSS, ESLint | Agente | Revisión del diff |
| 3 | Instalar solo lo aprobado | Agente | `pnpm ls` |
| 4 | Cargar el `.env` de la raíz desde `next.config.ts` y usar `@erp/db` como paquete del workspace | Agente | `pnpm --filter web build` |
| 5 | Repositorios de clientes, eventos y documentos (lectura) en `packages/db` con consultas parametrizadas | Agente | Pruebas en `erp_test` |
| 6 | Servicios, esquemas zod y Server Actions de clientes y eventos | Agente | Pruebas unitarias de validación |
| 7 | Diseño base: layout, navegación, componentes de formulario y tabla | Agente | Revisión visual |
| 8 | Pantallas de clientes y eventos (lista, crear, editar) y detalle del evento | Agente | Flujo probado en el navegador |
| 9 | Tabla editable y página `/desarrollo/tabla` | Agente | Editar, agregar, eliminar y renumerar filas en el navegador |
| 10 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Agente | Todo en verde |
| 11 | Levantar el servidor local y revisarlo contigo en el navegador integrado | Agente / Tú | Tu visto bueno |
| 12 | Actualizar `PLAN.md` y `MEMORY.md` | Agente | Sin secretos |

No se realizarán commits, push ni despliegues sin tu autorización.

### V6. Criterios de aceptación

1. `pnpm dev` levanta la aplicación en `http://127.0.0.1:3000` (solo local).
2. Se puede crear, listar, buscar y editar clientes y eventos; los datos se guardan en el esquema `erp` y sobreviven a reiniciar el servidor.
3. Errores controlados y en español: nombre vacío, RUC duplicado, fecha de fin anterior a la de inicio, evento sin cliente.
4. El detalle del evento muestra la sección de documentos con los controles de 1.2/1.3 deshabilitados y rotulados.
5. La tabla de desarrollo permite editar las 8 columnas, agregar, eliminar y renumerar filas, y rechaza cantidades o días negativos; está rotulada como datos de ejemplo.
6. Ninguna credencial ni consulta SQL llega al navegador (revisión del código cliente y del build).
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` sin errores.

### V7. Riesgos

- **TypeScript 7 y Next.js:** el proyecto usa TypeScript 7.0.2 (versión nativa). Next.js usa el paquete `typescript` durante el build; si no es compatible, propondré instalar en `apps/web` la última versión 5.x/6.x compatible (te lo consultaré antes).
- **Importar `.ts` del workspace:** `@erp/db` exporta archivos `.ts` con extensión explícita; Next.js debe transpilarlos (`transpilePackages`). Se verificará en el paso 4.
- **Límites de Netlify para la IA:** no afectan a esta tarea, pero condicionan la 1.3 (V-D2).
- **Prototipo sin autenticación:** solo local y con datos sintéticos o autorizados.
- **Datos de ejemplo en la tabla:** riesgo de confundirlos con una extracción real; mitigado con rótulo visible y página solo de desarrollo.
- **pnpm 12 y scripts de instalación:** pnpm puede bloquear scripts de instalación de algunos paquetes (p. ej. binarios nativos); si alguno lo requiere, te lo consultaré.

### V8. Resultado

**2026-11-26 — Instalación (paso 3).** El usuario aprobó los 14 paquetes y pidió **solo instalar, sin escribir código todavía**. Se creó únicamente el manifiesto mínimo `apps/web/package.json` (necesario para instalar). Versiones instaladas: `next` 16.4.6, `react`/`react-dom` 19.3.1, `zod` 4.6.7, `@tanstack/react-table` 9.3.1, `tailwindcss`/`@tailwindcss/postcss` 4.3.5, `postcss` 8.5.33, `@types/react` 19.3.3, `@types/react-dom` 19.3.0, `typescript` 7.0.2, `eslint` 10.15.0, `eslint-config-next` 16.4.6, `vitest` 5.1.2.

**Resuelto el mismo día, con aprobación del usuario:** en `apps/web` se fijaron `typescript` **6.0.3** y `eslint` **9.39.5** (versiones exactas, sin `^`, para que una actualización no vuelva a romper la compatibilidad). `pnpm peers check`: sin problemas. TypeScript 6.0.3 expone la API que usa Next.js; `packages/db` sigue con TypeScript 7.0.2 y sus 27 pruebas y la verificación de tipos siguen en verde. npm marca ESLint 9.39.5 como obsoleto (existe la 10), pero es la última compatible con `eslint-config-next` 16.4.6; revisar cuando Next.js admita ESLint 10. La instalación falló tres veces en Windows al renombrar la carpeta de `next` y funcionó con `--config.child-concurrency=1`.

Incompatibilidades detectadas inicialmente (`pnpm peers check`):
- **TypeScript 7.0.2:** no expone la API de JavaScript clásica (`createProgram` no existe). Next.js la usa para verificar tipos en el build y sugiere `typescript@^6.0.0`; `typescript-eslint` (de `eslint-config-next`) exige `>=4.8.4 <6.1.0`. Propuesta: `typescript@6.0.3` solo en `apps/web` (`packages/db` sigue con 7.0.2).
- **ESLint 10.15.0:** los plugins de `eslint-config-next` (`import`, `jsx-a11y`, `react`) admiten hasta ESLint 9. Propuesta: `eslint@9.39.5`.

Otros avisos: pnpm muestra «Agent skills awaiting approval: @tanstack/react-table» (no se aprobó; no es necesario para la aplicación). `sharp`, SWC de Next, `lightningcss` y Tailwind (oxide) se instalaron con binarios precompilados para Windows x64.

Pasos 2 y 4–12 sin iniciar: no se escribió configuración ni código.

---

## Tarea completada: Fase 1 · Subfase 1.1 — Conexión a PostgreSQL local y creación de tablas

| Campo | Valor |
| --- | --- |
| Estado | **Completado** el 2026-11-26 — revisión 2 aprobada (D1–D12), instalación de las seis dependencias aprobada; D13 añadida por indicación del usuario. Pendiente solo la revisión opcional en pgAdmin (paso 10). |
| Fecha | 2026-11-26 |
| Fase | 1.1 Base de datos (se adelanta antes de la parte visual, por decisión del usuario) |
| Fuera de alcance | Frontend, endpoints, carga de PDF, integración OpenAI, autenticación, Supabase |

#### Objetivo

Conectar el proyecto a la base de datos PostgreSQL local `grupo_cave_v1` con el usuario `grupo_cave` y crear, mediante migraciones versionadas en el repositorio, las tablas mínimas de Fase 1 (`clients`, `events`, `tdr_documents`, `tdr_extractions`, `tdr_items`), con una verificación automática de la conexión y de las restricciones.

#### Decisiones ya tomadas por el usuario (2026-11-26)

- Base de datos: **`grupo_cave_v1`** (ya creada). Usuario: **`grupo_cave`** (ya creado). Por ahora se trabaja solo en esa base.
- Gestor de paquetes: **pnpm**.
- Lenguaje: **TypeScript**.
- **No se instala ninguna dependencia sin aprobación previa y explícita del usuario**, paquete por paquete (ver §4).

#### Situación detectada en el entorno

- Repositorio casi vacío: `AGENTS.md`, `PLAN.md`, `MEMORY.md` (vacío) y `README.md`. Un commit inicial; los tres primeros archivos están en *staging* sin confirmar. No hay `package.json`, `.gitignore` ni migraciones.
- Node.js v24.11.0 y pnpm 12.21.0 disponibles.
- PostgreSQL **18.4** en ejecución (servicio `postgresql-x64-18`) en `localhost:5432`, con pgAdmin 4 incluido. `psql` está disponible y permite las verificaciones iniciales sin instalar nada.
- Supabase usa una versión mayor anterior a 18: **no se usarán funciones exclusivas de PostgreSQL 18** (por ejemplo `uuidv7()` nativo o columnas generadas virtuales). `gen_random_uuid()` está en el núcleo desde PostgreSQL 13.

---

### 1. Lo que necesito para conectarme a la base de datos

| # | Qué necesito | Quién lo hace | Detalle |
| --- | --- | --- | --- |
| 1 | Crear el archivo `.env` en la raíz del proyecto | Tú | Yo creo `.env.example` sin valores sensibles; lo copias como `.env` y escribes la contraseña de `grupo_cave`. `.env` queda excluido de Git (lo creo en `.gitignore` antes). La contraseña no debe pasar por el chat. Si tiene caracteres especiales (`@ : / # ?`), debe ir codificada en la URL (`@` → `%40`). |
| 2 | Confirmar el host y el puerto | Tú | Supongo `localhost:5432`. Indícalo si es otro. |
| 3 | Permisos de `grupo_cave` en `grupo_cave_v1` | Lo verifico yo con `psql` (paso 3) | Necesita poder **crear esquemas** en la base (`CREATE` sobre la base de datos) o ser su propietario. Si no los tiene, te daré la sentencia `GRANT` exacta para que la ejecutes tú como administrador. |
| 4 | Confirmar si `grupo_cave_v1` contiene datos o tablas previas | Tú (y lo compruebo en el paso 3) | No modificaré ni borraré nada existente; todo se crea en esquemas nuevos. |
| 5 | Aprobar las decisiones de §2 y, por separado, cada instalación de §4 | Tú | Sin aprobación no se instala nada. |

Contenido previsto de `.env.example`:

```dotenv
# Conexión a PostgreSQL local (solo desarrollo; nunca credenciales de producción)
DATABASE_URL=postgres://grupo_cave:<contraseña>@localhost:5432/grupo_cave_v1
# Esquema de la aplicación
DATABASE_SCHEMA=erp
# Esquema aislado para pruebas automatizadas (misma base de datos)
TEST_DATABASE_SCHEMA=erp_test
# Se añadirán en subfases posteriores: OPENAI_API_KEY, OPENAI_MODEL, STORAGE_LOCAL_DIR
```

---

### 2. Decisiones pendientes de aprobación (con recomendación)

| ID | Decisión | Recomendación | Alternativas y motivo |
| --- | --- | --- | --- |
| D1 | Herramienta de migraciones | **node-pg-migrate con archivos `.sql`** + driver `pg` | SQL escrito a mano: control total de índices parciales, `DEFERRABLE`, triggers y futuro RLS; las mismas sentencias sirven para Supabase (que también usa migraciones SQL). Dependencia pequeña, escrita en TypeScript y mantenida. **Drizzle ORM/kit**: tipos a partir del esquema, pero triggers y algunas restricciones requieren migraciones personalizadas igualmente. **Prisma**: más pesado, su motor de migraciones necesita una base *shadow* (privilegio `CREATEDB`, incompatible con trabajar en una sola base) y es menos flexible con índices parciales y RLS. La capa de consultas (SQL parametrizado con `pg` o Kysely) se decide en la subfase 1.2. |
| D2 | Esquema PostgreSQL | **`erp`** en lugar de `public` | En Supabase, la Data API expone `public` por defecto; un esquema propio evita exponer tablas por accidente y no interfiere con objetos que ya existan en `public`. |
| D3 | Idioma de identificadores | **Inglés** para tablas/columnas (como en `AGENTS.md`); **español** en la interfaz | Las columnas del contrato (`producto`, `subproducto`, `descripcion`, `cant`, `unidad`, `dias`, `observacion`) se mantienen en español para coincidir con el JSON de la IA. `item` se guarda como `item_number`. |
| D4 | Usuario de base de datos | **`grupo_cave`** para migraciones y para la aplicación, por ahora | Es el usuario indicado. Separar un rol de solo datos (sin permisos para crear/borrar tablas) queda como mejora antes de cualquier piloto o de Supabase (ver §7). |
| D5 | Estados de extracción | `pending`, `processing`, `processed`, `failed`, `confirmed`, `superseded` (texto con `CHECK`, no `ENUM`) | Cubre los estados de `AGENTS.md` y añade `superseded` para una confirmación reemplazada. En la interfaz: Pendiente, Procesando, Procesado, Error, Confirmado, Reemplazado. |
| D6 | Extracción vigente | Como máximo **una extracción `confirmed` por documento** y **un solo procesamiento activo** (`pending`/`processing`) por documento, con índices únicos parciales | Reprocesar crea un nuevo intento; nunca modifica el confirmado. Reemplazar una confirmación exige una acción explícita que, en una transacción, pasa la anterior a `superseded`. |
| D7 | Inmutabilidad en base de datos | Triggers que impiden (a) modificar `raw_response` una vez guardado y (b) modificar o borrar ítems de una extracción `confirmed`/`superseded` | Defensa en profundidad además de la validación del backend. |
| D8 | Borrado | Claves foráneas con `ON DELETE RESTRICT`; sin cascada | Evita perder documentos y extracciones al borrar un cliente o evento. |
| D9 | Datos mínimos de cliente y evento | Ver §3 | Confirmar si faltan campos indispensables (por ejemplo, RUC obligatorio, ciudad del evento). |
| D10 | Estructura del repositorio | **Workspace pnpm** (`pnpm-workspace.yaml`) con el paquete `packages/db` | La capa de datos queda independiente de la decisión pendiente sobre Next.js y un posible backend separado (subfase 1.0). Luego se añadirán `apps/web` y, si se aprueba, `apps/api`. |
| D11 | Pruebas con una sola base de datos | Las migraciones se escriben sin nombre de esquema fijo y se aplican a **`erp`** (desarrollo) y a **`erp_test`** (pruebas) dentro de `grupo_cave_v1` | Mantiene separados los datos de desarrollo y de pruebas sin crear otra base. Las pruebas trabajan solo en `erp_test`, dentro de transacciones que se revierten. Las funciones de trigger se crean con `SET search_path FROM CURRENT` para que cada esquema use sus propias tablas. |
| D13 | Proveedor de IA (indicación del usuario, 2026-11-26) | **No restringir a un modelo ni a una compañía.** `tdr_extractions` guarda `provider` (texto libre en minúsculas: `openai`, `anthropic`, `google`…) y `model` (identificador exacto) en cada intento | Permite comparar modelos de distintos proveedores sobre el mismo TDR. La integración (subfase 1.3) deberá usar una interfaz de proveedor con adaptadores. `AGENTS.md` aún menciona solo OpenAI: actualizarlo queda a decisión del usuario. |
| D12 | Ejecución de TypeScript | **Node 24 con eliminación nativa de tipos** para scripts (`node --env-file=.env script.ts`) y `tsc --noEmit` para verificar tipos | Evita una dependencia extra (`tsx`). Exige sintaxis borrable (sin `enum` ni `namespace`) e importaciones con extensión `.ts`. Si resultara insuficiente, propondré `tsx` y esperaré aprobación. |

---

### 3. Modelo de datos propuesto (esquema `erp`)

Convenciones: claves `uuid` con `DEFAULT gen_random_uuid()` (el cliente también podrá generarlas, previsto para Fase 8); `created_at`/`updated_at` como `timestamptz DEFAULT now()` con trigger de actualización; `version integer` para concurrencia optimista; cantidades en `numeric`; fechas operativas en `date` (interpretadas en `America/Guayaquil`).

#### `clients`
| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | uuid | PK |
| name | text | NOT NULL, `CHECK (btrim(name) <> '')` |
| tax_id | text | NULL; único cuando no es nulo (RUC/cédula) |
| email | text | NULL |
| phone | text | NULL |
| notes | text | NULL |
| created_at, updated_at, version | | |

#### `events`
| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | uuid | PK |
| client_id | uuid | NOT NULL, FK → `clients` RESTRICT, índice |
| name | text | NOT NULL, no vacío |
| location | text | NULL |
| start_date, end_date | date | NULL; `CHECK (end_date >= start_date)` |
| notes | text | NULL |
| created_at, updated_at, version | | |

#### `tdr_documents`
| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | uuid | PK |
| event_id | uuid | NOT NULL, FK → `events` RESTRICT, índice |
| storage_provider | text | NOT NULL, `CHECK IN ('local','supabase')` |
| storage_key | text | NOT NULL; único junto con `storage_provider` (nunca una ruta absoluta) |
| original_filename | text | NOT NULL |
| mime_type | text | NOT NULL, `CHECK (mime_type = 'application/pdf')` |
| size_bytes | bigint | NOT NULL, `CHECK > 0` |
| sha256 | text | NOT NULL, `CHECK` de 64 hexadecimales; único por `(event_id, sha256)` para detectar duplicados |
| page_count | integer | NULL, `CHECK > 0` |
| uploaded_at | timestamptz | NOT NULL |
| created_at | timestamptz | |

#### `tdr_extractions`
| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | uuid | PK |
| tdr_document_id | uuid | NOT NULL, FK → `tdr_documents` RESTRICT, índice con `created_at` |
| status | text | NOT NULL, `CHECK` con los estados de D5 |
| idempotency_key | uuid | NOT NULL, UNIQUE (evita doble clic/reintentos duplicados) |
| model, prompt_version, schema_version | text | NOT NULL |
| raw_response | jsonb | NULL hasta procesar; inmutable una vez guardado (D7) |
| provider_response_id, provider_request_id | text | NULL |
| error_code, error_message | text | NULL; mensaje seguro, sin datos internos del proveedor |
| input_tokens, output_tokens, total_tokens | integer | NULL, `CHECK >= 0` |
| started_at, finished_at, confirmed_at | timestamptz | NULL |
| duration_ms | integer | NULL, `CHECK >= 0` |
| created_at, updated_at, version | | |

Índices únicos parciales: `(tdr_document_id) WHERE status = 'confirmed'` y `(tdr_document_id) WHERE status IN ('pending','processing')`. `CHECK` de coherencia: `confirmed` exige `confirmed_at`; `failed` exige `error_code`.

#### `tdr_items`
| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | uuid | PK |
| extraction_id | uuid | NOT NULL, FK → `tdr_extractions` RESTRICT |
| item_number | integer | NOT NULL, `CHECK >= 1`; único por extracción (`DEFERRABLE INITIALLY DEFERRED` para renumerar al eliminar filas) |
| producto, subproducto, descripcion | text | NOT NULL |
| cant | numeric(14,4) | NULL, `CHECK >= 0` |
| unidad | text | NULL |
| dias | numeric(8,2) | NULL, `CHECK >= 0` |
| observacion | text | NULL |
| source | text | NOT NULL, `CHECK IN ('ai','manual')`; metadato interno de trazabilidad |
| source_index | integer | NULL; posición en `raw_response.items` cuando `source = 'ai'` |
| created_at, updated_at, version | | |

El JSON original queda en `tdr_extractions.raw_response`; `tdr_items` es la copia editable. Al confirmar, se cambia el estado en una transacción y los ítems quedan bloqueados (D7).

---

### 4. Dependencias, datos e infraestructura

#### Instalaciones (cada una requiere tu aprobación antes de ejecutarse)

No se ejecutará `pnpm add` ni `pnpm install` hasta que apruebes expresamente la lista. Si apruebas solo una parte, se instala solo esa parte.

| Paquete | Tipo | Para qué | Si no se aprueba |
| --- | --- | --- | --- |
| `pg` | producción | Driver oficial de PostgreSQL para Node; consultas parametrizadas | No hay conexión desde la aplicación |
| `node-pg-migrate` | producción (paquete db) | Aplicar y registrar migraciones SQL versionadas | Habría que elegir otra herramienta (D1) |
| `typescript` | desarrollo | Compilador y verificación de tipos (`tsc --noEmit`) | No se puede verificar el tipado |
| `@types/node` | desarrollo | Tipos de Node.js para TypeScript | Errores de tipos en scripts |
| `@types/pg` | desarrollo | Tipos del driver `pg` | Errores de tipos al usar `pg` |
| `vitest` | desarrollo | Pruebas automatizadas de esquema y restricciones | Las pruebas quedarían como scripts manuales |

Se instalará la versión estable vigente de cada paquete en el momento de la aprobación, y te informaré de la versión exacta. Node 24 carga `.env` de forma nativa (`--env-file`), por lo que **no** se propone `dotenv`.

#### Cambios en la base de datos `grupo_cave_v1`

- Se crean los esquemas `erp` y `erp_test` y, en cada uno, la tabla de control de node-pg-migrate (`pgmigrations`), las 5 tablas y sus funciones de trigger.
- No se modifica ni se borra ningún objeto existente (incluido `public`). No se crean bases, roles ni servicios remotos.

#### Archivos nuevos

- `package.json` (raíz), `pnpm-workspace.yaml`, `packages/db/package.json`, `tsconfig.json`
- `.gitignore` (`node_modules/`, `.env`, `.env.*` salvo `.env.example`, `storage/`, dumps)
- `.env.example`
- `packages/db/migrations/` — `0001_funciones_base.sql`, `0002_clients_events.sql`, `0003_tdr_documents.sql`, `0004_tdr_extractions.sql`, `0005_tdr_items.sql`
- `packages/db/src/client.ts` (pool de conexión con `DATABASE_URL` y `search_path` del esquema configurado)
- `packages/db/scripts/check-connection.ts`
- `packages/db/tests/schema.test.ts`
- Actualización de `MEMORY.md` y de este `PLAN.md`

#### Scripts pnpm previstos

`db:check`, `db:migrate` (esquema `erp`), `db:migrate:test` (esquema `erp_test`), `db:status`, `test:db`, `typecheck`. Las migraciones *down* existirán pero contienen `DROP`: solo se ejecutarán con tu autorización expresa y nunca sobre `erp` con datos.

---

### 5. Pasos ordenados

| # | Paso | Responsable | Verificación |
| --- | --- | --- | --- |
| 1 | Aprobar este plan y las decisiones D1–D12 (o indicar cambios) | Tú | Aprobación explícita en el chat |
| 2 | Crear `.gitignore` y `.env.example`; después creas tu `.env` | Agente / Tú | `git status` no muestra `.env` |
| 3 | Verificar la conexión **sin instalar nada**, con `psql` y `DATABASE_URL`: versión del servidor, usuario actual, permiso para crear esquemas, objetos existentes | Agente | Informe de resultados sin mostrar credenciales; si falta un permiso, te paso el `GRANT` |
| 4 | Presentar la solicitud de instalación de §4 | Agente | **Esperar tu aprobación** |
| 5 | Crear `package.json`, `pnpm-workspace.yaml`, `packages/db/package.json`, `tsconfig.json` e instalar solo lo aprobado | Agente | `pnpm ls` sin errores |
| 6 | Implementar `db:check` (TypeScript) | Agente | Muestra servidor, base, usuario y esquema |
| 7 | Escribir las migraciones 0001–0005 | Agente | Revisión del diff |
| 8 | Aplicar migraciones en `erp_test` y luego en `erp` | Agente | `db:status` sin pendientes; segunda ejecución no cambia nada |
| 9 | Pruebas de esquema en `erp_test` y verificación de tipos | Agente | `test:db` y `typecheck` en verde (ver §6) |
| 10 | Revisar las tablas en pgAdmin | Tú (opcional) | Esquema `erp` con las 5 tablas |
| 11 | Actualizar `PLAN.md` (resultado) y `MEMORY.md` | Agente | Sin secretos |

No se realizarán commits, push ni cambios de rama sin tu autorización.

---

### 6. Criterios de aceptación y pruebas

1. `pnpm db:check` se conecta a `grupo_cave_v1` con `grupo_cave` y reporta la versión del servidor y el esquema activo, sin imprimir credenciales.
2. Las migraciones se aplican sobre esquemas vacíos y son idempotentes.
3. Las 5 tablas existen en `erp` y en `erp_test` con sus PK, FK, `CHECK` e índices.
4. Pruebas automáticas (solo en `erp_test`, en transacciones que se revierten):
   - Un evento sin cliente existente es rechazado (FK).
   - `cant` o `dias` negativos son rechazados; `NULL` es aceptado.
   - `mime_type` distinto de PDF y `sha256` mal formado son rechazados.
   - No se pueden tener dos extracciones `confirmed` ni dos procesamientos activos para el mismo documento.
   - Una `idempotency_key` repetida es rechazada.
   - `raw_response` no puede modificarse una vez guardado.
   - Los ítems de una extracción confirmada no pueden editarse ni borrarse.
   - `updated_at` se actualiza automáticamente.
   - Borrar un cliente con eventos es rechazado (`RESTRICT`).
   - Las pruebas no escriben en el esquema `erp`.
5. `pnpm typecheck` sin errores.
6. `.env` no aparece en `git status`; ningún secreto en archivos versionados ni en la salida de los scripts.

---

### 7. Riesgos

- **Un solo usuario para migraciones y aplicación:** `grupo_cave` podrá crear y borrar tablas desde la aplicación. Aceptable en desarrollo local; antes de un piloto o de Supabase conviene separar un rol de solo datos.
- **Desarrollo y pruebas en la misma base:** el aislamiento depende del esquema (`erp` frente a `erp_test`). Un error de configuración podría escribir pruebas en `erp`; se mitiga validando en el código de pruebas que el esquema sea `erp_test`.
- **Permisos desconocidos de `grupo_cave`:** si no puede crear esquemas, el paso 3 quedará bloqueado hasta que apliques el `GRANT` indicado.
- **Diferencia de versión:** local 18.4 frente a Supabase. Mitigación: evitar funciones exclusivas de 18 y verificar la versión antes de migrar.
- **Roles distintos en Supabase** (`postgres`, `authenticated`, `service_role`): permisos y RLS se adaptarán en la migración.
- **Subfase 1.0 incompleta:** frontend, backend y hosting aún no están aprobados; esta tarea se limita a `packages/db`.
- **TypeScript nativo de Node:** si la eliminación de tipos presenta limitaciones, se propondrá `tsx` (con aprobación).
- **Credenciales en `.env` en texto plano:** aceptable solo para desarrollo local con una contraseña exclusiva de desarrollo.

### 8. Progreso y resultado

#### Avance al 2026-11-26

| Paso | Estado | Resultado |
| --- | --- | --- |
| 1 | Completado | Plan aprobado (D1–D12). |
| 2 | Completado | `.gitignore` y `.env.example` creados; `.env` creado por el usuario y confirmado como ignorado por Git. |
| 3 | Completado | Conexión correcta con `psql`: PostgreSQL 18.4, usuario `grupo_cave`, base `grupo_cave_v1` en `localhost:5432`, UTF8. `grupo_cave` es propietario de la base, puede crear esquemas, no es superusuario. La base no tenía tablas; solo existe `public` y la extensión `plpgsql`. Zona horaria del servidor: `America/Bogota` (UTC-5 sin horario de verano, igual que `America/Guayaquil`; `timestamptz` se almacena en UTC). |
| 7 | Completado (adelantado; no requería instalar nada) | Migraciones `0001`–`0005` escritas en `packages/db/migrations/`. |
| — | Completado | Validación en seco con `psql`: las 5 migraciones *up*, 34 comprobaciones de restricciones con datos sintéticos y las 5 migraciones *down* se ejecutaron en un esquema temporal `erp_validacion` dentro de una transacción revertida. Todas correctas; no quedó ningún objeto en la base. |
| 4 | Completado | Instalación aprobada por el usuario: `pg` 8.23.1, `node-pg-migrate` 9.0.0, `typescript` 7.0.2, `@types/node` 24.19.4, `@types/pg` 8.23.1, `vitest` 5.1.2. |
| 5 | Completado | Workspace pnpm (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`) y paquete `@erp/db` (`packages/db/package.json`, `tsconfig.json`, `vitest.config.ts`). |
| 6 | Completado | `src/` (configuración, pool con `search_path`, transacciones, códigos de error, constantes de dominio) y `pnpm db:check`. |
| — | Completado | D13: columna `provider` añadida en `0004` antes de aplicar (texto libre en minúsculas; sin lista fija de proveedores). |
| 8 | Completado | Migraciones aplicadas primero en `erp_test` y después en `erp`. Segunda ejecución: «Sin migraciones pendientes». `pnpm db:status`: 0 pendientes en ambos esquemas. |
| 9 | Completado | `pnpm test:db`: 27 pruebas en verde sobre `erp_test`, en transacciones revertidas (ambos esquemas quedan con 0 filas). `pnpm typecheck` sin errores. |
| 10 | Pendiente (opcional, usuario) | Revisar el esquema `erp` en pgAdmin. |
| 11 | Completado | `PLAN.md` y `MEMORY.md` actualizados. |

Ajustes respecto al modelo de §3 introducidos al escribir las migraciones (dentro de D5–D7):
- `version` se incrementa automáticamente por trigger en cada `UPDATE`.
- `processed`, `confirmed` y `superseded` exigen `raw_response`; `superseded` también exige `confirmed_at`.
- Los ítems solo se crean, editan o eliminan con la extracción en `processed`; el trigger bloquea la extracción (`FOR SHARE`) para evitar carreras con una confirmación.
- Una extracción no puede cambiar de documento ni borrarse si está `confirmed`/`superseded`.
- `storage_key` rechaza rutas absolutas, unidades de Windows, barras invertidas y `..`.
- Índice único `(extraction_id, source_index)` para no importar dos veces el mismo elemento del JSON.
- Sin índice separado en `tdr_documents.event_id`: lo cubre el índice único `(event_id, sha256)`.
- `ON DELETE RESTRICT` produce el error `restrict_violation` (23001), a tener en cuenta en el manejo de errores del backend.

- `tdr_extractions.provider` exige minúsculas, dígitos, `_` o `-` (p. ej. `openai`, `anthropic`, `azure-openai`).
- `pg` devuelve `date` y `numeric` como texto para no desplazar fechas por zona horaria ni perder decimales.
- El script de migraciones solo aplica *up*; las *down* (con `DROP`) no tienen script y requieren autorización expresa.

#### Resultado final

Base `grupo_cave_v1` con los esquemas `erp` (desarrollo) y `erp_test` (pruebas), cada uno con `clients`, `events`, `tdr_documents`, `tdr_extractions`, `tdr_items` y la tabla de control `pgmigrations`. El esquema `public` no se modificó. Comandos disponibles desde la raíz: `pnpm db:check`, `pnpm db:migrate`, `pnpm db:migrate:test`, `pnpm db:status`, `pnpm test:db`, `pnpm typecheck`.

Riesgos abiertos: un solo usuario con permisos de propietario; diferencia de versión con Supabase; `AGENTS.md` aún menciona solo OpenAI (D13). Siguiente paso propuesto: completar la subfase 1.0 (frontend/backend y hosting) o pasar a 1.2 (carga de PDF), con plan y aprobación propios. No se hicieron commits.
