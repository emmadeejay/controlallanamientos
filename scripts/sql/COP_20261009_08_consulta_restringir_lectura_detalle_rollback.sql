BEGIN;

CREATE OR REPLACE FUNCTION private.usuario_actual_puede_consultar_allanamientos()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select private.usuario_habilitado(p.id)
      and (
        p.rol::text in ('admin', 'administrador', 'supervisor')
        or (
          p.rol::text in ('auditor', 'consulta')
          and 'allanamientos' = any(coalesce(p.modulos_permitidos, array[]::text[]))
        )
      )
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), false);
$function$;
ALTER FUNCTION private.usuario_actual_puede_consultar_allanamientos() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.usuario_actual_puede_consultar_allanamientos() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.usuario_actual_puede_consultar_allanamientos() TO authenticated;

COMMIT;
