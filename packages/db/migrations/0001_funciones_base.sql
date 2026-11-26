-- Up Migration
-- Funciones compartidas. Las migraciones no fijan el nombre del esquema: se aplican
-- sobre el esquema indicado al migrador (erp en desarrollo, erp_test en pruebas).
-- SET search_path FROM CURRENT fija en cada función el esquema vigente al crearla.

CREATE FUNCTION set_row_metadata() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_row_metadata() IS
  'Actualiza updated_at e incrementa version en cada UPDATE (concurrencia optimista).';

-- Down Migration
DROP FUNCTION set_row_metadata();
