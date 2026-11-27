# PLAN.md — erp_v1

## Índice de tareas

| Tarea | Estado |
| --- | --- |
| Datos de demostración del prototipo en el proyecto 1 + módulos Planificación, Abastecimiento y Ejecución (lectura) + carga de fotografías en Ejecución | **Completado (2026-11-27): etapas E, F, F2 (edición) y G (fotografías); pendiente la revisión final del usuario** |
| Fase 1 · Módulo Operación › Requerimiento con el diseño del prototipo `CAVE-ERP-v3` (reemplaza el plan visual 1.0b; abarca 1.0b, 1.2, 1.3 y 1.4) | **Aprobado; en progreso** — etapas A y B completadas; C preparada sin proveedor (falta SDK y adaptador); D sin iniciar |
| Actualización de `AGENTS.md`: terminología proyecto/empresa, guía visual, ficha del proyecto, rubros y responsable por ítem | Completado (2026-11-26, solicitado por el usuario) |
| Fase 1 · 1.0b — Interfaz web base (Next.js) | **Reemplazado** por la tarea anterior; se conservan la instalación y las decisiones técnicas V-D1–V-D9 |
| Fase 1 · 1.1 — Conexión a PostgreSQL y creación de tablas | Completado (2026-11-26) |
| Actualización de `AGENTS.md`: IA multiproveedor con conexión común | Completado (2026-11-26, solicitado por el usuario) |

---

## Tarea actual: datos de demostración y fotografías en Ejecución

| Campo | Valor |
| --- | --- |
| Estado | **Aprobado por etapas (usuario, 2026-11-27):** «comencemos por la Etapa E y, una vez aprobada, la F, y así hasta la G». Se ejecutó con las recomendaciones E-D1 a E-D10. **Etapas E, F, F2 y G completadas (ver E7, E8 y E9)** |
| Fecha | 2026-11-26 |
| Origen | Solicitud del usuario: todavía no hay clave de API; quiere avanzar guardando en la base, como si fueran del proyecto 1, los datos que el prototipo muestra en Operación › Requerimiento, Planificación, Abastecimiento y Ejecución, y habilitar la subida de fotos desde Ejecución |
| Cambia el alcance vigente | Sí. `AGENTS.md` §2 y §6 excluían estos módulos de la Fase 1 y prohibían cargar los datos del prototipo; las fotografías eran de la Fase 7. Por eso este plan incluye actualizar `AGENTS.md` (E-D9) |
| Fuera de alcance | Edición de planificación, compras, pagos y estados de montaje (solo lectura); cotizaciones desde el portal del proveedor; versiones/adendas; Cierre, Finanzas, Administración; autenticación; acceso desde el celular; etapa D (matriz editable) y adaptador de IA, que siguen como estaban |

### E1. Situación encontrada

- **Proyecto 1** en `erp`: «Prueba 1», contratante «Raul», sede Guayaquil, fechas 26–27 nov 2026, sin TDR. Hay 3 trabajadores («Trabajador 1–3»). No hay empresas, documentos, extracciones ni ítems.
- **La matriz no puede guardarse sola:** `tdr_items` exige una extracción y esta exige un documento PDF. Hay que decidir el vehículo (E-D1).
- **El prototipo solo contiene 10 ítems** (dice «10 de 52 mostrados»). Los otros 42 y el rubro 6 «Artistas y show» no existen en el archivo: no se inventan.
- **El prototipo se contradice en sus totales:** los pagos listados suman $18.540; los porcentajes pagados por ítem suman $19.220; el pie dice $22.620 pagado y $26.572 de saldo; habla de «6 órdenes» y solo hay cinco (OC-014 a OC-018); la OC-015 tiene dos proveedores; la OC-018 es de hospedaje pero su pago dice «Flete de pantallas». El ítem «5.2» es el único del rubro 5 (el sistema lo numerará 5.1).
- **Defecto en `.gitignore`:** la regla `storage/` también ignora el código de `apps/web/src/integrations/storage/` (`types.ts`, `local.ts`). Esos dos archivos **no están en el commit `7e62a31`**: un clon del repositorio no compila. Corrección propuesta en E-D10.
- El repositorio tiene remoto en GitHub; el prototipo contiene nombres de personas (E-D5).

### E2. Decisiones que necesito que apruebes (con recomendación)

| ID | Decisión | Recomendación | Alternativa |
| --- | --- | --- | --- |
| E-D1 | Cómo entra la matriz sin IA | Un **documento de demostración** (PDF de una página generado por el sistema que dice «Documento de demostración — no es un TDR real») con una extracción de proveedor **`demo`**, modelo `prototipo-cave-erp-v3`, cuyo JSON cumple el contrato `tdr-v1`, importada a `tdr_items` y **confirmada**. Recorre el mismo camino que recorrerá la IA y queda rotulada «Datos de demostración» en pantalla | Cambiar el esquema para permitir matrices sin documento: más invasivo y toca restricciones ya probadas |
| E-D2 | Qué se cambia en el proyecto 1 | Conservar el nombre «Prueba 1». Sustituir la ficha por la del prototipo: contratante nuevo **EP UNEMI** (el contratante «Raul» no se borra), proceso `LICS-EPUNEMI-2026-002`, objeto, monto 286.400 USD, sedes Guayaquil · Quito · Cuenca, plazo «10 al 23 de noviembre», fechas 2026-11-10 a 2026-11-23 (año tomado del rótulo «Noviembre 2026»), administradora del contrato y empresa ejecutora **Grupo CAVE** (primer registro de `companies`). Los valores actuales quedan anotados aquí para poder revertir | Renombrar también el proyecto a «Graduaciones UNEMI», o crear un proyecto nuevo y dejar «Prueba 1» intacto |
| E-D3 | Totales e indicadores | **Se calculan siempre a partir de las filas guardadas**; no se guardan cifras literales. Las pantallas mostrarán 10 ítems en 5 rubros, pagado $19.220, saldo $29.972 y 5 órdenes, que no coinciden con los rótulos del prototipo | Guardar los literales del prototipo: mostraría cifras que no cuadran con sus propias filas |
| E-D4 | Fotografías del prototipo (49) | **No se guardan**: no existen los archivos y no se fabrican imágenes. La columna «Fotos» cuenta las fotografías realmente subidas (empieza en 0) y «Verificado» se calcula con ellas | — |
| E-D5 | Dónde vive el archivo con los datos | El **script** de carga se versiona; el **archivo de datos** (nombres de personas y montos del prototipo) queda en una carpeta **ignorada por Git** hasta que decidas lo contrario | Versionarlo: reproducible en otro equipo, pero publica esos nombres en GitHub |
| E-D6 | Alcance de las pantallas | Planificación (Matriz, Cronograma, Actividades, Vista del cliente), Abastecimiento y Ejecución en **solo lectura** sobre la base; Requerimiento muestra la matriz confirmada con su responsable y las tarjetas de cotizaciones y comparativo. Lo único interactivo nuevo es la carga, vista y eliminación de fotos | Solo guardar los datos sin pantallas (no se podrían ver) o hacerlas editables (tarea bastante mayor) |
| E-D7 | Reglas de las fotografías | JPEG, PNG y WebP, validadas por contenido real (no solo extensión); máximo 15 MB por foto (`EVIDENCE_MAX_BYTES`) y varias por envío; almacenamiento privado con clave `evidencias/<proyecto>/<ítem>/<uuid>`; descripción opcional; detección de duplicados por SHA-256 dentro del ítem. **Sin dependencias nuevas**: no se generan miniaturas ni se eliminan metadatos EXIF (la ubicación GPS de la cámara queda dentro del archivo, que es privado) | Miniaturas y limpieza de EXIF: requieren una librería de imágenes y tu aprobación de instalación |
| E-D8 | Uso desde el celular | **No en esta tarea.** La aplicación solo escucha en `127.0.0.1` y no tiene autenticación; exponerla en la red exige antes usuarios y permisos (`AGENTS.md` §10). El campo de carga queda listo para abrir la cámara cuando eso exista | — |
| E-D9 | `AGENTS.md` | Actualizar §2, §6, §7 y §12: módulos Planificación, Abastecimiento y Ejecución visibles en modo lectura con datos de demostración; excepción expresa para cargar los datos del prototipo en el proyecto 1; fotografías de evidencia adelantadas de la Fase 7 (sin revisión ni publicación al cliente) | — |
| E-D10 | `.gitignore` | Cambiar `storage/` por `/storage/` para que solo se ignore la carpeta de archivos de la raíz y el código del adaptador quede rastreado | — |

### E3. Qué se guarda y qué no

