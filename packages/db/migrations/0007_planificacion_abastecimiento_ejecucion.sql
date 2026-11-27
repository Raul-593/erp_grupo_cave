-- Up Migration
-- Vista previa de Planificación, Abastecimiento y Ejecución (AGENTS.md §2, decisión del
-- usuario, 2026-11-26). Solo añade tablas: no modifica ni borra nada existente.
-- Todo cuelga de ítems de una matriz confirmada. El modelo de órdenes, pagos y costos es
-- provisional y se rediseña en la Fase 6. Las migraciones 0001-0006 no se editan.

-- 1. Funciones compartidas -----------------------------------------------------------

CREATE FUNCTION tdr_item_project_id(p_item_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SET search_path FROM CURRENT
AS $$
  SELECT d.project_id
    FROM tdr_items i
    JOIN tdr_extractions x ON x.id = i.extraction_id
    JOIN tdr_documents d ON d.id = x.tdr_document_id
   WHERE i.id = p_item_id
$$;

COMMENT ON FUNCTION tdr_item_project_id(uuid) IS 'Proyecto al que pertenece un ítem de la matriz.';

-- Planificación, compras, ejecución y evidencias solo se registran sobre ítems de una
-- matriz confirmada (inmutable); así nunca quedan colgando de una fila que aún se edita.
CREATE FUNCTION require_confirmed_item() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT x.status INTO v_status
    FROM tdr_items i
    JOIN tdr_extractions x ON x.id = i.extraction_id
   WHERE i.id = NEW.tdr_item_id;

  -- Si el ítem no existe, la clave foránea rechazará la operación.
  IF FOUND AND v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'El ítem % pertenece a una matriz en estado %; debe estar confirmada', NEW.tdr_item_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- El ítem y su registro padre (actividad, orden o solicitud) deben ser del mismo proyecto.
-- Argumentos del trigger: tabla padre y columna de NEW que la referencia.
CREATE FUNCTION check_item_same_project() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_parent_id uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
  v_parent_project uuid;
  v_item_project uuid := tdr_item_project_id(NEW.tdr_item_id);
BEGIN
  EXECUTE format('SELECT project_id FROM %I WHERE id = $1', TG_ARGV[0])
     INTO v_parent_project
    USING v_parent_id;

  -- Si alguno no existe, la clave foránea rechazará la operación.
  IF v_parent_project IS NOT NULL AND v_item_project IS NOT NULL AND v_parent_project <> v_item_project THEN
    RAISE EXCEPTION 'El ítem % no pertenece al proyecto de % %', NEW.tdr_item_id, TG_ARGV[0], v_parent_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Proveedores ------------------------------------------------------------------------

CREATE TABLE suppliers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  kind        text        NOT NULL DEFAULT 'external',
  tax_id      text,
  notes       text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT suppliers_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT suppliers_kind_valid       CHECK (kind IN ('external', 'holding', 'payroll')),
  CONSTRAINT suppliers_tax_id_not_blank CHECK (tax_id IS NULL OR btrim(tax_id) <> ''),
  CONSTRAINT suppliers_version_positive CHECK (version >= 1)
);

CREATE UNIQUE INDEX suppliers_name_key ON suppliers (lower(btrim(name)));

CREATE TRIGGER suppliers_set_row_metadata
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE suppliers IS 'Proveedores. No se borran si tienen registros: se desactivan.';
COMMENT ON COLUMN suppliers.kind IS 'external: tercero | holding: empresa del grupo | payroll: nómina interna.';

-- 3. Planificación por ítem ---------------------------------------------------------------

CREATE TABLE item_plans (
  tdr_item_id      uuid          PRIMARY KEY,
  supplier_id      uuid,
  planned_cost     numeric(14,2),
  contract_status  text          NOT NULL DEFAULT 'pending',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  version          integer       NOT NULL DEFAULT 1,
  CONSTRAINT item_plans_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT item_plans_supplier_id_fkey FOREIGN KEY (supplier_id)
    REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT item_plans_planned_cost_non_negative CHECK (planned_cost IS NULL OR planned_cost >= 0),
  CONSTRAINT item_plans_contract_status_valid CHECK (contract_status IN ('not_required', 'pending', 'signed')),
  CONSTRAINT item_plans_version_positive CHECK (version >= 1)
);

