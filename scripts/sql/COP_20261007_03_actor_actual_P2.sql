BEGIN;
CREATE FUNCTION public.finalizar_cambio_estado_usuario(p_operacion_id uuid, p_auth_confirmada boolean, p_actor_actual_id uuid)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_op private.usuario_estado_operaciones%rowtype;
  v_actor public.profiles%rowtype;
  v_obj public.profiles%rowtype;
  v_abierta public.usuario_asignaciones%rowtype;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_vigencia date;
  v_accion text;
begin
  v_actor := private.exigir_actor_gestion_habilitado(p_actor_actual_id);
  select * into v_op from private.usuario_estado_operaciones
   where id=p_operacion_id for update;
  if not found or v_op.estado_operacion not in ('pendiente_auth','error_auth') then
    raise exception 'Operación pendiente inexistente o ya resuelta';
  end if;
  if p_actor_actual_id is distinct from v_op.actor_id
     and lower(btrim(v_actor.rol::text)) not in ('admin','administrador') then
    raise exception 'No podés finalizar una operación iniciada por otro actor' using errcode='42501';
  end if;
  if p_actor_actual_id = v_op.usuario_id then
    raise exception 'No podés gestionar tu propia cuenta mediante esta operación' using errcode='42501';
  end if;

   select * into v_obj from public.profiles where id=v_op.usuario_id for update;
  if not found then raise exception 'Identidad objetivo inexistente'; end if;
  if lower(btrim(v_actor.rol::text))='supervisor'
     and lower(btrim(v_obj.rol::text)) not in ('auditor','operador','consulta') then
    raise exception 'El supervisor no puede gestionar ese rol' using errcode='42501';
  end if;


  if p_auth_confirmada is not true then
    update private.usuario_estado_operaciones set estado_operacion='error_auth',
      resuelta_at=now() where id=p_operacion_id;
    insert into public.auditoria_eventos
      (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
       superintendencia_id,resultado,motivo,referencia_documental,detalles)
    values (p_actor_actual_id,v_actor.email,v_actor.rol::text,'usuarios',case when p_actor_actual_id is distinct from v_op.actor_id then 'error_auth_conciliar_cambio_estado' else 'error_auth_cambio_estado' end,
            'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'error',v_op.motivo,
            v_op.referencia,jsonb_build_object('actor_original_id',v_op.actor_id,'actor_actual_id',p_actor_actual_id,
              'usuario_objetivo_id',v_op.usuario_id,'operacion_id',p_operacion_id,
              'estado_nuevo',v_op.estado_nuevo,'requiere_revision',true));
    return null;
  end if;

  if v_op.estado_nuevo='activo' then
    if v_obj.estado_cuenta is distinct from v_op.estado_anterior or v_obj.activo is true then
      raise exception 'Estado cambiado antes de confirmar la reactivación';
    end if;
    select * into v_abierta from public.usuario_asignaciones
      where usuario_id=v_op.usuario_id and vigente_hasta is null for update;
    if not found then
      if v_obj.superintendencia_id is null then raise exception 'Destino ausente'; end if;
      if exists (select 1 from public.usuario_asignaciones
                 where usuario_id=v_op.usuario_id and vigente_hasta>=v_hoy) then
        raise exception 'La asignación nueva se solaparía con una cerrada';
      end if;
      insert into public.usuario_asignaciones
        (usuario_id,superintendencia_id,vigente_desde,vigente_hasta,motivo,
         referencia_documental,registrada_por)
      values (v_op.usuario_id,v_obj.superintendencia_id,v_hoy,null,
              left('Reactivación: '||v_op.motivo,1000),v_op.referencia,v_op.actor_id);
    end if;
    v_vigencia := v_hoy+60;
    update public.profiles set activo=true,estado_cuenta='activo',
      motivo_estado=v_op.motivo,referencia_estado=v_op.referencia,
      estado_actualizado_at=now(),estado_actualizado_por=v_op.actor_id,
      vigencia_institucional_hasta=v_vigencia,revalidado_at=now(),
      revalidado_por=v_op.actor_id,referencia_vigencia=v_op.referencia,
      requiere_cambio_clave=true
      where id=v_op.usuario_id;
    v_accion := 'reactivar_usuario';
  else
    if v_obj.estado_cuenta is distinct from v_op.estado_nuevo or v_obj.activo is true then
      raise exception 'El bloqueo en base no está aplicado';
    end if;
    v_accion := case when v_op.estado_nuevo='pausado' then 'pausar_usuario'
                     else 'deshabilitar_usuario' end;
  end if;

  update private.usuario_estado_operaciones set estado_operacion='confirmada',
    resuelta_at=now() where id=p_operacion_id;
  insert into public.auditoria_eventos
    (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
     superintendencia_id,resultado,motivo,referencia_documental,detalles)
  values (p_actor_actual_id,v_actor.email,v_actor.rol::text,'usuarios',case when p_actor_actual_id is distinct from v_op.actor_id then 'conciliar_cambio_estado_usuario' else v_accion end,
          'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'exitoso',
          v_op.motivo,v_op.referencia,
          jsonb_build_object('actor_original_id',v_op.actor_id,'actor_actual_id',p_actor_actual_id,
              'usuario_objetivo_id',v_op.usuario_id,'operacion_id',p_operacion_id,'estado_anterior',v_op.estado_anterior,
                             'estado_nuevo',v_op.estado_nuevo,'vigencia_hasta',v_vigencia));
  return v_vigencia;
