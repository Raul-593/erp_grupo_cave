-- Up Migration
-- Proyecto con varios eventos (PLAN.md, «Graduaciones UNEMI», decisiones G-1 a G-5, 2026-11-27).
-- Solo añade una tabla, columnas opcionales y un trigger: no cambia ni borra datos existentes.
-- Las migraciones 0001-0010 no se editan.

-- 1. Eventos de un proyecto ---------------------------------------------------------------

CREATE TABLE project_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid        NOT NULL,
  name           text        NOT NULL,
  schedule_text  text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer     NOT NULL DEFAULT 1,
  CONSTRAINT project_events_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT project_events_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT project_events_schedule_text_not_blank CHECK (schedule_text IS NULL OR btrim(schedule_text) <> ''),
  CONSTRAINT project_events_version_positive CHECK (version >= 1)
);

-- Un nombre de evento por proyecto; también sirve para listar los eventos de un proyecto.
CREATE UNIQUE INDEX project_events_project_name_key ON project_events (project_id, lower(btrim(name)));

CREATE TRIGGER project_events_set_row_metadata
  BEFORE UPDATE ON project_events
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE project_events IS
  'Eventos (ceremonias o sedes) de un proyecto. Los ítems de la matriz pueden pertenecer a uno.';
COMMENT ON COLUMN project_events.schedule_text IS
  'Fechas y jornadas tal como las expresa el documento de origen; no se calculan.';

-- 2. Ítems de la matriz: evento y datos del producto ---------------------------------------

ALTER TABLE tdr_items
  ADD COLUMN event_id              uuid,
  ADD COLUMN tdr_ref               text,
  ADD COLUMN producto_codigo       text,
  ADD COLUMN producto_descripcion  text,
  ADD COLUMN categoria             text,
  ADD CONSTRAINT tdr_items_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES project_events (id) ON DELETE RESTRICT,
  ADD CONSTRAINT tdr_items_tdr_ref_not_blank CHECK (tdr_ref IS NULL OR btrim(tdr_ref) <> ''),
  ADD CONSTRAINT tdr_items_producto_codigo_not_blank CHECK (producto_codigo IS NULL OR btrim(producto_codigo) <> ''),
  ADD CONSTRAINT tdr_items_producto_descripcion_not_blank
    CHECK (producto_descripcion IS NULL OR btrim(producto_descripcion) <> ''),
  ADD CONSTRAINT tdr_items_categoria_not_blank CHECK (categoria IS NULL OR btrim(categoria) <> '');

CREATE INDEX tdr_items_event_id_idx ON tdr_items (event_id) WHERE event_id IS NOT NULL;

-- El evento de un ítem debe ser del mismo proyecto que su matriz.
CREATE FUNCTION check_item_event_project() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_event_project uuid;
  v_item_project uuid;
BEGIN
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id INTO v_event_project FROM project_events WHERE id = NEW.event_id;
  SELECT d.project_id INTO v_item_project
    FROM tdr_extractions x
    JOIN tdr_documents d ON d.id = x.tdr_document_id
   WHERE x.id = NEW.extraction_id;

  -- Si alguno no existe, la clave foránea rechazará la operación.
  IF v_event_project IS NOT NULL AND v_item_project IS NOT NULL AND v_event_project <> v_item_project THEN
    RAISE EXCEPTION 'El evento % no pertenece al proyecto del ítem', NEW.event_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tdr_items_event_same_project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tdr_items_check_event_project
  BEFORE INSERT OR UPDATE OF event_id ON tdr_items
  FOR EACH ROW EXECUTE FUNCTION check_item_event_project();

COMMENT ON COLUMN tdr_items.event_id IS 'Evento del proyecto al que pertenece el ítem; NULL si el proyecto no distingue eventos.';
COMMENT ON COLUMN tdr_items.tdr_ref IS 'Número del ítem en el TDR, tal como lo indica el documento de origen.';
COMMENT ON COLUMN tdr_items.producto_codigo IS 'Código del producto en el documento de origen (por ejemplo, CPC).';
COMMENT ON COLUMN tdr_items.producto_descripcion IS 'Descripción del producto en el TDR (común a sus subproductos).';
COMMENT ON COLUMN tdr_items.categoria IS 'Categoría del subproducto o requerimiento.';

-- 3. Costos por ítem: precio unitario y anticipos (provisional hasta la Fase 6) ------------

ALTER TABLE item_plans
  ADD COLUMN unit_price  numeric(14,4),
  ADD COLUMN advance_1   numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN advance_2   numeric(14,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT item_plans_unit_price_non_negative CHECK (unit_price IS NULL OR unit_price >= 0),
  ADD CONSTRAINT item_plans_advance_1_non_negative CHECK (advance_1 >= 0),
  ADD CONSTRAINT item_plans_advance_2_non_negative CHECK (advance_2 >= 0);

COMMENT ON COLUMN item_plans.unit_price IS 'Precio unitario del ítem. El subtotal vive en planned_cost.';
COMMENT ON COLUMN item_plans.advance_1 IS
  'Primer anticipo registrado en la matriz de costos. El saldo (planned_cost - anticipos) se calcula, no se guarda.';
COMMENT ON COLUMN item_plans.advance_2 IS 'Segundo anticipo registrado en la matriz de costos.';

-- 4. Estado operativo del ítem ----------------------------------------------------------------

ALTER TABLE item_execution
  ADD COLUMN operational_status text NOT NULL DEFAULT 'pending',
  ADD CONSTRAINT item_execution_operational_status_valid
    CHECK (operational_status IN ('pending', 'in_progress', 'ready'));

COMMENT ON COLUMN item_execution.operational_status IS
  'pending | in_progress | ready (listo). Independiente del estado de montaje.';

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario.
ALTER TABLE item_execution
  DROP CONSTRAINT item_execution_operational_status_valid,
  DROP COLUMN operational_status;
ALTER TABLE item_plans
  DROP CONSTRAINT item_plans_advance_2_non_negative,
  DROP CONSTRAINT item_plans_advance_1_non_negative,
  DROP CONSTRAINT item_plans_unit_price_non_negative,
  DROP COLUMN advance_2,
  DROP COLUMN advance_1,
  DROP COLUMN unit_price;
DROP TRIGGER tdr_items_check_event_project ON tdr_items;
DROP FUNCTION check_item_event_project();
DROP INDEX tdr_items_event_id_idx;
ALTER TABLE tdr_items
  DROP CONSTRAINT tdr_items_categoria_not_blank,
  DROP CONSTRAINT tdr_items_producto_descripcion_not_blank,
  DROP CONSTRAINT tdr_items_producto_codigo_not_blank,
  DROP CONSTRAINT tdr_items_tdr_ref_not_blank,
  DROP CONSTRAINT tdr_items_event_id_fkey,
  DROP COLUMN categoria,
  DROP COLUMN producto_descripcion,
  DROP COLUMN producto_codigo,
  DROP COLUMN tdr_ref,
  DROP COLUMN event_id;
DROP TABLE project_events;
