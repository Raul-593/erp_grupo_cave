-- Up Migration
-- Terminología de AGENTS.md §1 (decisión del usuario, 2026-11-26):
--   events -> projects; empresas del holding (preparadas, sin interfaz en Fase 1);
--   ficha del proyecto; trabajadores y un responsable por ítem; rubro en la matriz.
-- Renombrar no borra datos. Las migraciones 0001-0005 no se editan.

-- 1. Empresas del holding ---------------------------------------------------------

CREATE TABLE companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  legal_name  text,
  tax_id      text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT companies_name_not_blank       CHECK (btrim(name) <> ''),
  CONSTRAINT companies_legal_name_not_blank CHECK (legal_name IS NULL OR btrim(legal_name) <> ''),
  CONSTRAINT companies_tax_id_not_blank     CHECK (tax_id IS NULL OR btrim(tax_id) <> ''),
  CONSTRAINT companies_version_positive     CHECK (version >= 1)
);

CREATE UNIQUE INDEX companies_tax_id_key ON companies (tax_id) WHERE tax_id IS NOT NULL;

CREATE TRIGGER companies_set_row_metadata
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE companies IS 'Empresas del holding que ejecutan proyectos. Sin interfaz en Fase 1.';

-- 2. events -> projects ------------------------------------------------------------

ALTER TABLE events RENAME TO projects;
ALTER TABLE projects RENAME CONSTRAINT events_pkey             TO projects_pkey;
ALTER TABLE projects RENAME CONSTRAINT events_client_id_fkey   TO projects_client_id_fkey;
ALTER TABLE projects RENAME CONSTRAINT events_name_not_blank   TO projects_name_not_blank;
ALTER TABLE projects RENAME CONSTRAINT events_dates_order      TO projects_dates_order;
ALTER TABLE projects RENAME CONSTRAINT events_version_positive TO projects_version_positive;
ALTER INDEX events_client_id_idx RENAME TO projects_client_id_idx;
ALTER TRIGGER events_set_row_metadata ON projects RENAME TO projects_set_row_metadata;

ALTER TABLE tdr_documents RENAME COLUMN event_id TO project_id;
ALTER TABLE tdr_documents RENAME CONSTRAINT tdr_documents_event_id_fkey    TO tdr_documents_project_id_fkey;
ALTER TABLE tdr_documents RENAME CONSTRAINT tdr_documents_event_sha256_key TO tdr_documents_project_sha256_key;

-- 3. Ficha del proyecto -------------------------------------------------------------

ALTER TABLE projects
  ADD COLUMN company_id             uuid,
  ADD COLUMN process_code           text,
  ADD COLUMN purpose                text,
  ADD COLUMN contract_amount        numeric(14,2),
  ADD COLUMN currency               text,
  ADD COLUMN amount_includes_vat    boolean,
  ADD COLUMN venues                 text[] NOT NULL DEFAULT '{}',
  ADD COLUMN term_text              text,
  ADD COLUMN contract_administrator text,
  ADD COLUMN ficha_extraction_id    uuid,
  ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id)
    REFERENCES companies (id) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_ficha_extraction_id_fkey FOREIGN KEY (ficha_extraction_id)
    REFERENCES tdr_extractions (id) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_process_code_not_blank CHECK (process_code IS NULL OR btrim(process_code) <> ''),
  ADD CONSTRAINT projects_purpose_not_blank CHECK (purpose IS NULL OR btrim(purpose) <> ''),
  ADD CONSTRAINT projects_term_text_not_blank CHECK (term_text IS NULL OR btrim(term_text) <> ''),
  ADD CONSTRAINT projects_contract_administrator_not_blank CHECK (
    contract_administrator IS NULL OR btrim(contract_administrator) <> ''
  ),
  ADD CONSTRAINT projects_contract_amount_non_negative CHECK (contract_amount IS NULL OR contract_amount >= 0),
  ADD CONSTRAINT projects_currency_format CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT projects_amount_requires_currency CHECK (contract_amount IS NULL OR currency IS NOT NULL),
  -- Sin elementos nulos ni vacíos (el backend recorta los espacios).
  ADD CONSTRAINT projects_venues_valid CHECK (array_position(venues, NULL) IS NULL AND '' <> ALL (venues));

