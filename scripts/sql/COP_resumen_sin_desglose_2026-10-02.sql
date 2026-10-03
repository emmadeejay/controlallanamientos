begin;

-- Ampliación de resúmenes existentes. No modifica ni duplica las semanas vigentes.
alter table public.resumenes_historicos_semanales
  add column if not exists desglose_estado text not null default 'por_unidad';
alter table public.resumenes_historicos_semanales
  drop constraint if exists resumen_historico_desglose_estado;
alter table public.resumenes_historicos_semanales
  add constraint resumen_historico_desglose_estado
  check (desglose_estado in ('por_unidad','sin_desglose'));

create or replace function public.registrar_resumen_historico_semanal(
  p_semana_inicio date,
  p_total integer,
  p_archivo_excel text,
  p_archivo_pdf text,
  p_archivo_excel_sha256 text,
  p_unidades jsonb,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_item jsonb;
  v_nombre text;
  v_cantidad integer;
  v_celda text;
  v_suma integer := 0;
  v_nombres text[] := array[]::text[];
  v_celdas text[] := array[]::text[];
begin
  if private.usuario_actual_es_administrador() is not true
     or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Se requiere una sesión de administrador con MFA para cargar resúmenes.';
  end if;
  if p_semana_inicio is null or extract(isodow from p_semana_inicio) <> 1
     or p_semana_inicio < date '2026-06-01'
     or p_semana_inicio + 6 >= private.hoy_argentina() then
    raise exception 'La semana debe ser histórica, completa y comenzar en lunes.';
  end if;
  if p_total is null or p_total not between 1 and 1500
     or char_length(trim(coalesce(p_archivo_excel,''))) not between 1 and 255
     or char_length(trim(coalesce(p_archivo_pdf,''))) not between 1 and 255
     or coalesce(p_archivo_excel_sha256,'') !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(p_observaciones,'')) > 1000
     or p_unidades is null or jsonb_typeof(p_unidades) <> 'array'
     or jsonb_array_length(p_unidades) not between 0 and 100 then
    raise exception 'El encabezado del resumen o el listado de unidades no es válido.';
  end if;
  if exists (select 1 from public.importaciones_allanamientos i
             where i.semana_inicio = p_semana_inicio and i.estado = 'completado') then
    raise exception 'Ya existe una importación individual para esa semana; conciliar antes de crear el resumen.';
  end if;

  for v_item in select value from jsonb_array_elements(p_unidades) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Cada unidad debe ser un objeto.';
    end if;
    v_nombre := trim(coalesce(v_item->>'nombre_fuente',''));
    v_celda := trim(coalesce(v_item->>'celda_fuente',''));
    if char_length(v_nombre) not between 1 and 160
       or v_celda !~ '^C[0-9]{1,4}$'
       or upper(v_nombre) = any(v_nombres)
       or v_celda = any(v_celdas) then
      raise exception 'Hay una unidad repetida o sin nombre/celda válida.';
    end if;
    v_nombres := array_append(v_nombres, upper(v_nombre));
    v_celdas := array_append(v_celdas, v_celda);
    if jsonb_typeof(v_item->'total_informado') = 'null' then
      v_cantidad := null;
    elsif jsonb_typeof(v_item->'total_informado') = 'number'
          and (v_item->>'total_informado') ~ '^(0|[1-9][0-9]{0,3})$' then
      v_cantidad := (v_item->>'total_informado')::integer;
      if v_cantidad > 1500 then raise exception 'Cantidad por unidad fuera de rango.'; end if;
    else
      raise exception 'El total por unidad debe ser entero o quedar sin informar.';
    end if;
    v_suma := v_suma + coalesce(v_cantidad,0);
  end loop;
  if jsonb_array_length(p_unidades) = 0 and char_length(trim(coalesce(p_observaciones,''))) < 30 then
    raise exception 'El total sin desglose requiere una referencia documental de al menos 30 caracteres.';
  end if;
  if jsonb_array_length(p_unidades) > 0 and v_suma <> p_total then
    raise exception 'La suma de los totales informados por unidad (%) difiere del total semanal (%).',v_suma,p_total;
  end if;

  insert into public.resumenes_historicos_semanales
    (semana_inicio,semana_fin,total_presentado,archivo_excel,archivo_pdf,archivo_excel_sha256,
     observaciones,creado_por,desglose_estado)
  values (p_semana_inicio,p_semana_inicio+6,p_total,trim(p_archivo_excel),trim(p_archivo_pdf),
          p_archivo_excel_sha256,nullif(trim(coalesce(p_observaciones,'')),''),auth.uid(),
          case when jsonb_array_length(p_unidades) = 0 then 'sin_desglose' else 'por_unidad' end)
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_unidades) loop
    insert into public.resumenes_historicos_unidades(resumen_id,nombre_fuente,total_informado,celda_fuente)
    values (v_id,trim(v_item->>'nombre_fuente'),
            case when jsonb_typeof(v_item->'total_informado') = 'null' then null
                 else (v_item->>'total_informado')::integer end,
            trim(v_item->>'celda_fuente'));
  end loop;

  perform private.registrar_evento_auditoria(
    p_modulo => 'allanamientos', p_accion => 'registrar_resumen_historico',
    p_entidad_tipo => 'resumen_historico', p_entidad_id => v_id::text,
    p_resultado => 'exitoso', p_motivo => format('Resumen documental de %s registros presentados.',p_total),
    p_referencia_documental => trim(p_archivo_excel),
    p_detalles => jsonb_build_object('semana_inicio',p_semana_inicio,'total',p_total,
      'unidades',jsonb_array_length(p_unidades),'desglose_estado',
      case when jsonb_array_length(p_unidades) = 0 then 'sin_desglose' else 'por_unidad' end,
      'archivo_excel_sha256',p_archivo_excel_sha256)
  );
  return v_id;
end;
$function$;


revoke execute on function public.registrar_resumen_historico_semanal(date,integer,text,text,text,jsonb,text)
  from public, anon;
grant execute on function public.registrar_resumen_historico_semanal(date,integer,text,text,text,jsonb,text)
  to authenticated;

commit;