| Sección | Se guarda (filas reales) | No se guarda |
| --- | --- | --- |
| Requerimiento | Ficha (E-D2); 10 ítems con rubro, producto, subproducto, descripción, cant., unidad, días y observación; 9 proveedores; 5 solicitudes de cotización (proveedor, rubro, fecha, estado) y 6 valores cotizados del rubro 1 con el elegido | «52 ítems en 6 rubros»; «12/14/4 ítems» por solicitud (solo existen 3, 3 y 1); versiones y adendas (solo la observación «Adenda 1» del ítem 2.2); el texto «Lectura del comparativo» (es un texto de IA simulado) |
| Planificación | Responsable por ítem (6 trabajadores nuevos; los 3 actuales no se tocan), proveedor adjudicado, costo y estado del contrato; 10 actividades (las 9 del cronograma más «Certificado estructural del techo») con fechas, responsable, ítems vinculados, hito, dependencia y estado | El número de «actividades» por ítem (se cuenta de las reales); el estado de 5 actividades que el prototipo no indica (quedan sin estado); la descripción por rubro de la vista del cliente (se arma con los productos) |
| Abastecimiento | 5 órdenes de compra, 9 líneas (ítem, monto pagado, responsable de pago) y 4 pagos (fecha, orden, concepto, forma, monto, respaldo). El estado de pago se calcula | Los conteos de «Documentos de la etapa» (18 facturas, 14 comprobantes…): no hay archivos |
| Ejecución | Estado de montaje de los 10 ítems; 6 controles del checklist previo (responsable, fecha y hora, resultado) | Las 49 fotografías (E-D4); la maqueta del teléfono (es una vista de los mismos datos) |

Interpretaciones mías que conviene que valides: «Depende de: Traslado / Montaje / Ceremonia» se enlaza con la actividad de nombre equivalente; las fechas sin año se toman como 2026; «Nómina interna» se registra como proveedor de tipo nómina; la moneda «$» es USD.

### E4. Cambios en la base de datos (migración `0007`, solo añade tablas)

| Tabla | Contenido |
| --- | --- |
| `suppliers` | Proveedores: nombre, tipo (`external`, `holding`, `payroll`), RUC opcional, activo |
| `item_plans` | Uno por ítem: proveedor adjudicado, costo `numeric(14,2)`, estado del contrato |
| `activities`, `activity_items` | Actividades del proyecto y sus ítems (varios por actividad) |
| `purchase_orders`, `purchase_order_lines`, `payments` | Órdenes por proyecto, una línea por ítem con lo pagado, y pagos por orden |
| `quote_requests`, `quote_lines` | Solicitudes de cotización y valores cotizados por ítem |
| `item_execution`, `pre_event_checks` | Estado de montaje por ítem y checklist previo |
| `item_evidences` | Fotografías: ítem, clave de almacenamiento, nombre original, tipo, tamaño, SHA-256, descripción |

UUID, `timestamptz`, `numeric`, claves foráneas `RESTRICT`, `CHECK` y triggers de metadatos como en las tablas actuales. No modifica ni borra nada existente; las migraciones `0001`–`0006` no se tocan. Se valida en un esquema temporal dentro de una transacción revertida, luego en `erp_test` y por último en `erp`.

### E5. Etapas

Me detengo al final de cada etapa para tu revisión.

| Etapa | Paso | Verificación |
| --- | --- | --- |
| **E. Esquema y datos** | 1. Corregir `.gitignore` (E-D10) y actualizar `AGENTS.md` (E-D9) | `git status` muestra los dos archivos del adaptador |
| | 2. Respaldo de `erp` con `pg_dump` en `dumps/` (ignorado por Git) | Archivo creado; se informa tamaño |
| | 3. Migración `0007` y repositorios nuevos en `packages/db` | `pnpm test:db`, `pnpm db:status` |
| | 4. Script `pnpm db:seed:demo`: una sola transacción, solo esquema de desarrollo, valida el JSON contra `tdr-v1`, no hace nada si ya se cargó; borra el PDF si la transacción falla | Prueba en `erp_test` revertida; conteos por tabla tras ejecutarlo en `erp` |
| **F. Pantallas** | 5. Pestañas Planificación, Abastecimiento y Ejecución; Requerimiento con la matriz confirmada, responsable, cotizaciones y comparativo; rótulo «Datos de demostración» | Revisión en el navegador integrado, modo claro/oscuro y vista estrecha |
| **G. Fotografías** | 6. `POST /api/items/[id]/evidencias`, `GET /api/evidencias/[id]`, eliminación con confirmación; galería y carga por ítem en Ejecución; «Fotos» y «Verificado» calculados | Pruebas: JPEG/PNG/WebP válidos, archivo que no es imagen, vacío, demasiado grande, duplicado, fallo de base con limpieza del archivo; prueba real en el navegador con una imagen generada para la prueba, que se elimina al terminar |
| Cierre | 7. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; actualizar `PLAN.md` y `MEMORY.md` | Todo en verde |

Sin dependencias nuevas, sin commits ni push sin tu autorización.

### E6. Riesgos

- **Los datos de demostración quedan protegidos:** una extracción confirmada y sus ítems no se pueden borrar (triggers de la subfase 1.1). Retirarlos después exige un script de limpieza con autorización aparte; por eso el paso 2 hace un respaldo.
- **Convivencia con el TDR real:** cuando proceses tu TDR en «Prueba 1» habrá dos documentos en el mismo proyecto; los módulos nuevos leen la extracción confirmada. Si prefieres mantenerlos separados, la alternativa de E-D2 (proyecto nuevo) lo evita.
- **Modelo financiero provisional:** órdenes, pagos y costos se modelan como los muestra el prototipo (lo pagado por línea y los pagos por orden son datos independientes). La Fase 6 deberá rediseñarlo (pagos parciales asignados a obligaciones, facturas, comprobantes).
- **Datos ilustrativos:** se rotulan en pantalla y en la base (`provider = 'demo'`); no deben usarse como referencia de precios.
- **Fotos sin miniaturas:** una galería con muchas fotos grandes cargará lento; aceptable en local.
- **Sin autenticación:** solo local, como hasta ahora.

### E7. Resultado

**2026-11-27 — Etapa E completada** (pasos 1–4). Pendiente: tu revisión y aprobación antes de la etapa F.

- **`.gitignore` y `AGENTS.md`:** `/storage/` solo ignora la carpeta de la raíz (el adaptador `apps/web/src/integrations/storage/` ya aparece para versionar); `/apps/web/scripts/local/` ignora el archivo de datos. `AGENTS.md` §2 («Vista previa con datos de demostración»), §6, §7 y §12 actualizados.
- **Respaldo:** `dumps/erp_antes_0007_2026-11-27.dump` (47 KB, esquema `erp` antes de la migración; ignorado por Git).
- **Migración `0007_planificacion_abastecimiento_ejecucion`:** 12 tablas (`suppliers`, `item_plans`, `activities`, `activity_items`, `purchase_orders`, `purchase_order_lines`, `payments`, `quote_requests`, `quote_lines`, `item_execution`, `pre_event_checks`, `item_evidences`) y 4 funciones. Validada en un esquema temporal dentro de una transacción revertida (up 0001–0007, 48 comprobaciones, down 0007–0001, sin objetos restantes); aplicada en `erp_test` y `erp`. `pnpm db:status`: 0 pendientes.
- **`packages/db`:** constantes de dominio de los `CHECK` nuevos; `src/demo/` (tipos del conjunto de datos y `seedDemo`, que corre en la transacción del llamador y no hace nada si el proyecto ya tiene la demostración); repositorios de lectura `matrix.ts` (matriz confirmada vigente, ítems con responsable/plan/orden/pago calculado/montaje, indicadores calculados en SQL) y `operations.ts` (proveedores, actividades, pagos, checklist previo, cotizaciones).
- **Script `pnpm db:seed:demo`** (`apps/web/scripts/seed-demo.ts`; `--dry-run` no escribe, `--project=<uuid>` elige otro proyecto): solo esquema de desarrollo; valida el JSON contra el contrato `tdr-v1` antes de escribir; genera el PDF de demostración (`src/lib/simple-pdf.ts`), lo guarda con el adaptador de almacenamiento y lo borra si la transacción falla. Los datos viven en `apps/web/scripts/local/demo-cave-v3.ts` (ignorado por Git).
- **Carga en `erp`, proyecto «Prueba 1»:** ensayada antes en una transacción revertida. Filas creadas: 1 empresa (Grupo CAVE), 1 contratante (EP UNEMI), 6 trabajadores, 9 proveedores, 1 documento, 1 extracción `demo` confirmada, 10 ítems con responsable, 10 planes, 5 órdenes con 9 líneas, 4 pagos, 10 actividades con 10 vínculos a ítems, 10 estados de montaje, 6 controles previos, 5 solicitudes de cotización con 6 valores. Una segunda ejecución no hace nada. El PDF existe en `storage/` y su tamaño y SHA-256 coinciden con la base. No se tocaron el contratante «Raul» ni «Trabajador 1–3».
- **Valores anteriores de «Prueba 1»** (para revertir la ficha): contratante «Raul», sede Guayaquil, fechas 2026-11-26 a 2026-11-27; proceso, objeto, monto, moneda, plazo, administrador, empresa y extracción de la ficha vacíos.
- **Indicadores calculados sobre los datos cargados:** 10 ítems en 5 rubros; 5 responsables; 6 proveedores (1 del holding); costo asignado $49.192; 5 órdenes por $47.572; pagado $19.220; saldo de órdenes $28.352 más $1.620 sin orden (nómina) = $29.972 por pagar; compras internas $7.800; 3 ítems pagados por completo; 6 montados; 0 fotografías. Los pagos registrados suman $18.540 (no se concilian con lo pagado por línea: así está en el prototipo).
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 59 pruebas de base (incluye 6 de las tablas nuevas y 8 de la carga con un conjunto sintético) y 79 de web (incluye 3 del PDF). En el navegador integrado, Requerimiento muestra el documento, la ficha y los 10 ítems rotulados «Datos de demostración», sin errores en consola.