CREATE INDEX item_plans_supplier_id_idx ON item_plans (supplier_id) WHERE supplier_id IS NOT NULL;

CREATE TRIGGER item_plans_require_confirmed_item
  BEFORE INSERT OR UPDATE OF tdr_item_id ON item_plans
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER item_plans_set_row_metadata
  BEFORE UPDATE ON item_plans
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE item_plans IS 'Planificación de cada ítem: proveedor adjudicado, costo asignado y contrato.';
COMMENT ON COLUMN item_plans.planned_cost IS 'Costo asignado al ítem, en la moneda del proyecto. No es precio al cliente.';
COMMENT ON COLUMN item_plans.contract_status IS 'not_required | pending | signed';

-- 4. Actividades (cronograma) ---------------------------------------------------------------

CREATE TABLE activities (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              uuid        NOT NULL,
  name                    text        NOT NULL,
  worker_id               uuid,
  whole_team              boolean     NOT NULL DEFAULT false,
  start_date              date        NOT NULL,
  end_date                date        NOT NULL,
  is_milestone            boolean     NOT NULL DEFAULT false,
  status                  text,
  depends_on_activity_id  uuid,
  sort_order              integer     NOT NULL DEFAULT 0,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 integer     NOT NULL DEFAULT 1,
  CONSTRAINT activities_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT activities_worker_id_fkey FOREIGN KEY (worker_id)
    REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT activities_depends_on_activity_id_fkey FOREIGN KEY (depends_on_activity_id)
    REFERENCES activities (id) ON DELETE RESTRICT,
  CONSTRAINT activities_name_not_blank      CHECK (btrim(name) <> ''),
  CONSTRAINT activities_dates_order         CHECK (end_date >= start_date),
  CONSTRAINT activities_status_valid        CHECK (status IS NULL OR status IN ('not_started', 'in_progress', 'done', 'delayed')),
  CONSTRAINT activities_team_or_worker      CHECK (NOT (whole_team AND worker_id IS NOT NULL)),
  CONSTRAINT activities_not_self_dependent  CHECK (depends_on_activity_id IS NULL OR depends_on_activity_id <> id),
  CONSTRAINT activities_version_positive    CHECK (version >= 1)
);

CREATE INDEX activities_project_start_idx ON activities (project_id, start_date, sort_order);
CREATE INDEX activities_worker_id_idx ON activities (worker_id) WHERE worker_id IS NOT NULL;

-- Una actividad solo depende de otra del mismo proyecto.
CREATE FUNCTION check_activity_dependency() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF NEW.depends_on_activity_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM activities a WHERE a.id = NEW.depends_on_activity_id AND a.project_id <> NEW.project_id
  ) THEN
    RAISE EXCEPTION 'La actividad % no puede depender de una actividad de otro proyecto', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER activities_check_dependency
  BEFORE INSERT OR UPDATE OF depends_on_activity_id, project_id ON activities
  FOR EACH ROW EXECUTE FUNCTION check_activity_dependency();

CREATE TRIGGER activities_set_row_metadata
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE activities IS 'Actividades del proyecto (cronograma). Cada una puede vincularse a varios ítems.';
COMMENT ON COLUMN activities.whole_team IS 'La ejecuta el equipo completo (sin responsable individual).';
COMMENT ON COLUMN activities.status IS 'not_started | in_progress | done | delayed; NULL si no se ha registrado.';
COMMENT ON COLUMN activities.start_date IS 'Fecha operativa (America/Guayaquil).';
COMMENT ON COLUMN activities.end_date IS 'Fecha operativa (America/Guayaquil), inclusive.';

CREATE TABLE activity_items (
  activity_id  uuid        NOT NULL,
  tdr_item_id  uuid        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_items_pkey PRIMARY KEY (activity_id, tdr_item_id),
  CONSTRAINT activity_items_activity_id_fkey FOREIGN KEY (activity_id)
    REFERENCES activities (id) ON DELETE RESTRICT,
  CONSTRAINT activity_items_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT
);

CREATE INDEX activity_items_tdr_item_id_idx ON activity_items (tdr_item_id);

CREATE TRIGGER activity_items_require_confirmed_item
  BEFORE INSERT OR UPDATE ON activity_items
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER activity_items_same_project
  BEFORE INSERT OR UPDATE ON activity_items
  FOR EACH ROW EXECUTE FUNCTION check_item_same_project('activities', 'activity_id');

