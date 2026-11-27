# PLAN.md — erp_v1

## Índice de tareas

| Tarea | Estado |
| --- | --- |
| Subida de la base de datos, los archivos y el inicio de sesión a Supabase (parte S) | **Propuesto (2026-11-27).** Espera la aprobación del usuario y sus respuestas a S-D1…S-D8 |
| Fase 1 · Operación › Requerimiento: adaptador de IA (etapa C) y matriz editable (etapa D) | **En pausa.** Etapas A, B y C (sin proveedor) hechas; falta elegir el proveedor de IA |

Las tareas completadas (usuarios, roles y permisos —parte U—, reparto de pagos, datos de demostración y fotografías, etapas A–C de Requerimiento y subfase 1.1) se retiraron de este archivo a pedido del usuario (2026-11-27). Sus decisiones vigentes están en `AGENTS.md`, su estado en `MEMORY.md` y su detalle en el historial de Git de `PLAN.md`.

---

## Tarea propuesta: subida a Supabase (parte S)

| Campo | Valor |
| --- | --- |
| Estado | **Propuesto (2026-11-27).** Nada se ejecuta sin la aprobación explícita del usuario |
| Origen | Pedido del usuario (2026-11-27): terminada la parte U (usuarios y permisos), subir la base a Supabase y cargar allí los usuarios reales |
| Fase | Preparación de producción (`AGENTS.md` §12), con aprobación independiente |
| Fuera de alcance | Publicar la aplicación web (S-D8), portal del proveedor, módulo de aprobación de costos, políticas RLS por usuario (S-D7) |

### S1. Objetivo

La base de datos, los archivos (PDF y fotografías) y el inicio de sesión pasan a Supabase: primero en un proyecto de pruebas y, validado, en el de producción.

**Aclaración:** con la base en Supabase la aplicación web sigue corriendo solo en este computador (`127.0.0.1`). Para que otras personas la usen desde sus equipos o celulares hay que publicarla (Netlify u otro hosting); eso es un plan aparte (S-D8).

### S2. Punto de partida (verificado el 2026-11-27)

- Migraciones `0001`–`0009` en `erp` y `erp_test` (PostgreSQL 18.4 local). Supabase usa una versión mayor anterior: no se usaron funciones exclusivas de la 18, pero hay que comprobarlo en S1.
- Usuarios en `app_users` (rol, vínculo con trabajador o proveedor) con la columna `auth_subject`, vacía, prevista para el id de Supabase Auth. Historial en `audit_log`.
- Autenticación detrás de la interfaz `AuthProvider` (`apps/web/src/integrations/auth/`). Hoy solo existe el adaptador `dev` («Entrar como…», sin contraseña), que se niega a funcionar con una base remota, desde otra dirección que no sea la del propio equipo o en un hosting. `AUTH_PROVIDER=supabase` se rechaza hasta que exista su adaptador.
- Permisos por rol en el código (`apps/web/src/domain/access/permissions.ts`) y comprobados en el servidor en cada acción y ruta (una prueba lo exige).
- Almacenamiento detrás de `FileStorage` (`integrations/storage/types.ts`), que ya admite `'local' | 'supabase'`; solo existe el adaptador local.
- El esquema `erp` no está en `public`: la API automática de Supabase no lo expone por defecto.
- El pool fija el esquema con `options: -c search_path=…` (`packages/db/src/client.ts`); el pooler de Supabase puede ignorarlo: el esquema se fijará en el rol de la base.
- Los datos de `erp` son de ejemplo: la demostración del proyecto 1, trabajadores, proveedores y 18 usuarios de ejemplo creados a partir de ellos.

### S3. Decisiones que necesito (con recomendación)

| ID | Decisión | Recomendación | Alternativa |
| --- | --- | --- | --- |
| S-D1 | Plan de Supabase | **Plan de pago (Pro)** para datos reales: el plan gratuito pausa el proyecto tras una semana sin uso y no incluye respaldos diarios. Usted confirma el costo vigente en el panel de Supabase; la cuenta y el pago los gestiona usted | Plan gratuito solo para el proyecto de pruebas |
| S-D2 | Entornos | **Dos proyectos:** `erp-pruebas` (primero) y `erp-produccion` (después de validar). `AGENTS.md` §7 exige probar antes en un entorno no productivo | Un solo proyecto |
| S-D3 | Región | **La misma región donde se vaya a publicar el servidor web**; si no está decidido, `us-east-1` (Estados Unidos, Este), en general la de menor latencia desde Ecuador. Conviene verificar con la empresa la Ley Orgánica de Protección de Datos Personales sobre transferencia internacional de datos | `sa-east-1` (São Paulo) |
| S-D4 | Qué datos se suben | **Producción empieza limpia:** esquema completo, empresa, los catálogos que usted elija (trabajadores, proveedores, contratantes) y los usuarios reales. La demostración del proyecto 1 y los usuarios de ejemplo **no se suben** (`AGENTS.md` §2: la demostración es solo local) | Copiar todo, incluida la demostración, al proyecto de pruebas (exige cambiar la regla de §2) |
| S-D5 | Archivos | **Buckets privados** `tdr` y `evidencias` en Supabase Storage; los archivos siempre pasan por el servidor, que comprueba permisos; nunca enlaces públicos | URLs firmadas de corta duración para descargar directo desde Supabase |
| S-D6 | Cómo reciben su acceso las personas | **Invitación por correo** creada por el superusuario. Requiere configurar un servidor de correo propio (SMTP de la empresa o un servicio de envío): el correo integrado de Supabase es solo para pruebas y tiene un límite muy bajo | El superusuario crea el usuario con una contraseña temporal y la persona la cambia al entrar |
| S-D7 | Seguridad dentro de la base (RLS) | **Ahora:** RLS activado en todas las tablas de `erp`, sin acceso para los roles públicos de Supabase (`anon`, `authenticated`), esquema no expuesto en la API automática y la aplicación con un rol propio `erp_app` que solo lee y escribe datos. Los permisos por usuario siguen en el servidor. **Después** (cuando exista el portal del proveedor, con usuarios externos): políticas RLS por usuario como segunda barrera | Políticas RLS por usuario desde ya: más seguridad en la base, pero cada consulta debe llevar la identidad del usuario y los repositorios cambian mucho |
| S-D8 | Publicar la aplicación web | **Plan aparte** después de S: elegir dónde corre el servidor (Netlify tiene límites de duración que afectan al procesamiento de TDR con IA; `AGENTS.md` §3) | Incluirlo en esta tarea |