Cambios respecto a lo propuesto:

- `purchase_order_lines` guarda también `amount` (lo comprometido en la orden), además de lo pagado y el responsable de pago.
- Dos reglas en la base, como defensa adicional: las tablas nuevas solo aceptan ítems de una matriz **confirmada**, y un ítem solo puede vincularse a una actividad, orden o solicitud de **su mismo proyecto**.
- El script vive en `apps/web` (necesita el contrato y el almacenamiento) y la lógica de carga en `packages/db`. Para poder usar el adaptador desde Node se cambió una importación de `local.ts` a `./types.ts`.
- Se adelantó de la etapa F un ajuste mínimo en Requerimiento: la demostración se rotula como tal y no como «Propuesta IA». La columna Responsable sigue mostrando «—» hasta la etapa F.
- Los repositorios de fotografías (`item_evidences`) se escriben en la etapa G; la tabla ya existe.

Incoherencias del prototipo guardadas tal cual: la OC-015 agrupa dos proveedores; el pago de la OC-018 (hospedaje) dice «Flete de pantallas»; el ítem 1.3 figura adjudicado a Montajes del Litoral en el comparativo y a Estructuras Andinas en planificación. De las dos variantes del nombre de una actividad se guardó «Prueba de sonido, luces y video».

Sin commits. El usuario aprobó la etapa E y pidió empezar la F (2026-11-27).

**2026-11-27 — Etapa F completada** (paso 5). Pendiente: tu revisión y aprobación antes de la etapa G. Sin cambios de base de datos ni dependencias nuevas.

- **Navegación:** pestañas Planificación, Abastecimiento y Ejecución en Operación. Las tres leen la matriz confirmada vigente del proyecto; sin proyecto o sin matriz confirmada muestran un estado vacío con el enlace a Requerimiento. Con la demostración aparece el aviso «Datos de demostración» en cada pantalla.
- **Planificación** (`/operacion/planificacion?vista=…`): Matriz (indicadores, responsable, proveedor, costo, número de actividades, contrato y total), Cronograma (barras por fecha, hitos y leyenda por estado), Actividades (ítems, responsable, fechas, dependencia y estado; «Sin registrar» donde el prototipo no lo indica) y Vista del cliente (rubros con sus productos, sin costos ni proveedores).
- **Abastecimiento:** indicadores, órdenes por entregable (orden, responsables de compra y de pago, costo, pagado, saldo y estado calculado) y pagos registrados con su total. Avisa cuando los pagos y lo pagado por ítem no coinciden ($18.540 frente a $19.220 en la demostración).
- **Ejecución:** indicadores, checklist de entregables (estado de pago, estado de montaje en pasos, fotos y verificado) y checklist previo al evento. Todos los ítems figuran «Falta foto» hasta la etapa G.
- **Requerimiento:** la matriz confirmada se lee de la base y muestra el responsable de cada ítem; la ficha añade «Empresa ejecutora»; tarjetas nuevas de solicitudes de cotización y comparativo por rubro (valor más bajo en verde, elegido y total adjudicado). Una propuesta sin confirmar de un documento más reciente sigue teniendo prioridad en la tarjeta de la matriz.
- **Código:** `src/server/matrix.ts`, `src/components/operacion/shared.tsx`, `src/components/requerimiento/QuotesCards.tsx`, `src/lib/labels.ts` (rótulos en español), `money.ts` (sumas exactas en centavos), `gantt.ts`, `compactCodes` en `numbering.ts`, `formatQuantity` y `formatDayMonth` en `format.ts`; `projects.ts` devuelve `companyName`.
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 59 de base y 88 de web (9 nuevas: importes, formato, códigos y cronograma). En el navegador integrado se revisaron las cuatro pantallas y las cuatro vistas de Planificación en modo claro, y Cronograma y Ejecución en modo oscuro a 375 px (sin desbordamiento horizontal de la página); todas las rutas responden 200; el código del navegador no contiene SQL ni datos de conexión. Cifras en pantalla iguales a las de la base (E7, etapa E).
- **No incluido, según el alcance:** nada se edita desde estas pantallas (ni responsable, ni costos, ni estados, ni pagos); no se muestran los botones del prototipo sin función («Generar contratos», «Registrar pago», «Modo campo»), la tarjeta «Documentos de la etapa» ni la maqueta del teléfono.

Sin commits de la etapa F. El usuario revisó la etapa F y pidió cambios (2026-11-27): que ya se pueda editar desde la pantalla (responsables, costos, estados y pagos) y seguir construyendo el producto final hasta la etapa G. Eso sustituye la decisión E-D6 («solo lectura») y se planifica en E8.

### E8. Etapa F2 — edición desde las pantallas (propuesta, pendiente de aprobación)

| Campo | Valor |
| --- | --- |
| Estado | **Aprobado por partes (usuario, 2026-11-27):** parar tras F2a, F2b y F2c, y después la etapa G. **F2 completa (F2a, F2b y F2c)** |
| Cambia el alcance vigente | Sí: `AGENTS.md` §2 dejaba la edición de planificación, abastecimiento y ejecución para fases posteriores. Se actualiza al aprobar |
| Sin cambios | La matriz confirmada (producto, cantidad, descripción…) sigue inmutable: editarla es la etapa D. Cotizaciones y comparativo siguen en lectura. Sin autenticación: solo local |

#### Qué se podrá editar

| Sub-etapa | Pantalla | Edición |
| --- | --- | --- |
| **F2a. Responsables y planificación** | Requerimiento y Planificación › Matriz | Responsable por ítem (lista de trabajadores activos; se guarda al elegir). Proveedor adjudicado (lista), costo asignado y estado del contrato por ítem |
| | Nueva pestaña mínima «Proveedores» | Alta, edición y desactivación de proveedores (nombre, tipo, RUC), como la de Trabajadores. Sin ella no se podría elegir un proveedor nuevo |
| **F2b. Estados** | Planificación › Actividades | Estado y responsable de cada actividad |
| | Ejecución | Estado de montaje por ítem y resultado de cada control del checklist previo |
| **F2c. Órdenes y pagos** | Abastecimiento | Crear una orden y asignarle ítems con su monto; cambiar el monto; quitar un ítem de una orden sin pagos. Registrar, corregir y eliminar pagos (fecha, orden, concepto, forma, monto, respaldo) |

No incluido en F2 (lo propongo después si lo quieres): crear o reprogramar actividades y controles previos, editar cotizaciones, y adjuntar facturas o comprobantes a un pago.

#### Decisiones que necesito

| ID | Decisión | Recomendación | Alternativa |
| --- | --- | --- | --- |
| F2-D1 | De dónde sale «lo pagado» de cada ítem | **De los pagos.** Cada pago se reparte entre los ítems de su orden (el sistema propone el reparto según el saldo de cada ítem y se puede ajustar); lo pagado, el saldo y el estado se calculan de ahí. Es el modelo de producto final: una sola fuente, sin contradicciones, y no permite repartir más que el monto del pago. Requiere la migración `0008` (tabla de reparto de pagos) y **recalcular la demostración**: sus cuatro pagos se reparten entre sus órdenes y el total pagado pasa de $19.220 a $18.540 | Mantener lo pagado por ítem como un dato que se escribe a mano, separado de los pagos: sin migración, pero conserva la contradicción que hoy avisa la pantalla |
| F2-D2 | Sobrepagos | Rechazar un pago o reparto que supere el saldo del ítem; mensaje claro en pantalla | Permitirlo y solo advertir |
| F2-D3 | Cómo se guarda | Cada cambio se guarda al momento con control de versión: si otra pestaña cambió el mismo dato, se avisa y no se pisa. Montos con dos decimales exactos, validados en el servidor | Botón «Guardar» por tabla |
| F2-D4 | Historial de cambios | No en F2 (no hay usuarios todavía a quienes atribuirlos); se añade con la autenticación (Fase 3) | Registrar ya fecha y valor anterior sin autor |
| F2-D5 | Ritmo | Detenerme al final de F2a, F2b y F2c para tu revisión, y después la etapa G | Hacer F2 completa y detenerme una sola vez antes de G |

