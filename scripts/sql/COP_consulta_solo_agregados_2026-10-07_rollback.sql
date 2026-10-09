-- Revierte sólo la migración de Consulta agregada. Ejecutar en orden inverso.

BEGIN;

CREATE OR REPLACE FUNCTION public.metricas_allanamientos_semana(p_semana_inicio date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_resultado jsonb;
  v_positivos integer := 0;
  v_informados integer := 0;
  v_sin_informar integer := 0;
begin
  if not private.usuario_actual_puede_consultar_allanamientos() then
    raise exception 'No tenés permisos para consultar métricas de allanamientos.';
  end if;

  v_resultado := public.metricas_allanamientos_semana_base_20260930(p_semana_inicio);

  select
    count(*) filter (where a.resultado_medida = 'Positivo')::integer,
    count(*) filter (where a.resultado_medida <> 'Sin informar')::integer,
    count(*) filter (where a.resultado_medida = 'Sin informar')::integer
  into v_positivos, v_informados, v_sin_informar
  from public.allanamientos a
  where a.fecha_ejecucion between p_semana_inicio and (p_semana_inicio + 6);

  return v_resultado || jsonb_build_object(
    'efectividad', case
      when v_informados = 0 then 0
      else round((v_positivos::numeric / v_informados) * 100)::integer
    end,
    'resultados_informados', v_informados,
    'resultados_sin_informar', v_sin_informar
  );
end;
$function$;
ALTER FUNCTION public.metricas_allanamientos_semana(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.metricas_allanamientos_semana(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metricas_allanamientos_semana(date) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.metricas_allanamientos_semana_base_20260930(p_semana_inicio date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_semana_fin date := p_semana_inicio + 6;
  v_mes_inicio date := date_trunc('month', private.hoy_argentina())::date;
  v_mes_fin date := (date_trunc('month', private.hoy_argentina()) + interval '1 month - 1 day')::date;
  v_total_semana integer := 0;
  v_total_mes integer := 0;
  v_positivos integer := 0;
  v_armas_semana integer := 0;
  v_vehiculos_semana integer := 0;
  v_personas_semana integer := 0;
  v_armas_mes integer := 0;
  v_vehiculos_mes integer := 0;
  v_personas_mes integer := 0;
  v_armas jsonb := '{}'::jsonb;
  v_vehiculos jsonb := '{}'::jsonb;
  v_personas jsonb := '{}'::jsonb;
  v_evolucion jsonb := '[]'::jsonb;
  v_partidos jsonb := '[]'::jsonb;
  v_superintendencias jsonb := '[]'::jsonb;
  v_especialidades jsonb := '[]'::jsonb;
begin
  if not private.usuario_actual_puede_consultar_allanamientos() then
    raise exception 'No tenés permisos para consultar métricas de allanamientos.';
  end if;

  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La semana debe comenzar un lunes.';
  end if;

  select
    count(*)::integer,
    count(*) filter (where lower(coalesce(a.resultado_medida, '')) = 'positivo')::integer,
    coalesce(sum(a.armas_secuestradas), 0)::integer,
    coalesce(sum(a.vehiculos_secuestrados), 0)::integer,
    coalesce(sum(a.detenidos_aprehendidos_cant), 0)::integer
  into v_total_semana, v_positivos, v_armas_semana, v_vehiculos_semana, v_personas_semana
  from public.allanamientos a
  where a.fecha_ejecucion between p_semana_inicio and v_semana_fin;

  select
    count(*)::integer,
    coalesce(sum(a.armas_secuestradas), 0)::integer,
    coalesce(sum(a.vehiculos_secuestrados), 0)::integer,
    coalesce(sum(a.detenidos_aprehendidos_cant), 0)::integer
  into v_total_mes, v_armas_mes, v_vehiculos_mes, v_personas_mes
  from public.allanamientos a
  where a.fecha_ejecucion between v_mes_inicio and v_mes_fin;

  select coalesce(jsonb_object_agg(x.subtipo, x.total), '{}'::jsonb)
  into v_armas
  from (
    select
      case lower(trim(e.elemento ->> 'subtipo'))
        when 'corta' then 'Arma Corta'
        when 'arma corta' then 'Arma Corta'
        when 'larga' then 'Arma Larga'
        when 'arma larga' then 'Arma Larga'
        when 'blanca' then 'Arma Blanca'
        when 'arma blanca' then 'Arma Blanca'
        when 'replica' then 'Réplica'
        when 'réplica' then 'Réplica'
        else coalesce(nullif(trim(e.elemento ->> 'subtipo'), ''), 'Sin especificar')
      end as subtipo,
      sum(greatest(0, coalesce((e.elemento ->> 'cantidad')::integer, 0)))::integer as total
    from public.allanamientos a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(coalesce(a.secuestro_armas, '[]'::jsonb)) = 'array'
        then coalesce(a.secuestro_armas, '[]'::jsonb) else '[]'::jsonb end
    ) e(elemento)
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by 1
  ) x;

  select coalesce(jsonb_object_agg(x.subtipo, x.total), '{}'::jsonb)
  into v_vehiculos
  from (
    select
      case lower(trim(e.elemento ->> 'subtipo'))
        when 'auto' then 'Auto'
        when 'autos' then 'Auto'
        when 'moto' then 'Moto'
        when 'motos' then 'Moto'
        when 'camioneta' then 'Camioneta'
        when 'camionetas' then 'Camioneta'
        when 'otros' then 'Otros'
        else coalesce(nullif(trim(e.elemento ->> 'subtipo'), ''), 'Otros')
      end as subtipo,
      sum(greatest(0, coalesce((e.elemento ->> 'cantidad')::integer, 0)))::integer as total
    from public.allanamientos a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(coalesce(a.secuestro_vehiculos, '[]'::jsonb)) = 'array'
        then coalesce(a.secuestro_vehiculos, '[]'::jsonb) else '[]'::jsonb end
    ) e(elemento)
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by 1
  ) x;

  select coalesce(jsonb_object_agg(x.subtipo, x.total), '{}'::jsonb)
  into v_personas
  from (
    select
      case lower(trim(e.elemento ->> 'subtipo'))
        when 'detenido' then 'Detenido'
        when 'detenidos' then 'Detenido'
        when 'aprehendido' then 'Aprehendido'
        when 'aprehendidos' then 'Aprehendido'
        else coalesce(nullif(trim(e.elemento ->> 'subtipo'), ''), 'Sin especificar')
      end as subtipo,
      sum(greatest(0, coalesce((e.elemento ->> 'cantidad')::integer, 0)))::integer as total
    from public.allanamientos a
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(coalesce(a.detenidos_aprehendidos, '[]'::jsonb)) = 'array'
        then coalesce(a.detenidos_aprehendidos, '[]'::jsonb) else '[]'::jsonb end
    ) e(elemento)
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', to_char(s.inicio, 'DD/MM'),
    'total', (
      select count(*)::integer from public.allanamientos a
      where a.fecha_ejecucion between s.inicio and (s.inicio + 6)
    )
  ) order by s.inicio), '[]'::jsonb)
  into v_evolucion
  from (
    select (p_semana_inicio - (n * 7))::date as inicio
    from generate_series(3, 0, -1) n
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object('name', x.nombre, 'total', x.total) order by x.total desc, x.nombre), '[]'::jsonb)
  into v_partidos
  from (
    select coalesce(nullif(trim(a.partido), ''), 'Sin especificar') as nombre, count(*)::integer as total
    from public.allanamientos a
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by 1 order by 2 desc, 1 limit 5
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('name', x.nombre, 'total', x.total) order by x.total desc, x.nombre), '[]'::jsonb)
  into v_superintendencias
  from (
    select s.nombre, count(*)::integer as total
    from public.allanamientos a
    join public.superintendencias s on s.id = a.superintendencia_id
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by s.id, s.nombre order by 2 desc, 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('name', x.nombre, 'total', x.total) order by x.total desc, x.nombre), '[]'::jsonb)
  into v_especialidades
  from (
    select
      coalesce(nullif(trim(c.especialidad), ''), 'Sin especificar') as nombre,
      coalesce(sum(c.cant_afectada), 0)::integer as total
    from public.allanamiento_colaboraciones c
    join public.allanamientos a on a.id = c.allanamiento_id
    where a.fecha_ejecucion between p_semana_inicio and v_semana_fin
    group by 1 order by 2 desc, 1 limit 5
  ) x;

  return jsonb_build_object(
    'semana_desde', p_semana_inicio,
    'semana_hasta', v_semana_fin,
    'mes_desde', v_mes_inicio,
    'mes_hasta', v_mes_fin,
    'rendicion_semanal', v_total_semana,
    'total_mensual', v_total_mes,
    'efectividad', case when v_total_semana = 0 then 0 else round((v_positivos::numeric / v_total_semana) * 100)::integer end,
    'armas_semana', v_armas_semana,
    'vehiculos_semana', v_vehiculos_semana,
    'personas_semana', v_personas_semana,
    'armas_mes', v_armas_mes,
    'vehiculos_mes', v_vehiculos_mes,
    'personas_mes', v_personas_mes,
    'desglose_armas', v_armas,
    'desglose_vehiculos', v_vehiculos,
    'desglose_personas', v_personas,
    'evolucion', v_evolucion,
    'partidos', v_partidos,
    'superintendencias', v_superintendencias,
    'especialidades', v_especialidades
  );
end;
$function$;
ALTER FUNCTION public.metricas_allanamientos_semana_base_20260930(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.metricas_allanamientos_semana_base_20260930(date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metricas_allanamientos_semana_base_20260930(date) TO service_role;


DROP FUNCTION private.metricas_consulta_solo_agregados(jsonb);

DROP FUNCTION private.usuario_actual_puede_ver_metricas_allanamientos();

COMMIT;
