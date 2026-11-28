-- Up Migration
-- Alta automática del trabajador o del proveedor de un usuario (PLAN.md, parte A, aprobada el
-- 2026-11-28). Al crear un usuario sin vínculo, la base crea su ficha con el mismo nombre:
-- un proveedor (tipo external) para el rol supplier y un trabajador para los demás roles. Si el
-- alta ya trae worker_id o supplier_id, no crea nada (permite vincular a uno existente).
-- Solo actúa al crear: cambiar el nombre, el rol o desactivar un usuario no toca su ficha.
-- Los CHECK de app_users se evalúan después de este trigger, así que siguen protegiendo el vínculo.
-- No añade tablas (RLS sin cambios) ni modifica datos existentes. Las migraciones 0001-0012 no se editan.

CREATE FUNCTION create_app_user_link() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  -- Un nombre vacío lo rechaza app_users_full_name_not_blank; no se crea una ficha sin nombre.
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.role = 'supplier' THEN
    IF NEW.supplier_id IS NULL THEN
      INSERT INTO suppliers (name, kind) VALUES (btrim(NEW.full_name), 'external') RETURNING id INTO NEW.supplier_id;
    END IF;
  ELSIF NEW.worker_id IS NULL THEN
    INSERT INTO workers (full_name, email) VALUES (btrim(NEW.full_name), NEW.email) RETURNING id INTO NEW.worker_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_users_create_link
  BEFORE INSERT ON app_users
  FOR EACH ROW EXECUTE FUNCTION create_app_user_link();

COMMENT ON FUNCTION create_app_user_link() IS
  'Al crear un usuario sin vínculo, crea su trabajador (o su proveedor, si es de rol supplier) con el mismo nombre.';

-- Down Migration
-- Los trabajadores y proveedores ya creados por el trigger se conservan.
DROP TRIGGER app_users_create_link ON app_users;
DROP FUNCTION create_app_user_link();