**Respuestas del usuario (2026-11-27):** F2-D1 → lo pagado por ítem se escribe **a mano por ahora**; el cálculo automático desde los pagos (migración de reparto) queda para después. F2-D5 → parar en cada parte. Pestaña de Proveedores → sí. F2-D2, F2-D3 y F2-D4 según la recomendación; con lo pagado a mano, F2-D2 se aplica como «lo pagado de un ítem no puede superar el monto de su orden».

#### Resultado

**2026-11-27 — F2a completada.** Pendiente: tu revisión antes de F2b (estados). Sin migraciones ni dependencias nuevas.

- **Responsable por ítem:** lista desplegable en Requerimiento (matriz confirmada) y en Planificación › Matriz; se guarda al elegir, incluye «Sin asignar» y solo ofrece trabajadores activos (uno inactivo ya asignado se sigue viendo).
- **Planificación › Matriz:** proveedor (lista de activos), costo asignado (campo con formato es-EC; se guarda al salir o con Enter, Esc cancela) y contrato (No aplica, Pendiente, Firmado). Indicadores y total se recalculan al guardar.
- **Proveedores:** pestaña nueva con lista, alta, edición y activar/desactivar (nombre, tipo, RUC, notas). No se borran.
- **Control de cambios:** cada guardado comprueba que el dato no cambió desde que se leyó; si cambió, avisa y no lo pisa. Validación en el servidor (zod) y reglas de la base; mensajes en español junto al campo.
- **Código:** `packages/db` → `repositories/suppliers.ts`, `repositories/item-edits.ts`, `planVersion` en la matriz; `apps/web` → `server/actions/planning.ts` y `suppliers.ts`, esquemas nuevos en `server/schemas.ts`, `components/operacion/inline.tsx`, `components/forms/SupplierForm.tsx`, páginas `operacion/proveedores`.
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 67 de base (8 nuevas: asignar/cambiar/quitar responsable, conflicto, trabajador inactivo, plan por campo, versión antigua, proveedores) y 96 de web (8 nuevas de validación). En el navegador, sobre el ítem 1.3: costo 2.160 → 2.500,75 (total $49.532,75) → restaurado; costo «abc» rechazado con mensaje y sin guardar; responsable, proveedor y contrato cambiados y restaurados; en Requerimiento, responsable del 5.1 a «Sin asignar» (pie «1 sin responsable») y restaurado; proveedor con nombre repetido rechazado; alta y desactivación de un proveedor de prueba, borrado después por SQL. La base quedó con los mismos valores que antes de las pruebas.
- **Sin verificar:** el aviso de conflicto con dos pestañas abiertas a la vez (cubierto solo por las pruebas de base).

**2026-11-27 — F2b completada.** Pendiente: tu revisión antes de F2c (órdenes y pagos). Sin migraciones ni dependencias nuevas.

- **Planificación › Actividades:** estado (Sin registrar, Por iniciar, En curso, Terminada, Atrasada) y responsable de cada actividad, en listas que se guardan al cambiar. Las de equipo completo no admiten responsable individual. El cronograma toma su color del estado guardado.
- **Ejecución:** estado de montaje por ítem (de «Sin iniciar» a «Desmontado») y resultado de cada control del checklist previo (Pendiente, Cumple, No cumple). Los indicadores se recalculan al guardar.
- **Código:** `packages/db/src/repositories/status-edits.ts` (versión de actividades, controles y ejecución expuesta en las consultas); `apps/web/src/server/actions/status.ts`, esquemas nuevos y controles `ActivityCells`, `MountSelect` y `CheckResultSelect` en `components/operacion/inline.tsx`.
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 71 de base (4 nuevas) y 99 de web (3 nuevas). En el navegador: actividad «Montaje sede Quito» a Terminada y con otro responsable, y restaurada; ítem 2.3 a Montado (indicador de 6 a 7 de 10) y restaurado; control «Certificado estructural en sitio» a Cumple y restaurado. La base quedó como antes de las pruebas.
- **No incluido:** crear, reprogramar o eliminar actividades y controles (solo se editan los existentes).

**2026-11-27 — F2c completada: termina la etapa F2 (edición).** Pendiente: tu revisión antes de la etapa G (fotografías). Sin migraciones ni dependencias nuevas.

- **Órdenes (Abastecimiento › Órdenes por entregable):** alta de una orden con su código (único por proyecto); cada ítem elige su orden en una lista («Sin orden» lo quita). Al entrar en una orden el ítem toma como monto su costo asignado. Dentro de la orden se editan el costo, lo pagado y el responsable de pago; saldo y estado se calculan.
- **Reglas:** lo pagado no puede superar el costo (ni el costo bajar de lo pagado); un ítem con algo pagado no se puede quitar de su orden; la orden debe ser del mismo proyecto. Un valor rechazado muestra el motivo y el campo vuelve al valor guardado.
- **Pagos:** «Registrar pago» abre un formulario (orden, fecha, concepto, monto, forma y respaldo); cada pago se puede corregir o eliminar (con confirmación). Según tu decisión F2-D1, registrar un pago **no** modifica lo pagado de cada ítem; la pantalla lo avisa y muestra la diferencia entre ambos totales.
- **Código:** `packages/db/src/repositories/procurement-edits.ts` (`BusinessRuleError` para las reglas); `apps/web/src/server/actions/procurement.ts`, esquemas nuevos, `components/operacion/procurement.tsx` y páginas `operacion/abastecimiento/pagos`.
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 77 de base (6 nuevas) y 103 de web (4 nuevas). En el navegador, con una orden de prueba: código repetido rechazado; ítem 4.1 asignado a la orden (órdenes 5 → 6, ordenado $47.572 → $49.192); pagado 500 (estado Anticipo); sobrepago, costo menor que lo pagado y quitar con pago rechazados con su mensaje; pagado a 0 y quitado de la orden; pago de prueba registrado (formulario vacío rechazado campo por campo), corregido y eliminado. La orden de prueba se borró por SQL y los totales quedaron como antes (5 órdenes, $47.572 ordenado, $19.220 pagado, $29.972 por pagar, 4 pagos).
- **No incluido:** eliminar o renombrar órdenes (una orden vacía queda listada como «sin ítems»), fecha de emisión de la orden, facturas y comprobantes adjuntos, y el reparto automático de pagos entre ítems (migración posterior).
- **Observado:** durante las pruebas el responsable del ítem 4.1 figuraba como «Trabajador 2» (cambio hecho por el usuario desde la aplicación); no se tocó.

#### Verificación prevista

Pruebas de cada acción (valor válido, inválido, conflicto de versión, ítem de otro proyecto, sobrepago), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y prueba real en el navegador de cada edición. Antes de la migración `0008`: validación en esquema temporal revertido y respaldo de `erp`.

#### Riesgos

- Editar cambia los datos de demostración de «Prueba 1»; el respaldo previo permite volver al estado actual.
- Órdenes y pagos pasan de provisionales a un modelo real simplificado; la Fase 6 todavía debe añadir facturas, comprobantes y aprobaciones.
- Sin autenticación cualquiera con acceso al equipo puede editar: sigue siendo solo local.

### E9. Etapa G — fotografías por ítem en Ejecución

**2026-11-27 — Etapa G completada: termina la tarea.** Pendiente: tu revisión. Sin migraciones (la tabla `item_evidences` es de la `0007`) ni dependencias nuevas.

