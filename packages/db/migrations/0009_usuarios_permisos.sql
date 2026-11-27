-- Up Migration
-- Usuarios y auditoría (PLAN.md, «usuarios, roles y permisos», parte U, aprobada el 2026-11-27).
-- Adelanto de la Fase 3. Cuatro roles: admin (superusuario), field (empleado de campo),
-- accounting (empleado de contabilidad) y supplier (proveedor). Los permisos de cada rol se
-- definen en el código de la aplicación (decisión U-D9); la base garantiza la coherencia de
-- los vínculos, que siempre quede un superusuario activo y que la auditoría sea inmutable.
-- No depende del esquema auth de Supabase: auth_subject guardará el id de Supabase Auth
-- cuando se migre (parte S). Solo añade; no borra columnas ni datos.

-- 1. Usuarios del sistema ------------------------------------------------------------------

CREATE TABLE app_users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      text        NOT NULL,
  email          text,
  role           text        NOT NULL,
  worker_id      uuid,
  supplier_id    uuid,
  auth_subject   uuid,
  active         boolean     NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer     NOT NULL DEFAULT 1,
  CONSTRAINT app_users_worker_id_fkey FOREIGN KEY (worker_id)
    REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT app_users_supplier_id_fkey FOREIGN KEY (supplier_id)
    REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT app_users_role_valid         CHECK (role IN ('admin', 'field', 'accounting', 'supplier')),
  CONSTRAINT app_users_full_name_not_blank CHECK (btrim(full_name) <> ''),
  -- El correo se guarda normalizado (minúsculas, sin espacios) para que sea único sin distinguir mayúsculas.
  CONSTRAINT app_users_email_format CHECK (
    email IS NULL OR (email = lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  -- Un empleado de campo trabaja sobre los ítems de su trabajador: el vínculo es obligatorio.
  CONSTRAINT app_users_field_requires_worker CHECK (role <> 'field' OR worker_id IS NOT NULL),
  -- Solo el proveedor se vincula a un proveedor, y siempre.
  CONSTRAINT app_users_supplier_link CHECK ((role = 'supplier') = (supplier_id IS NOT NULL)),
  CONSTRAINT app_users_supplier_no_worker CHECK (role <> 'supplier' OR worker_id IS NULL),
  CONSTRAINT app_users_version_positive CHECK (version >= 1),
  CONSTRAINT app_users_email_key        UNIQUE (email),
  CONSTRAINT app_users_worker_id_key    UNIQUE (worker_id),
  CONSTRAINT app_users_auth_subject_key UNIQUE (auth_subject)
);

CREATE INDEX app_users_supplier_id_idx ON app_users (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX app_users_active_full_name_idx ON app_users (active, full_name);

CREATE TRIGGER app_users_set_row_metadata
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

-- Los usuarios no se borran (se desactivan) y siempre queda al menos un superusuario activo.
-- Bloquea a los superusuarios activos para que dos cambios simultáneos no dejen ninguno.
CREATE FUNCTION check_app_user_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_admins integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los usuarios no se borran: se desactivan'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'app_users_no_delete';
  END IF;
  IF OLD.role = 'admin' AND OLD.active AND (NEW.role <> 'admin' OR NOT NEW.active) THEN
    PERFORM 1 FROM app_users WHERE role = 'admin' AND active FOR UPDATE;
    SELECT count(*) INTO v_admins FROM app_users WHERE role = 'admin' AND active AND id <> OLD.id;
    IF v_admins = 0 THEN
      RAISE EXCEPTION 'Debe quedar al menos un superusuario activo'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'app_users_last_admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_users_check_change
  BEFORE UPDATE OF role, active OR DELETE ON app_users
  FOR EACH ROW EXECUTE FUNCTION check_app_user_change();

COMMENT ON TABLE app_users IS
  'Usuarios del sistema. Un rol por usuario; los permisos de cada rol están en el código. No se borran: se desactivan.';
COMMENT ON COLUMN app_users.role IS 'admin (superusuario) | field (empleado de campo) | accounting (contabilidad) | supplier (proveedor)';
COMMENT ON COLUMN app_users.worker_id IS 'Trabajador del usuario: define los ítems de un empleado de campo (tdr_item_assignments).';
COMMENT ON COLUMN app_users.supplier_id IS 'Proveedor al que pertenece un usuario de rol supplier.';
COMMENT ON COLUMN app_users.auth_subject IS 'Identificador del usuario en el proveedor de autenticación (Supabase Auth). Vacío en desarrollo local.';

-- 2. Auditoría ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  user_id      uuid        NOT NULL,
  action       text        NOT NULL,
  entity       text        NOT NULL,
  entity_id    uuid,
  details      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES app_users (id) ON DELETE RESTRICT,
  CONSTRAINT audit_log_action_format CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  CONSTRAINT audit_log_entity_format CHECK (entity ~ '^[a-z_]+$'),
  CONSTRAINT audit_log_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id, occurred_at);
CREATE INDEX audit_log_user_id_idx ON audit_log (user_id, occurred_at);

-- Solo se agregan filas: nadie corrige ni borra el historial.
CREATE FUNCTION reject_audit_log_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de cambios no se modifica ni se borra'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'audit_log_append_only';
END;
$$;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_change();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_change();

COMMENT ON TABLE audit_log IS 'Historial de cambios: quién, cuándo, qué acción y sobre qué registro. Solo se agregan filas.';
COMMENT ON COLUMN audit_log.action IS 'Acción con formato modulo.accion, por ejemplo item_plan.update.';
COMMENT ON COLUMN audit_log.details IS 'Valores enviados en el cambio. Nunca contraseñas, claves ni contenido de archivos.';

-- 3. Quién subió cada fotografía -----------------------------------------------------------

ALTER TABLE item_evidences ADD COLUMN uploaded_by uuid;
ALTER TABLE item_evidences ADD CONSTRAINT item_evidences_uploaded_by_fkey FOREIGN KEY (uploaded_by)
  REFERENCES app_users (id) ON DELETE RESTRICT;
CREATE INDEX item_evidences_uploaded_by_idx ON item_evidences (uploaded_by) WHERE uploaded_by IS NOT NULL;

COMMENT ON COLUMN item_evidences.uploaded_by IS
  'Usuario que subió la fotografía. Vacío en las fotografías anteriores a la existencia de usuarios.';

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario. Se pierde la auditoría registrada.
DROP INDEX item_evidences_uploaded_by_idx;
ALTER TABLE item_evidences DROP CONSTRAINT item_evidences_uploaded_by_fkey;
ALTER TABLE item_evidences DROP COLUMN uploaded_by;
DROP TABLE audit_log;
DROP FUNCTION reject_audit_log_change();
DROP TABLE app_users;
DROP FUNCTION check_app_user_change();
