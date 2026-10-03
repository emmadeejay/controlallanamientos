begin;

-- Backend de importación histórica. La carga semanal normal conserva sus reglas actuales.

-- El catálogo de pruebas puede estar rezagado respecto del catálogo productivo.
-- Esta superintendencia ya existe en producción; el bloque es idempotente.
update public.superintendencias
set activa = true,
    tipo = 'ESPECIALIZADA'
where upper(trim(nombre)) = 'SUPERINTENDENCIA DE INVESTIGACIONES EN FUNCION JUDICIAL';

insert into public.superintendencias (nombre, tipo, activa)
select 'SUPERINTENDENCIA DE INVESTIGACIONES EN FUNCION JUDICIAL', 'ESPECIALIZADA', true
where not exists (
  select 1
  from public.superintendencias
  where upper(trim(nombre)) = 'SUPERINTENDENCIA DE INVESTIGACIONES EN FUNCION JUDICIAL'
);

create table if not exists public.importaciones_allanamientos (
  id uuid primary key default gen_random_uuid(),
  archivo_nombre text not null check (char_length(archivo_nombre) between 1 and 255),
  archivo_sha256 text not null check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  semana_inicio date not null check (extract(isodow from semana_inicio) = 1),
  semana_fin date not null,
  estado text not null default 'completado'
    check (estado in ('completado', 'anulado')),
  filas_importadas integer not null check (filas_importadas between 1 and 1500),
  filas_con_advertencia integer not null default 0
    check (filas_con_advertencia between 0 and filas_importadas),
  creado_por uuid not null references public.profiles(id),
  creado_at timestamptz not null default timezone('utc', now()),
  anulado_por uuid references public.profiles(id),
  anulado_at timestamptz,
  motivo_anulacion text,
  constraint importaciones_allanamientos_semana_fin_check
    check (semana_fin = semana_inicio + 6),
  constraint importaciones_allanamientos_anulacion_check check (
    (estado = 'completado' and anulado_por is null and anulado_at is null and motivo_anulacion is null)
    or
    (estado = 'anulado' and anulado_por is not null and anulado_at is not null
      and char_length(trim(motivo_anulacion)) >= 12)
  )
);

alter table public.allanamientos
  add column if not exists es_historico boolean not null default false,
  add column if not exists importacion_lote_id uuid,
  add column if not exists importacion_registro_id text,
  add column if not exists importacion_hoja_origen text,
  add column if not exists importacion_fila_origen integer;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'allanamientos_importacion_lote_id_fkey'
      and conrelid = 'public.allanamientos'::regclass
  ) then
    alter table public.allanamientos
      add constraint allanamientos_importacion_lote_id_fkey
      foreign key (importacion_lote_id)
      references public.importaciones_allanamientos(id)
      on delete restrict;
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'allanamiento_colaboraciones_allanamiento_id_fkey'
      and conrelid = 'public.allanamiento_colaboraciones'::regclass
  ) then
    alter table public.allanamiento_colaboraciones
      add constraint allanamiento_colaboraciones_allanamiento_id_fkey
      foreign key (allanamiento_id)
      references public.allanamientos(id)
      on delete cascade
      not valid;

    alter table public.allanamiento_colaboraciones
      validate constraint allanamiento_colaboraciones_allanamiento_id_fkey;
  end if;
end
$migration$;

alter table public.allanamientos
  drop constraint if exists allanamientos_resultado_medida_check;

alter table public.allanamientos
  add constraint allanamientos_resultado_medida_check
  check (resultado_medida::text = any (array[
    'Positivo'::text,
    'Negativo'::text,
    'Irrupcion Sin Novedad'::text,
    'Suspendido'::text,
    'Sin informar'::text
  ]));

alter table public.allanamientos
  drop constraint if exists allanamientos_horario_o_en_el_acto;

alter table public.allanamientos
  add constraint allanamientos_horario_o_en_el_acto
  check (es_historico or en_el_acto = (horario_ejecucion is null));

-- Misma validación que el ajuste del 01/10; incluida aquí para instalaciones nuevas.
create or replace function private.validar_y_sincronizar_allanamiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.es_historico is true then
    if new.importacion_lote_id is null
       or private.usuario_actual_es_administrador() is not true then
      raise exception 'La carga histórica requiere un lote y un administrador autorizado.';
    end if;
  elsif new.importacion_lote_id is not null then
    raise exception 'Un lote de importación sólo puede contener registros históricos.';
  end if;

  if new.resultado_medida::text = 'Sin informar'
     and new.es_historico is not true then
    raise exception 'Sin informar sólo se admite en una importación histórica.';
  end if;

  if new.fecha_ejecucion > private.hoy_argentina() then
    raise exception 'La fecha de ejecución no puede ser futura.';
  end if;

  if new.fecha_solicitud is not null
     and new.fecha_solicitud > new.fecha_ejecucion
     and new.es_historico is not true then
    raise exception 'La fecha de solicitud no puede ser posterior a la ejecución.';
  end if;

  if coalesce(new.objetivos, 0) < 0
     or coalesce(new.personal_propio, 0) < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;

  if new.resultado_secuestros = 'Negativo' then
    new.secuestro_armas := '[]'::jsonb;
    new.secuestro_vehiculos := '[]'::jsonb;
    new.detenidos_aprehendidos := '[]'::jsonb;
  end if;

  if jsonb_typeof(coalesce(new.secuestro_armas, '[]'::jsonb)) in ('array', 'number') then
    new.armas_secuestradas := private.sumar_detalles_jsonb(new.secuestro_armas);
  end if;

  if jsonb_typeof(coalesce(new.secuestro_vehiculos, '[]'::jsonb)) in ('array', 'number') then
    new.vehiculos_secuestrados := private.sumar_detalles_jsonb(new.secuestro_vehiculos);
  end if;

  if jsonb_typeof(coalesce(new.detenidos_aprehendidos, '[]'::jsonb)) in ('array', 'number') then
    new.detenidos_aprehendidos_cant := private.sumar_detalles_jsonb(new.detenidos_aprehendidos);
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;

