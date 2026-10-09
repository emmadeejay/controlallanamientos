-- Ejecutar únicamente en Allanamientos-Pruebas (obdmozyaxuqjpzoceelm).
-- Revierte exactamente los objetos agregados por negativos-aplicar.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.allanamiento_colaboraciones
  DROP CONSTRAINT cant_solicitada_no_negativa,
  DROP CONSTRAINT cant_afectada_no_negativa;
ALTER TABLE public.allanamiento_secuestros DROP CONSTRAINT cantidad_no_negativa;
ALTER TABLE public.allanamientos
  DROP CONSTRAINT objetivos_no_negativos,
  DROP CONSTRAINT personal_propio_no_negativo,
  DROP CONSTRAINT personal_solicitado_no_negativo,
  DROP CONSTRAINT personal_afectado_no_negativo,
  DROP CONSTRAINT armas_secuestradas_no_negativas,
  DROP CONSTRAINT vehiculos_secuestrados_no_negativos,
  DROP CONSTRAINT detenidos_aprehendidos_cant_no_negativa,
  DROP CONSTRAINT secuestro_armas_cantidades_no_negativas,
  DROP CONSTRAINT secuestro_vehiculos_cantidades_no_negativas,
  DROP CONSTRAINT detenidos_aprehendidos_cantidades_no_negativas;
DROP FUNCTION private.cantidades_detalle_no_negativas(jsonb);
COMMIT;
