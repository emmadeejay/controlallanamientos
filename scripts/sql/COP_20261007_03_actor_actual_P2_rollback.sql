BEGIN;
CREATE OR REPLACE FUNCTION public.finalizar_cambio_estado_usuario(p_operacion_id uuid, p_auth_confirmada boolean)
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
  select * into v_op from private.usuario_estado_operaciones
   where id=p_operacion_id for update;
  if not found or v_op.estado_operacion not in ('pendiente_auth','error_auth') then
    raise exception 'Operación pendiente inexistente o ya resuelta';
  end if;
  select * into v_actor from public.profiles where id=v_op.actor_id;
  select * into v_obj from public.profiles where id=v_op.usuario_id for update;
  if not found then raise exception 'Identidad objetivo inexistente'; end if;

  if p_auth_confirmada is not true then
    update private.usuario_estado_operaciones set estado_operacion='error_auth',
      resuelta_at=now() where id=p_operacion_id;
    insert into public.auditoria_eventos
      (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
       superintendencia_id,resultado,motivo,referencia_documental,detalles)
    values (v_op.actor_id,v_actor.email,v_actor.rol::text,'usuarios','error_auth_cambio_estado',
            'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'error',v_op.motivo,
            v_op.referencia,jsonb_build_object('operacion_id',p_operacion_id,
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
  values (v_op.actor_id,v_actor.email,v_actor.rol::text,'usuarios',v_accion,
          'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'exitoso',
          v_op.motivo,v_op.referencia,
          jsonb_build_object('operacion_id',p_operacion_id,'estado_anterior',v_op.estado_anterior,
                             'estado_nuevo',v_op.estado_nuevo,'vigencia_hasta',v_vigencia));
  return v_vigencia;
end;
$function$;
ALTER FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.finalizar_reset_clave_usuario(p_operacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_op private.usuario_reset_operaciones%rowtype;
 v_actor public.profiles%rowtype;
 v_obj public.profiles%rowtype;
begin
 select * into v_op from private.usuario_reset_operaciones
   where id=p_operacion_id and estado_operacion='pendiente_auth' for update;
 if not found then raise exception 'Operación pendiente inexistente'; end if;
 select * into v_obj from public.profiles where id=v_op.usuario_id for update;
 if not found or v_obj.activo is distinct from false then
   raise exception 'Estado de perfil incompatible con el restablecimiento';
 end if;
 select * into v_actor from public.profiles where id=v_op.actor_id;
 update public.profiles set activo=v_op.activo_anterior,requiere_cambio_clave=true
   where id=v_op.usuario_id;
 insert into public.auditoria_eventos
   (actor_id,actor_email,actor_rol,modulo,accion,entidad_tipo,entidad_id,
    superintendencia_id,resultado,detalles)
 values(v_op.actor_id,v_actor.email,v_actor.rol::text,'usuarios','restablecer_password',
        'usuario',v_op.usuario_id::text,v_obj.superintendencia_id,'exitoso',
        jsonb_build_object('operacion_id',p_operacion_id,'email',v_obj.email,
                           'requiere_cambio_clave',true));
 update private.usuario_reset_operaciones
   set estado_operacion='confirmada',resuelta_at=now() where id=p_operacion_id;
end;
$function$;
ALTER FUNCTION public.finalizar_reset_clave_usuario(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalizar_reset_clave_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_reset_clave_usuario(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.obtener_cambio_estado_pendiente(p_operacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_op private.usuario_estado_operaciones%rowtype;
begin
  select * into v_op from private.usuario_estado_operaciones
    where id=p_operacion_id and estado_operacion in ('pendiente_auth','error_auth');
  if not found then raise exception 'Operación pendiente no encontrada'; end if;
  return jsonb_build_object('id',v_op.id,'usuario_id',v_op.usuario_id,
    'estado_nuevo',v_op.estado_nuevo,'estado_operacion',v_op.estado_operacion);
end;
$function$;
ALTER FUNCTION public.obtener_cambio_estado_pendiente(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_cambio_estado_pendiente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_cambio_estado_pendiente(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.obtener_reset_clave_pendiente(p_operacion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_op private.usuario_reset_operaciones%rowtype;
begin
 select * into v_op from private.usuario_reset_operaciones
   where id=p_operacion_id and estado_operacion='pendiente_auth';
 if not found then raise exception 'Operación pendiente no encontrada'; end if;
 return jsonb_build_object('usuario_id',v_op.usuario_id,'actor_id',v_op.actor_id);
end;
$function$;
ALTER FUNCTION public.obtener_reset_clave_pendiente(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.obtener_reset_clave_pendiente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_reset_clave_pendiente(uuid) TO service_role;

DROP FUNCTION public.finalizar_cambio_estado_usuario(uuid,boolean,uuid);
DROP FUNCTION public.finalizar_reset_clave_usuario(uuid,uuid);
DROP FUNCTION public.obtener_cambio_estado_pendiente(uuid,uuid);
DROP FUNCTION public.obtener_reset_clave_pendiente(uuid,uuid);
NOTIFY pgrst, 'reload schema';
COMMIT;
