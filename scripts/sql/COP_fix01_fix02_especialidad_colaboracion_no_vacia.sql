-- Candidato FIX-02. Aplicar exclusivamente en Allanamientos-Pruebas.
-- Impide colaboraciones sin una especialidad real, incluidas entradas por RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $precheck$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.allanamiento_colaboraciones
    WHERE especialidad IS NULL
       OR especialidad !~ '[^[:space:]]'
  ) THEN
    RAISE EXCEPTION 'Hay colaboraciones existentes sin especialidad no blanca; revisar antes de aplicar FIX-02.';
  END IF;
END;
$precheck$;

ALTER TABLE public.allanamiento_colaboraciones
  ADD CONSTRAINT especialidad_no_vacia
  CHECK (especialidad ~ '[^[:space:]]') NOT VALID;

ALTER TABLE public.allanamiento_colaboraciones
  VALIDATE CONSTRAINT especialidad_no_vacia;

COMMIT;