- **Dónde:** en Ejecución, la columna «Fotos» de cada ítem es un botón (número de fotos y «Subir» o «Ver») que abre la página del ítem: datos del entregable, carga y galería.
- **Carga:** una o varias fotografías a la vez, con una descripción opcional; se envían de una en una y cada archivo muestra su resultado. JPEG, PNG y WebP reconocidos por su contenido (no por la extensión ni por el tipo que declare el navegador); máximo 15 MB por foto (`EVIDENCE_MAX_BYTES`, documentada en `.env.example`); la misma foto no se repite en un ítem.
- **Almacenamiento:** archivo en `storage/evidencias/<proyecto>/<ítem>/<uuid>.<ext>` mediante el adaptador (ignorado por Git); en la base solo la referencia, nombre original saneado, tipo, tamaño, SHA-256 y descripción. Si el registro falla se borra el archivo; al eliminar se borran registro y archivo en una transacción.
- **Consulta:** `GET /api/evidencias/[id]` sirve la imagen sin caché, con `nosniff` y política de contenido restrictiva. `POST /api/items/[id]/evidencias` rechaza otro origen (403), ítem inexistente (404), archivo ausente o que no es imagen (400), demasiado grande (413), repetido o ítem de una matriz sin confirmar (409).
- **Indicadores:** «Con evidencia», «Fotos» y «Verificado» (montado y con al menos una foto) se calculan con las fotos reales.
- **Código:** `packages/db/src/repositories/evidences.ts`; `apps/web/src/lib/image.ts`, `server/services/evidence-upload.ts`, `server/actions/evidences.ts`, rutas `api/items/[id]/evidencias` y `api/evidencias/[id]`, `components/operacion/evidences.tsx`, página `operacion/ejecucion/[itemId]`.
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 79 de base (2 nuevas) y 113 de web (10 nuevas: firmas de imagen, nombre saneado, archivo vacío, demasiado grande, PDF con nombre de foto, duplicado, limpieza ante fallo de base). En el navegador, con dos imágenes generadas para la prueba en el ítem 2.3: las dos cargadas y visibles en la galería a 640 × 480; un PDF renombrado a `.jpg` y la foto repetida, rechazados con su mensaje; Ejecución pasó a «1 de 10 con evidencia, 2 fotografías»; cabeceras de la imagen correctas; 403 sin origen y con otro origen. Las dos fotos se eliminaron desde la pantalla: 0 filas en `item_evidences` y ningún archivo en `storage/evidencias`.
- **Cómo se verificó:** el servidor de desarrollo abierto por el usuario (puerto 3000) no recargó `server/storage.ts` y devolvía error 500 en la página nueva; la prueba se hizo con la compilación de producción en un servidor aparte (entrada `web-verificacion`, puerto 3100, añadida a `.claude/launch.json`). **Hay que reiniciar el servidor de desarrollo** para ver la página de fotografías en el puerto 3000.
- **Sin verificar:** tomar la foto con la cámara de un celular (la aplicación solo escucha en el equipo local) y fotos reales de varios megabytes.
- **No incluido:** miniaturas, limpieza de metadatos EXIF, HEIC, editar la descripción después de cargar, revisión y publicación al cliente (Fase 7).

**2026-11-27 — Ajuste pedido por el usuario: guardar las fotografías con un botón.** Elegir archivos ya no los envía: quedan en una lista «sin guardar» con vista previa y opción de quitar cada uno; solo se guardan al pulsar «Guardar N fotografías» («Descartar selección» los suelta). Las rechazadas por el servidor se quedan en la lista con su motivo; el navegador avisa al cerrar la pestaña con fotos sin guardar. Cambio solo en `components/operacion/evidences.tsx`. Verificado: lint, tipos, 79 + 113 pruebas y build; en el navegador (puerto 3000), tras elegir tres archivos el servidor seguía con 0 fotografías; se quitó una, se pulsó «Guardar» y quedó 1 guardada y el PDF renombrado rechazado en la lista; la foto de prueba se eliminó después.

**Consulta del usuario sobre sus fotos (2026-11-27):** la base no lleva historial de cargas ni de eliminaciones; `item_evidences` estaba vacía y sin archivos. Los contadores de actividad de PostgreSQL para esa tabla marcaban 6 inserciones y 6 borrados desde su creación; 2 y 2 eran de la prueba de la etapa G, así que al usuario le corresponden 4 cargas y 4 eliminaciones (dato aproximado: los contadores no guardan fechas ni qué fotos eran).

El usuario confirmó F, F2 y G en `4b71ac5`; el ajuste del botón «Guardar» está sin confirmar. Con esto queda cerrada la tarea «datos de demostración y fotografías». Siguientes pasos posibles, cada uno con su propio plan: migración para calcular lo pagado por ítem desde los pagos; etapa D (matriz editable) y adaptador de IA cuando haya clave; crear y reprogramar actividades.

---

## Tarea en pausa: Fase 1 · Operación › Requerimiento

| Campo | Valor |
| --- | --- |
| Estado | **Aprobado por el usuario (2026-11-26) — en progreso.** Etapas A y B completadas; la carga se verificó con el TDR real del usuario. Sigue pendiente R-D6 (proveedor de IA) y la instalación de su SDK (R5), necesarias en la etapa C |
| Fecha | 2026-11-26 |
| Fase | Fase 1 completa, organizada en cuatro etapas con revisión entre cada una |
| Referencia visual | Prototipo `CAVE-ERP-v3.html` entregado por el usuario (fuera del repositorio). Se copia su diseño, no sus datos |
| Fuera de alcance | Resto de módulos del prototipo, selector e interfaz de empresas, cotizaciones, comparativo, versiones/adendas, exportar a Excel, precios, tareas y seguimiento de responsables, autenticación, despliegue |

### R1. Objetivo

En el módulo **Operación › Requerimiento**, con el aspecto del prototipo, poder: elegir o crear un proyecto, **subir el PDF del TDR**, pulsar «Procesar TDR con IA» y obtener del documento **la ficha del proyecto y la matriz de entregables completa**; revisar y corregir todo, **asignar un responsable por ítem** con una lista desplegable de trabajadores, y confirmar el resultado en PostgreSQL.

### R2. Decisiones ya tomadas por el usuario (2026-11-26)

| Tema | Decisión |
| --- | --- |
| Responsable | **Un solo responsable por ítem**, elegido de una **lista desplegable** con los nombres de los trabajadores |
| Niveles de la matriz | **Tres niveles**: rubro › producto › subproducto, con numeración 1.1, 1.2… por rubro |
| Proyecto y empresa | Se usa «Proyecto» y «Empresa». La empresa **no se implementa todavía en la interfaz**; la migración la deja preparada |
| Ficha del proyecto | La IA la extrae del PDF, **incluido el monto** (transcrito del TDR, no estimado) |

`AGENTS.md` ya refleja estas decisiones (§1 terminología, §2 alcance, §6 guía visual, §7 modelo, §8 contrato, §12 hoja de ruta).

### R3. Pantallas

```
┌────────────┬───────────────────────────────────────────────────────────────────────┐
│ ■ CAVE ERP │ Proyecto: [Proyecto seleccionado ▾]                          ☀  ☾      │
│            ├───────────────────────────────────────────────────────────────────────┤
│ GESTIÓN    │ PROYECTOS   REQUERIMIENTO   TRABAJADORES                              │
│▌OPERACIÓN  ├───────────────────────────────────────────────────────────────────────┤
│            │ REQUERIMIENTO                         [ + Ítem ] [ CARGAR TDR ]       │
│            │ Aquí entra el TDR y queda convertido en la matriz de entregables.     │
│            │ ┌ DOCUMENTO TDR ───────────────────────────────────────────────────┐  │
│            │ │ tdr.pdf · 2,4 MB · 48 págs.   [PROCESADO]   [ Procesar con IA ]  │  │
│            │ └──────────────────────────────────────────────────────────────────┘  │
│            │ ┌ FICHA DEL PROYECTO ───────────────── ◆ Propuesta IA [Aplicar] ───┐  │
│            │ │ CONTRATANTE │ PROCESO │ OBJETO │ MONTO │ SEDES │ PLAZO │ ADMIN.  │  │
│            │ └──────────────────────────────────────────────────────────────────┘  │
│            │ ┌ MATRIZ DE ENTREGABLES ───────────────────────────────────────────┐  │
│            │ │ ÍTEM│PRODUCTO  │SUBPROD.│DESCRIPCIÓN│CANT│UNID│DÍAS│OBS.│RESPONS.│  │
│            │ │ 1 · ESCENARIO Y ESTRUCTURAS (rubro, editable)                    │  │
│            │ │ 1.1 │[       ] │[     ] │[        ] │[ ] │[  ]│[ ] │[  ]│[ ▾ ]  ✕│  │
│            │ │ 2 · AUDIO, LUCES Y VIDEO                                         │  │
│            │ │ 2.1 │ …                                                          │  │
│            │ │ 52 ítems en 6 rubros · 3 sin responsable · cambios sin guardar: 2│  │
│            │ │                         [ Descartar ] [ Guardar ] [ CONFIRMAR ]  │  │
│            │ └──────────────────────────────────────────────────────────────────┘  │
└────────────┴───────────────────────────────────────────────────────────────────────┘
```