end;
$function$;
ALTER FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean,uuid) TO service_role;

CREATE FUNCTION public.finalizar_reset_clave_usuario(p_operacion_id uuid, p_actor_actual_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_op private.usuario_reset_operaciones%rowtype;
 v_actor public.profiles%rowtype;
 v_obj public.profiles%rowtype;
begin
  v_actor := private.exigir_actor_gestion_habilitado(p_actor_actual_id);
 select * into v_op from private.usuario_reset_operaciones
   where id=p_operacion_id and estado_operacion='pendiente_auth' for update;
 if not found then raise exception 'Operación pendiente inexistente'; end if;
  if p_actor_actual_id is distinct from v_op.actor_id
     and lower(btrim(v_actor.rol::text)) not in ('admin','administrador') then
    raise exception 'No podés finalizar una operación iniciada por otro actor' using errcode='42501';
  end if;
  if p_actor_actual_id = v_op.usuario_id then
    raise exception 'No podés gestionar tu propia cuenta mediante esta operación' using errcode='42501';
  end if;

 select * into v_obj from public.profiles where id=v_op.usuario_id for update;
 if not found or v_obj.activo is distinct from false then
   raise exception 'Estado de perfil incompatible con el restablecimiento';
 end if;
  if lower(btrim(v_actor.rol::text))='supervisor'
     and lower(btrim(v_obj.rol::text)) not in ('auditor','operador','consulta') then
    raise exception 'El supervisor no puede gestionar ese rol' using errcode='42501';
  end if;

 update public.profiles set activo=v_op.activo_anterior,requiere_cambio_clave=true
   where id=v_op.usuario_id;
 insert into public.auditoria_eventos
   (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
    superintendencia_id,resultado,detalles)
 values(p_actor_actual_id,v_actor.email,v_actor.rol::text,'usuarios',case when p_actor_actual_id is distinct from v_op.actor_id then 'conciliar_reset_clave_usuario' else 'restablecer_password' end,
        'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'exitoso',
        jsonb_build_object('actor_original_id',v_op.actor_id,'actor_actual_id',p_actor_actual_id,
              'usuario_objetivo_id',v_op.usuario_id,'operacion_id',p_operacion_id,'email',v_obj.email,
                           'requiere_cambio_clave',true));
 update private.usuario_reset_operaciones
   set estado_operacion='confirmada',resuelta_at=now() where id=p_operacion_id;
end;
$function$;
ALTER FUNCTION public.finalizar_reset_clave_usuario(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalizar_reset_clave_usuario(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_reset_clave_usuario(uuid,uuid) TO service_role;

CREATE FUNCTION public.obtener_cambio_estado_pendiente(p_operacion_id uuid, p_actor_actual_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_op private.usuario_estado_operaciones%rowtype;

  v_actor public.profiles%rowtype;
begin
  v_actor := private.exigir_actor_gestion_habilitado(p_actor_actual_id);
  if lower(btrim(v_actor.rol::text)) not in ('admin','administrador') then
    raise exception 'Sólo el administrador puede conciliar operaciones pendientes' using errcode='42501';
  end if;

  select * into v_op from private.usuario_estado_operaciones
    where id=p_operacion_id and estado_operacion in ('pendiente_auth','error_auth');
  if not found then raise exception 'Operación pendiente no encontrada'; end if;
  if p_actor_actual_id = v_op.usuario_id then
    raise exception 'No podés gestionar tu propia cuenta mediante esta operación' using errcode='42501';
  end if;
  return jsonb_build_object('id',v_op.id,'actor_original_id',v_op.actor_id,'usuario_id',v_op.usuario_id,
    'estado_nuevo',v_op.estado_nuevo,'estado_operacion',v_op.estado_operacion);
end;
$function$;
ALTER FUNCTION public.obtener_cambio_estado_pendiente(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_cambio_estado_pendiente(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_cambio_estado_pendiente(uuid,uuid) TO service_role;

CREATE FUNCTION public.obtener_reset_clave_pendiente(p_operacion_id uuid, p_actor_actual_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_op private.usuario_reset_operaciones%rowtype;

  v_actor public.profiles%rowtype;
begin
  v_actor := private.exigir_actor_gestion_habilitado(p_actor_actual_id);
  if lower(btrim(v_actor.rol::text)) not in ('admin','administrador') then
    raise exception 'Sólo el administrador puede conciliar operaciones pendientes' using errcode='42501';
  end if;

 select * into v_op from private.usuario_reset_operaciones
   where id=p_operacion_id and estado_operacion='pendiente_auth';
 if not found then raise exception 'Operación pendiente no encontrada'; end if;
  if p_actor_actual_id = v_op.usuario_id then
    raise exception 'No podés gestionar tu propia cuenta mediante esta operación' using errcode='42501';
  end if;
 return jsonb_build_object('usuario_id',v_op.usuario_id,'actor_id',v_op.actor_id);
end;
$function$;
ALTER FUNCTION public.obtener_reset_clave_pendiente(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_reset_clave_pendiente(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_reset_clave_pendiente(uuid,uuid) TO service_role;

DROP FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean);
DROP FUNCTION public.finalizar_reset_clave_usuario(uuid);
DROP FUNCTION public.obtener_cambio_estado_pendiente(uuid);
DROP FUNCTION public.obtener_reset_clave_pendiente(uuid);
NOTIFY pgrst, 'reload schema';
COMMIT;
