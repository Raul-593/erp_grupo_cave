-- Up Migration

CREATE TABLE tdr_extractions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tdr_document_id       uuid        NOT NULL,
  status                text        NOT NULL DEFAULT 'pending',
  idempotency_key       uuid        NOT NULL,
  provider              text        NOT NULL,
  model                 text        NOT NULL,
  prompt_version        text        NOT NULL,
  schema_version        text        NOT NULL,
  raw_response          jsonb,
  provider_response_id  text,
  provider_request_id   text,
  error_code            text,
  error_message         text,
  input_tokens          integer,
  output_tokens         integer,
  total_tokens          integer,
  started_at            timestamptz,
  finished_at           timestamptz,
  confirmed_at          timestamptz,
  duration_ms           integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               integer     NOT NULL DEFAULT 1,
  CONSTRAINT tdr_extractions_tdr_document_id_fkey FOREIGN KEY (tdr_document_id)
    REFERENCES tdr_documents (id) ON DELETE RESTRICT,
  CONSTRAINT tdr_extractions_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT tdr_extractions_status_valid CHECK (
    status IN ('pending', 'processing', 'processed', 'failed', 'confirmed', 'superseded')
  ),
  -- Proveedor y modelo son texto libre: se probarán modelos de distintas compañías.
  CONSTRAINT tdr_extractions_provider_format          CHECK (provider ~ '^[a-z0-9][a-z0-9_-]*$'),
  CONSTRAINT tdr_extractions_model_not_blank          CHECK (btrim(model) <> ''),
  CONSTRAINT tdr_extractions_prompt_version_not_blank CHECK (btrim(prompt_version) <> ''),
  CONSTRAINT tdr_extractions_schema_version_not_blank CHECK (btrim(schema_version) <> ''),
  CONSTRAINT tdr_extractions_raw_response_object CHECK (
    raw_response IS NULL OR jsonb_typeof(raw_response) = 'object'
  ),
  CONSTRAINT tdr_extractions_tokens_non_negative CHECK (
    (input_tokens IS NULL OR input_tokens >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
    AND (total_tokens IS NULL OR total_tokens >= 0)
  ),
  CONSTRAINT tdr_extractions_duration_non_negative CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT tdr_extractions_finished_after_started CHECK (
    started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at
  ),
  -- Coherencia entre estado y datos.
  CONSTRAINT tdr_extractions_failed_requires_error CHECK (status <> 'failed' OR error_code IS NOT NULL),
  CONSTRAINT tdr_extractions_result_requires_response CHECK (
    status NOT IN ('processed', 'confirmed', 'superseded') OR raw_response IS NOT NULL
  ),
  CONSTRAINT tdr_extractions_confirmed_requires_timestamp CHECK (
    status NOT IN ('confirmed', 'superseded') OR confirmed_at IS NOT NULL
  ),
  CONSTRAINT tdr_extractions_version_positive CHECK (version >= 1)
);

CREATE INDEX tdr_extractions_document_created_idx
  ON tdr_extractions (tdr_document_id, created_at DESC);

-- Como máximo una extracción confirmada (vigente) por documento.
CREATE UNIQUE INDEX tdr_extractions_one_confirmed_per_document
  ON tdr_extractions (tdr_document_id) WHERE status = 'confirmed';

-- Como máximo un procesamiento activo por documento.
CREATE UNIQUE INDEX tdr_extractions_one_active_per_document
  ON tdr_extractions (tdr_document_id) WHERE status IN ('pending', 'processing');

-- Invariantes: el JSON original y el documento no cambian; una confirmación solo
-- puede pasar a 'superseded'; 'superseded' es definitivo; lo confirmado no se borra.
CREATE FUNCTION protect_tdr_extraction() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('confirmed', 'superseded') THEN
      RAISE EXCEPTION 'No se puede eliminar la extracción % en estado %', OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.tdr_document_id IS DISTINCT FROM OLD.tdr_document_id THEN
    RAISE EXCEPTION 'No se puede cambiar el documento de la extracción %', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.raw_response IS NOT NULL AND NEW.raw_response IS DISTINCT FROM OLD.raw_response THEN
    RAISE EXCEPTION 'raw_response de la extracción % es inmutable', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'superseded' AND NEW.status <> 'superseded' THEN
    RAISE EXCEPTION 'La extracción % está reemplazada y no puede cambiar de estado', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'confirmed' AND NEW.status NOT IN ('confirmed', 'superseded') THEN
    RAISE EXCEPTION 'La extracción confirmada % solo puede pasar a superseded', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tdr_extractions_protect
  BEFORE UPDATE OR DELETE ON tdr_extractions
  FOR EACH ROW EXECUTE FUNCTION protect_tdr_extraction();

CREATE TRIGGER tdr_extractions_set_row_metadata
  BEFORE UPDATE ON tdr_extractions
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE tdr_extractions IS
  'Cada intento de procesamiento de un TDR con IA. El resultado es una propuesta, no un documento confirmado.';
COMMENT ON COLUMN tdr_extractions.status IS
  'pending | processing | processed | failed | confirmed | superseded';
COMMENT ON COLUMN tdr_extractions.provider IS
  'Proveedor de IA en minúsculas (p. ej. openai, anthropic, google). No se restringe a una lista fija.';
COMMENT ON COLUMN tdr_extractions.model IS
  'Identificador exacto del modelo usado en el intento, tal como lo informa el proveedor.';
COMMENT ON COLUMN tdr_extractions.idempotency_key IS
  'Identificador de operación enviado por el cliente; evita procesar dos veces por doble clic o reintento.';
COMMENT ON COLUMN tdr_extractions.raw_response IS
  'JSON original devuelto por la IA; inmutable una vez guardado.';
COMMENT ON COLUMN tdr_extractions.error_message IS
  'Mensaje seguro para el usuario; sin secretos ni detalles internos del proveedor.';

-- Down Migration
DROP TABLE tdr_extractions;
DROP FUNCTION protect_tdr_extraction();