### S4. Pasos

**Lo que hace usted (yo no puedo crear cuentas ni contratar servicios):** crear la cuenta y los proyectos de Supabase (S-D1…S-D3) y copiar las cadenas de conexión y claves en `.env` (nunca en el chat ni en Git).

| # | Paso | Verificación |
| --- | --- | --- |
| S0 | Aprobación de la parte S, de sus dependencias (`@supabase/supabase-js` y `@supabase/ssr`, SDK oficiales) y respuestas a S-D1…S-D8 | Aprobación explícita |
| S1 | En `erp-pruebas`: comprobar versión de PostgreSQL, extensiones y conexión directa y por el pooler | Informe de compatibilidad |
| S2 | Script de preparación por entorno: esquema `erp` y rol `erp_app` (solo datos, `search_path` fijado en el rol), sin permisos para `anon` ni `authenticated`. Aplicar `0001`–`0009` con node-pg-migrate | `pnpm db:status` contra Supabase |
| S3 | Migración `0010_rls`: RLS activado en todas las tablas, con política solo para `erp_app` (funciona igual en local y en Supabase) | `anon` y `authenticated` no leen nada; Security Advisor de Supabase sin alertas críticas |
| S4 | Adaptador `supabase` de almacenamiento (buckets privados, límites por bucket, clave de servicio solo en el servidor) | Pruebas con el mock y una real en `erp-pruebas` |
| S5 | Adaptador `supabase` de autenticación: correo y contraseña, recuperación de contraseña, invitación o contraseña temporal (S-D6), renovación de sesión; vínculo con `app_users.auth_subject`; el correo pasa a ser obligatorio para entrar. El adaptador `dev` sigue bloqueado fuera del entorno local | Un usuario por rol en `erp-pruebas` |
| S6 | Validación completa en `erp-pruebas` con la aplicación local apuntando a Supabase: las mismas pruebas por rol de la parte U | Todo en verde |
| S7 | Producción: mismo procedimiento en `erp-produccion`; carga de los catálogos elegidos (S-D4) con un script que respeta el orden de las tablas y sus triggers (no un `pg_dump` completo: lleva la demostración y sintaxis de PostgreSQL 18); alta de los usuarios reales | Conteos por tabla; inicio de sesión de cada usuario |
| S8 | Respaldos: confirmar los diarios de la base y definir aparte el de los archivos (los respaldos de la base no incluyen Storage; `AGENTS.md` §9). Reversión: mientras producción no se use, se vuelve al entorno local sin pérdida | Documento de respaldo y reversión |
| S9 | Actualizar `.env.example` (sin valores), `AGENTS.md`, `PLAN.md` y `MEMORY.md` | Sin secretos |

### S5. Criterios de aceptación

