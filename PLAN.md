# PLAN.md — erp_v1

## Índice de tareas

| Tarea | Estado |
| --- | --- |
| Proyecto «Graduaciones UNEMI» con tres eventos | **Completado en local (2026-11-27)**; pendiente la revisión del usuario (decisiones G-1…G-8). Resultado abajo |
| Adaptador de IA (etapa C, subfase 1.3) | **Pendiente:** falta que el usuario elija proveedor y tenga clave de API |
| Etapa D (subfase 1.4): matriz editable y confirmación | **Completado (2026-11-27)**; pendiente la revisión del usuario. Resultado abajo; retirar tras la revisión |
| Catálogos en Administración y alta automática de trabajador/proveedor (parte A) | **Completado en local (2026-11-28)**; `0013` aplicada en `erp` y `erp_test`, pendiente en Supabase (aprobación aparte). Resultado abajo |
| Subida a Supabase y uso desde celulares (parte S) | **En progreso.** Aprobado el 2026-11-27 con las recomendaciones S-D1…S-D8 (sin cargar usuarios: los crea el usuario). Hechos S0–S6; faltan primer superusuario (usuario), publicación (S7) y respaldos (S8) |

### Camino a las primeras pruebas (orden acordado, 2026-11-27)

Cada punto necesita su propio plan y aprobación.

1. ~~Etapa D (subfase 1.4)~~ — completada el 2026-11-27. Con la matriz manual ya se pueden preparar proyectos reales sin IA.
   - **Cambio de prioridad (2026-11-27):** «Graduaciones UNEMI» debe llegar a Supabase (local primero, producción después) para que los encargados suban fotografías desde el celular. Eso adelanta la parte S y la publicación (puntos 5 y 6) respecto de la IA, que queda pendiente. Falta la aprobación del plan S y sus decisiones S-D1…S-D8.
2. **IA (siguiente):** elegir proveedor, clave en `.env`, SDK y adaptador; autorizar el envío de TDR reales.
3. **Operación mínima en proyectos reales** (decisión pendiente): hoy actividades y controles previos solo se editan, no se crean; las cotizaciones son de solo lectura.
4. **Validación (subfase 1.5):** TDR reales de distinto formato y extensión; criterios de calidad acordados con la empresa.
5. **Parte S (Supabase):** base, archivos, ingreso con correo y contraseña, RLS, respaldos y usuarios reales.
6. **Publicación (S-D8):** hosting, HTTPS, secretos y procesamiento de IA en segundo plano; revisión en celular.
7. **Datos reales y piloto.**

Las tareas completadas (usuarios y permisos, control de campo en Ejecución, reparto de pagos, demostración y fotografías, etapas A–C de Requerimiento, subfase 1.1) se retiraron de este archivo. Sus decisiones vigentes están en `AGENTS.md`, su estado en `MEMORY.md` y su detalle en el historial de Git.

---

## Resultado: catálogos en Administración y alta automática (parte A, aprobada y completada el 2026-11-28)

**Objetivo (pedido del usuario):** mover Trabajadores y Proveedores de Operación a Administración, junto a Usuarios, y que al crear un usuario la base cree automáticamente su trabajador o su proveedor.

### Decisiones (aprobadas el 2026-11-28)

- **A-D1. Qué tipos de usuario crean trabajador.** Recomendado: superusuario, campo y contabilidad (todos son personal de la empresa y pueden ser responsables); el proveedor crea un proveedor. Alternativa: solo el empleado de campo.
- **A-D2. Cuándo crea.** Recomendado: solo si el usuario se guarda **sin** trabajador/proveedor elegido; el formulario conserva la lista con una primera opción «Crear uno nuevo con este nombre» (por omisión), para poder seguir vinculando a un trabajador o proveedor ya existente (por ejemplo, los responsables de Graduaciones UNEMI). Datos copiados: nombre (y correo en el trabajador); proveedor de tipo `external`.
- **A-D3. Contabilidad.** Decisión del usuario: no incluirla por ahora. Administración sigue siendo solo del superusuario (`users.manage`); contabilidad conserva `catalogs.read` pero ya no ve los catálogos en pantalla (queda para después).
- **A-D4. Solo al crear.** Recomendado: el trigger actúa solo en el alta; cambiar el nombre o desactivar el usuario no toca al trabajador/proveedor (se editan en su catálogo).

### Pasos

