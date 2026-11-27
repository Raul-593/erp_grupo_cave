# PLAN.md — erp_v1

## Índice de tareas

| Tarea | Estado |
| --- | --- |
| Proyecto «Graduaciones UNEMI» con tres eventos | **Completado en local (2026-11-27)**; pendiente la revisión del usuario (decisiones G-1…G-8). Resultado abajo |
| Adaptador de IA (etapa C, subfase 1.3) | **Pendiente:** falta que el usuario elija proveedor y tenga clave de API |
| Etapa D (subfase 1.4): matriz editable y confirmación | **Completado (2026-11-27)**; pendiente la revisión del usuario. Resultado abajo; retirar tras la revisión |
| Subida a Supabase (parte S) | **Pospuesta por el usuario (2026-11-27)** hasta tener todo listo para las primeras pruebas. El proyecto de Supabase ya existe, vacío y sin conectar |

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

## Tarea pospuesta: subida a Supabase (parte S)

| Campo | Valor |
| --- | --- |
| Estado | **Propuesto y pospuesto (2026-11-27):** se hará cuando esté todo listo para las primeras pruebas (punto 5 del camino). Nada se ejecuta sin aprobación explícita |
| Fuera de alcance | Publicar la aplicación web (S-D8), portal del proveedor, módulo de aprobación de costos, políticas RLS por usuario (S-D7) |

### S1. Objetivo

La base de datos, los archivos (PDF y fotografías) y el inicio de sesión pasan a Supabase: primero en un proyecto de pruebas y, validado, en el de producción. Con la base en Supabase la aplicación sigue corriendo solo en este computador hasta publicarla (S-D8).

### S2. Punto de partida (2026-11-27)

- Migraciones `0001`–`0009` (PostgreSQL 18.4 local; Supabase usa una versión anterior: comprobar en S1).
- `app_users.auth_subject` vacía, prevista para el id de Supabase Auth; historial en `audit_log`.
- Autenticación detrás de `AuthProvider`; solo existe el adaptador `dev`, que se niega a funcionar con una base remota. `AUTH_PROVIDER=supabase` se rechaza hasta que exista su adaptador.
- Almacenamiento detrás de `FileStorage` (`'local' | 'supabase'`); solo existe el adaptador local.
- El esquema `erp` no está en `public`. El pool fija el esquema con `options: -c search_path=…`, que el pooler de Supabase puede ignorar: se fijará en el rol.
- Conexión prevista: cadena del **Session pooler** en `.env` como `SUPABASE_DATABASE_URL`, sin reemplazar `DATABASE_URL`.

### S3. Decisiones que necesito (con recomendación)

| ID | Decisión | Recomendación | Alternativa |
| --- | --- | --- | --- |
| S-D1 | Plan de Supabase | **Pro** para datos reales (el gratuito pausa tras una semana sin uso y no tiene respaldos diarios); costo y cuenta los gestiona el usuario | Gratuito solo para pruebas |
| S-D2 | Entornos | **Dos proyectos:** pruebas primero y producción después de validar | Uno solo |
| S-D3 | Región | **La del futuro servidor web**; si no está decidida, `us-east-1`. Verificar con la empresa la Ley Orgánica de Protección de Datos Personales | `sa-east-1` |
| S-D4 | Qué datos se suben | **Producción limpia:** esquema, empresa, catálogos elegidos y usuarios reales; sin demostración, usuarios de ejemplo ni proyectos de prueba | Copiar todo al proyecto de pruebas |
| S-D5 | Archivos | **Buckets privados** `tdr` y `evidencias`; los archivos pasan por el servidor | URLs firmadas de corta duración |
| S-D6 | Acceso de las personas | **Invitación por correo** (requiere SMTP propio) | Contraseña temporal |
| S-D7 | RLS | **Ahora:** RLS en todas las tablas sin acceso para `anon` ni `authenticated` y rol `erp_app` solo de datos. **Después:** políticas por usuario | Políticas por usuario desde ya |
| S-D8 | Publicar la web | **Plan aparte** | Incluirlo aquí |

### S4. Pasos

| # | Paso | Verificación |
| --- | --- | --- |
| S0 | Aprobación, dependencias (`@supabase/supabase-js`, `@supabase/ssr`) y respuestas S-D1…S-D8 | Aprobación explícita |
| S1 | Comprobar versión, extensiones, SSL y conexión (solo lectura) | Informe de compatibilidad |
| S2 | Esquema `erp`, rol `erp_app` y migraciones | `pnpm db:status` contra Supabase |
| S3 | Migración de RLS (solo `erp_app`) | `anon`/`authenticated` no leen nada; Security Advisor sin alertas críticas |
| S4 | Adaptador de almacenamiento `supabase` | Pruebas con mock y una real |
| S5 | Adaptador de autenticación `supabase` (correo y contraseña, recuperación, invitación, `auth_subject`) | Un usuario por rol |
| S6 | Validación completa con la aplicación local apuntando a Supabase | Pruebas por rol en verde |
| S7 | Producción y carga de catálogos y usuarios reales (script que respeta triggers; no `pg_dump` completo) | Conteos e ingreso de cada usuario |
| S8 | Respaldos de base y de archivos; plan de reversión | Documento |
| S9 | Actualizar `.env.example`, `AGENTS.md`, `PLAN.md` y `MEMORY.md` | Sin secretos |

### S5. Riesgos

Diferencia de versión de PostgreSQL; pooler sin ajustes de sesión; invitaciones sin SMTP propio; carga de pagos con triggers (repartos después de las líneas); privacidad y región; costos mensuales.
