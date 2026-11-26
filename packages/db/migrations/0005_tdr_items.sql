-- Up Migration

CREATE TABLE tdr_items (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id  uuid          NOT NULL,
  item_number    integer       NOT NULL,
  producto       text          NOT NULL,
  subproducto    text          NOT NULL,
  descripcion    text          NOT NULL,
  cant           numeric(14,4),
  unidad         text,
  dias           numeric(8,2),
  observacion    text,
  source         text          NOT NULL,
  source_index   integer,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now(),
  version        integer       NOT NULL DEFAULT 1,
  CONSTRAINT tdr_items_extraction_id_fkey FOREIGN KEY (extraction_id)
    REFERENCES tdr_extractions (id) ON DELETE RESTRICT,
  CONSTRAINT tdr_items_item_number_positive CHECK (item_number >= 1),
  CONSTRAINT tdr_items_producto_not_blank    CHECK (btrim(producto) <> ''),
  CONSTRAINT tdr_items_subproducto_not_blank CHECK (btrim(subproducto) <> ''),
  CONSTRAINT tdr_items_cant_non_negative CHECK (cant IS NULL OR cant >= 0),
  CONSTRAINT tdr_items_dias_non_negative CHECK (dias IS NULL OR dias >= 0),
  CONSTRAINT tdr_items_source_valid CHECK (source IN ('ai', 'manual')),
  CONSTRAINT tdr_items_source_index_matches_source CHECK (
    (source = 'ai' AND source_index IS NOT NULL AND source_index >= 0)
    OR (source = 'manual' AND source_index IS NULL)
  ),
  CONSTRAINT tdr_items_version_positive CHECK (version >= 1),
  -- Diferida hasta el COMMIT para poder renumerar filas al eliminar o reordenar.
  -- También sirve como índice para listar los ítems de una extracción en orden.
  CONSTRAINT tdr_items_extraction_item_number_key UNIQUE (extraction_id, item_number)
    DEFERRABLE INITIALLY DEFERRED
);

-- Cada elemento del JSON original se importa una sola vez.
CREATE UNIQUE INDEX tdr_items_extraction_source_index_key
  ON tdr_items (extraction_id, source_index) WHERE source_index IS NOT NULL;

-- Los ítems solo se crean, editan o eliminan mientras la extracción está en 'processed'.
-- FOR SHARE bloquea la extracción frente a una confirmación concurrente.
CREATE FUNCTION protect_tdr_items() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_extraction_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.extraction_id IS DISTINCT FROM OLD.extraction_id THEN
    RAISE EXCEPTION 'No se puede mover el ítem % a otra extracción', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_extraction_id := OLD.extraction_id;
  ELSE
    v_extraction_id := NEW.extraction_id;
  END IF;

  SELECT status INTO v_status
    FROM tdr_extractions
   WHERE id = v_extraction_id
     FOR SHARE;

  -- Si la extracción no existe, la clave foránea rechazará la operación.
  IF FOUND AND v_status <> 'processed' THEN
    RAISE EXCEPTION 'Los ítems de la extracción % no se pueden modificar en estado %', v_extraction_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tdr_items_protect
  BEFORE INSERT OR UPDATE OR DELETE ON tdr_items
  FOR EACH ROW EXECUTE FUNCTION protect_tdr_items();

CREATE TRIGGER tdr_items_set_row_metadata
  BEFORE UPDATE ON tdr_items
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE tdr_items IS
  'Filas editables del desglose (copia de trabajo). El JSON original se conserva en tdr_extractions.raw_response.';
COMMENT ON COLUMN tdr_items.item_number IS 'Número de fila para presentación (columna "item"); no es clave primaria.';
COMMENT ON COLUMN tdr_items.cant IS 'Cantidad del recurso, sin multiplicar por días. NULL si se desconoce.';
COMMENT ON COLUMN tdr_items.dias IS 'Días aplicables al recurso. NULL si se desconoce.';
COMMENT ON COLUMN tdr_items.source IS 'ai: proviene del JSON de la IA; manual: añadida por el usuario.';
COMMENT ON COLUMN tdr_items.source_index IS 'Posición (desde 0) en raw_response.items cuando source = ai.';

-- Down Migration
DROP TABLE tdr_items;
DROP FUNCTION protect_tdr_items();