1. Mover `app/operacion/{trabajadores,proveedores}` a `app/administracion/` y actualizar enlaces (`navigation.ts`, formularios, acciones, Requerimiento). Las rutas antiguas redirigen a las nuevas.
2. ~~Cambiar el layout de Administración~~: no se cambia (A-D3); `adminTabs` devuelve vacío sin `users.manage`.
3. Migración `0013_alta_trabajador_proveedor.sql`: función y trigger `BEFORE INSERT ON app_users` que, si falta el vínculo, inserta el trabajador o proveedor y completa `worker_id`/`supplier_id` (los CHECK existentes se evalúan después del trigger). Sin tablas nuevas (RLS sin cambios). Down: quita trigger y función.
4. Formulario y acción de usuario: opción «Crear uno nuevo», el `audit_log` del alta registra el trabajador/proveedor creado.
5. Pruebas: repositorio de usuarios (alta con y sin vínculo, por tipo), navegación por rol y cobertura de `authorize`. Typecheck, lint, test y build; verificación en `web-verificacion`.
6. Aplicar `0013` en `erp` y `erp_test` (con respaldo previo de `erp`). **En Supabase solo con aprobación aparte.**

### Resultado

- Páginas movidas a `apps/web/src/app/administracion/{trabajadores,proveedores}`; las rutas `/operacion/{trabajadores,proveedores}/*` redirigen (`next.config.ts`).
- `0013_alta_trabajador_proveedor.sql`: trigger `app_users_create_link` (`BEFORE INSERT`). Respaldo previo: `dumps/erp_antes_0013_2026-11-28.dump`.
- Formulario: «Crear un trabajador/proveedor nuevo con este nombre» por omisión en el alta; al editar, campo y proveedor siguen exigiendo vínculo. La auditoría `user.create` registra el vínculo creado (`linkCreated`).
- Pruebas: `pnpm test` (116 + 160), typecheck, lint y build sin errores; verificado en `web-verificacion` (redirección, pestañas y opciones del formulario). El alta real desde la pantalla no se probó en `erp` para no dejar un usuario de prueba (no se borran); la base se probó en `erp_test`.

### Riesgos

- Un alta con vínculo vacío por error crea un trabajador duplicado; se mitiga con la opción explícita del formulario y desactivándolo después (los trabajadores no se borran).
- `db:users:example` pasa siempre el vínculo: no cambia. `db:supabase:admin` crea el primer superusuario sin trabajador: con A-D1 recomendado también se le crearía uno (se registra en su auditoría).

---

## Tarea urgente: proyecto «Graduaciones UNEMI» con tres eventos (2026-11-27)

| Campo | Valor |
| --- | --- |
| Estado | **Completado en local (2026-11-27).** Ejecución pedida directamente por el usuario («urgente»). Las decisiones G-1…G-8 las tomó el agente con el valor más conservador y **quedan pendientes de la revisión del usuario** |
| Origen | `MATRIZ_COSTOS_GRADUACIONES BORRADOR DILAN copy.xlsx` (hojas QUITO, CUENCA y GUAYAQUIL). El archivo no se versiona |
| Objetivo | Cargar el proyecto con sus tres eventos y que los encargados puedan subir fotografías por subproducto/requerimiento (también desde el celular), para generar el informe después |
| Fuera de alcance | IA (queda pendiente), informe fotográfico, subida a Supabase (parte S: primero local; producción necesita su aprobación y credenciales), edición de P. Unit y anticipos desde pantalla |

### Decisiones tomadas (revisar)