create unique index if not exists importaciones_allanamientos_sha_activo_uidx
  on public.importaciones_allanamientos (archivo_sha256)
  where estado = 'completado';

create index if not exists importaciones_allanamientos_semana_idx
  on public.importaciones_allanamientos (semana_inicio desc, creado_at desc);

create index if not exists importaciones_allanamientos_creado_por_idx
  on public.importaciones_allanamientos (creado_por);

create index if not exists importaciones_allanamientos_anulado_por_idx
  on public.importaciones_allanamientos (anulado_por)
  where anulado_por is not null;

create index if not exists allanamientos_importacion_lote_idx
  on public.allanamientos (importacion_lote_id)
  where importacion_lote_id is not null;

create index if not exists allanamientos_probable_duplicado_idx
  on public.allanamientos (superintendencia_id, fecha_ejecucion, numero_ipp);

alter table public.importaciones_allanamientos enable row level security;

drop policy if exists importaciones_allanamientos_select_admin
  on public.importaciones_allanamientos;

create policy importaciones_allanamientos_select_admin
on public.importaciones_allanamientos
for select
to authenticated
using (private.usuario_actual_es_administrador());

revoke all on table public.importaciones_allanamientos from public, anon, authenticated;
grant select on table public.importaciones_allanamientos to authenticated;
grant select, insert, update, delete on table public.importaciones_allanamientos to service_role;

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

create or replace function public.importar_lote_historico_allanamientos(
  p_archivo_nombre text,
  p_archivo_sha256 text,
  p_semana_inicio date,
  p_filas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lote_id uuid;
  v_fila jsonb;
  v_indice integer;
  v_allanamiento_id uuid;
  v_revision record;
  v_advertencias integer := 0;
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
      'advertencias', v_advertencias
    )
  );

  return v_lote_id;
end;
$function$;

create or replace function public.anular_importacion_historica_allanamientos(
  p_lote_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lote public.importaciones_allanamientos%rowtype;
  v_eliminados integer;
begin
  if not private.usuario_actual_es_administrador() then
    raise exception 'No tenés permisos para anular importaciones históricas.';
  end if;

  if p_lote_id is null or char_length(trim(coalesce(p_motivo, ''))) < 12 then
    raise exception 'La anulación requiere un motivo de al menos 12 caracteres.';
  end if;

  select * into v_lote
  from public.importaciones_allanamientos
  where id = p_lote_id
  for update;

  if not found then
    raise exception 'El lote histórico no existe.';
  end if;

  if v_lote.estado <> 'completado' then
    raise exception 'El lote histórico ya se encuentra anulado.';
  end if;

  delete from public.allanamientos
  where importacion_lote_id = p_lote_id;
  get diagnostics v_eliminados = row_count;

  if v_eliminados <> v_lote.filas_importadas then
    raise exception 'La cantidad de registros del lote no coincide con la importación original.';
  end if;

  update public.importaciones_allanamientos
  set estado = 'anulado',
      anulado_por = auth.uid(),
      anulado_at = timezone('utc', now()),
      motivo_anulacion = trim(p_motivo)
  where id = p_lote_id;

  perform private.registrar_evento_auditoria(
    p_modulo => 'allanamientos',
    p_accion => 'anular_importacion_historica',
    p_entidad_tipo => 'importacion_allanamientos',
    p_entidad_id => p_lote_id::text,
    p_resultado => 'exitoso',
    p_motivo => trim(p_motivo),
    p_referencia_documental => v_lote.archivo_nombre,
    p_detalles => jsonb_build_object(
      'semana_inicio', v_lote.semana_inicio,
      'semana_fin', v_lote.semana_fin,
      'filas_retiradas', v_eliminados,
      'archivo_sha256', v_lote.archivo_sha256
    )
  );
end;
$function$;

-- Conserva la función de métricas vigente como base y corrige sólo la cobertura
-- de resultados históricos incompletos.
do $migration$
begin
  if to_regprocedure('public.metricas_allanamientos_semana_base_20260930(date)') is null then
    alter function public.metricas_allanamientos_semana(date)
      rename to metricas_allanamientos_semana_base_20260930;
  end if;
end
$migration$;

create or replace function public.metricas_allanamientos_semana(p_semana_inicio date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
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

revoke all on function public.prevalidar_importacion_historica_allanamientos(date, jsonb)
  from public, anon;
revoke all on function public.importar_lote_historico_allanamientos(text, text, date, jsonb)
  from public, anon;
revoke all on function public.anular_importacion_historica_allanamientos(uuid, text)
  from public, anon;
revoke all on function public.metricas_allanamientos_semana(date)
  from public, anon;
revoke all on function public.metricas_allanamientos_semana_base_20260930(date)
  from public, anon, authenticated;

grant execute on function public.prevalidar_importacion_historica_allanamientos(date, jsonb)
  to authenticated;
grant execute on function public.importar_lote_historico_allanamientos(text, text, date, jsonb)
  to authenticated;
grant execute on function public.anular_importacion_historica_allanamientos(uuid, text)
  to authenticated;
grant execute on function public.metricas_allanamientos_semana(date)
  to authenticated;
grant execute on function public.metricas_allanamientos_semana_base_20260930(date)
  to service_role;

commit;
