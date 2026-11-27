-- Up Migration
-- Reparto de pagos (PLAN.md, «reparto de pagos», decisiones R-1 a R-5 del 2026-11-27).
-- Lo pagado de cada ítem deja de escribirse a mano: es la suma de lo que los pagos le asignan.
-- Solo añade una tabla, una restricción y triggers; no borra columnas ni datos. Los valores
-- escritos a mano antes de esta migración se convierten con un script aparte, no aquí.
-- Modelo provisional hasta la Fase 6. Las migraciones 0001-0007 no se editan.

-- 1. Reparto de cada pago entre los ítems de su orden ------------------------------------

CREATE TABLE payment_allocations (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id              uuid          NOT NULL,
  purchase_order_line_id  uuid          NOT NULL,
  amount                  numeric(14,2) NOT NULL,
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  version                 integer       NOT NULL DEFAULT 1,
  CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id)
    REFERENCES payments (id) ON DELETE RESTRICT,
  CONSTRAINT payment_allocations_purchase_order_line_id_fkey FOREIGN KEY (purchase_order_line_id)
    REFERENCES purchase_order_lines (id) ON DELETE RESTRICT,
  CONSTRAINT payment_allocations_amount_positive  CHECK (amount > 0),
  CONSTRAINT payment_allocations_version_positive CHECK (version >= 1),
  -- También sirve como índice para leer el reparto de un pago.
  CONSTRAINT payment_allocations_payment_line_key UNIQUE (payment_id, purchase_order_line_id)
);

CREATE INDEX payment_allocations_purchase_order_line_id_idx ON payment_allocations (purchase_order_line_id);

COMMENT ON TABLE payment_allocations IS
  'Parte de un pago asignada a un ítem (línea) de su misma orden. Un pago puede quedar repartido solo en parte.';
COMMENT ON COLUMN payment_allocations.amount IS 'Importe del pago que corresponde a ese ítem.';

-- Reglas del reparto. Bloquea el pago y la línea para que dos repartos simultáneos no pasen
-- la validación a la vez. El nombre de restricción identifica la regla incumplida.
CREATE FUNCTION check_payment_allocation() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_payment_order  uuid;
  v_payment_amount numeric(14,2);
  v_line_order     uuid;
  v_line_amount    numeric(14,2);
  v_others         numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.payment_id <> OLD.payment_id OR NEW.purchase_order_line_id <> OLD.purchase_order_line_id) THEN
    RAISE EXCEPTION 'Un reparto no cambia de pago ni de ítem: se elimina y se crea otro'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_keys_immutable';
  END IF;

  SELECT p.purchase_order_id, p.amount INTO v_payment_order, v_payment_amount
    FROM payments p WHERE p.id = NEW.payment_id FOR UPDATE;
  SELECT l.purchase_order_id, l.amount INTO v_line_order, v_line_amount
    FROM purchase_order_lines l WHERE l.id = NEW.purchase_order_line_id FOR UPDATE;

  -- Sin pago o sin línea no hay nada que validar: se rechaza aquí, con el mismo código y
  -- nombre que la clave foránea, en lugar de dejar pasar la fila sin comprobar.
  IF v_payment_order IS NULL THEN
    RAISE EXCEPTION 'El pago % no existe', NEW.payment_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'payment_allocations_payment_id_fkey';
  END IF;
  IF v_line_order IS NULL THEN
    RAISE EXCEPTION 'La línea % no existe', NEW.purchase_order_line_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'payment_allocations_purchase_order_line_id_fkey';
  END IF;

  IF v_payment_order <> v_line_order THEN
    RAISE EXCEPTION 'El pago % y la línea % son de órdenes distintas', NEW.payment_id, NEW.purchase_order_line_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_same_order';
  END IF;

  SELECT COALESCE(sum(a.amount), 0) INTO v_others
    FROM payment_allocations a WHERE a.payment_id = NEW.payment_id AND a.id <> NEW.id;
  IF v_others + NEW.amount > v_payment_amount THEN
    RAISE EXCEPTION 'El reparto del pago % supera su monto', NEW.payment_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_within_payment';
  END IF;

  SELECT COALESCE(sum(a.amount), 0) INTO v_others
    FROM payment_allocations a WHERE a.purchase_order_line_id = NEW.purchase_order_line_id AND a.id <> NEW.id;
  IF v_others + NEW.amount > v_line_amount THEN
    RAISE EXCEPTION 'Lo pagado de la línea % superaría su costo', NEW.purchase_order_line_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_within_line';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_allocations_check
  BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION check_payment_allocation();