| ID | Decisión |
| --- | --- |
| G-1 | **Evento** como entidad propia: tabla `project_events` y `tdr_items.event_id`. Requerimiento, Planificación, Abastecimiento y Ejecución muestran pestañas de evento (`?evento=`); los indicadores se calculan del evento visible |
| G-2 | Niveles: `rubro` y `producto` = «Producto integral (TDR)»; `producto_codigo` = CPC; `tdr_ref` = «Ítem TDR»; `producto_descripcion` = «Descripción TDR»; `subproducto` = «Subproducto / requerimiento»; `descripcion` = «Especificación técnica»; `categoria` = «Cat.». La numeración en pantalla es `ítem TDR.posición` dentro de cada evento |
| G-3 | Cada fila del Excel con subproducto es un ítem (y admite fotografías, que ya existían por ítem). Las filas sin subproducto (renglones vacíos de «Adicionales», totales y resúmenes) no se cargan |
| G-4 | Costos: `item_plans.planned_cost` = subtotal del Excel; nuevas `unit_price`, `advance_1` y `advance_2`. **Saldo = subtotal − anticipos**, calculado, nunca guardado. Los anticipos del Excel no se cargan como pagos de órdenes (no tienen fecha ni respaldo, y algunos superan el subtotal) |
| G-5 | **Estado operativo** propio (`item_execution.operational_status`: pendiente, en proceso, listo), distinto del estado de montaje. Lo cambia quien tiene `mount.update` |
| G-6 | Proveedores: se crea en el catálogo cada nombre del Excel tal como está escrito, sin fusionar parecidos («monica» ≠ «MONICA ALBAN»). Los textos que no son un proveedor (PENDIENTE, NOMBRE, NO ES ENTREGABLE, NO CATERING) van a la observación |
| G-7 | La columna «Responsable» de Cuenca (6 filas) va a la observación: esas personas no están en el catálogo de trabajadores y no se crean personas a partir de nombres parciales |
| G-8 | La matriz entra como un intento con proveedor `excel`, ya confirmado, sobre un PDF generado que declara su origen (no es un TDR). Asignación de responsable **en bloque** por evento o por producto, para que los encargados alcancen sus ítems |

### Pasos

1. Migración `0011_eventos_costos` (respaldo previo `dumps/erp_antes_0011_2026-11-27.dump`) en `erp_test` y `erp`.
2. Repositorios: eventos, columnas nuevas en la matriz, estado operativo, asignación en bloque; pruebas.
3. Script `apps/web/scripts/import-graduaciones.ts` (idempotente, con `--dry-run`): lee un JSON extraído del Excel y crea proyecto, eventos, proveedores, matriz confirmada y costos.
4. Pantallas: pestañas de evento, matriz con todas las columnas, Ejecución usable en celular, estado operativo y responsable en bloque.
5. Verificación: pruebas, tipos, lint, build y recorrido en el navegador (también en tamaño de celular).

### Resultado

- **Base:** migración `0011_eventos_costos` en `erp_test` y `erp`. Repositorios `events.ts`, columnas nuevas en `matrix.ts` (indicadores por evento), `setItemOperationalStatus`, `assignResponsibleBulk` e `import/cost-matrix.ts`.
- **Datos (solo en `erp` local):** proyecto «Graduaciones UNEMI» (contratante EP UNEMI, empresa Grupo CAVE, proceso LICS-EPUNEMI-2026-002) con 3 eventos y 593 ítems: Quito 187 (subtotal 110.911,08; anticipos 2.250,00), Cuenca 219 (56.645,50; 21.940,91) y Guayaquil 187 (97.407,00; 0). Los subtotales coinciden al centavo con los totales del Excel. Se omitieron 11 filas sin subproducto. 16 proveedores creados tal como están escritos (revisar duplicados: «MONICA»/«MONICA ALBAN», «DIEGO»/«DIEGO CHILIQUINGA»). Sin responsables asignados.
- **Pantallas:** pestañas de evento en Requerimiento, Planificación, Abastecimiento y Ejecución; matriz por producto con subproducto, especificación, proveedor, días, cant., p. unit, subtotal, saldo, estado operativo, fotos y responsable; responsable en bloque; checklist de Ejecución para celular; botón «Tomar foto».
- **Verificación:** lint, tipos, 112 pruebas de base y 154 de web, build. En el navegador: los tres eventos y sus totales; como superusuario, responsable en bloque sobre un producto; como empleado de campo en tamaño de celular, entrada directa a su evento, cambio de estado operativo y subida y borrado de una fotografía sintética (201 y foto visible); el proyecto de demostración (sin eventos) se ve igual que antes. Los datos de la prueba se revirtieron (queda su rastro en `audit_log`).
- **No probado:** un celular real (el ingreso local solo acepta este equipo); varios usuarios a la vez; el rechazo del servidor a un empleado de campo sobre un ítem ajeno se apoya en `authorize` y en la prueba de cobertura, no se repitió en el navegador.

### Riesgos

- El ingreso local (`dev`) solo funciona desde este equipo: **el uso real desde celulares llega con Supabase Auth y la publicación** (parte S y S-D8).
- 593 ítems: tablas largas por evento; sin medir con varios usuarios a la vez.
- Los datos son un borrador del Excel: cantidades y precios pueden cambiar y la matriz confirmada no se edita (sí proveedor, costo, estados, responsable y fotos).

