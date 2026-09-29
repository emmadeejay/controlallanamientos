'use server';

import { randomInt, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { registrarEventoAuditoria } from '@/lib/auditoria';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  normalizarRolUsuario,
  perfilTieneAcceso,
  type EstadoCuenta,
} from '@/lib/usuarios';

type RolAplicacion =
  | 'administrador'
  | 'supervisor'
  | 'auditor'
  | 'operador'
  | 'consulta';

type PerfilActor = {
  id: string;
  email: string | null;
  rol: RolAplicacion;
  activo: boolean;
  estado_cuenta: EstadoCuenta;
  superintendencia_id: string | null;
  vigencia_institucional_hasta: string | null;
};

type PerfilObjetivo = {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: string;
  activo: boolean | null;
  estado_cuenta: EstadoCuenta | null;
  superintendencia_id: string | null;
  vigencia_institucional_hasta: string | null;
  requiere_cambio_clave: boolean | null;
};

export type ResultadoAccionUsuario =
  | {
      success: true;
      temporaryPassword?: string;
      nuevoEstado?: EstadoCuenta;
      vigenciaHasta?: string;
    }
  | { success: false; error: string };

const ROLES_VALIDOS = new Set<RolAplicacion>([
  'administrador',
  'supervisor',
  'auditor',
  'operador',
  'consulta',
]);
const ROLES_GESTION = new Set<RolAplicacion>(['administrador', 'supervisor']);
const ROLES_GESTIONABLES_POR_SUPERVISOR = new Set<RolAplicacion>([
  'auditor',
  'operador',
  'consulta',
]);
const MODULOS_VALIDOS = new Set(['allanamientos']);
const ESTADOS_GESTIONABLES = new Set<EstadoCuenta>([
  'activo',
  'pausado',
  'deshabilitado',
]);

class ErrorDeAccion extends Error {}

function normalizarRol(valor: unknown): RolAplicacion | null {
  const rol = normalizarRolUsuario(valor);
  return ROLES_VALIDOS.has(rol as RolAplicacion)
    ? (rol as RolAplicacion)
    : null;
}

function leerTexto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? '').trim();
}

function validarPassword(password: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir mayúscula, minúscula y número.';
  }
  if (password === 'ABCdef123') return 'La contraseña no puede ser la clave temporal anterior.';
  return null;
}

function generarPasswordTemporal(): string {
  const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const minusculas = 'abcdefghijkmnopqrstuvwxyz';
  const numeros = '23456789';
  const simbolos = '!@#$%*-_';
  const todos = `${mayusculas}${minusculas}${numeros}${simbolos}`;
  const caracteres = [
    mayusculas[randomInt(mayusculas.length)],
    minusculas[randomInt(minusculas.length)],
    numeros[randomInt(numeros.length)],
    simbolos[randomInt(simbolos.length)],
  ];

  while (caracteres.length < 16) caracteres.push(todos[randomInt(todos.length)]);
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}

function leerModulos(formData: FormData): string[] {
  const valor = formData.get('modulos_array');
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErrorDeAccion('La lista de módulos es obligatoria.');
  }

  try {
    const modulos = JSON.parse(valor);
    if (!Array.isArray(modulos) || modulos.some(
      (modulo) => typeof modulo !== 'string' || !MODULOS_VALIDOS.has(modulo.trim().toLowerCase()),
    )) {
      throw new Error('Formato inválido');
    }
    return [...new Set(modulos.map((modulo: string) => modulo.trim().toLowerCase()))];
  } catch {
    throw new ErrorDeAccion('La lista de módulos no tiene un formato válido.');
  }
}

function respuestaDeError(
  error: unknown,
  mensajePublico: string,
): ResultadoAccionUsuario {
  if (error instanceof ErrorDeAccion) return { success: false, error: error.message };
  console.error(mensajePublico, error);
  return { success: false, error: mensajePublico };
}

