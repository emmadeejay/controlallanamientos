BEGIN;
CREATE OR REPLACE FUNCTION public.confirmar_alta_usuario_atomica(p_actor_id uuid, p_usuario_id uuid, p_email text, p_nombre text, p_apellido text, p_dni text, p_legajo text, p_rol text, p_superintendencia_id uuid, p_modulos text[], p_referencia text)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_rol_actor text;
  v_nombre_super text;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_vigencia date := (now() at time zone 'America/Argentina/Buenos_Aires')::date + 60;
begin
  if p_actor_id is null or p_usuario_id is null or p_superintendencia_id is null
     or nullif(btrim(p_email),'') is null
     or nullif(btrim(p_nombre),'') is null or nullif(btrim(p_apellido),'') is null
     or p_dni !~ '^[0-9]{6,9}$' or p_legajo !~ '^[A-Za-z0-9./-]{3,30}$'
     or p_rol not in ('supervisor','auditor','operador','consulta')
     or p_modulos is null or array_position(p_modulos,null) is not null
     or exists (select 1 from unnest(p_modulos) as m where m <> 'allanamientos')
     or nullif(btrim(p_referencia),'') is null or char_length(p_referencia)>500 then
    raise exception 'Datos de alta inválidos';
  end if;

  select * into v_actor from public.profiles where id=p_actor_id;
  v_rol_actor := lower(btrim(coalesce(v_actor.rol::text,'')));
  if not found or v_actor.activo is distinct from true or v_actor.estado_cuenta<>'activo'
     or v_rol_actor not in ('admin','administrador','supervisor')
     or (v_rol_actor='supervisor' and
         (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta<v_hoy))
     or (v_rol_actor='supervisor' and p_rol='supervisor') then
    raise exception 'Actor no habilitado para el alta';
  end if;

  select nombre into v_nombre_super from public.superintendencias
    where id=p_superintendencia_id;
  if not found then raise exception 'Destino institucional inexistente'; end if;

  -- Serializa altas simultáneas que usan el mismo control de identificadores.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cop_alta_identificadores',0));
  if exists (select 1 from public.profiles where dni=p_dni or legajo=p_legajo) then
    raise exception 'DNI o legajo ya registrado';
  end if;

  insert into public.profiles
    (id,email,nombre,apellido,nombre_completo,dni,legajo,rol,
     superintendencia_id,modulos_permitidos,activo,estado_cuenta,
     vigencia_institucional_hasta,revalidado_at,revalidado_por,
     referencia_vigencia,requiere_cambio_clave)
  values
    (p_usuario_id,lower(btrim(p_email)),btrim(p_nombre),btrim(p_apellido),
     btrim(p_nombre)||' '||btrim(p_apellido),p_dni,p_legajo,
     p_rol::public.user_role,p_superintendencia_id,p_modulos,true,'activo',
     v_vigencia,now(),p_actor_id,btrim(p_referencia),true);

  insert into public.usuario_asignaciones
    (usuario_id,superintendencia_id,vigente_desde,vigente_hasta,
     motivo,referencia_documental,registrada_por)
  values (p_usuario_id,p_superintendencia_id,v_hoy,null,
          'Alta inicial',btrim(p_referencia),p_actor_id);

  insert into public.auditoria_eventos
    (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
     superintendencia_id,superintendencia_nombre,resultado,
     referencia_documental,detalles)
  values (p_actor_id,v_actor.email,v_rol_actor,'usuarios','crear_usuario',
          'usuario',p_usuario_id::text,p_superintendencia_id,v_nombre_super,
          'exitoso',btrim(p_referencia),
          jsonb_build_object('email',lower(btrim(p_email)),
                             'nombre_completo',btrim(p_nombre)||' '||btrim(p_apellido),
                             'rol',p_rol,'vigencia_hasta',v_vigencia));
  return v_vigencia;