---

## Resultado: etapa D — matriz editable y confirmación (completada el 2026-11-27)

Aprobada el 2026-11-27 con las recomendaciones de D-1…D-10. Pendiente la revisión del usuario; después se retira esta sección.

- **Base:** migración `0010_una_matriz_por_proyecto` (aplicada en `erp_test` y `erp`; respaldo previo `dumps/erp_antes_0010_2026-11-27.dump`): al confirmar exige al menos un ítem y que el proyecto no tenga otra matriz confirmada. Repositorio `matrix-draft.ts`: importación idempotente de la propuesta, matriz manual (proveedor `manual`), alta, edición por campo con versión, mover dentro del rubro, eliminar (con su responsable) y confirmación; el orden se normaliza para que cada rubro quede junto. `updateProject` registra `ficha_extraction_id`.
- **Servidor:** el orquestador copia la propuesta a la matriz en la misma transacción que guarda el JSON (D-2). Permiso `matrix.edit` (solo superusuario); acciones en `server/actions/matrix.ts` con `authorize` y `audit_log`. La ficha se aplica leyendo el JSON guardado, no lo que envía el navegador.
- **Pantalla Requerimiento:** editor agrupado por rubro con guardado celda a celda, ↑ ↓, ✕, responsable, alta de ítems y «Confirmar matriz…» con resumen; violeta en lo que la IA propuso y nadie cambió; tarjeta «Ficha propuesta» con casillas por campo y elección del contratante (mantener, usar uno registrado o crear); «Empezar matriz a mano».
- **Verificación:** lint, tipos, 103 pruebas de base y 148 de web, build. En el navegador, en el proyecto **«PRUEBA etapa D»** (con contratantes «PRUEBA contratante etapa D» y «PRUEBA contratante sintético S.A.», y un PDF inventado; quedan en la base local, D-10): matriz manual con alta, edición (incluido un valor no válido rechazado), mover, cambiar de rubro, responsable y eliminar; propuesta simulada (proveedor `prueba-sintetica`, sin IA real) en violeta, edición que quita el violeta, ficha aplicada por campos con contratante nuevo, confirmación y matriz visible en Planificación; rechazo del servidor a una segunda matriz y a editar un ítem confirmado; contabilidad en solo lectura.
- **Desviaciones:** (1) «Procesar con IA» se bloquea cuando el proyecto ya tiene matriz confirmada (el resultado no podría confirmarse por D-7). (2) La descripción puede quedar vacía (el contrato `tdr-v1` y la base lo admiten); rubro y producto son obligatorios. (3) La ficha se aplica con casillas marcadas por defecto («aplicar todo» = dejar todas marcadas). (4) El panel de confirmación se corrigió tras la prueba (desbordaba a lo ancho); la corrección compila, pero no se volvió a abrir en el navegador porque ya no quedaba ningún borrador sin confirmar.
- **Riesgos abiertos:** importación probada solo con una propuesta simulada (falta un adaptador real); matrices de cientos de filas sin medir; el borrador manual del proyecto de prueba quedó sin confirmar (inofensivo).

---

## Tarea pendiente: adaptador de IA (etapa C, subfase 1.3)

| Campo | Valor |
| --- | --- |
| Estado | **Pendiente.** Hecho sin proveedor: contrato `tdr-v1`, prompt `tdr-extraccion-v1`, interfaz común, servicio, orquestador y pantalla de estado. Falta el adaptador |
| Bloqueo | El usuario debe elegir proveedor (R-D6) y tener su clave de API |

- **R-D6:** Anthropic (`@anthropic-ai/sdk`), OpenAI (`openai`) o Google (`@google/genai`). Antes de integrarlo se verifica en la documentación vigente la entrada PDF nativa, la salida estructurada y los límites. La clave la escribe el usuario en `.env`; enviar TDR reales requiere su autorización (si no, solo PDF sintéticos).
- **R-D7:** el procesamiento corre dentro del servidor local; se reevalúa antes de publicar (punto 6 del camino).
- **Pasos:** instalar el SDK aprobado; adaptador en `apps/web/src/integrations/ai/` registrado en `registry.ts`; pruebas con mock (respuesta válida, JSON inválido, incompleta, rechazada, vacía, timeout, doble clic); una prueba real solo con un PDF sintético o autorizado, con informe de tokens y duración.
- **Riesgos:** coste y privacidad de las llamadas; PDF extensos que superen los límites del modelo (error controlado; dividir documentos requiere aprobación aparte, `AGENTS.md` §8); paneles de intento procesado o fallido aún sin verificar con datos reales.