COMMENT ON TABLE activity_items IS 'Ítems de la matriz de los que cuelga cada actividad.';

-- 5. Órdenes de compra y pagos (provisional hasta la Fase 6) -----------------------------

CREATE TABLE purchase_orders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL,
  code        text        NOT NULL,
  issued_on   date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT purchase_orders_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT purchase_orders_code_not_blank   CHECK (btrim(code) <> ''),
  CONSTRAINT purchase_orders_version_positive CHECK (version >= 1),
  -- También sirve como índice para listar las órdenes de un proyecto.
  CONSTRAINT purchase_orders_project_code_key UNIQUE (project_id, code)
);

CREATE TRIGGER purchase_orders_set_row_metadata
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE purchase_orders IS 'Órdenes de compra de un proyecto. El proveedor vive en la planificación de cada ítem.';

CREATE TABLE purchase_order_lines (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  uuid          NOT NULL,
  tdr_item_id        uuid          NOT NULL,
  amount             numeric(14,2) NOT NULL,
  paid_amount        numeric(14,2) NOT NULL DEFAULT 0,
  payment_worker_id  uuid,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  version            integer       NOT NULL DEFAULT 1,
  CONSTRAINT purchase_order_lines_purchase_order_id_fkey FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_payment_worker_id_fkey FOREIGN KEY (payment_worker_id)
    REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT purchase_order_lines_amount_non_negative      CHECK (amount >= 0),
  CONSTRAINT purchase_order_lines_paid_amount_non_negative CHECK (paid_amount >= 0),
  CONSTRAINT purchase_order_lines_version_positive         CHECK (version >= 1),
  -- Por ahora, un ítem pertenece a una sola orden.
  CONSTRAINT purchase_order_lines_tdr_item_id_key UNIQUE (tdr_item_id)
);

CREATE INDEX purchase_order_lines_purchase_order_id_idx ON purchase_order_lines (purchase_order_id);

CREATE TRIGGER purchase_order_lines_require_confirmed_item
  BEFORE INSERT OR UPDATE OF tdr_item_id ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER purchase_order_lines_same_project
  BEFORE INSERT OR UPDATE OF tdr_item_id, purchase_order_id ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION check_item_same_project('purchase_orders', 'purchase_order_id');

CREATE TRIGGER purchase_order_lines_set_row_metadata
  BEFORE UPDATE ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE purchase_order_lines IS 'Ítem comprado dentro de una orden, con lo comprometido y lo pagado.';
COMMENT ON COLUMN purchase_order_lines.amount IS 'Costo comprometido del ítem en la orden.';
COMMENT ON COLUMN purchase_order_lines.paid_amount IS
  'Pagado del ítem (dato registrado). El estado de pago se calcula; todavía no se concilia con payments (Fase 6).';
COMMENT ON COLUMN purchase_order_lines.payment_worker_id IS 'Responsable del pago.';

CREATE TABLE payments (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  uuid          NOT NULL,
  paid_on            date          NOT NULL,
  concept            text          NOT NULL,
  method             text          NOT NULL,
  amount             numeric(14,2) NOT NULL,
  support            text          NOT NULL,
  notes              text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  version            integer       NOT NULL DEFAULT 1,
  CONSTRAINT payments_purchase_order_id_fkey FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders (id) ON DELETE RESTRICT,
  CONSTRAINT payments_concept_not_blank CHECK (btrim(concept) <> ''),
  CONSTRAINT payments_method_valid      CHECK (method IN ('transfer', 'cash', 'check', 'internal')),
  CONSTRAINT payments_amount_positive   CHECK (amount > 0),
  CONSTRAINT payments_support_valid     CHECK (support IN ('invoice_and_receipt', 'internal_invoice', 'none')),
  CONSTRAINT payments_version_positive  CHECK (version >= 1)
);

CREATE INDEX payments_purchase_order_paid_on_idx ON payments (purchase_order_id, paid_on);

CREATE TRIGGER payments_set_row_metadata
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE payments IS 'Pagos registrados contra una orden de compra.';
COMMENT ON COLUMN payments.method IS 'transfer | cash | check | internal (entre empresas del holding)';
COMMENT ON COLUMN payments.support IS 'Respaldo: invoice_and_receipt | internal_invoice | none (sin factura)';

