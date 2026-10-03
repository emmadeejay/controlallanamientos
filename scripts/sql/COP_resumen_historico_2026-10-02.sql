begin;

-- Resúmenes documentales separados de los allanamientos individuales.
-- Aplicar después del backend histórico y antes de la ampliación sin desglose.
create table if not exists public.resumenes_historicos_semanales (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),
  semana_fin date not null,
  total_presentado integer not null check (total_presentado between 1 and 1500),
  archivo_excel text not null check (char_length(trim(archivo_excel)) between 1 and 255),
  archivo_pdf text not null check (char_length(trim(archivo_pdf)) between 1 and 255),
  archivo_excel_sha256 text not null check (archivo_excel_sha256 ~ '^[0-9a-f]{64}$'),
  observaciones text,
  estado text not null default 'vigente' check (estado in ('vigente','anulado')),
  creado_por uuid not null references public.profiles(id),
  creado_at timestamptz not null default now(),
  anulado_por uuid references public.profiles(id),
  anulado_at timestamptz,
  motivo_anulacion text,
  constraint resumen_historico_fin_semana check (semana_fin = semana_inicio + 6),
  constraint resumen_historico_anulacion check (
    (estado = 'vigente' and anulado_por is null and anulado_at is null and motivo_anulacion is null)
    or (estado = 'anulado' and anulado_por is not null and anulado_at is not null
        and char_length(trim(motivo_anulacion)) >= 12)
  )
);

create unique index if not exists resumen_historico_semana_vigente_unica
  on public.resumenes_historicos_semanales (semana_inicio)
  where estado = 'vigente';

create table if not exists public.resumenes_historicos_unidades (
  resumen_id uuid not null references public.resumenes_historicos_semanales(id) on delete restrict,
  nombre_fuente text not null check (char_length(trim(nombre_fuente)) between 1 and 160),
  total_informado integer check (total_informado between 0 and 1500),
  celda_fuente text not null check (celda_fuente ~ '^C[0-9]{1,4}$'),
  primary key (resumen_id, nombre_fuente)
);

alter table public.resumenes_historicos_semanales enable row level security;
alter table public.resumenes_historicos_unidades enable row level security;

drop policy if exists resumen_semanal_select_admin on public.resumenes_historicos_semanales;
create policy resumen_semanal_select_admin on public.resumenes_historicos_semanales
  for select to authenticated using (private.usuario_actual_es_administrador());
drop policy if exists resumen_unidades_select_admin on public.resumenes_historicos_unidades;
create policy resumen_unidades_select_admin on public.resumenes_historicos_unidades
  for select to authenticated using (private.usuario_actual_es_administrador());

revoke all on public.resumenes_historicos_semanales from public, anon, authenticated;
revoke all on public.resumenes_historicos_unidades from public, anon, authenticated;
grant select on public.resumenes_historicos_semanales to authenticated;
grant select on public.resumenes_historicos_unidades to authenticated;
grant select, insert, update, delete on public.resumenes_historicos_semanales to service_role;
grant select, insert, update, delete on public.resumenes_historicos_unidades to service_role;

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
     or jsonb_array_length(p_unidades) not between 1 and 100 then
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
  if v_suma <> p_total then
    raise exception 'La suma de los totales informados por unidad (%) difiere del total semanal (%).',v_suma,p_total;
  end if;

  insert into public.resumenes_historicos_semanales
    (semana_inicio,semana_fin,total_presentado,archivo_excel,archivo_pdf,archivo_excel_sha256,
     observaciones,creado_por)
  values (p_semana_inicio,p_semana_inicio+6,p_total,trim(p_archivo_excel),trim(p_archivo_pdf),
          p_archivo_excel_sha256,nullif(trim(coalesce(p_observaciones,'')),''),auth.uid())
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
      'unidades',jsonb_array_length(p_unidades),'archivo_excel_sha256',p_archivo_excel_sha256)
  );
  return v_id;
end;
$function$;

create or replace function public.anular_resumen_historico_semanal(p_resumen_id uuid,p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_resumen public.resumenes_historicos_semanales%rowtype;
begin
  if private.usuario_actual_es_administrador() is not true
     or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Se requiere administrador con MFA.';
  end if;
  if p_resumen_id is null or char_length(trim(coalesce(p_motivo,''))) < 12 then
    raise exception 'La anulación requiere un motivo de al menos 12 caracteres.';
  end if;
  select * into v_resumen from public.resumenes_historicos_semanales
    where id=p_resumen_id for update;
  if not found or v_resumen.estado <> 'vigente' then
    raise exception 'El resumen no existe o ya está anulado.';
  end if;
  update public.resumenes_historicos_semanales
    set estado='anulado',anulado_por=auth.uid(),anulado_at=now(),motivo_anulacion=trim(p_motivo)
    where id=p_resumen_id;
  perform private.registrar_evento_auditoria(
    p_modulo => 'allanamientos',p_accion => 'anular_resumen_historico',
    p_entidad_tipo => 'resumen_historico',p_entidad_id => p_resumen_id::text,
    p_resultado => 'exitoso',p_motivo => trim(p_motivo),
    p_referencia_documental => v_resumen.archivo_excel,
    p_detalles => jsonb_build_object('semana_inicio',v_resumen.semana_inicio,
      'total',v_resumen.total_presentado)
  );
end;
$function$;

revoke execute on function public.registrar_resumen_historico_semanal(date,integer,text,text,text,jsonb,text)
  from public,anon;
revoke execute on function public.anular_resumen_historico_semanal(uuid,text)
  from public,anon;
grant execute on function public.registrar_resumen_historico_semanal(date,integer,text,text,text,jsonb,text)
  to authenticated;
grant execute on function public.anular_resumen_historico_semanal(uuid,text)
  to authenticated;

commit;