---

## Tarea propuesta: subida a Supabase y uso desde celulares (parte S)

| Campo | Valor |
| --- | --- |
| Estado | **Aprobado el 2026-11-27** con las recomendaciones S-D1…S-D8. El usuario crea los usuarios a mano: no se cargan trabajadores ni usuarios. **En progreso:** S0–S6 hechos |
| Objetivo | Base, fotografías e inicio de sesión en Supabase; aplicación publicada en una dirección de internet para que los encargados suban fotos desde el celular |
| Fuera de alcance | IA, portal del proveedor, aprobación de costos, políticas RLS por usuario (S-D7, «después»), informe fotográfico |

### S1. Comprobación de solo lectura (hecha el 2026-11-27)

- Proyecto `pwgnnqynbfppcmtekizi`; conexión por **Session pooler** `aws-2-us-east-1.pooler.supabase.com:5432` (la conexión directa es solo IPv6 y este equipo no la resuelve). Región: `us-east-1`.
- **PostgreSQL 17.12** (local: 18.4). Las migraciones `0001`–`0011` no usan nada exclusivo de PG 18 (revisado); se confirma al aplicarlas.
- Usuario `postgres`: puede crear esquemas y roles, no es superusuario. `pgcrypto`, `uuid-ossp` y `gen_random_uuid()` disponibles. El pooler respeta `search_path` por sesión (el pool actual funciona sin cambios).
- Proyecto vacío: sin esquema `erp`, 0 tablas en `public`, sin buckets. La clave secreta de Storage funciona.
- **SSL:** el certificado lo firma la CA de Supabase, que Node no conoce. Para conexión verificada hace falta el certificado de Supabase (Project Settings › Database › SSL Configuration › Download certificate) guardado fuera de Git; no se conectará sin verificar en el uso normal.

### S2. Decisiones que necesito (con recomendación)

| ID | Decisión | Recomendación | Alternativa |
| --- | --- | --- | --- |
| S-D1 | Plan de Supabase | **Pro** para datos reales (el gratuito pausa tras una semana sin uso y no tiene respaldos diarios). Lo contrata el usuario | Gratuito por ahora, con respaldo manual diario |
| S-D2 | Entornos | **Este proyecto es producción.** Antes de tocarlo, las migraciones se ensayan dentro de una transacción que se revierte (no deja rastro) | Crear un segundo proyecto de pruebas |
| S-D4 | Qué datos se suben | **Graduaciones UNEMI** (contratante, empresa Grupo CAVE, eventos, 593 ítems, 16 proveedores) más trabajadores y usuarios reales. Sin demostración, proyectos de prueba ni usuarios de ejemplo | Copiar todo |
| S-D5 | Archivos | **Buckets privados** `tdr` y `evidencias`. Las fotos **suben directo del celular a Storage** con una URL firmada de un solo uso que emite el servidor tras `authorize`; el servidor valida el archivo y registra la foto | Que pasen por el servidor (choca con el límite de tamaño de las funciones del hosting) |
| S-D6 | Acceso de las personas | **Contraseña temporal** creada por el superusuario en Administración › Usuarios; la persona la cambia al entrar | Invitación por correo (requiere SMTP propio) |
| S-D7 | Seguridad en la base | El esquema `erp` **no se expone** en la API de Supabase; RLS activado en todas sus tablas sin políticas para `anon`/`authenticated`; la aplicación entra con un rol propio `erp_app` (solo datos, sin crear tablas) | Entrar con `postgres` |
| S-D8 | Publicar la web | **Netlify** (hosting que ya tienen), dominio o subdominio de la empresa, HTTPS. Se verifica antes el soporte de Next.js 16 y sus límites | Otro hosting (Vercel, Render) |

### S3. Pasos