-- 6. Solicitudes de cotización ---------------------------------------------------------------

CREATE TABLE quote_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL,
  supplier_id  uuid        NOT NULL,
  rubro        text        NOT NULL,
  sent_on      date,
  status       text        NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  CONSTRAINT quote_requests_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT quote_requests_supplier_id_fkey FOREIGN KEY (supplier_id)
    REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT quote_requests_rubro_not_blank   CHECK (btrim(rubro) <> ''),
  CONSTRAINT quote_requests_status_valid      CHECK (status IN ('quoted', 'no_response', 'manual_proforma')),
  CONSTRAINT quote_requests_version_positive  CHECK (version >= 1),
  -- También sirve como índice para listar las solicitudes de un proyecto.
  CONSTRAINT quote_requests_project_supplier_rubro_key UNIQUE (project_id, supplier_id, rubro)
);

CREATE INDEX quote_requests_supplier_id_idx ON quote_requests (supplier_id);

CREATE TRIGGER quote_requests_set_row_metadata
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE quote_requests IS 'Solicitud de cotización de un rubro a un proveedor.';
COMMENT ON COLUMN quote_requests.status IS 'quoted | no_response | manual_proforma (proforma cargada a mano)';

CREATE TABLE quote_lines (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id  uuid          NOT NULL,
  tdr_item_id       uuid          NOT NULL,
  amount            numeric(14,2) NOT NULL,
  awarded           boolean       NOT NULL DEFAULT false,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  version           integer       NOT NULL DEFAULT 1,
  CONSTRAINT quote_lines_quote_request_id_fkey FOREIGN KEY (quote_request_id)
    REFERENCES quote_requests (id) ON DELETE RESTRICT,
  CONSTRAINT quote_lines_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT quote_lines_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT quote_lines_version_positive    CHECK (version >= 1),
  CONSTRAINT quote_lines_request_item_key UNIQUE (quote_request_id, tdr_item_id)
);

-- Como máximo una cotización elegida por ítem.
CREATE UNIQUE INDEX quote_lines_one_awarded_per_item ON quote_lines (tdr_item_id) WHERE awarded;
CREATE INDEX quote_lines_tdr_item_id_idx ON quote_lines (tdr_item_id);

CREATE TRIGGER quote_lines_require_confirmed_item
  BEFORE INSERT OR UPDATE OF tdr_item_id ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER quote_lines_same_project
  BEFORE INSERT OR UPDATE OF tdr_item_id, quote_request_id ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION check_item_same_project('quote_requests', 'quote_request_id');

CREATE TRIGGER quote_lines_set_row_metadata
  BEFORE UPDATE ON quote_lines
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE quote_lines IS 'Valor total cotizado por un proveedor para un ítem (comparativo).';
COMMENT ON COLUMN quote_lines.amount IS 'Total del ítem cotizado (no precio unitario).';

-- 7. Ejecución ---------------------------------------------------------------------------------

CREATE TABLE item_execution (
  tdr_item_id   uuid        PRIMARY KEY,
  mount_status  text        NOT NULL DEFAULT 'not_started',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer     NOT NULL DEFAULT 1,
  CONSTRAINT item_execution_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT item_execution_mount_status_valid CHECK (
    mount_status IN ('not_started', 'in_warehouse', 'on_site', 'mounted', 'tested', 'in_event', 'dismounted')
  ),
  CONSTRAINT item_execution_version_positive CHECK (version >= 1)
);

CREATE TRIGGER item_execution_require_confirmed_item
  BEFORE INSERT OR UPDATE OF tdr_item_id ON item_execution
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER item_execution_set_row_metadata
  BEFORE UPDATE ON item_execution
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE item_execution IS 'Estado de montaje de cada ítem durante la ejecución.';
COMMENT ON COLUMN item_execution.mount_status IS
  'not_started | in_warehouse | on_site | mounted | tested | in_event | dismounted (en ese orden)';