async function obtenerActorAutorizado(): Promise<PerfilActor> {
  const supabaseSesion = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabaseSesion.auth.getUser();
  if (userError || !user) throw new ErrorDeAccion('La sesión no es válida. Volvé a iniciar sesión.');

  const supabaseAdmin = createAdminClient();
  const { data: perfil, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, rol, activo, estado_cuenta, superintendencia_id, vigencia_institucional_hasta',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error || !perfil) throw new ErrorDeAccion('No se encontró un perfil válido para la sesión.');
  const rol = normalizarRol(perfil.rol);
  if (!rol) throw new ErrorDeAccion('El rol de la cuenta no es válido.');

  if (!perfilTieneAcceso(perfil)) {
    throw new ErrorDeAccion('La cuenta no está habilitada o su validación institucional venció.');
  }

  if (rol === 'administrador') {
    const { data: assurance, error: mfaError } = await supabaseSesion.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== 'aal2') {
      throw new ErrorDeAccion('Verificá el segundo factor antes de gestionar usuarios.');
    }
  }

  return {
    id: user.id,
    email: perfil.email || user.email || null,
    rol,
    activo: true,
    estado_cuenta: 'activo',
    superintendencia_id: perfil.superintendencia_id,
    vigencia_institucional_hasta: perfil.vigencia_institucional_hasta,
  };
}

function exigirGestor(actor: PerfilActor) {
  if (!ROLES_GESTION.has(actor.rol)) {
    throw new ErrorDeAccion('No tenés permisos para gestionar usuarios.');
  }
}

async function obtenerPerfilObjetivo(userId: string): Promise<PerfilObjetivo> {
  if (!userId) throw new ErrorDeAccion('No se indicó el usuario objetivo.');
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, email, nombre_completo, rol, activo, estado_cuenta, superintendencia_id, vigencia_institucional_hasta, requiere_cambio_clave',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) throw new ErrorDeAccion('El usuario objetivo no existe.');
  return data as PerfilObjetivo;
}

function exigirPuedeGestionarObjetivo(
  actor: PerfilActor,
  objetivo: PerfilObjetivo,
  nuevoRol?: RolAplicacion,
) {
  exigirGestor(actor);
  const rolObjetivo = normalizarRol(objetivo.rol);
  if (!rolObjetivo) throw new ErrorDeAccion('El rol del usuario objetivo no es válido.');

  if (actor.rol === 'administrador') {
    if (actor.id === objetivo.id && nuevoRol && nuevoRol !== rolObjetivo) {
      throw new ErrorDeAccion('No podés cambiar tu propio rol administrativo.');
    }
    return;
  }

  if (!ROLES_GESTIONABLES_POR_SUPERVISOR.has(rolObjetivo)) {
    throw new ErrorDeAccion('Un supervisor no puede gestionar administradores ni otros supervisores.');
  }
  if (nuevoRol && !ROLES_GESTIONABLES_POR_SUPERVISOR.has(nuevoRol)) {
    throw new ErrorDeAccion('Un supervisor sólo puede asignar roles Auditor, Operador o Consulta.');
  }
}

async function validarSuperintendencia(superintendenciaId: string) {
  if (!superintendenciaId) throw new ErrorDeAccion('Debés seleccionar una superintendencia.');
  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('superintendencias')
    .select('id')
    .eq('id', superintendenciaId)
    .maybeSingle();
  if (error || !data) throw new ErrorDeAccion('La superintendencia seleccionada no existe.');
}

