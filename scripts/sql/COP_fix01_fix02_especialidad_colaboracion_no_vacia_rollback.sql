-- Rollback exclusivo del constraint agregado por COP_fix01_fix02_especialidad_colaboracion_no_vacia.sql.
-- Ejecutar únicamente en Allanamientos-Pruebas y con autorización explícita.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.allanamiento_colaboraciones
  DROP CONSTRAINT especialidad_no_vacia;

COMMIT;