CREATE INDEX projects_company_id_idx ON projects (company_id) WHERE company_id IS NOT NULL;

-- La ficha solo puede provenir de una extracción de un TDR del mismo proyecto.
CREATE FUNCTION check_project_ficha_extraction() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF NEW.ficha_extraction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM tdr_extractions x
      JOIN tdr_documents d ON d.id = x.tdr_document_id
     WHERE x.id = NEW.ficha_extraction_id
       AND d.project_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'La extracción % no pertenece al proyecto %', NEW.ficha_extraction_id, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_check_ficha_extraction
  BEFORE INSERT OR UPDATE OF ficha_extraction_id ON projects
  FOR EACH ROW EXECUTE FUNCTION check_project_ficha_extraction();

COMMENT ON TABLE projects IS 'Proyectos de un contratante (antes "events"). Contiene la ficha del proyecto.';
COMMENT ON COLUMN projects.company_id IS 'Empresa del holding que ejecuta el proyecto. Nulo hasta implementar empresas.';
COMMENT ON COLUMN projects.process_code IS 'Código del proceso de contratación.';
COMMENT ON COLUMN projects.purpose IS 'Objeto de la contratación.';
COMMENT ON COLUMN projects.contract_amount IS 'Monto del contrato o presupuesto referencial transcrito del TDR; nunca estimado.';
COMMENT ON COLUMN projects.currency IS 'Código ISO 4217 (p. ej. USD); obligatorio si hay monto.';
COMMENT ON COLUMN projects.venues IS 'Sedes o ciudades de ejecución.';
COMMENT ON COLUMN projects.term_text IS 'Plazo tal como lo expresa el documento.';
COMMENT ON COLUMN projects.ficha_extraction_id IS 'Extracción cuya ficha propuesta se aplicó por última vez.';

-- 4. Trabajadores --------------------------------------------------------------------

CREATE TABLE workers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text        NOT NULL,
  job_title   text,
  phone       text,
  email       text,
  notes       text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT workers_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT workers_job_title_not_blank CHECK (job_title IS NULL OR btrim(job_title) <> ''),
  CONSTRAINT workers_version_positive    CHECK (version >= 1)
);

CREATE INDEX workers_active_full_name_idx ON workers (active, full_name);

CREATE TRIGGER workers_set_row_metadata
  BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE workers IS
  'Trabajadores que pueden ser responsables de un ítem. No son usuarios del sistema (Fase 3). No se borran: se desactivan.';

-- 5. Responsable por ítem ------------------------------------------------------------

-- Tabla separada de tdr_items: los ítems confirmados son inmutables, el responsable no.
CREATE TABLE tdr_item_assignments (
  tdr_item_id  uuid        PRIMARY KEY,
  worker_id    uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  CONSTRAINT tdr_item_assignments_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT tdr_item_assignments_worker_id_fkey FOREIGN KEY (worker_id)
    REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT tdr_item_assignments_version_positive CHECK (version >= 1)
);

CREATE INDEX tdr_item_assignments_worker_id_idx ON tdr_item_assignments (worker_id);