async function validarIdentificadoresUnicos(dni: string, legajo: string, excluirId?: string) {
  if (!/^\d{6,9}$/.test(dni)) throw new ErrorDeAccion('El DNI debe contener entre 6 y 9 números.');
  if (!/^[A-Za-z0-9./-]{3,30}$/.test(legajo)) {
    throw new ErrorDeAccion('El legajo contiene caracteres no válidos.');
  }

  const supabaseAdmin = createAdminClient();
  let consultaDni = supabaseAdmin.from('profiles').select('id').eq('dni', dni);
  let consultaLegajo = supabaseAdmin.from('profiles').select('id').eq('legajo', legajo);
  if (excluirId) {
    consultaDni = consultaDni.neq('id', excluirId);
    consultaLegajo = consultaLegajo.neq('id', excluirId);
  }
  const [{ data: dniExistente }, { data: legajoExistente }] = await Promise.all([
    consultaDni.limit(1),
    consultaLegajo.limit(1),
  ]);
  if (dniExistente?.length) throw new ErrorDeAccion('Ya existe un usuario con ese DNI.');
  if (legajoExistente?.length) throw new ErrorDeAccion('Ya existe un usuario con ese legajo.');
}

export async function crearUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    exigirGestor(actor);

    const nombre = leerTexto(formData, 'nombre');
    const apellido = leerTexto(formData, 'apellido');
    const dni = leerTexto(formData, 'dni');
    const legajo = leerTexto(formData, 'legajo');
    const email = leerTexto(formData, 'email').toLowerCase();
    const superintendenciaId = leerTexto(formData, 'superintendencia_id');
    const referencia = leerTexto(formData, 'referencia_documental');
    const rol = normalizarRol(leerTexto(formData, 'rol'));
    const modulosPermitidos = leerModulos(formData);

    if (!nombre || !apellido || !dni || !legajo || !email || !rol || !referencia) {
      throw new ErrorDeAccion('Todos los campos y la referencia documental son obligatorios.');
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErrorDeAccion('El correo electrónico no es válido.');
    if (rol === 'administrador') {
      throw new ErrorDeAccion('Los administradores se designan mediante la edición de una identidad existente.');
    }
    if (actor.rol === 'supervisor' && !ROLES_GESTIONABLES_POR_SUPERVISOR.has(rol)) {
      throw new ErrorDeAccion('Un supervisor sólo puede crear Auditor, Operador o Consulta.');
    }

    await validarIdentificadoresUnicos(dni, legajo);
    await validarSuperintendencia(superintendenciaId);

    const passwordTemporal = generarPasswordTemporal();
    const nombreCompleto = `${nombre} ${apellido}`.trim();
    const supabaseAdmin = createAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { nombre, apellido, nombre_completo: nombreCompleto, dni, legajo },
    });

    if (authError || !authData.user) {
      if (authError?.message.toLowerCase().includes('already')) {
        throw new ErrorDeAccion('Ya existe una cuenta con ese correo electrónico.');
      }
      throw authError ?? new Error('No se recibió el usuario creado.');
    }

    const { data: vigenciaRpc, error: altaError } = await supabaseAdmin.rpc(
      'confirmar_alta_usuario_atomica',
      {
        p_actor_id: actor.id, p_usuario_id: authData.user.id, p_email: email,
        p_nombre: nombre, p_apellido: apellido, p_dni: dni, p_legajo: legajo,
        p_rol: rol, p_superintendencia_id: superintendenciaId,
        p_modulos: modulosPermitidos, p_referencia: referencia,
      },
    );
    let vigenciaHasta = vigenciaRpc ? String(vigenciaRpc) : null;
    if (altaError || !vigenciaHasta) {
      // Si la respuesta de red se perdió después del commit, no borrar el alta.
      const { data: perfilCreado, error: consultaError } = await supabaseAdmin
        .from('profiles').select('vigencia_institucional_hasta')
        .eq('id', authData.user.id).maybeSingle();
      if (perfilCreado?.vigencia_institucional_hasta) {
        vigenciaHasta = perfilCreado.vigencia_institucional_hasta;
      } else if (consultaError) {
        const { error: bloqueoError } = await supabaseAdmin.auth.admin.updateUserById(
          authData.user.id, { ban_duration: '876600h' },
        );
        console.error('Alta sin confirmación; revisar Auth y perfil.', {
          usuarioId: authData.user.id, error: consultaError.message,
          bloqueo: bloqueoError?.message,
        });
        throw new ErrorDeAccion(`No se pudo confirmar el alta ${authData.user.id}. Revisá la cuenta en Auth y el perfil antes de reintentar.`);
      } else {
        const { error: borradoError } = await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        if (borradoError) {
          const { error: bloqueoError } = await supabaseAdmin.auth.admin.updateUserById(
            authData.user.id, { ban_duration: '876600h' },
          );
          console.error('No se pudo compensar el alta incompleta.', {
            usuarioId: authData.user.id, borrado: borradoError.message,
            bloqueo: bloqueoError?.message,
          });
          throw new ErrorDeAccion(`El alta ${authData.user.id} quedó pendiente de revisión en Auth. No repitas la operación.`);
        }
        throw altaError ?? new Error('No se confirmó el alta institucional.');
      }
    }

    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal, vigenciaHasta: vigenciaHasta! };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo crear el usuario.');
  }
}

