-- Up Migration
-- Etapa D (PLAN.md, decisiones D-7 y D-8, aprobadas el 2026-11-27). Planificación, Abastecimiento
-- y Ejecución cuelgan de la matriz confirmada del proyecto: una segunda matriz confirmada en el
-- mismo proyecto dejaría de mostrar la planificación de la primera. Hasta que existan versiones y
-- adendas, la base impide confirmar una segunda matriz por proyecto y confirmar una matriz vacía.
-- Solo añade una función y un trigger; no cambia datos.

CREATE FUNCTION check_extraction_confirmation() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF NEW.status <> 'confirmed' OR (TG_OP = 'UPDATE' AND OLD.status = 'confirmed') THEN
    RETURN NEW;
  END IF;

  -- Bloquea el proyecto para que dos confirmaciones simultáneas no pasen la validación a la vez.
  SELECT d.project_id INTO v_project_id
    FROM tdr_documents d
   WHERE d.id = NEW.tdr_document_id;
  PERFORM 1 FROM projects WHERE id = v_project_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
      FROM tdr_extractions x
      JOIN tdr_documents d ON d.id = x.tdr_document_id
     WHERE d.project_id = v_project_id
       AND x.status = 'confirmed'
       AND x.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'El proyecto % ya tiene una matriz confirmada', v_project_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tdr_extractions_one_confirmed_per_project';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tdr_items WHERE extraction_id = NEW.id) THEN
    RAISE EXCEPTION 'La matriz % no tiene ítems', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tdr_extractions_confirm_requires_items';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tdr_extractions_check_confirmation
  BEFORE INSERT OR UPDATE OF status ON tdr_extractions
  FOR EACH ROW EXECUTE FUNCTION check_extraction_confirmation();

COMMENT ON FUNCTION check_extraction_confirmation() IS
  'Al confirmar: como máximo una matriz confirmada por proyecto y al menos un ítem.';

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario.
DROP TRIGGER tdr_extractions_check_confirmation ON tdr_extractions;
DROP FUNCTION check_extraction_confirmation();