CREATE TRIGGER payment_allocations_set_row_metadata
  BEFORE UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION set_row_metadata();

-- 2. Lo pagado de la línea es un valor calculado --------------------------------------------

-- Recalcula purchase_order_lines.paid_amount como la suma de sus repartos.
CREATE FUNCTION sync_line_paid_amount() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_line_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_order_line_id ELSE NEW.purchase_order_line_id END;
BEGIN
  UPDATE purchase_order_lines l
     SET paid_amount = t.total
    FROM (SELECT COALESCE(sum(a.amount), 0)::numeric(14,2) AS total
            FROM payment_allocations a
           WHERE a.purchase_order_line_id = v_line_id) t
   WHERE l.id = v_line_id AND l.paid_amount <> t.total;
  RETURN NULL;
END;
$$;

CREATE TRIGGER payment_allocations_sync_line
  AFTER INSERT OR UPDATE OF amount OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION sync_line_paid_amount();

-- Nada más puede escribir lo pagado: debe coincidir siempre con la suma de los repartos.
-- Además, un ítem con pagos repartidos no cambia de orden (el reparto es de la misma orden).
CREATE FUNCTION check_line_paid_amount() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_allocated numeric;
BEGIN
  SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
    FROM payment_allocations a WHERE a.purchase_order_line_id = NEW.id;

  IF TG_OP = 'UPDATE' AND NEW.purchase_order_id <> OLD.purchase_order_id AND v_allocated > 0 THEN
    RAISE EXCEPTION 'La línea % tiene pagos repartidos y no puede cambiar de orden', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_order_lines_order_locked';
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.paid_amount <> OLD.paid_amount) AND NEW.paid_amount <> v_allocated THEN
    RAISE EXCEPTION 'Lo pagado de la línea % se calcula a partir de los pagos; no se escribe directamente', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_order_lines_paid_amount_derived';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_order_lines_check_paid_amount
  BEFORE INSERT OR UPDATE OF paid_amount, purchase_order_id ON purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION check_line_paid_amount();

-- La regla «lo pagado no supera el costo» pasa a estar también en la base.
ALTER TABLE purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_paid_within_amount CHECK (paid_amount <= amount);

COMMENT ON COLUMN purchase_order_lines.paid_amount IS
  'Pagado del ítem: valor calculado, suma de payment_allocations. Lo mantiene un trigger; no se escribe directamente.';

-- 3. Protecciones de los pagos ya repartidos ---------------------------------------------------

CREATE FUNCTION check_payment_allocated() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  v_allocated numeric;
BEGIN
  SELECT COALESCE(sum(a.amount), 0) INTO v_allocated
    FROM payment_allocations a WHERE a.payment_id = NEW.id;

  IF NEW.purchase_order_id <> OLD.purchase_order_id AND v_allocated > 0 THEN
    RAISE EXCEPTION 'El pago % está repartido y no puede cambiar de orden', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_order_locked';
  END IF;

  IF NEW.amount < v_allocated THEN
    RAISE EXCEPTION 'El monto del pago % no puede ser menor que lo ya repartido', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_amount_covers_allocations';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_check_allocated
  BEFORE UPDATE OF amount, purchase_order_id ON payments
  FOR EACH ROW EXECUTE FUNCTION check_payment_allocated();

-- Down Migration
-- Contiene DROP: solo con autorización expresa del usuario. Tras revertir, paid_amount conserva
-- el último valor calculado y vuelve a ser un dato escrito a mano.
DROP TRIGGER payments_check_allocated ON payments;
DROP FUNCTION check_payment_allocated();
ALTER TABLE purchase_order_lines DROP CONSTRAINT purchase_order_lines_paid_within_amount;
DROP TRIGGER purchase_order_lines_check_paid_amount ON purchase_order_lines;
DROP FUNCTION check_line_paid_amount();
DROP TABLE payment_allocations;
DROP FUNCTION sync_line_paid_amount();
DROP FUNCTION check_payment_allocation();
COMMENT ON COLUMN purchase_order_lines.paid_amount IS
  'Pagado del ítem (dato registrado). El estado de pago se calcula; todavía no se concilia con payments (Fase 6).';