export async function editarUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const id = leerTexto(formData, 'id');
    const objetivo = await obtenerPerfilObjetivo(id);
    const nombre = leerTexto(formData, 'nombre');
    const apellido = leerTexto(formData, 'apellido');
    const dni = leerTexto(formData, 'dni');
    const legajo = leerTexto(formData, 'legajo');
    const superintendenciaId = leerTexto(formData, 'superintendencia_id');
    const rol = normalizarRol(leerTexto(formData, 'rol'));
    const modulosPermitidos = leerModulos(formData);

    if (!nombre || !apellido || !dni || !legajo || !rol) {
      throw new ErrorDeAccion('Todos los campos son obligatorios.');
    }
    exigirPuedeGestionarObjetivo(actor, objetivo, rol);
    await validarIdentificadoresUnicos(dni, legajo, id);
    await validarSuperintendencia(superintendenciaId);
    if (superintendenciaId !== objetivo.superintendencia_id) {
      throw new ErrorDeAccion('Para cambiar el destino utilizá la acción Registrar traslado.');
    }

    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.rpc('editar_usuario_atomico', {
      p_actor_id: actor.id,
      p_usuario_id: id,
      p_nombre: nombre,
      p_apellido: apellido,
      p_dni: dni,
      p_legajo: legajo,
      p_rol: rol,
      p_modulos: modulosPermitidos,
    });
    if (error) throw error;

    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo editar el usuario.');
  }
}

export async function revalidarUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const userId = leerTexto(formData, 'id');
    const referencia = leerTexto(formData, 'referencia_documental');
    const motivo = leerTexto(formData, 'motivo') || 'Revalidación institucional periódica';
    if (!referencia) throw new ErrorDeAccion('La referencia documental es obligatoria.');

    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    if (normalizarRol(objetivo.rol) === 'administrador') {
      throw new ErrorDeAccion('El administrador único no requiere revalidación institucional.');
    }
    if (objetivo.estado_cuenta !== 'activo') {
      throw new ErrorDeAccion('Una cuenta pausada o con baja operativa debe reactivarse, no revalidarse.');
    }

    const supabaseAdmin = createAdminClient();
    const { data: vigenciaHasta, error } = await supabaseAdmin.rpc(
      'revalidar_usuario_atomico',
      { p_actor_id: actor.id, p_usuario_id: userId, p_motivo: motivo, p_referencia: referencia },
    );
    if (error) throw error;
    if (!vigenciaHasta) throw new Error('La revalidación no devolvió la nueva vigencia.');

    revalidatePath('/admin/usuarios');
    return { success: true, vigenciaHasta: String(vigenciaHasta) };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo revalidar el usuario.');
  }
}