1. En Supabase las tablas no son accesibles por la API pública, los archivos están en buckets privados, la aplicación usa un rol sin permisos de estructura y ningún secreto llega al navegador.
2. Cada persona entra con su correo y contraseña; el ingreso de desarrollo no funciona contra Supabase.
3. Cada rol puede exactamente lo mismo que en local (las pruebas por rol pasan contra `erp-pruebas`).
4. Producción no contiene la demostración ni los usuarios de ejemplo; hay respaldo de base y de archivos y un plan de reversión.
5. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` sin errores.

### S6. Riesgos

- **Diferencia de versión** (local 18.4 frente a Supabase): se valida en S1 antes de tocar producción.
- **Pooler de Supabase:** el modo de transacción no conserva ajustes de sesión; el esquema se fija en el rol.
- **Correos de invitación:** sin un servidor de correo propio, Supabase no envía invitaciones reales (S-D6).
- **Carga de datos con triggers:** `paid_amount` lo calcula un trigger a partir de los repartos de pagos; una carga de datos debe insertar pagos y repartos después de las líneas.
- **Privacidad:** los TDR y fotografías de clientes quedan en un servicio externo; confirmar la autorización de la empresa y la región (S-D3).
- **Costos:** Supabase Pro y, después, el hosting de la aplicación web tienen costo mensual; los decide usted.
- **Historial de auditoría local:** `audit_log` de `erp` contiene las pruebas de la parte U; no se migra (S-D4).

---

## Tarea en pausa: Fase 1 · Operación › Requerimiento

| Campo | Valor |
| --- | --- |
| Estado | **En pausa.** Aprobada el 2026-11-26. Hechas las etapas A (base visual y datos, migración `0006`), B (carga de PDF, subfase 1.2) y C sin proveedor (contrato `tdr-v1`, prompt `tdr-extraccion-v1`, interfaz común de IA, servicio y orquestador). Pendientes: elegir proveedor de IA (R-D6) y la etapa D |
| Fuera de alcance | Cotizaciones editables, versiones/adendas, exportar a Excel, precios, tareas y seguimiento de responsables, despliegue |

### R1. Objetivo

En **Operación › Requerimiento**: subir el PDF del TDR, pulsar «Procesar TDR con IA», obtener la ficha del proyecto y la matriz de entregables completa, revisarlas y corregirlas, asignar un responsable por ítem y confirmar el resultado en PostgreSQL.

### R2. Decisiones vigentes

- **R-D6 (pendiente del usuario):** primer adaptador de IA: Anthropic (`@anthropic-ai/sdk`), OpenAI (`openai`) o Google (`@google/genai`). Antes de integrarlo se verifica en la documentación vigente la entrada PDF nativa, la salida estructurada y los límites. Requiere la clave del usuario en `.env` y su autorización para enviar TDR reales; sin ella, solo PDF sintéticos.
- **R-D7:** el procesamiento corre en el proceso del servidor local (intento `pending` con clave de idempotencia, consulta periódica del estado, intentos interrumpidos marcados como error). Se reevalúa antes de publicar la aplicación.
- **R-D3:** la ficha vive en columnas de `projects`; la propuesta de la IA queda intacta en `raw_response.ficha` y `projects.ficha_extraction_id` registra de qué extracción se aplicó.
- **R-D4:** el responsable vive en `tdr_item_assignments`; al reprocesar, el nuevo intento empieza sin responsables.
- **Permisos (parte U):** cargar, procesar y borrar TDR exige `tdr.manage`; editar y confirmar la matriz y la ficha, `projects.write` y `items.assign` (hoy, solo el superusuario). Toda acción nueva debe llamar a `authorize` y registrar el cambio en `audit_log`.

### R3. Pasos pendientes

| # | Paso | Verificación |
| --- | --- | --- |
| 8 | Instalar el SDK aprobado (R-D6) y escribir su adaptador en `apps/web/src/integrations/ai/`, registrado en `registry.ts` | Pruebas con mock: respuesta válida, JSON inválido, incompleta, rechazada, vacía, timeout, doble clic |
| 9 | Una prueba real **solo con un PDF sintético** (o real, si el usuario autoriza al proveedor) | Autorización previa; informe de tokens y duración |
| 10 | **Etapa D (subfase 1.4):** importar `raw_response.items` a `tdr_items`; tabla agrupada por rubro con edición, alta, baja, renumeración y responsable; guardar; confirmar en una transacción; ficha con «Aplicar propuesta» | Pruebas de servicio y flujo completo en el navegador |
| 11 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` | Todo en verde |
| 12 | Actualizar `PLAN.md`, `MEMORY.md` y `AGENTS.md` | Sin secretos |

### R4. Criterios de aceptación pendientes

1. «Procesar TDR con IA» genera la ficha (contratante, código de proceso, objeto, monto, moneda, sedes, plazo, administrador del contrato) y la matriz con rubro, producto, subproducto, descripción, cant., unidad, días y observación; los errores de la IA se muestran en español y no crean resultados confirmados.
2. La matriz se edita, agrupa por rubro y numera 1.1, 1.2…; cada ítem admite un responsable; se guarda y se confirma; el responsable puede cambiarse después de confirmar.
3. El JSON original de la IA queda intacto y separado de las ediciones; reprocesar no modifica lo confirmado.
4. Ninguna credencial, clave de IA ni consulta SQL llega al navegador.

### R5. Riesgos

- **Coste y privacidad de la IA:** las llamadas reales tienen coste y envían el TDR al proveedor; sin autorización, solo PDF sintéticos.
- **PDF extensos:** pueden superar límites del modelo; se informan como error controlado. Dividir documentos requiere aprobación aparte (`AGENTS.md` §8).
- **Procesamiento en el proceso del servidor:** un reinicio interrumpe el trabajo (se detecta y se marca como error); no apto para producción sin reevaluar.
- **Numeración derivada:** 1.1, 1.2… cambia al reordenar o mover ítems entre rubros; es de presentación, no una referencia estable.
- **Sin verificar con datos reales:** los paneles de intento procesado o fallido (no hay adaptador todavía).