- **Estructura y estilo** según `AGENTS.md` §6 «Guía visual»: barra lateral oscura, barra superior con selector de proyecto, pestañas en mayúsculas, tarjetas, etiquetas de estado de color, modo claro/oscuro.
- **Proyectos:** lista y alta/edición mínima (nombre, contratante, fechas, sedes). El contratante puede crearse desde el mismo formulario.
- **Requerimiento:** sin TDR muestra un estado vacío con la zona de carga; con TDR muestra el documento y su estado (Pendiente, Procesando, Procesado, Error, Confirmado, Reemplazado), la ficha y la matriz.
- **Ficha del proyecto:** cuadrícula etiqueta/valor como en el prototipo, editable. Los valores que propone la IA se muestran en violeta con «Propuesta IA» y se aplican al proyecto solo al pulsar «Aplicar» (campo por campo o todos). El contratante extraído se vincula a uno existente (por RUC o nombre) o se crea tras confirmarlo.
- **Matriz de entregables:** agrupada por rubro; columna Ítem con 1.1, 1.2… calculada; Producto con el rubro debajo en texto secundario (como el prototipo) en modo lectura y campos editables en modo edición; **Responsable** como lista desplegable de trabajadores activos (un trabajador desactivado sigue visible si ya estaba asignado). Agregar, eliminar, mover entre rubros y renumerar. Validación: cant. y días numéricos ≥ 0 o vacío (= desconocido); producto y descripción obligatorios; aviso de cambios sin guardar. Tras confirmar, la matriz queda bloqueada pero **el responsable se puede seguir cambiando**.
- **Trabajadores:** lista, alta, edición y desactivación (nombre completo obligatorio; cargo, teléfono y correo opcionales). No se borran trabajadores con asignaciones.
- No se muestran los demás módulos ni las tarjetas de cotizaciones/comparativo/adendas del prototipo. No se cargan como datos los nombres ni montos del prototipo.

### R4. Decisiones pendientes de aprobación (con recomendación)

Se mantienen las decisiones V-D1 (Next.js 16 + React 19), V-D2 (backend en el servidor de Next.js para operaciones cortas), V-D3 (Tailwind 4 + componentes propios), V-D4 (capas), V-D5 (zod), V-D6 (TanStack Table), V-D8 (sin autenticación, solo `127.0.0.1`) y V-D9 (lint, typecheck, vitest, build) del plan 1.0b, ya aprobado. Cambian o se añaden:

| ID | Decisión | Recomendación | Alternativas y motivo |
| --- | --- | --- | --- |
| R-D1 | Tipografía (sustituye V-D10) | **Inter con `next/font/google`**: Next.js descarga la fuente al compilar y la sirve desde la propia aplicación; el navegador no contacta a Google. No requiere instalar paquetes | Fuentes del sistema (V-D10): sin descarga, pero se pierde el aspecto del prototipo. El build necesitará internet la primera vez |
| R-D2 | Migración `0006` | **Una migración nueva** (no se editan las aplicadas): renombrar `events` → `projects` y `tdr_documents.event_id` → `project_id` (con sus restricciones, índices y triggers); añadir a `projects` las columnas de la ficha; crear `companies`, `workers` y `tdr_item_assignments`; añadir `tdr_items.rubro` y permitir `subproducto` nulo. Detalle en R4.1 | Mantener `events` y solo añadir columnas: menos cambios, pero el código y la base hablarían de «eventos» y la interfaz de «proyectos». Renombrar ahora es seguro: las tablas están vacías y `ALTER … RENAME` no borra datos |
| R-D3 | Dónde vive la ficha | **Columnas de `projects`**, editables en cualquier momento con control de versión; la propuesta de la IA queda en `raw_response.ficha` (inmutable) y `projects.ficha_extraction_id` registra de qué extracción se aplicó | Tabla aparte de borradores de ficha: más trazabilidad, más complejidad sin necesidad actual |
| R-D4 | Responsable | Tabla **`tdr_item_assignments`** (un registro por ítem, clave = ítem) con `worker_id` → `workers` (`RESTRICT`) | Columna en `tdr_items`: imposible, porque los ítems confirmados son inmutables y el responsable debe poder cambiar. Al reprocesar, el nuevo intento empieza sin responsables (copiar responsables queda como mejora) |
| R-D5 | Gestión de trabajadores | **Pestaña mínima «Trabajadores»** en Operación | Solo alta desde la lista desplegable: más rápido, pero sin forma de editar ni desactivar |
| R-D6 | Primer adaptador de IA | **A elegir por ti**: Anthropic (`@anthropic-ai/sdk`; `.env.example` ya tiene líneas `CLAUDE_*`), OpenAI (`openai`) o Google (`@google/genai`). Antes de integrarlo verificaré en la documentación vigente la entrada PDF nativa, la salida estructurada y los límites de tamaño | La interfaz común permite añadir los demás después sin tocar dominio ni persistencia (`AGENTS.md` §8). Requiere tu clave en `.env` (la escribes tú) y tu autorización para enviar TDR reales; si no, solo PDF sintéticos |
| R-D7 | Ejecución del procesamiento | **En el proceso del servidor local**: «Procesar» crea la extracción `pending` con clave de idempotencia, la procesa en segundo plano dentro del servidor y la pantalla consulta el estado cada pocos segundos. Tiempo máximo configurable; un intento que quede en `processing` tras reiniciar el servidor se marca como error al detectarlo | Trabajador separado o cola persistente: más robusto, innecesario en local. Antes de desplegar en Netlify se reevalúa (V-D2) |
| R-D8 | Carga del PDF | **Route Handler** `POST` con `multipart/form-data`; límite 50 MB (`TDR_MAX_BYTES`); valida extensión, tipo y firma `%PDF-`; SHA-256 para detectar duplicados; almacenamiento local en `STORAGE_LOCAL_DIR` (por defecto `storage/`, ya excluido de Git) con clave `tdr/<proyecto>/<uuid>.pdf`; si falla la base se borra el archivo | Server Action: su límite de tamaño por defecto es bajo y el progreso de carga es peor. Sin librería para contar páginas (`page_count` queda nulo) |
| R-D9 | Selector superior | Solo **«Proyecto»**; el de «Empresa» aparece cuando se implemente `companies` | — |

#### R4.1. Contenido propuesto de la migración `0006_proyectos_trabajadores.sql`

- `events` → `projects`; `tdr_documents.event_id` → `project_id`; renombrar restricciones, índices y triggers con el nuevo prefijo.
- `projects`: `company_id uuid NULL` → `companies` (`RESTRICT`; nulo hasta que exista la interfaz de empresas), `process_code`, `purpose` (objeto), `contract_amount numeric(14,2) CHECK >= 0`, `currency char(3)` (ISO 4217, `CHECK` de formato), `amount_includes_vat boolean`, `venues text[]` (sedes), `term_text` (plazo literal), `contract_administrator`, `ficha_extraction_id uuid NULL` → `tdr_extractions`. Se conservan `location`, `start_date`, `end_date` y `notes`.
- `companies`: `name` (no vacío), `legal_name`, `tax_id` (único si no es nulo), `active`, `created_at`, `updated_at`, `version`.
- `workers`: `full_name` (no vacío), `job_title`, `phone`, `email`, `active`, `notes`, metadatos de fila.
- `tdr_item_assignments`: `tdr_item_id` (PK, → `tdr_items` `RESTRICT`), `worker_id` (→ `workers` `RESTRICT`, índice), metadatos de fila.
- `tdr_items`: `rubro text NOT NULL` (no vacío); `subproducto` admite `NULL` (no vacío si se informa).
- La sección *down* existe pero contiene `DROP`/renombres inversos: no se ejecuta sin tu autorización expresa.
- Se valida primero en un esquema temporal dentro de una transacción revertida (como en 1.1), después en `erp_test` y por último en `erp`.

### R5. Instalaciones (requieren tu aprobación antes de ejecutarse)

| Paquete | Tipo | Para qué | Cuándo |
| --- | --- | --- | --- |
| SDK oficial del proveedor elegido en R-D6 (uno solo) | producción (`apps/web` o paquete de integración) | Adaptador de IA | Etapa C |

Nada más: `next/font` viene con Next.js; la carga de archivos, el hash y la firma PDF usan Node. Si durante la implementación apareciera otra necesidad, te la consultaré antes.

### R6. Etapas y pasos

Al terminar cada etapa me detengo para tu revisión en el navegador integrado antes de seguir.