export async function registrarTrasladoUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const userId = leerTexto(formData, 'id');
    const nuevaSuperintendenciaId = leerTexto(formData, 'superintendencia_id');
    const motivo = leerTexto(formData, 'motivo');
    const referencia = leerTexto(formData, 'referencia_documental');
    if (!motivo || !referencia) {
      throw new ErrorDeAccion('El motivo y la referencia documental son obligatorios.');
    }

    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    if (actor.id === objetivo.id) throw new ErrorDeAccion('No podés registrar tu propio traslado.');
    if (objetivo.estado_cuenta !== 'activo') {
      throw new ErrorDeAccion('Primero debés reactivar la identidad y luego registrar el traslado.');
    }
    await validarSuperintendencia(nuevaSuperintendenciaId);
    if (nuevaSuperintendenciaId === objetivo.superintendencia_id) {
      throw new ErrorDeAccion('La nueva superintendencia debe ser diferente de la actual.');
    }

    const supabaseAdmin = createAdminClient();
    const { data: vigenciaHasta, error: trasladoError } = await supabaseAdmin.rpc(
      'trasladar_usuario_atomico',
      {
        p_actor_id: actor.id,
        p_usuario_id: userId,
        p_destino_id: nuevaSuperintendenciaId,
        p_motivo: motivo,
        p_referencia: referencia,
      },
    );
    if (trasladoError) {
      if (trasladoError.message === 'El traslado del mismo día requiere una fecha de inicio anterior') {
        throw new ErrorDeAccion('No se puede trasladar esta identidad el mismo día en que comenzó su asignación.');
      }
      throw trasladoError;
    }
    if (!vigenciaHasta) throw new Error('El traslado no devolvió la vigencia nueva.');

    revalidatePath('/admin/usuarios');
    return { success: true, vigenciaHasta: String(vigenciaHasta) };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo registrar el traslado.');
  }
}

export async function cambiarEstadoUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const userId = leerTexto(formData, 'id');
    const estado = leerTexto(formData, 'estado') as EstadoCuenta;
    const motivo = leerTexto(formData, 'motivo');
    const referencia = leerTexto(formData, 'referencia_documental');
    if (!ESTADOS_GESTIONABLES.has(estado)) throw new ErrorDeAccion('El estado solicitado no es válido.');
    if (!motivo) throw new ErrorDeAccion('Debés indicar el motivo de la decisión.');
    if (estado === 'activo' && !referencia) {
      throw new ErrorDeAccion('La reactivación requiere una referencia documental.');
    }

    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    if (actor.id === objetivo.id) throw new ErrorDeAccion('No podés cambiar el estado de tu propia cuenta.');

    const supabaseAdmin = createAdminClient();
    const operacionId = randomUUID();
    const { error: inicioError } = await supabaseAdmin.rpc('iniciar_cambio_estado_usuario', {
      p_operacion_id: operacionId,
      p_actor_id: actor.id,
      p_usuario_id: userId,
      p_estado_anterior: objetivo.estado_cuenta,
      p_estado_nuevo: estado,
      p_motivo: motivo,
      p_referencia: referencia || null,
    });
    if (inicioError) {
      if (inicioError.message.includes('reactivación del mismo día')) {
        throw new ErrorDeAccion('No se puede reactivar el mismo día de la baja: las fechas de asignación se superpondrían.');
      }
      throw inicioError;
    }

    const temporaryPassword = estado === 'activo' ? generarPasswordTemporal() : undefined;
    let authError: Error | null = null;
    try {
      const resultadoAuth = await supabaseAdmin.auth.admin.updateUserById(userId,
        estado === 'activo'
          ? { password: temporaryPassword!, ban_duration: 'none' }
          : { ban_duration: '876600h' },
      );
      authError = resultadoAuth.error;
    } catch (error) {
      authError = error instanceof Error ? error : new Error('Auth no respondió');
    }

    const { data: vigenciaHasta, error: finalError } = await supabaseAdmin.rpc(
      'finalizar_cambio_estado_usuario',
      { p_operacion_id: operacionId, p_auth_confirmada: !authError },
    );
    if (finalError) {
      console.error('Cambio de estado pendiente de conciliación.', {
        operacionId, userId, mensaje: finalError.message,
      });
      throw new ErrorDeAccion(`La operación ${operacionId} quedó pendiente de conciliación. La cuenta permanece bloqueada en la aplicación; informá este código a la oficina COP.`);
    }
    if (authError) {
      console.error('Auth no confirmó el cambio de estado.', { operacionId, userId, error: authError.message });
      revalidatePath('/admin/usuarios');
      throw new ErrorDeAccion(`Auth no confirmó la operación ${operacionId}. La cuenta permanece bloqueada en la aplicación; informá este código a la oficina COP.`);
    }

    revalidatePath('/admin/usuarios');
    return {
      success: true,
      nuevoEstado: estado,
      temporaryPassword,
      vigenciaHasta: vigenciaHasta ? String(vigenciaHasta) : undefined,
    };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar el estado del usuario.');
  }
}

