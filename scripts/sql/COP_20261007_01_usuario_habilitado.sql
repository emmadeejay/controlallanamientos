CREATE OR REPLACE FUNCTION private.usuario_habilitado(p_usuario_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select
      coalesce(p.activo, false)
      and p.requiere_cambio_clave is false
      and p.estado_cuenta = 'activo'
      and (
        p.rol::text in ('admin', 'administrador')
        or p.vigencia_institucional_hasta >= private.hoy_argentina()
      )
      and (
        p.rol::text not in ('admin', 'administrador')
        or auth.uid() is distinct from p_usuario_id
        or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      )
    from public.profiles p
    where p.id = p_usuario_id
    limit 1
  ), false);
$function$;
