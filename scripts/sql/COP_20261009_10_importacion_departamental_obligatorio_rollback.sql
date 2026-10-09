BEGIN;

create or replace function public.prevalidar_importacion_historica_allanamientos(
  p_semana_inicio date,
  p_filas jsonb
)
returns table (
  indice integer,
  fila_origen integer,
  estado text,
  errores text[],
  advertencias text[],
  coincidencias_probables integer,
  huella_contenido text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_semana_fin date := p_semana_inicio + 6;
  v_fila jsonb;
  v_indice integer := 0;
  v_errores text[];
  v_advertencias text[];
  v_fecha_ejecucion date;
  v_fecha_solicitud date;
  v_superintendencia_id uuid;
  v_resultado_medida text;
  v_resultado_secuestros text;
  v_huella text;
  v_repeticiones_archivo integer;
  v_coincidencias integer;
  v_exacto_existente boolean;
begin
  if not private.usuario_actual_es_administrador() then
    raise exception 'No tenés permisos para prevalidar importaciones históricas.';
  end if;

  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1 then
    raise exception 'La semana debe comenzar un lunes.';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'El lote histórico no tiene un formato válido.';
  end if;

  if jsonb_array_length(p_filas) = 0 or jsonb_array_length(p_filas) > 1500 then
    raise exception 'El lote debe contener entre 1 y 1500 allanamientos.';
  end if;

  for v_fila in select value from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_errores := array[]::text[];
    v_advertencias := array[]::text[];
    v_fecha_ejecucion := null;
    v_fecha_solicitud := null;
    v_superintendencia_id := null;

    begin
      v_fecha_ejecucion := nullif(v_fila ->> 'fecha_ejecucion', '')::date;
    exception when others then
      v_errores := array_append(v_errores, 'La fecha de ejecución no es válida.');
    end;

    begin
      v_fecha_solicitud := nullif(v_fila ->> 'fecha_solicitud', '')::date;
    exception when others then
      v_errores := array_append(v_errores, 'La fecha de solicitud no es válida.');
    end;

    begin
      v_superintendencia_id := nullif(v_fila ->> 'superintendencia_id', '')::uuid;
    exception when others then
      v_errores := array_append(v_errores, 'La superintendencia no es válida.');
    end;

    if nullif(trim(coalesce(v_fila ->> 'registro_id', '')), '') is null then
      v_errores := array_append(v_errores, 'Falta REGISTRO_ID.');
    end if;

    if v_superintendencia_id is null or not exists (
      select 1 from public.superintendencias s
      where s.id = v_superintendencia_id and s.activa = true
    ) then
      v_errores := array_append(v_errores, 'La superintendencia no coincide con el padrón activo.');
    end if;

    if nullif(trim(coalesce(v_fila ->> 'numero_ipp', '')), '') is null then
      v_errores := array_append(v_errores, 'Falta el número de IPP o causa.');
    end if;

    if nullif(trim(coalesce(v_fila ->> 'caratula', '')), '') is null then
      v_errores := array_append(v_errores, 'Falta la carátula.');
    end if;

    if nullif(trim(coalesce(v_fila ->> 'partido', '')), '') is null then
      v_errores := array_append(v_errores, 'Falta el partido.');
    end if;

    if v_fecha_ejecucion is null then
      v_errores := array_append(v_errores, 'Falta la fecha de ejecución.');
    elsif v_fecha_ejecucion not between p_semana_inicio and v_semana_fin then
      v_errores := array_append(
        v_errores,
        format('La fecha de ejecución debe estar entre %s y %s.', p_semana_inicio, v_semana_fin)
      );
    end if;

    v_resultado_medida := coalesce(v_fila ->> 'resultado_medida', '');
    if v_resultado_medida not in ('Positivo', 'Negativo', 'Sin informar') then
      v_errores := array_append(v_errores, 'El resultado de la medida no es válido.');
    elsif v_resultado_medida = 'Sin informar' then
      v_advertencias := array_append(
        v_advertencias,
        'La fuente histórica no informó el resultado de la medida.'
      );
    end if;

    v_resultado_secuestros := coalesce(v_fila ->> 'resultado_secuestros', '');
    if v_resultado_secuestros not in ('Positivo', 'Negativo', 'Sin Especificar') then
      v_errores := array_append(v_errores, 'El resultado de secuestros no es válido.');
    elsif v_resultado_secuestros = 'Sin Especificar' then
      v_advertencias := array_append(
        v_advertencias,
        'La fuente histórica no informó el resultado de secuestros.'
      );
    end if;

    if v_resultado_secuestros = 'Negativo' and (
      jsonb_array_length(coalesce(v_fila -> 'secuestro_armas', '[]'::jsonb))
      + jsonb_array_length(coalesce(v_fila -> 'secuestro_vehiculos', '[]'::jsonb))
      + jsonb_array_length(coalesce(v_fila -> 'detenidos_aprehendidos', '[]'::jsonb))
    ) > 0 then
      v_errores := array_append(
        v_errores,
        'El resultado de secuestros es Negativo pero existen detalles asociados.'
      );
    end if;

    if coalesce((v_fila ->> 'objetivos')::integer, 0) = 0 then
      v_advertencias := array_append(v_advertencias, 'La cantidad de objetivos es cero.');
    end if;

    if coalesce((v_fila ->> 'personal_propio')::integer, 0) = 0 then
      v_advertencias := array_append(v_advertencias, 'La fuente histórica no informó personal propio.');
    end if;

    if v_fecha_solicitud is not null and v_fecha_ejecucion is not null
       and v_fecha_solicitud > v_fecha_ejecucion then
      v_advertencias := array_append(
        v_advertencias,
        'La fecha de solicitud es posterior a la fecha de ejecución.'
      );
    end if;

    v_huella := md5((v_fila - array[
      'registro_id',
      'superintendencia_nombre',
      'hoja_origen',
      'fila_origen',
      'confirmar_advertencia',
      'motivo_confirmacion'
    ]::text[])::text);

    select count(*)::integer
    into v_repeticiones_archivo
    from jsonb_array_elements(p_filas) x(value)
    where md5((x.value - array[
      'registro_id',
      'superintendencia_nombre',
      'hoja_origen',
      'fila_origen',
      'confirmar_advertencia',
      'motivo_confirmacion'
    ]::text[])::text) = v_huella;

    if v_repeticiones_archivo > 1 then
      v_errores := array_append(v_errores, 'El mismo allanamiento está duplicado dentro del archivo.');
    end if;

    select count(*)::integer
    into v_coincidencias
    from public.allanamientos a
    where a.superintendencia_id = v_superintendencia_id
      and a.fecha_ejecucion = v_fecha_ejecucion
      and upper(trim(a.numero_ipp)) = upper(trim(coalesce(v_fila ->> 'numero_ipp', '')));

    select exists (
      select 1
      from public.allanamientos a
      where a.superintendencia_id = v_superintendencia_id
        and a.fecha_ejecucion = v_fecha_ejecucion
        and upper(trim(a.numero_ipp)) = upper(trim(coalesce(v_fila ->> 'numero_ipp', '')))
        and upper(trim(a.caratula)) = upper(trim(coalesce(v_fila ->> 'caratula', '')))
        and coalesce(to_char(a.horario_ejecucion, 'HH24:MI'), '') =
            coalesce(left(v_fila ->> 'horario_ejecucion', 5), '')
        and upper(trim(coalesce(a.dependencia, ''))) = upper(trim(coalesce(v_fila ->> 'dependencia', '')))
    ) into v_exacto_existente;

    if v_exacto_existente then
      v_errores := array_append(v_errores, 'El allanamiento ya existe en la base de datos.');
    elsif v_coincidencias > 0 then
      v_advertencias := array_append(
        v_advertencias,
        format('Existen %s coincidencias con igual superintendencia, fecha e IPP.', v_coincidencias)
      );
    end if;

    indice := v_indice;
    fila_origen := coalesce((v_fila ->> 'fila_origen')::integer, v_indice + 1);
    errores := v_errores;
    advertencias := v_advertencias;
    coincidencias_probables := coalesce(v_coincidencias, 0);
    huella_contenido := v_huella;
    estado := case
      when cardinality(v_errores) > 0 then 'error'
      when cardinality(v_advertencias) > 0 then 'advertencia'
      else 'apto'
    end;
    return next;
  end loop;
end;
$function$;

ALTER FUNCTION public.prevalidar_importacion_historica_allanamientos(date,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevalidar_importacion_historica_allanamientos(date,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevalidar_importacion_historica_allanamientos(date,jsonb) TO authenticated, service_role;

COMMIT;