export async function conciliarCambioEstadoUsuarioAction(
  formData: FormData,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    if (actor.rol !== 'administrador') {
      throw new ErrorDeAccion('Sólo el administrador puede conciliar operaciones pendientes.');
    }
    const operacionId = leerTexto(formData, 'operacion_id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operacionId)) {
      throw new ErrorDeAccion('Ingresá un código de operación válido.');
    }
    const supabaseAdmin = createAdminClient();
    const { data: operacion, error: consultaError } = await supabaseAdmin.rpc(
      'obtener_cambio_estado_pendiente', { p_operacion_id: operacionId },
    );
    if (consultaError || !operacion?.usuario_id) {
      throw new ErrorDeAccion('No se encontró una operación pendiente con ese código.');
    }
    const estado = String(operacion.estado_nuevo);
    const usuarioId = String(operacion.usuario_id);
    const temporaryPassword = estado === 'activo' ? generarPasswordTemporal() : undefined;
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(usuarioId,
      estado === 'activo'
        ? { password: temporaryPassword!, ban_duration: 'none' }
        : { ban_duration: '876600h' },
    );
    if (authError) {
      console.error('Auth no permitió conciliar el estado de usuario.', { operacionId, usuarioId, error: authError.message });
      throw new ErrorDeAccion(`Auth sigue sin confirmar la operación ${operacionId}. La identidad permanece bloqueada en la aplicación.`);
    }
    const { data: vigenciaHasta, error: finalError } = await supabaseAdmin.rpc(
      'finalizar_cambio_estado_usuario',
      { p_operacion_id: operacionId, p_auth_confirmada: true },
    );
    if (finalError) {
      console.error('No se pudo confirmar la conciliación.', { operacionId, usuarioId, error: finalError.message });
      throw new ErrorDeAccion(`La operación ${operacionId} sigue pendiente de conciliación. La identidad permanece bloqueada en la aplicación.`);
    }
    revalidatePath('/admin/usuarios');
    return {
      success: true, nuevoEstado: estado as EstadoCuenta, temporaryPassword,
      vigenciaHasta: vigenciaHasta ? String(vigenciaHasta) : undefined,
    };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo conciliar el cambio de estado.');
  }
}

export async function resetearPasswordAction(
  userId: string,
): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    const passwordTemporal = generarPasswordTemporal();
    const supabaseAdmin = createAdminClient();
    const operacionId = randomUUID();
    const { error: inicioError } = await supabaseAdmin.rpc('iniciar_reset_clave_usuario', {
      p_operacion_id: operacionId, p_actor_id: actor.id, p_usuario_id: userId,
    });
    if (inicioError) throw inicioError;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: passwordTemporal,
    });
    if (authError) {
      console.error('Auth no confirmó el restablecimiento.', { operacionId, userId, error: authError.message });
      throw new ErrorDeAccion(`Operación ${operacionId} pendiente. La cuenta está bloqueada; conciliá la operación antes de volver a usarla.`);
    }
    const { error: finalError } = await supabaseAdmin.rpc('finalizar_reset_clave_usuario', {
      p_operacion_id: operacionId,
    });
    if (finalError) {
      console.error('No se pudo confirmar el restablecimiento.', { operacionId, userId, error: finalError.message });
      throw new ErrorDeAccion(`Operación ${operacionId} pendiente. La cuenta está bloqueada; conciliá la operación para generar otra clave temporal.`);
    }
    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo restablecer la contraseña.');
  }
}

