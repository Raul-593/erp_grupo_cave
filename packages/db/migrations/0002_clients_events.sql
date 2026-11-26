-- Up Migration

CREATE TABLE clients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  tax_id      text,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT clients_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT clients_tax_id_not_blank CHECK (tax_id IS NULL OR btrim(tax_id) <> ''),
  CONSTRAINT clients_version_positive CHECK (version >= 1)
);

CREATE UNIQUE INDEX clients_tax_id_key ON clients (tax_id) WHERE tax_id IS NOT NULL;

CREATE TRIGGER clients_set_row_metadata
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE clients IS 'Clientes de la empresa.';
COMMENT ON COLUMN clients.tax_id IS 'RUC o cédula; único cuando se informa.';

CREATE TABLE events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL,
  name        text        NOT NULL,
  location    text,
  start_date  date,
  end_date    date,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,
  CONSTRAINT events_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE RESTRICT,
  CONSTRAINT events_name_not_blank   CHECK (btrim(name) <> ''),
  CONSTRAINT events_dates_order      CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT events_version_positive CHECK (version >= 1)
);

CREATE INDEX events_client_id_idx ON events (client_id);

CREATE TRIGGER events_set_row_metadata
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

COMMENT ON TABLE events IS 'Eventos asociados a un cliente.';
COMMENT ON COLUMN events.start_date IS 'Fecha operativa (America/Guayaquil).';
COMMENT ON COLUMN events.end_date IS 'Fecha operativa (America/Guayaquil).';

-- Down Migration
DROP TABLE events;
DROP TABLE clients;
