-- Exclusivamente Allanamientos-Pruebas. No altera configuración global de Auth.
CREATE TABLE private.sesion_actividad (
  session_id uuid PRIMARY KEY REFERENCES auth.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_actividad timestamptz NOT NULL
);
ALTER TABLE private.sesion_actividad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sesion_actividad FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.sesion_actual_vigente()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s
    LEFT JOIN private.sesion_actividad a ON a.session_id = s.id
    WHERE s.id::text = auth.jwt()->>'session_id'
      AND s.user_id = auth.uid()
      AND (s.not_after IS NULL OR s.not_after > now())
      AND coalesce(a.ultima_actividad, s.created_at) > now() - interval '20 minutes'
  );
$$;
REVOKE ALL ON FUNCTION private.sesion_actual_vigente() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.estado_sesion_actual()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'vigente', private.sesion_actual_vigente(),
    'servidor_ahora', now(),
    'ultima_actividad', (
      SELECT coalesce(a.ultima_actividad,s.created_at)
      FROM auth.sessions s LEFT JOIN private.sesion_actividad a ON a.session_id=s.id
      WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
    )
  );
$$;
REVOKE ALL ON FUNCTION public.estado_sesion_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_sesion_actual() TO authenticated;

CREATE FUNCTION public.registrar_actividad_sesion(p_ocurrio_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_session uuid;
BEGIN
  IF NOT private.sesion_actual_vigente() THEN
    RAISE EXCEPTION 'La sesión venció. Volvé a iniciar sesión.' USING ERRCODE='42501';
  END IF;
  IF p_ocurrio_at IS NULL OR p_ocurrio_at > now() + interval '5 seconds'
     OR p_ocurrio_at < now() - interval '60 seconds' THEN
    RAISE EXCEPTION 'La actividad no tiene una fecha válida.';
  END IF;
  SELECT id INTO v_session FROM auth.sessions
  WHERE id::text=auth.jwt()->>'session_id' AND user_id=auth.uid();
  INSERT INTO private.sesion_actividad(session_id,user_id,ultima_actividad)
  VALUES(v_session,auth.uid(),least(p_ocurrio_at,now()))
  ON CONFLICT(session_id) DO UPDATE
    SET ultima_actividad=greatest(private.sesion_actividad.ultima_actividad,excluded.ultima_actividad);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_actividad_sesion(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_actividad_sesion(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION private.usuario_habilitado(p_usuario_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
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
      and (auth.uid() is distinct from p_usuario_id or private.sesion_actual_vigente())
    from public.profiles p
    where p.id = p_usuario_id
    limit 1
  ), false);
$function$;