-- Solo se asigna (o reasigna) a trabajadores activos; una asignación previa a un
-- trabajador luego desactivado se conserva.
CREATE FUNCTION check_assignment_worker_active() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tdr_item_id IS DISTINCT FROM OLD.tdr_item_id THEN
    RAISE EXCEPTION 'No se puede mover la asignación % a otro ítem', OLD.tdr_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.worker_id IS DISTINCT FROM OLD.worker_id)
     AND NOT EXISTS (SELECT 1 FROM workers WHERE id = NEW.worker_id AND active) THEN
    -- Si el trabajador no existe, la clave foránea rechazará la operación.
    IF EXISTS (SELECT 1 FROM workers WHERE id = NEW.worker_id) THEN
      RAISE EXCEPTION 'El trabajador % está desactivado', NEW.worker_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tdr_item_assignments_check_worker
  BEFORE INSERT OR UPDATE ON tdr_item_assignments
  FOR EACH ROW EXECUTE FUNCTION check_assignment_worker_active();

CREATE TRIGGER tdr_item_assignments_set_row_metadata
  BEFORE UPDATE ON tdr_item_assignments
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE tdr_item_assignments IS
  'Responsable único de cada ítem. Editable aunque la extracción esté confirmada.';

-- 6. Rubro y subproducto opcional en la matriz -------------------------------------

-- Sin valor por omisión: las tablas están vacías al aplicar esta migración.
ALTER TABLE tdr_items
  ADD COLUMN rubro text NOT NULL,
  ADD CONSTRAINT tdr_items_rubro_not_blank CHECK (btrim(rubro) <> '');

-- tdr_items_subproducto_not_blank sigue vigente cuando se informa.
ALTER TABLE tdr_items ALTER COLUMN subproducto DROP NOT NULL;

COMMENT ON COLUMN tdr_items.rubro IS 'Gran grupo del requerimiento (primer nivel de la matriz).';
COMMENT ON COLUMN tdr_items.subproducto IS 'Componente o tipo dentro del producto; NULL si no existe uno identificable.';
COMMENT ON COLUMN tdr_items.item_number IS
  'Orden de presentación dentro de la extracción; la numeración 1.1, 1.2... se calcula en pantalla.';

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario.
ALTER TABLE tdr_items ALTER COLUMN subproducto SET NOT NULL;
ALTER TABLE tdr_items DROP CONSTRAINT tdr_items_rubro_not_blank, DROP COLUMN rubro;

DROP TABLE tdr_item_assignments;
DROP FUNCTION check_assignment_worker_active();
DROP TABLE workers;

DROP TRIGGER projects_check_ficha_extraction ON projects;
DROP FUNCTION check_project_ficha_extraction();
DROP INDEX projects_company_id_idx;
ALTER TABLE projects
  DROP COLUMN company_id,
  DROP COLUMN process_code,
  DROP COLUMN purpose,
  DROP COLUMN contract_amount,
  DROP COLUMN currency,
  DROP COLUMN amount_includes_vat,
  DROP COLUMN venues,
  DROP COLUMN term_text,
  DROP COLUMN contract_administrator,
  DROP COLUMN ficha_extraction_id;

ALTER TABLE tdr_documents RENAME CONSTRAINT tdr_documents_project_sha256_key TO tdr_documents_event_sha256_key;
ALTER TABLE tdr_documents RENAME CONSTRAINT tdr_documents_project_id_fkey    TO tdr_documents_event_id_fkey;
ALTER TABLE tdr_documents RENAME COLUMN project_id TO event_id;

ALTER TRIGGER projects_set_row_metadata ON projects RENAME TO events_set_row_metadata;
ALTER INDEX projects_client_id_idx RENAME TO events_client_id_idx;
ALTER TABLE projects RENAME CONSTRAINT projects_version_positive TO events_version_positive;
ALTER TABLE projects RENAME CONSTRAINT projects_dates_order      TO events_dates_order;
ALTER TABLE projects RENAME CONSTRAINT projects_name_not_blank   TO events_name_not_blank;
ALTER TABLE projects RENAME CONSTRAINT projects_client_id_fkey   TO events_client_id_fkey;
ALTER TABLE projects RENAME CONSTRAINT projects_pkey             TO events_pkey;
ALTER TABLE projects RENAME TO events;

DROP TABLE companies;