export async function conciliarResetClaveUsuarioAction(formData: FormData): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    if (actor.rol !== 'administrador') {
      throw new ErrorDeAccion('Sólo el administrador puede conciliar operaciones pendientes.');
    }
    const operacionId = leerTexto(formData, 'operacion_id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operacionId)) {
      throw new ErrorDeAccion('Ingresá un código de operación válido.');
    }
    const supabaseAdmin = createAdminClient();
    const { data: op, error: consultaError } = await supabaseAdmin.rpc(
      'obtener_reset_clave_pendiente', { p_operacion_id: operacionId },
    );
    if (consultaError || !op?.usuario_id) {
      throw new ErrorDeAccion('No se encontró un restablecimiento pendiente con ese código.');
    }
    const userId = String(op.usuario_id);
    const passwordTemporal = generarPasswordTemporal();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: passwordTemporal,
    });
    if (authError) {
      console.error('Auth no permitió conciliar la clave.', { operacionId, userId, error: authError.message });
      throw new ErrorDeAccion(`La operación ${operacionId} sigue pendiente. La cuenta permanece bloqueada.`);
    }
    const { error: finalError } = await supabaseAdmin.rpc('finalizar_reset_clave_usuario', {
      p_operacion_id: operacionId,
    });
    if (finalError) {
      console.error('No se pudo finalizar la clave conciliada.', { operacionId, userId, error: finalError.message });
      throw new ErrorDeAccion(`La operación ${operacionId} sigue pendiente. La cuenta permanece bloqueada.`);
    }
    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo conciliar el restablecimiento.');
  }
}

async function actualizarPasswordDeSesion(
  nuevaPassword: string,
  accion: 'cambiar_password_obligatorio' | 'cambiar_password_sesion',
): Promise<ResultadoAccionUsuario> {
  try {
    const passwordError = validarPassword(nuevaPassword);
    if (passwordError) throw new ErrorDeAccion(passwordError);
    const supabaseSesion = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseSesion.auth.getUser();
    if (userError || !user) throw new ErrorDeAccion('La sesión no es válida. Volvé a iniciar sesión.');

    const supabaseAdmin = createAdminClient();
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('profiles')
      .select('rol, superintendencia_id')
      .eq('id', user.id)
      .maybeSingle();
    if (perfilError || !perfil) {
      throw new ErrorDeAccion('No se encontró un perfil válido para la sesión.');
    }

    const { error: passwordUpdateError } = await supabaseSesion.auth.updateUser({ password: nuevaPassword });
    if (passwordUpdateError) throw passwordUpdateError;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: false, password_changed_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileError) throw profileError;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor: { id: user.id, email: user.email || null, rol: perfil.rol || 'usuario' },
      modulo: 'seguridad',
      accion,
      entidadTipo: 'usuario',
      entidadId: user.id,
      superintendenciaId: perfil.superintendencia_id || null,
      detalles: { requiere_cambio_clave: false },
    });
    revalidatePath('/select-app');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar la contraseña.');
  }
}

export async function cambiarPasswordObligatorioAction(
  nuevaPassword: string,
): Promise<ResultadoAccionUsuario> {
  return actualizarPasswordDeSesion(nuevaPassword, 'cambiar_password_obligatorio');
}

export async function actualizarPasswordRecuperacionAction(
  nuevaPassword: string,
): Promise<ResultadoAccionUsuario> {
  return actualizarPasswordDeSesion(nuevaPassword, 'cambiar_password_sesion');
}
