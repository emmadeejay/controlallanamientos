-- Destino autorizado: Allanamientos-Pruebas (obdmozyaxuqjpzoceelm).
-- Sin cambios de RLS, grants, owners, RPC, triggers ni auditoría existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Valida sólo el signo de cantidades, incluidas las representaciones heredadas.
-- No agrega máximos, NOT NULL ni nuevas restricciones de formato.
CREATE FUNCTION private.cantidades_detalle_no_negativas(p_detalle jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_tipo text := jsonb_typeof(p_detalle);
  v_valor jsonb;
  v_texto text;
BEGIN
  IF p_detalle IS NULL OR v_tipo = 'null' THEN RETURN true; END IF;
  IF v_tipo = 'number' THEN RETURN (p_detalle #>> '{}')::numeric >= 0; END IF;
  IF v_tipo = 'string' THEN
    v_texto := p_detalle #>> '{}';
    BEGIN
      RETURN v_texto::numeric >= 0;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Algunos lectores existentes admiten JSON serializado como texto.
      BEGIN
        v_valor := v_texto::jsonb;
      EXCEPTION WHEN invalid_text_representation THEN RETURN true;
      END;
      RETURN private.cantidades_detalle_no_negativas(v_valor);
    END;
  END IF;
  IF v_tipo = 'array' THEN
    FOR v_valor IN SELECT value FROM jsonb_array_elements(p_detalle) LOOP
      IF NOT private.cantidades_detalle_no_negativas(v_valor) THEN RETURN false; END IF;
    END LOOP;
  ELSIF v_tipo = 'object' THEN
    IF p_detalle ?| ARRAY['subtipo', 'tipo', 'categoria'] THEN
      RETURN private.cantidades_detalle_no_negativas(p_detalle -> 'cantidad')
         AND private.cantidades_detalle_no_negativas(p_detalle -> 'cant');
    END IF;
    FOR v_valor IN SELECT value FROM jsonb_each(p_detalle) LOOP
      IF NOT private.cantidades_detalle_no_negativas(v_valor) THEN RETURN false; END IF;
    END LOOP;
  END IF;
  RETURN true;
END;
$function$;

ALTER TABLE public.allanamiento_colaboraciones
  ADD CONSTRAINT cant_solicitada_no_negativa CHECK (cant_solicitada >= 0),
  ADD CONSTRAINT cant_afectada_no_negativa CHECK (cant_afectada >= 0);
ALTER TABLE public.allanamiento_secuestros
  ADD CONSTRAINT cantidad_no_negativa CHECK (cantidad >= 0);
ALTER TABLE public.allanamientos
  ADD CONSTRAINT objetivos_no_negativos CHECK (objetivos >= 0),
  ADD CONSTRAINT personal_propio_no_negativo CHECK (personal_propio >= 0),
  ADD CONSTRAINT personal_solicitado_no_negativo CHECK (personal_solicitado >= 0),
  ADD CONSTRAINT personal_afectado_no_negativo CHECK (personal_afectado >= 0),
  ADD CONSTRAINT armas_secuestradas_no_negativas CHECK (armas_secuestradas >= 0),
  ADD CONSTRAINT vehiculos_secuestrados_no_negativos CHECK (vehiculos_secuestrados >= 0),
  ADD CONSTRAINT detenidos_aprehendidos_cant_no_negativa CHECK (detenidos_aprehendidos_cant >= 0),
  ADD CONSTRAINT secuestro_armas_cantidades_no_negativas CHECK (private.cantidades_detalle_no_negativas(secuestro_armas)),
  ADD CONSTRAINT secuestro_vehiculos_cantidades_no_negativas CHECK (private.cantidades_detalle_no_negativas(secuestro_vehiculos)),
  ADD CONSTRAINT detenidos_aprehendidos_cantidades_no_negativas CHECK (private.cantidades_detalle_no_negativas(detenidos_aprehendidos));
COMMIT;