end;
$function$;
ALTER FUNCTION public.confirmar_alta_usuario_atomica(uuid,uuid,text,text,text,text,text,text,uuid,text[],text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirmar_alta_usuario_atomica(uuid,uuid,text,text,text,text,text,text,uuid,text[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_alta_usuario_atomica(uuid,uuid,text,text,text,text,text,text,uuid,text[],text) TO service_role;

CREATE OR REPLACE FUNCTION public.editar_usuario_atomico(p_actor_id uuid, p_usuario_id uuid, p_nombre text, p_apellido text, p_dni text, p_legajo text, p_rol text, p_modulos text[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_obj public.profiles%rowtype;
  v_rol_actor text;
  v_rol_obj text;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_nombre_super text;
begin
  if p_actor_id is null or p_usuario_id is null
     or nullif(btrim(p_nombre),'') is null or nullif(btrim(p_apellido),'') is null
     or nullif(btrim(p_dni),'') is null or nullif(btrim(p_legajo),'') is null
     or p_rol not in ('administrador','supervisor','auditor','operador','consulta')
     or p_modulos is null or array_position(p_modulos,null) is not null
     or exists (select 1 from unnest(p_modulos) as m where m <> 'allanamientos') then
    raise exception 'Datos de edición inválidos';
  end if;

  select * into v_actor from public.profiles where id=p_actor_id;
  v_rol_actor := lower(btrim(coalesce(v_actor.rol::text,'')));
  if not found or v_actor.activo is distinct from true or v_actor.estado_cuenta<>'activo'
     or v_rol_actor not in ('admin','administrador','supervisor')
     or (v_rol_actor='supervisor' and
         (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta<v_hoy)) then
    raise exception 'Actor no habilitado';
  end if;
  select * into v_obj from public.profiles where id=p_usuario_id for update;
  if not found then raise exception 'Identidad objetivo inexistente'; end if;
  v_rol_obj := lower(btrim(coalesce(v_obj.rol::text,'')));
  if v_rol_actor='supervisor' and
     (v_rol_obj not in ('auditor','operador','consulta') or
      p_rol not in ('auditor','operador','consulta')) then
    raise exception 'El supervisor no puede gestionar ese rol';
  end if;
  if p_actor_id=p_usuario_id and p_rol is distinct from v_rol_obj then
    raise exception 'No podés cambiar tu propio rol administrativo';
  end if;
  if exists (select 1 from public.profiles where id<>p_usuario_id
             and (dni=btrim(p_dni) or legajo=btrim(p_legajo))) then
    raise exception 'DNI o legajo ya asignado a otra identidad';
  end if;

  update public.profiles set nombre=btrim(p_nombre),apellido=btrim(p_apellido),
    nombre_completo=btrim(p_nombre)||' '||btrim(p_apellido),
    dni=btrim(p_dni),legajo=btrim(p_legajo),rol=p_rol::public.user_role,
    modulos_permitidos=p_modulos,
    vigencia_institucional_hasta=case when p_rol='administrador' then null
      else v_obj.vigencia_institucional_hasta end
    where id=p_usuario_id;

  select nombre into v_nombre_super from public.superintendencias
    where id=v_obj.superintendencia_id;
  insert into public.auditoria_eventos
    (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
     superintendencia_id,superintendencia_nombre,resultado,detalles)
  values (p_actor_id,v_actor.email,v_rol_actor,'usuarios','editar_usuario',
          'usuario',p_usuario_id::text,v_obj.superintendencia_id,v_nombre_super,
          'exitoso',jsonb_build_object('email',v_obj.email,
             'nombre_completo',btrim(p_nombre)||' '||btrim(p_apellido),
             'rol_anterior',v_rol_obj,'rol_nuevo',p_rol,
             'modulos_permitidos',p_modulos));
end;
$function$;
ALTER FUNCTION public.editar_usuario_atomico(uuid,uuid,text,text,text,text,text,text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.editar_usuario_atomico(uuid,uuid,text,text,text,text,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editar_usuario_atomico(uuid,uuid,text,text,text,text,text,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.iniciar_cambio_estado_usuario(p_operacion_id uuid, p_actor_id uuid, p_usuario_id uuid, p_estado_anterior text, p_estado_nuevo text, p_motivo text, p_referencia text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_objetivo public.profiles%rowtype;
  v_abierta public.usuario_asignaciones%rowtype;
  v_rol_actor text;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_ultima_fecha date;
begin
  if p_operacion_id is null or p_actor_id is null or p_usuario_id is null
     or p_estado_nuevo not in ('activo','pausado','deshabilitado')
     or nullif(btrim(p_motivo),'') is null or char_length(p_motivo)>1000
     or char_length(coalesce(p_referencia,''))>500 then
    raise exception 'Datos de cambio de estado inválidos';
  end if;
  if p_estado_nuevo = 'activo' and nullif(btrim(coalesce(p_referencia,'')),'') is null then
    raise exception 'La reactivación requiere referencia documental';
  end if;

  select * into v_actor from public.profiles where id=p_actor_id;
  v_rol_actor := lower(btrim(coalesce(v_actor.rol::text,'')));
  if not found or v_actor.activo is distinct from true
     or v_actor.estado_cuenta <> 'activo'
     or v_rol_actor not in ('admin','administrador','supervisor')
     or (v_rol_actor='supervisor' and
         (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta<v_hoy)) then
    raise exception 'Actor no habilitado';
  end if;
  select * into v_objetivo from public.profiles where id=p_usuario_id for update;
  if not found or v_objetivo.id=p_actor_id or
     exists (select 1 from private.usuario_reset_operaciones where usuario_id=p_usuario_id and estado_operacion='pendiente_auth') or
     v_objetivo.estado_cuenta is distinct from p_estado_anterior or
     v_objetivo.estado_cuenta=p_estado_nuevo then
    raise exception 'Estado del objetivo cambiado o transición inválida';
  end if;
  if v_rol_actor='supervisor' and lower(btrim(v_objetivo.rol::text)) not in
     ('auditor','operador','consulta') then
    raise exception 'El supervisor no puede gestionar ese rol';
  end if;

  select * into v_abierta from public.usuario_asignaciones
   where usuario_id=p_usuario_id and vigente_hasta is null for update;
  if p_estado_nuevo='activo' and not found then
    if v_objetivo.superintendencia_id is null then
      raise exception 'El usuario no tiene destino institucional';
    end if;
    select max(vigente_hasta) into v_ultima_fecha from public.usuario_asignaciones
      where usuario_id=p_usuario_id;
    if v_ultima_fecha >= v_hoy then
      raise exception 'La reactivación del mismo día solaparía asignaciones';
    end if;
  end if;

  insert into private.usuario_estado_operaciones
    (id,usuario_id,actor_id,estado_anterior,estado_nuevo,motivo,referencia)
  values (p_operacion_id,p_usuario_id,p_actor_id,v_objetivo.estado_cuenta,
          p_estado_nuevo,btrim(p_motivo),nullif(btrim(coalesce(p_referencia,'')),''));

  if p_estado_nuevo <> 'activo' then
    update public.profiles set activo=false,estado_cuenta=p_estado_nuevo,
      motivo_estado=btrim(p_motivo),
      referencia_estado=nullif(btrim(coalesce(p_referencia,'')),''),
      estado_actualizado_at=now(),estado_actualizado_por=p_actor_id
      where id=p_usuario_id;
    if p_estado_nuevo='deshabilitado' and v_abierta.id is not null then
      update public.usuario_asignaciones
        set vigente_hasta=greatest(v_hoy,v_abierta.vigente_desde)
        where id=v_abierta.id;
    end if;
  end if;

  insert into public.auditoria_eventos
    (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
     superintendencia_id,resultado,motivo,referencia_documental,detalles)
  values (p_actor_id,v_actor.email,v_rol_actor,'usuarios','iniciar_cambio_estado_usuario',
          'usuario',p_usuario_id::text,v_objetivo.superintendencia_id,'exitoso',
          btrim(p_motivo),nullif(btrim(coalesce(p_referencia,'')),''),
          jsonb_build_object('operacion_id',p_operacion_id,'estado_anterior',v_objetivo.estado_cuenta,
                             'estado_nuevo',p_estado_nuevo,'auth_pendiente',true));
end;
$function$;
ALTER FUNCTION public.iniciar_cambio_estado_usuario(uuid,uuid,uuid,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.iniciar_cambio_estado_usuario(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_cambio_estado_usuario(uuid,uuid,uuid,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.iniciar_reset_clave_usuario(p_operacion_id uuid, p_actor_id uuid, p_usuario_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_actor public.profiles%rowtype;
 v_obj public.profiles%rowtype;
 v_rol text;
 v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
 if p_operacion_id is null or p_actor_id is null or p_usuario_id is null then
   raise exception 'Datos de restablecimiento inválidos';
 end if;
 select * into v_actor from public.profiles where id=p_actor_id;
 v_rol := lower(btrim(coalesce(v_actor.rol::text,'')));
 if not found or v_actor.activo is distinct from true or v_actor.estado_cuenta<>'activo'
    or v_rol not in ('admin','administrador','supervisor')
    or (v_rol='supervisor' and (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta<v_hoy)) then
   raise exception 'Actor no habilitado';
 end if;
 select * into v_obj from public.profiles where id=p_usuario_id for update;
 if not found or p_usuario_id=p_actor_id then raise exception 'Identidad objetivo no habilitada'; end if;
 if v_rol='supervisor' and lower(btrim(v_obj.rol::text)) not in ('auditor','operador','consulta') then
   raise exception 'El supervisor no puede gestionar ese rol';
 end if;
 if exists(select 1 from private.usuario_estado_operaciones where usuario_id=p_usuario_id and estado_operacion in ('pendiente_auth','error_auth')) then
   raise exception 'Hay un cambio de estado pendiente para este usuario';
 end if;
 insert into private.usuario_reset_operaciones(id,usuario_id,actor_id,activo_anterior)
 values(p_operacion_id,p_usuario_id,p_actor_id,coalesce(v_obj.activo,false));
 update public.profiles set activo=false where id=p_usuario_id;
 insert into public.auditoria_eventos
   (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
    superintendencia_id,resultado,detalles)
 values(p_actor_id,v_actor.email,v_rol,'usuarios','iniciar_reset_clave_usuario',
        'usuario',p_usuario_id::text,v_obj.superintendencia_id,'exitoso',
        jsonb_build_object('operacion_id',p_operacion_id,'auth_pendiente',true));
end;
$function$;
ALTER FUNCTION public.iniciar_reset_clave_usuario(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.iniciar_reset_clave_usuario(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_reset_clave_usuario(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.revalidar_usuario_atomico(p_actor_id uuid, p_usuario_id uuid, p_motivo text, p_referencia text)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_obj public.profiles%rowtype;
  v_rol_actor text;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_vigencia date := ((now() at time zone 'America/Argentina/Buenos_Aires')::date+60);
  v_nombre_super text;
begin
  if p_actor_id is null or p_usuario_id is null
     or nullif(btrim(p_motivo),'') is null or char_length(p_motivo)>1000
     or nullif(btrim(p_referencia),'') is null or char_length(p_referencia)>500 then
    raise exception 'Datos de revalidación inválidos';
  end if;
  select * into v_actor from public.profiles where id=p_actor_id;
  v_rol_actor := lower(btrim(coalesce(v_actor.rol::text,'')));
  if not found or v_actor.activo is distinct from true or v_actor.estado_cuenta<>'activo'
     or v_rol_actor not in ('admin','administrador','supervisor')
     or (v_rol_actor='supervisor' and
         (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta<v_hoy)) then
    raise exception 'Actor no habilitado';
  end if;
  select * into v_obj from public.profiles where id=p_usuario_id for update;
  if not found or v_obj.estado_cuenta<>'activo' or v_obj.activo is distinct from true
     or lower(btrim(v_obj.rol::text)) in ('admin','administrador') then
    raise exception 'Identidad objetivo no habilitada para revalidación';
  end if;
  if v_rol_actor='supervisor' and lower(btrim(v_obj.rol::text)) not in
     ('auditor','operador','consulta') then
    raise exception 'El supervisor no puede gestionar ese rol';
  end if;

  update public.profiles set activo=true,estado_cuenta='activo',
    vigencia_institucional_hasta=v_vigencia,revalidado_at=now(),
    revalidado_por=p_actor_id,referencia_vigencia=btrim(p_referencia),
    motivo_estado=null where id=p_usuario_id;

  select nombre into v_nombre_super from public.superintendencias
    where id=v_obj.superintendencia_id;
  insert into public.auditoria_eventos
    (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
     superintendencia_id,superintendencia_nombre,resultado,motivo,
     referencia_documental,detalles)
  values (p_actor_id,v_actor.email,v_rol_actor,'usuarios','revalidar_usuario',
          'usuario',p_usuario_id::text,v_obj.superintendencia_id,v_nombre_super,
          'exitoso',btrim(p_motivo),btrim(p_referencia),
          jsonb_build_object('email',v_obj.email,'vigencia_hasta',v_vigencia));
  return v_vigencia;
end;
$function$;
ALTER FUNCTION public.revalidar_usuario_atomico(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revalidar_usuario_atomico(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revalidar_usuario_atomico(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.trasladar_usuario_atomico(p_actor_id uuid, p_usuario_id uuid, p_destino_id uuid, p_motivo text, p_referencia text)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor public.profiles%rowtype;
  v_objetivo public.profiles%rowtype;
  v_asignacion public.usuario_asignaciones%rowtype;
  v_destino_nombre text;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_vigencia date := ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 60);
  v_rol_actor text;
  v_rol_objetivo text;
begin
  if p_actor_id is null or p_usuario_id is null or p_destino_id is null
     or nullif(btrim(p_motivo), '') is null or nullif(btrim(p_referencia), '') is null
     or char_length(p_motivo) > 1000 or char_length(p_referencia) > 500 then
    raise exception 'Datos de traslado inválidos';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  v_rol_actor := lower(btrim(coalesce(v_actor.rol::text, '')));
  if not found or v_actor.activo is distinct from true
     or v_actor.estado_cuenta <> 'activo'
     or v_rol_actor not in ('admin', 'administrador', 'supervisor')
     or (v_rol_actor = 'supervisor' and
         (v_actor.vigencia_institucional_hasta is null or v_actor.vigencia_institucional_hasta < v_hoy)) then
    raise exception 'Actor no habilitado para gestionar usuarios';
  end if;

  select * into v_objetivo from public.profiles where id = p_usuario_id for update;
  v_rol_objetivo := lower(btrim(coalesce(v_objetivo.rol::text, '')));
  if not found or v_objetivo.id = p_actor_id or v_objetivo.estado_cuenta <> 'activo'
     or v_objetivo.activo is distinct from true then
    raise exception 'Identidad objetivo no habilitada para traslado';
  end if;
  if v_rol_actor = 'supervisor' and v_rol_objetivo not in ('auditor', 'operador', 'consulta') then
    raise exception 'El supervisor no puede gestionar ese rol';
  end if;
  if v_objetivo.superintendencia_id = p_destino_id then
    raise exception 'El destino debe ser diferente del actual';
  end if;

  select nombre into v_destino_nombre from public.superintendencias where id = p_destino_id;
  if not found then raise exception 'Destino inexistente'; end if;

  select * into v_asignacion
  from public.usuario_asignaciones
  where usuario_id = p_usuario_id and vigente_hasta is null
  for update;
  if not found or v_asignacion.superintendencia_id is distinct from v_objetivo.superintendencia_id then
    raise exception 'Asignación abierta ausente o inconsistente';
  end if;
  -- Un intervalo inclusivo de fechas no puede representar dos destinos en el mismo día.
  if v_asignacion.vigente_desde >= v_hoy then
    raise exception 'El traslado del mismo día requiere una fecha de inicio anterior';
  end if;

  update public.usuario_asignaciones
  set vigente_hasta = v_hoy - 1
  where id = v_asignacion.id;

  insert into public.usuario_asignaciones
    (usuario_id, superintendencia_id, vigente_desde, vigente_hasta,
     motivo, referencia_documental, registrada_por)
  values
    (p_usuario_id, p_destino_id, v_hoy, null,
     btrim(p_motivo), btrim(p_referencia), p_actor_id);

  update public.profiles
  set superintendencia_id = p_destino_id,
      activo = true,
      estado_cuenta = 'activo',
      vigencia_institucional_hasta = v_vigencia,
      revalidado_at = now(),
      revalidado_por = p_actor_id,
      referencia_vigencia = btrim(p_referencia),
      requiere_cambio_clave = true,
      motivo_estado = btrim(p_motivo)
  where id = p_usuario_id;

  insert into public.auditoria_eventos
    (actor_id, actor_email, actor_rol, modulo, accion, entidad_tipo, entidad_id,
     superintendencia_id, superintendencia_nombre, resultado, motivo,
     referencia_documental, detalles)
  values
    (p_actor_id, v_actor.email, v_rol_actor, 'usuarios', 'trasladar_usuario',
     'usuario', p_usuario_id::text, p_destino_id, v_destino_nombre, 'exitoso',
     btrim(p_motivo), btrim(p_referencia),
     jsonb_build_object('email', v_objetivo.email,
                        'superintendencia_anterior', v_objetivo.superintendencia_id,
                        'superintendencia_nueva', p_destino_id,
                        'vigencia_hasta', v_vigencia,
                        'requiere_cambio_clave', true));

  return v_vigencia;
end;
$function$;
ALTER FUNCTION public.trasladar_usuario_atomico(uuid,uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trasladar_usuario_atomico(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trasladar_usuario_atomico(uuid,uuid,uuid,text,text) TO service_role;

DROP FUNCTION private.exigir_actor_gestion_habilitado(uuid);
COMMIT;
