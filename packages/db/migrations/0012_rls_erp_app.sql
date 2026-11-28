-- Up Migration
-- Seguridad en la base para Supabase (PLAN.md, parte S, decisión S-D7, aprobada el 2026-11-27).
-- RLS activado en todas las tablas del esquema: los roles de la API de Supabase (anon,
-- authenticated) no leen nada aunque alguien expusiera el esquema. La aplicación entra con el
-- rol erp_app, que tiene una política que le permite todo; el dueño de las tablas (el usuario de
-- las migraciones) no está sujeto a RLS. En una base local sin el rol erp_app solo se activa RLS
-- (el dueño sigue trabajando igual). No cambia datos.

DO $$
DECLARE
  v_table text;
  v_has_role boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app');
BEGIN
  FOR v_table IN
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'pgmigrations' ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
    IF v_has_role THEN
      EXECUTE format('CREATE POLICY erp_app_all ON %I TO erp_app USING (true) WITH CHECK (true)', v_table);
    END IF;
  END LOOP;
END;
$$;

-- Down Migration
DO $$
DECLARE
  v_table text;
BEGIN
  FOR v_table IN
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'pgmigrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS erp_app_all ON %I', v_table);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', v_table);
  END LOOP;
END;
$$;