| Etapa | # | Paso | Verificación |
| --- | --- | --- | --- |
| — | 0 | Aprobar este plan (R4) | Tu aprobación explícita |
| **A. Base visual y datos** | 1 | Escribir `0006`, validarla en esquema temporal, aplicarla en `erp_test` y `erp`; actualizar `domain.ts` y las 27 pruebas existentes (`events` → `projects`, `rubro`) y añadir pruebas de las tablas nuevas | `pnpm test:db`, `pnpm db:status` |
| | 2 | Configuración de `apps/web`: `next.config.ts` (carga del `.env` raíz, `transpilePackages: ['@erp/db']`, servidor en `127.0.0.1`), `tsconfig`, PostCSS, ESLint, `globals.css` con los tokens del prototipo | `pnpm --filter web build` |
| | 3 | Repositorios SQL parametrizados en `packages/db/src/repositories` (contratantes, proyectos, trabajadores, documentos, extracciones, ítems, asignaciones) | Pruebas en `erp_test` |
| | 4 | Servicios y esquemas zod en `apps/web/src/server`; Server Actions | Pruebas unitarias |
| | 5 | Diseño base: barra lateral, barra superior con selector de proyecto, pestañas, modo oscuro, componentes (botón, campo, tarjeta, etiqueta, tabla, diálogo) | Revisión visual |
| | 6 | Pestañas Proyectos y Trabajadores; Requerimiento con estado vacío y ficha editable | **Revisión contigo** |
| **B. Carga de PDF (1.2)** | 7 | Interfaz de almacenamiento + adaptador local; Route Handler de carga; listado y estado del documento | Pruebas: PDF válido, no PDF, vacío, demasiado grande, duplicado, fallo de base con limpieza del archivo |
| **C. Extracción IA (1.3)** | 8 | Instalar el SDK aprobado; interfaz común de IA, adaptador, prompt versionado `v1`, esquema JSON de ficha + ítems, validación zod, estados, idempotencia, tiempo máximo, reintentos acotados, errores en español | Pruebas con mock: respuesta válida, JSON inválido, incompleta, rechazada, vacía, timeout, doble clic |
| | 9 | Una prueba real **solo con un PDF sintético** (o real, si autorizas al proveedor) | Tu autorización previa; informe de tokens y duración |
| **D. Matriz editable (1.4)** | 10 | Importar `raw_response.items` a `tdr_items`; tabla agrupada por rubro con edición, alta, baja, renumeración y responsable; guardar; confirmar en una transacción; ficha con «Aplicar propuesta» | Pruebas de servicio y flujo completo en el navegador |
| Cierre | 11 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; revisión del código cliente (sin credenciales ni SQL) | Todo en verde |
| | 12 | Actualizar `PLAN.md` y `MEMORY.md` | Sin secretos |

No se realizarán commits, push ni despliegues sin tu autorización.

#### Archivos afectados (previstos)

- `packages/db/migrations/0006_proyectos_trabajadores.sql`, `packages/db/src/domain.ts`, `packages/db/src/repositories/*`, `packages/db/tests/*`
- `apps/web/` (configuración, `src/app`, `src/components`, `src/server`, `src/integrations/ai`, `src/integrations/storage`, `src/prompts`)
- `.env.example` (variables `AI_PROVIDER`, `AI_MODEL`, clave del proveedor elegido, `STORAGE_LOCAL_DIR`, `TDR_MAX_BYTES`), `PLAN.md`, `MEMORY.md`

### R7. Criterios de aceptación