| # | Paso | Verificación |
| --- | --- | --- |
| S0 | Aprobación, respuestas S-D1…S-D8 y dependencias `@supabase/supabase-js` y `@supabase/ssr` | Aprobación explícita |
| S2 | Ensayo de `0001`–`0011` en una transacción revertida; luego esquema `erp`, migraciones y rol `erp_app` | `pnpm db:status` contra Supabase |
| S3 | Migración `0012`: RLS en todas las tablas de `erp`, permisos de `erp_app` | `anon`/`authenticated` no leen nada; Security Advisor sin alertas críticas |
| S4 | Adaptador de almacenamiento `supabase` y subida directa firmada | Pruebas con mock y una foto real |
| S5 | Adaptador de autenticación `supabase` (correo y contraseña, cambio de contraseña, `auth_subject`) y alta de usuarios con contraseña temporal | Un usuario por tipo |
| S6 | Carga de datos: empresa, Graduaciones UNEMI (`pnpm db:import:matrix` apuntando a Supabase), trabajadores y usuarios reales | Conteos y totales iguales al Excel |
| S7 | Publicación en Netlify con secretos en sus variables de entorno | Ingreso y subida de una foto **desde un celular real** |
| S8 | Respaldos de base y de fotos; plan de reversión; `.env.example`, `AGENTS.md`, `MEMORY.md` | Documento y una restauración de prueba |

### Resultado parcial (2026-11-27)

- **Código:** destino `supabase` en `@erp/db` (`SUPABASE_DATABASE_URL`, esquema `erp`); conexión remota solo con CA (`DATABASE_SSL_CA_FILE` o `DATABASE_SSL_CA`). Migración `0012_rls_erp_app` (RLS en todas las tablas y política para `erp_app`; aplicada también en `erp` y `erp_test`, respaldo `dumps/erp_antes_0012_2026-11-27.dump`). Scripts `db:supabase:setup` (`--rehearse`, `--role`, `--grants`), `db:migrate:supabase`, `db:status:supabase`, `db:supabase:storage`, `db:supabase:admin`, `db:import:matrix --target=supabase` y `start:supabase`. Adaptador de almacenamiento `supabase` (buckets privados `tdr` y `evidencias`, enlaces de lectura de 5 min, subida directa firmada desde el celular que el servidor valida y registra). Adaptador de ingreso `supabase` (correo y contraseña, `src/proxy.ts` renueva la sesión, cambio obligatorio de la contraseña temporal en `/cuenta/contrasena`). Administración › Usuarios pide correo y contraseña temporal y crea la cuenta en Supabase Auth (con compensación si falla). Dependencias: `@supabase/supabase-js` 2.119.2 y `@supabase/ssr` 0.12.7.
- **En Supabase:** ensayo correcto de `0001`–`0012` en PG 17.12 (revertido); rol `erp_app` (sin privilegios de administración; su conexión en `.env.supabase`, fuera de Git); esquema `erp` con 24 tablas, RLS en todas; buckets privados con límite de tamaño y tipo. Datos: Graduaciones UNEMI (contratante EP UNEMI, empresa Grupo CAVE, 3 eventos, 593 ítems, 16 proveedores) con los mismos totales que el Excel; sin trabajadores ni usuarios.
- **Verificado:** `erp_app` entra verificado por el pooler, escribe (revertido) y no puede crear tablas, borrar el historial ni leer las migraciones; la API pública con la clave publicable no lee `erp` ni lista archivos; subida firmada sin clave aceptada una sola vez, PDF rechazado en `evidencias`, lectura por enlace temporal; la aplicación local contra Supabase muestra el ingreso con correo y rechaza credenciales incorrectas. Tipos, lint, 115 pruebas de base y 160 de web, build.
- **Sin probar:** ingreso correcto, cambio de contraseña, alta de usuarios y subida de una foto desde la aplicación contra Supabase (no hay usuarios: los crea el usuario) y un celular real (falta publicar).
- **Pendiente:** primer superusuario (el usuario: Supabase › Authentication › Add user y `pnpm db:supabase:admin`); S7 publicación (hosting y dominio); S8 respaldos. La subida de PDF de TDR pasa por el servidor y en Netlify chocaría con su límite de tamaño (no urgente: sin IA no se cargan TDR).

### S4. Riesgos

- Es producción desde el primer día: todo cambio va por migración y con respaldo previo.
- Diferencia PG 17 / 18 (bajo riesgo, se confirma en el ensayo).
- Límites del hosting para subir fotos grandes (por eso la subida directa firmada).
- Cobertura móvil en las sedes: sin conexión no se pueden subir fotos (la operación sin conexión es la Fase 8).
- Costos mensuales de Supabase y del hosting; privacidad y región (`us-east-1`).
- Mientras no exista S5, el ingreso `dev` se niega a funcionar con esta base (correcto).
