BEGIN;

CREATE OR REPLACE FUNCTION public.importar_lote_historico_allanamientos(p_archivo_nombre text, p_archivo_sha256 text, p_semana_inicio date, p_filas jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lote_id uuid;
  v_fila jsonb;
  v_indice integer;
  v_allanamiento_id uuid;
  v_revision record;
  v_advertencias integer := 0;
  v_confirmaciones jsonb := '[]'::jsonb;
  v_detalle jsonb;
  v_colaboracion jsonb;
begin
  if not private.usuario_actual_es_administrador() then
    raise exception 'No tenés permisos para importar lotes históricos.';
  end if;

  if nullif(trim(coalesce(p_archivo_nombre, '')), '') is null
     or char_length(p_archivo_nombre) > 255 then
    raise exception 'El nombre del archivo no es válido.';
  end if;

  if coalesce(p_archivo_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella SHA-256 del archivo no es válida.';
  end if;

  if exists (
    select 1 from public.importaciones_allanamientos i
    where i.archivo_sha256 = p_archivo_sha256 and i.estado = 'completado'
  ) then
    raise exception 'Este mismo archivo ya fue importado.';
  end if;

  for v_revision in
    select * from public.prevalidar_importacion_historica_allanamientos(p_semana_inicio, p_filas)
  loop
    if v_revision.estado = 'error' then
      raise exception 'La importación contiene errores. Volvé a prevalidar el archivo.';
    end if;

    if v_revision.estado = 'advertencia' then
      v_advertencias := v_advertencias + 1;
      v_fila := p_filas -> (v_revision.indice - 1);
      if coalesce((v_fila ->> 'confirmar_advertencia')::boolean, false) is not true
         or char_length(trim(coalesce(v_fila ->> 'motivo_confirmacion', ''))) < 8 then
        raise exception 'Las advertencias requieren confirmación y un motivo de al menos 8 caracteres.';
      end if;
      v_confirmaciones := v_confirmaciones || jsonb_build_array(jsonb_build_object(
        'fila_origen', v_revision.fila_origen,
        'cantidad_advertencias', cardinality(v_revision.advertencias),
        'confirmacion_advertencias', true
      ));
    end if;
  end loop;

  insert into public.importaciones_allanamientos (
    archivo_nombre,
    archivo_sha256,
    semana_inicio,
    semana_fin,
    filas_importadas,
    filas_con_advertencia,
    creado_por
  ) values (
    trim(p_archivo_nombre),
    p_archivo_sha256,
    p_semana_inicio,
    p_semana_inicio + 6,
    jsonb_array_length(p_filas),
    v_advertencias,
    auth.uid()
  )
  returning id into v_lote_id;

  for v_fila, v_indice in
    select value, ordinality::integer
    from jsonb_array_elements(p_filas) with ordinality
  loop
    insert into public.allanamientos (
      numero_ipp,
      caratula,
      ufi_juzgado,
      fecha_solicitud,
      lugar_presentacion,
      partido,
      fecha_ejecucion,
      horario_ejecucion,
      departamental,
      dependencia,
      objetivos,
      personal_propio,
      resultado_medida,
      es_positivo,
      resultado_secuestros,
      secuestro_armas,
      secuestro_vehiculos,
      detenidos_aprehendidos,
      numero_parte_urgente,
      observaciones,
      operador_id,
      orden_servicio_propia,
      orden_servicio_cop,
      superintendencia_id,
      armas_secuestradas,
      vehiculos_secuestrados,
      detenidos_aprehendidos_cant,
      en_el_acto,
      es_exhorto,
      provincia,
      localidad,
      es_historico,
      importacion_lote_id,
      importacion_registro_id,
      importacion_hoja_origen,
      importacion_fila_origen
    ) values (
      trim(v_fila ->> 'numero_ipp'),
      trim(v_fila ->> 'caratula'),
      coalesce(nullif(trim(v_fila ->> 'ufi_juzgado'), ''), 'Sin especificar'),
      nullif(v_fila ->> 'fecha_solicitud', '')::date,
      coalesce(nullif(trim(v_fila ->> 'lugar_presentacion'), ''), trim(v_fila ->> 'dependencia')),
      trim(v_fila ->> 'partido'),
      (v_fila ->> 'fecha_ejecucion')::date,
      nullif(v_fila ->> 'horario_ejecucion', '')::time,
      nullif(trim(v_fila ->> 'departamental'), ''),
      coalesce(nullif(trim(v_fila ->> 'dependencia'), ''), 'Sin especificar'),
      coalesce((v_fila ->> 'objetivos')::integer, 0),
      coalesce((v_fila ->> 'personal_propio')::integer, 0),
      v_fila ->> 'resultado_medida',
      case
        when v_fila ->> 'resultado_medida' = 'Positivo' then true
        when v_fila ->> 'resultado_medida' = 'Negativo' then false
        else null
      end,
      v_fila ->> 'resultado_secuestros',
      coalesce(v_fila -> 'secuestro_armas', '[]'::jsonb),
      coalesce(v_fila -> 'secuestro_vehiculos', '[]'::jsonb),
      coalesce(v_fila -> 'detenidos_aprehendidos', '[]'::jsonb),
      nullif(trim(v_fila ->> 'numero_parte_urgente'), ''),
      nullif(trim(v_fila ->> 'observaciones'), ''),
      auth.uid(),
      nullif(trim(v_fila ->> 'orden_servicio_propia'), ''),
      nullif(trim(v_fila ->> 'orden_servicio_cop'), ''),
      (v_fila ->> 'superintendencia_id')::uuid,
      coalesce((
        select sum(coalesce((d ->> 'cantidad')::integer, 0))
        from jsonb_array_elements(coalesce(v_fila -> 'secuestro_armas', '[]'::jsonb)) d
      ), 0),
      coalesce((
        select sum(coalesce((d ->> 'cantidad')::integer, 0))
        from jsonb_array_elements(coalesce(v_fila -> 'secuestro_vehiculos', '[]'::jsonb)) d
      ), 0),
      coalesce((
        select sum(coalesce((d ->> 'cantidad')::integer, 0))
        from jsonb_array_elements(coalesce(v_fila -> 'detenidos_aprehendidos', '[]'::jsonb)) d
      ), 0),
      coalesce((v_fila ->> 'en_el_acto')::boolean, false),
      false,
      'Buenos Aires',
      null,
      true,
      v_lote_id,
      v_fila ->> 'registro_id',
      coalesce(nullif(trim(v_fila ->> 'hoja_origen'), ''), 'Allanamientos'),
      coalesce((v_fila ->> 'fila_origen')::integer, v_indice + 1)
    )
    returning id into v_allanamiento_id;

    for v_colaboracion in
      select value from jsonb_array_elements(coalesce(v_fila -> 'colaboraciones', '[]'::jsonb))
    loop
      insert into public.allanamiento_colaboraciones (
        allanamiento_id,
        especialidad,
        cant_solicitada,
        cant_afectada
      ) values (
        v_allanamiento_id,
        trim(v_colaboracion ->> 'especialidad'),
        coalesce((v_colaboracion ->> 'cant_solicitada')::integer, 0),
        coalesce((v_colaboracion ->> 'cant_afectada')::integer, 0)
      );
    end loop;

    for v_detalle in
      select value from jsonb_array_elements(coalesce(v_fila -> 'secuestro_armas', '[]'::jsonb))
    loop
      insert into public.allanamiento_secuestros (allanamiento_id, tipo, subtipo, cantidad)
      values (v_allanamiento_id, 'ARMA', trim(v_detalle ->> 'subtipo'), (v_detalle ->> 'cantidad')::integer);
    end loop;

    for v_detalle in
      select value from jsonb_array_elements(coalesce(v_fila -> 'secuestro_vehiculos', '[]'::jsonb))
    loop
      insert into public.allanamiento_secuestros (allanamiento_id, tipo, subtipo, cantidad)
      values (v_allanamiento_id, 'VEHICULO', trim(v_detalle ->> 'subtipo'), (v_detalle ->> 'cantidad')::integer);
    end loop;

    for v_detalle in
      select value from jsonb_array_elements(coalesce(v_fila -> 'detenidos_aprehendidos', '[]'::jsonb))
    loop
      insert into public.allanamiento_secuestros (allanamiento_id, tipo, subtipo, cantidad)
      values (v_allanamiento_id, 'PERSONA', trim(v_detalle ->> 'subtipo'), (v_detalle ->> 'cantidad')::integer);
    end loop;
  end loop;

  perform private.registrar_evento_auditoria(
    p_modulo => 'allanamientos',
    p_accion => 'importar_historico',
    p_entidad_tipo => 'importacion_allanamientos',
    p_entidad_id => v_lote_id::text,
    p_resultado => 'exitoso',
    p_motivo => format('Importación histórica de %s registros.', jsonb_array_length(p_filas)),
    p_referencia_documental => trim(p_archivo_nombre),
    p_detalles => jsonb_build_object(
      'semana_inicio', p_semana_inicio,
      'semana_fin', p_semana_inicio + 6,
      'archivo_sha256', p_archivo_sha256,
      'filas', jsonb_array_length(p_filas),
      'advertencias', v_advertencias,
      'confirmaciones', v_confirmaciones
    )
  );

  return v_lote_id;
end;
$function$;
ALTER FUNCTION public.importar_lote_historico_allanamientos(text,text,date,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.importar_lote_historico_allanamientos(text,text,date,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.importar_lote_historico_allanamientos(text,text,date,jsonb) TO authenticated, service_role;

COMMIT;
