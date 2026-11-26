-- Up Migration

CREATE TABLE tdr_documents (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid        NOT NULL,
  storage_provider   text        NOT NULL,
  storage_key        text        NOT NULL,
  original_filename  text        NOT NULL,
  mime_type          text        NOT NULL,
  size_bytes         bigint      NOT NULL,
  sha256             text        NOT NULL,
  page_count         integer,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tdr_documents_event_id_fkey FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE RESTRICT,
  CONSTRAINT tdr_documents_storage_provider_valid CHECK (storage_provider IN ('local', 'supabase')),
  -- Clave relativa y opaca: sin rutas absolutas, unidades de Windows, barras invertidas ni "..".
  CONSTRAINT tdr_documents_storage_key_safe CHECK (
    btrim(storage_key) <> ''
    AND storage_key !~ '^/'
    AND storage_key !~ '^[A-Za-z]:'
    AND storage_key !~ '\\'
    AND storage_key !~ '(^|/)\.\.(/|$)'
  ),
  CONSTRAINT tdr_documents_original_filename_not_blank CHECK (btrim(original_filename) <> ''),
  CONSTRAINT tdr_documents_mime_type_pdf CHECK (mime_type = 'application/pdf'),
  CONSTRAINT tdr_documents_size_positive CHECK (size_bytes > 0),
  CONSTRAINT tdr_documents_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT tdr_documents_page_count_positive CHECK (page_count IS NULL OR page_count > 0),
  CONSTRAINT tdr_documents_storage_key_key UNIQUE (storage_provider, storage_key),
  -- También sirve como índice para consultar los documentos de un evento.
  CONSTRAINT tdr_documents_event_sha256_key UNIQUE (event_id, sha256)
);

COMMENT ON TABLE tdr_documents IS
  'Metadatos y referencia del PDF del TDR. El archivo vive en el almacenamiento privado, nunca en la base.';
COMMENT ON COLUMN tdr_documents.storage_key IS
  'Clave relativa dentro del proveedor de almacenamiento; no es una ruta del sistema de archivos.';
COMMENT ON COLUMN tdr_documents.sha256 IS
  'Hash SHA-256 en hexadecimal minúsculo; detecta duplicados dentro del mismo evento.';

-- Down Migration
DROP TABLE tdr_documents;