CREATE TABLE pre_event_checks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL,
  description  text        NOT NULL,
  worker_id    uuid,
  due_at       timestamptz,
  result       text        NOT NULL DEFAULT 'pending',
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      integer     NOT NULL DEFAULT 1,
  CONSTRAINT pre_event_checks_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT pre_event_checks_worker_id_fkey FOREIGN KEY (worker_id)
    REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT pre_event_checks_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT pre_event_checks_result_valid          CHECK (result IN ('pending', 'pass', 'fail')),
  CONSTRAINT pre_event_checks_version_positive      CHECK (version >= 1)
);

CREATE INDEX pre_event_checks_project_idx ON pre_event_checks (project_id, sort_order);
CREATE INDEX pre_event_checks_worker_id_idx ON pre_event_checks (worker_id) WHERE worker_id IS NOT NULL;

CREATE TRIGGER pre_event_checks_set_row_metadata
  BEFORE UPDATE ON pre_event_checks
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE pre_event_checks IS 'Checklist previo al evento.';
COMMENT ON COLUMN pre_event_checks.result IS 'pending | pass (cumple) | fail (no cumple)';

-- 8. Evidencias fotográficas ---------------------------------------------------------------

CREATE TABLE item_evidences (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tdr_item_id        uuid        NOT NULL,
  storage_provider   text        NOT NULL,
  storage_key        text        NOT NULL,
  original_filename  text        NOT NULL,
  mime_type          text        NOT NULL,
  size_bytes         bigint      NOT NULL,
  sha256             text        NOT NULL,
  description        text,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  version            integer     NOT NULL DEFAULT 1,
  CONSTRAINT item_evidences_tdr_item_id_fkey FOREIGN KEY (tdr_item_id)
    REFERENCES tdr_items (id) ON DELETE RESTRICT,
  CONSTRAINT item_evidences_storage_provider_valid CHECK (storage_provider IN ('local', 'supabase')),
  -- Misma regla que tdr_documents_storage_key_safe.
  CONSTRAINT item_evidences_storage_key_safe CHECK (
    btrim(storage_key) <> ''
    AND storage_key !~ '^/'
    AND storage_key !~ '^[A-Za-z]:'
    AND storage_key !~ '\\'
    AND storage_key !~ '(^|/)\.\.(/|$)'
  ),
  CONSTRAINT item_evidences_original_filename_not_blank CHECK (btrim(original_filename) <> ''),
  CONSTRAINT item_evidences_mime_type_image CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT item_evidences_size_positive   CHECK (size_bytes > 0),
  CONSTRAINT item_evidences_sha256_format   CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT item_evidences_description_not_blank CHECK (description IS NULL OR btrim(description) <> ''),
  CONSTRAINT item_evidences_version_positive CHECK (version >= 1),
  CONSTRAINT item_evidences_storage_key_key UNIQUE (storage_provider, storage_key),
  -- También sirve como índice para listar las fotografías de un ítem.
  CONSTRAINT item_evidences_item_sha256_key UNIQUE (tdr_item_id, sha256)
);

CREATE TRIGGER item_evidences_require_confirmed_item
  BEFORE INSERT OR UPDATE OF tdr_item_id ON item_evidences
  FOR EACH ROW EXECUTE FUNCTION require_confirmed_item();

CREATE TRIGGER item_evidences_set_row_metadata
  BEFORE UPDATE ON item_evidences
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE item_evidences IS
  'Fotografías de evidencia de un ítem. El archivo vive en el almacenamiento privado, nunca en la base.';
COMMENT ON COLUMN item_evidences.storage_key IS
  'Clave relativa dentro del proveedor de almacenamiento; no es una ruta del sistema de archivos.';
COMMENT ON COLUMN item_evidences.sha256 IS
  'Hash SHA-256 en hexadecimal minúsculo; detecta la misma fotografía repetida en el ítem.';

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario.
DROP TABLE item_evidences;
DROP TABLE pre_event_checks;
DROP TABLE item_execution;
DROP TABLE quote_lines;
DROP TABLE quote_requests;
DROP TABLE payments;
DROP TABLE purchase_order_lines;
DROP TABLE purchase_orders;
DROP TABLE activity_items;
DROP TABLE activities;
DROP FUNCTION check_activity_dependency();
DROP TABLE item_plans;
DROP TABLE suppliers;
DROP FUNCTION check_item_same_project();
DROP FUNCTION require_confirmed_item();
DROP FUNCTION tdr_item_project_id(uuid);