1. `pnpm dev` levanta la aplicación en `http://127.0.0.1:3000` con el aspecto del prototipo (barra lateral, barra superior, pestañas, tarjetas, modo claro/oscuro) y solo los módulos implementados.
2. Se pueden crear y editar proyectos, contratantes y trabajadores; los datos se guardan en el esquema `erp`.
3. En Requerimiento se sube un PDF; se rechazan de forma controlada los archivos no PDF, vacíos, duplicados o mayores que el límite.
4. «Procesar TDR con IA» genera la ficha (contratante, código de proceso, objeto, monto, moneda, sedes, plazo, administrador del contrato) y la matriz con rubro, producto, subproducto, descripción, cant., unidad, días y observación; los errores de la IA se muestran en español y no crean resultados confirmados.
5. La matriz se edita, agrupa por rubro y numera 1.1, 1.2…; cada ítem admite un responsable de la lista desplegable; se guarda y se confirma; el responsable puede cambiarse después de confirmar.
6. El JSON original de la IA queda intacto y separado de las ediciones; reprocesar no modifica lo confirmado.
7. Ninguna credencial, clave de IA ni consulta SQL llega al navegador.
8. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` sin errores.

### R8. Riesgos

- **Alcance amplio** (cuatro subfases en una tarea): mitigado con etapas y revisión tuya entre ellas.
- **Renombrar tablas** rompe referencias en pruebas y código de `packages/db`; se actualizan en el mismo paso y se verifica con las pruebas. Si en algún momento hay datos en `erp`, renombrar sigue sin borrarlos, pero conviene un respaldo previo.
- **Coste y privacidad de la IA:** las llamadas reales tienen coste y envían el TDR al proveedor; sin tu autorización solo se usarán PDF sintéticos.
- **PDF extensos:** pueden superar límites de tamaño o de salida del modelo; se informan como error controlado. Dividir documentos requiere una aprobación aparte (`AGENTS.md` §8).
- **Procesamiento en el proceso del servidor:** un reinicio interrumpe el trabajo; se detecta y se marca como error. No es apto para producción sin reevaluar.
- **Fuente Inter:** el primer build necesita internet; si falla, se usa la fuente del sistema como respaldo.
- **Numeración derivada:** el número 1.1 cambia al reordenar o mover ítems entre rubros; es de presentación y no se usa como referencia estable.
- **Datos del prototipo:** contiene nombres de personas, proyectos y montos; no se copian a la aplicación ni al repositorio.
- **Prototipo sin autenticación:** solo local y con datos autorizados.

### R9. Resultado

**2026-11-26 — Etapa A completada** (pasos 1–6). Pendiente: tu revisión visual antes de empezar la etapa B.

- **Migración `0006_proyectos_trabajadores`:** validada primero en un esquema temporal dentro de una transacción revertida (up de 0001–0006, 14 comprobaciones, down de 0006–0001, sin objetos restantes); después aplicada en `erp_test` y `erp`. `pnpm db:status`: 0 pendientes. Ambos esquemas estaban vacíos.
- **`packages/db`:** repositorios con SQL parametrizado (`clients`, `projects`, `workers`, `documents`) y concurrencia optimista (`VersionConflictError`). Los repositorios de extracciones, ítems y asignaciones se escriben en las etapas C y D, cuando se usen.
- **`apps/web`:** configuración (Next.js 16 con Turbopack, `@erp/db` del workspace, `.env` raíz cargado solo en el servidor, servidor en `127.0.0.1:3000`), tokens del prototipo en Tailwind 4, modo claro/oscuro, Inter con `next/font`. Pantallas: Proyectos (lista, alta con contratante nuevo o existente, edición), Requerimiento (documento TDR y matriz con sus controles deshabilitados y rotulados por etapa; ficha del proyecto editable) y Trabajadores (lista, alta, edición, activar/desactivar).
- **Verificación:** `pnpm lint`, `pnpm typecheck` y `pnpm build` sin errores; `pnpm test`: 39 pruebas de base (`erp_test`) + 24 de validación y formato. En el navegador integrado: errores de validación en español conservando lo escrito, alta de proyecto con contratante nuevo, ficha con monto «286.400,50» guardado como `286400.50`, alta y desactivación de trabajador, modo oscuro y vista móvil; sin errores en consola ni en el servidor. El código del navegador no contiene SQL ni datos de conexión.
- Los tres registros sintéticos («PRUEBA …») creados para la prueba en `erp` se borraron al terminar; `erp` queda vacío.
- Cambios menores respecto al plan: no se modificó `.env.example` (las variables nuevas llegan en las etapas B y C); se añadió `.claude/launch.json` para levantar el servidor desde la app.

**2026-11-26 — Etapa B completada** (paso 7, subfase 1.2). El usuario aprobó continuar y pidió **no inventar datos**: usará un TDR real como prueba. No se crearon proyectos ni se subieron PDF de prueba a `erp`.

- **Carga:** `POST /api/proyectos/[id]/tdr` (multipart, campo `archivo`). Rechaza otro origen (403), proyecto inexistente (404), cuerpo mayor que el límite (413), archivo vacío, sin extensión `.pdf`, con tipo declarado distinto de PDF o sin la firma `%PDF-` en el primer kilobyte (400) y el mismo PDF ya cargado en el proyecto (409, por SHA-256 y por la restricción única de la base).
- **Almacenamiento:** interfaz `FileStorage` y adaptador local (`apps/web/src/integrations/storage`). Clave opaca `tdr/<proyecto>/<uuid>.pdf`, nunca la ruta ni el nombre original; no sobrescribe; doble defensa contra *path traversal*. Carpeta por omisión `storage/` en la raíz (ya en `.gitignore`); configurable con `STORAGE_LOCAL_DIR` y `TDR_MAX_BYTES` (documentadas en `.env.example`). Si falla el registro en la base, el archivo se borra.
- **Consulta y eliminación:** `GET /api/tdr/[id]` muestra el PDF original (sin caché, `nosniff`). «Eliminar» solo existe para documentos sin intentos de extracción, pide confirmación y borra registro y archivo en una transacción.
- **Pantalla Requerimiento:** el botón «Cargar TDR» y la zona de arrastrar y soltar están activos, con progreso, cancelación y mensajes en español; la lista muestra nombre, tamaño, fecha, estado, «Ver PDF» y «Eliminar». «Procesar TDR con IA» y «+ Ítem» siguen deshabilitados (etapas C y D). `page_count` queda nulo (sin librería de PDF, según R-D8).
- **Verificación:** lint, tipos y build sin errores; `pnpm test`: 41 pruebas de base y 42 de web (validación del PDF con bytes mínimos que no representan ningún TDR, almacenamiento en carpeta temporal, limpieza ante fallo, duplicados). Comprobado con peticiones HTTP que no escriben datos: 403 sin origen o con otro origen, 404 para proyecto o documento inexistente e id no válido. **Verificado con el TDR real del usuario (2026-11-26):** un PDF de ~2 MB cargado en su proyecto; el archivo existe en `storage/` (ignorado por Git), tamaño y SHA-256 coinciden con `tdr_documents`, cabecera PDF válida, `GET /api/tdr/[id]` responde 200 `application/pdf`. Según los registros del servidor, el usuario también lo eliminó y lo volvió a cargar: sin archivos huérfanos (1 registro, 1 archivo). Contenido del documento no leído ni registrado.

**2026-11-26 — Ajuste solicitado por el usuario: campo «Valor del proyecto».** El usuario pidió un campo para el valor del proyecto, sin decidir aún si se ingresa al crear el proyecto o al subir el TDR, y que sea fácil de mover. Usa el dato existente `projects.contract_amount` / `currency` / `amount_includes_vat` (el mismo «monto» de la ficha y del contrato de la IA); sin cambios de base de datos.

- Componentes: `ProjectValueFields` (solo los campos, para incluir en cualquier formulario) y `ProjectValueForm` (formulario autónomo con «Guardar valor»), en `apps/web/src/components/forms/`. Validación única `projectValueFields` / `projectValueSchema` en `server/schemas.ts`; acción `saveProjectValue`; conversión `lib/project-value.ts`.
- Ubicaciones: alta y edición del proyecto (dentro del formulario), Requerimiento en la tarjeta «Documento TDR» bajo la zona de carga (formulario autónomo) y edición de la ficha. En la ficha el rótulo pasa a «Valor del proyecto». Moverlo = mover una línea de JSX.
- Verificación: 45 pruebas web (incluye validación compartida y conversión), 41 de base, lint, tipos y build en verde; revisión visual de ambas pantallas. **No se guardó ningún valor desde el navegador** para no modificar el proyecto real del usuario; el guardado se cubre con las pruebas del esquema y del repositorio (`updateProject`).
- Observado: el TDR real se eliminó desde la pantalla tras la verificación anterior (acción del usuario según el registro del servidor); base y `storage/` quedaron coherentes (0 y 0).

#### R10. Etapa C sin proveedor elegido (decisión del usuario, 2026-11-26)

El usuario todavía no elige proveedor. Pidió dejar todo listo para solo poner la clave y el modelo, y una primera versión del prompt para ir ajustándola, con la respuesta estructurada según el contrato de `AGENTS.md` §8. Respuestas a las preguntas:

- **SDK:** no se instala ninguno por ahora. Al elegir proveedor hay que instalar su SDK oficial (con aprobación) y escribir su adaptador; queda anotado en `MEMORY.md`.
- **Proveedor y modelo:** solo en `.env` (`AI_PROVIDER`, `AI_MODEL` y la clave del proveedor). Cada intento registra proveedor y modelo.

Alcance de esta parte (sin dependencias nuevas ni cambios de base de datos):

1. Contrato de salida `tdr-v1`: esquema zod (validación en el backend) y JSON Schema para la salida estructurada de los proveedores.
2. Prompt de extracción `tdr-extraccion-v1`, versionado en su propio archivo.
3. Interfaz común de IA (petición, resultado normalizado, errores clasificados, capacidades) y registro de adaptadores, vacío hasta instalar un SDK.
4. Configuración desde `.env` con un estado legible en pantalla (qué falta: proveedor, modelo, clave o adaptador), sin mostrar la clave.
5. Servicio de extracción: intento `pending` con clave de idempotencia, procesamiento en el servidor local, tiempo máximo, reintentos acotados solo para fallos transitorios, validación, `processed` o `failed` con mensaje seguro; intentos interrumpidos se marcan como error. Si la respuesta no cumple el contrato se conserva tal cual en el intento fallido para ajustar el prompt.
6. Pantalla: «Procesar TDR con IA» se activa solo si la configuración está completa; estado del intento con actualización automática; resumen y JSON del resultado para revisar el prompt. La matriz editable sigue en la etapa D.
7. Pruebas con un adaptador simulado (sin llamadas reales ni coste).

**2026-11-26 — Etapa C preparada sin proveedor** (alcance R10). Sin dependencias nuevas ni cambios de base de datos.

- Contrato `tdr-v1` (`apps/web/src/domain/tdr-extraction/contract.ts`): zod estricto (campos exactos, cantidades y días ≥ 0, fechas válidas y en orden, moneda ISO, ítems sin repetir, máx. 2000 filas) y JSON Schema equivalente; una prueba comprueba que ambos declaran los mismos campos.
- Prompt `tdr-extraccion-v1` (`apps/web/src/prompts/tdr-extraccion/v1.ts`), común a los proveedores, con las reglas de `AGENTS.md` §8 y protección ante instrucciones dentro del PDF. Para ajustarlo: copiar a `v2.ts` y apuntar `CURRENT_PROMPT`.
- Interfaz común (`integrations/ai/types.ts`), configuración desde `.env` con estado público sin clave (`config.ts`) y registro de adaptadores vacío (`registry.ts`).
- Repositorio de intentos (`packages/db/src/repositories/extractions.ts`): creación idempotente, `pending → processing → processed/failed`, intentos interrumpidos.
- Servicio (`server/services/tdr-extraction.ts`) y orquestador (`server/extraction-runner.ts`): tiempo máximo total, reintentos con espera solo para errores transitorios, validación, mensajes seguros en español; la respuesta que no cumple el contrato (o que no es JSON) se guarda en el intento fallido para revisar el prompt. Registros solo con metadatos.
- Pantalla: «Procesar TDR con IA» (clave de operación por clic) deshabilitado con la lista de lo que falta en `.env`; panel del último intento con estado, proveedor/modelo/prompt, duración, tokens, error, ficha propuesta en violeta y JSON original; matriz con la propuesta en solo lectura numerada 1.1, 1.2…; actualización automática mientras procesa.
- `.env.example`: `AI_PROVIDER`, `AI_MODEL`, claves por proveedor, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_CONCURRENCY` (sustituyen las líneas `CLAUDE_*`/`OPENAI_MODEL`).
- Verificación: 45 pruebas de base y 76 de web (incluye 14 del servicio con adaptador simulado: éxito, reintentos, errores sin reintento, timeout, respuesta fuera de contrato, texto no JSON, modelo sin capacidades, PDF ilegible); lint, tipos y build sin errores; el código del navegador no contiene claves ni el prompt. En pantalla se comprobó el estado «IA no configurada». **Sin verificar:** paneles de intento procesado o fallido con datos reales (no hay adaptador ni se crearon datos de prueba en `erp`).

### Antecedente: instalación del plan 1.0b (2026-11-26)

El usuario aprobó los 14 paquetes del plan 1.0b y pidió solo instalarlos. Se creó únicamente `apps/web/package.json`. Versiones: `next` 16.4.6, `react`/`react-dom` 19.3.1, `zod` 4.6.7, `@tanstack/react-table` 9.3.1, `tailwindcss`/`@tailwindcss/postcss` 4.3.5, `postcss` 8.5.33, `@types/react` 19.3.3, `@types/react-dom` 19.3.0, `typescript` **6.0.3** y `eslint` **9.39.5** (fijadas sin `^` por compatibilidad con Next.js y `eslint-config-next`; `packages/db` sigue con TypeScript 7.0.2), `eslint-config-next` 16.4.6, `vitest` 5.1.2. `pnpm peers check` sin problemas. En Windows la instalación necesitó `--config.child-concurrency=1`. pnpm avisa «Agent skills awaiting approval: @tanstack/react-table» (no aprobado; no hace falta).

Las pantallas originales del plan 1.0b (eventos, clientes y tabla de ocho columnas en `/desarrollo/tabla`) quedan sustituidas por las de R3.

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
