'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { registrarEventoAuditoria } from '@/lib/auditoria';

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
  superintendencia_id: string | null;
};

type PerfilObjetivo = {
  id: string;
  email: string | null;
  nombre_completo: string | null;
  rol: string;
  activo: boolean | null;
  superintendencia_id: string | null;
};

type ResultadoAccion =
  | { success: true; temporaryPassword?: string; nuevoEstado?: boolean }
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

// Durante esta etapa sólo habilitamos el módulo que tiene requerimientos definidos.
const MODULOS_VALIDOS = new Set(['allanamientos']);

class ErrorDeAccion extends Error {}

function normalizarRol(valor: unknown): RolAplicacion | null {
  const rol = String(valor ?? '').trim().toLowerCase();

  // Compatibilidad temporal con el valor viejo existente en la base.
  if (rol === 'admin') return 'administrador';

  return ROLES_VALIDOS.has(rol as RolAplicacion)
    ? (rol as RolAplicacion)
    : null;
}

function leerTexto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? '').trim();
}

function validarPassword(password: string): string | null {
  if (password.length < 10) {
    return 'La contraseña debe tener al menos 10 caracteres.';
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir mayúscula, minúscula y número.';
  }

  if (password === 'ABCdef123') {
    return 'La contraseña no puede ser la clave temporal anterior.';
  }

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

  while (caracteres.length < 16) {
    caracteres.push(todos[randomInt(todos.length)]);
  }

  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join('');
}

function leerModulos(formData: FormData): string[] {
  const valor = leerTexto(formData, 'modulos_array');

  if (!valor) return ['allanamientos'];

  try {
    const modulos = JSON.parse(valor);
    if (!Array.isArray(modulos)) throw new Error('Formato inválido');

    const permitidos = modulos
      .map((modulo) => String(modulo).trim().toLowerCase())
      .filter(
        (modulo, index, lista) =>
          MODULOS_VALIDOS.has(modulo) && lista.indexOf(modulo) === index,
      );

    return permitidos.length > 0 ? permitidos : ['allanamientos'];
  } catch {
    throw new ErrorDeAccion('La lista de módulos no tiene un formato válido.');
  }
}

function respuestaDeError(error: unknown, mensajePublico: string): ResultadoAccion {
  if (error instanceof ErrorDeAccion) {
    return { success: false, error: error.message };
  }

  console.error(mensajePublico, error);
  return { success: false, error: mensajePublico };
}

async function obtenerActorAutorizado(): Promise<PerfilActor> {
  const supabaseSesion = await createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabaseSesion.auth.getUser();

  if (userError || !user) {
    throw new ErrorDeAccion('La sesión no es válida. Volvé a iniciar sesión.');
  }

  const supabaseAdmin = createAdminClient();
  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, rol, activo, superintendencia_id')
    .eq('id', user.id)
    .maybeSingle();

  if (perfilError || !perfil) {
    throw new ErrorDeAccion('No se encontró un perfil válido para la sesión.');
  }

  const rol = normalizarRol(perfil.rol);
  if (!rol) {
    throw new ErrorDeAccion('El rol de la cuenta no es válido.');
  }

  if (perfil.activo === false) {
    throw new ErrorDeAccion('La cuenta se encuentra desactivada.');
  }

  return {
    id: user.id,
    email: perfil.email || user.email || null,
    rol,
    activo: true,
    superintendencia_id: perfil.superintendencia_id,
  };
}

function exigirGestor(actor: PerfilActor) {
  if (!ROLES_GESTION.has(actor.rol)) {
    throw new ErrorDeAccion('No tenés permisos para gestionar usuarios.');
  }
}

async function obtenerPerfilObjetivo(userId: string): Promise<PerfilObjetivo> {
  if (!userId) {
    throw new ErrorDeAccion('No se indicó el usuario objetivo.');
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, nombre_completo, rol, activo, superintendencia_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new ErrorDeAccion('El usuario objetivo no existe.');
  }

  return data as PerfilObjetivo;
}

function exigirPuedeGestionarObjetivo(
  actor: PerfilActor,
  objetivo: PerfilObjetivo,
  nuevoRol?: RolAplicacion,
) {
  exigirGestor(actor);

  if (actor.rol === 'administrador') {
    if (
      actor.id === objetivo.id &&
      nuevoRol &&
      nuevoRol !== normalizarRol(objetivo.rol)
    ) {
      throw new ErrorDeAccion('No podés cambiar tu propio rol administrativo.');
    }
    return;
  }

  const rolObjetivo = normalizarRol(objetivo.rol);
  if (!rolObjetivo || !ROLES_GESTIONABLES_POR_SUPERVISOR.has(rolObjetivo)) {
    throw new ErrorDeAccion(
      'Un supervisor no puede gestionar administradores ni otros supervisores.',
    );
  }

  if (nuevoRol && !ROLES_GESTIONABLES_POR_SUPERVISOR.has(nuevoRol)) {
    throw new ErrorDeAccion(
      'Un supervisor sólo puede asignar roles Auditor, Operador o Consulta.',
    );
  }
}

async function validarSuperintendencia(superintendenciaId: string) {
  if (!superintendenciaId) {
    throw new ErrorDeAccion('Debés seleccionar una superintendencia.');
  }

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin
    .from('superintendencias')
    .select('id')
    .eq('id', superintendenciaId)
    .maybeSingle();

  if (error || !data) {
    throw new ErrorDeAccion('La superintendencia seleccionada no existe.');
  }
}

export async function crearUsuarioAction(formData: FormData): Promise<ResultadoAccion> {
  try {
    const actor = await obtenerActorAutorizado();
    exigirGestor(actor);

    const nombre = leerTexto(formData, 'nombre');
    const apellido = leerTexto(formData, 'apellido');
    const dni = leerTexto(formData, 'dni');
    const legajo = leerTexto(formData, 'legajo');
    const email = leerTexto(formData, 'email').toLowerCase();
    const superintendenciaId = leerTexto(formData, 'superintendencia_id');
    const rol = normalizarRol(leerTexto(formData, 'rol'));
    const modulosPermitidos = leerModulos(formData);

    if (!nombre || !apellido || !dni || !legajo || !email || !rol) {
      throw new ErrorDeAccion('Todos los campos son obligatorios.');
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new ErrorDeAccion('El correo electrónico no es válido.');
    }

    if (
      actor.rol === 'supervisor' &&
      !ROLES_GESTIONABLES_POR_SUPERVISOR.has(rol)
    ) {
      throw new ErrorDeAccion(
        'Un supervisor sólo puede crear Auditor, Operador o Consulta.',
      );
    }

    await validarSuperintendencia(superintendenciaId);

    const passwordTemporal = generarPasswordTemporal();
    const nombreCompleto = `${nombre} ${apellido}`.trim();
    const supabaseAdmin = createAdminClient();

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: passwordTemporal,
        email_confirm: true,
        user_metadata: {
          nombre,
          apellido,
          nombre_completo: nombreCompleto,
          dni,
          legajo,
        },
      });

    if (authError || !authData.user) {
      if (authError?.message.toLowerCase().includes('already')) {
        throw new ErrorDeAccion('Ya existe una cuenta con ese correo electrónico.');
      }
      throw authError ?? new Error('No se recibió el usuario creado.');
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authData.user.id,
      email,
      nombre,
      apellido,
      nombre_completo: nombreCompleto,
      dni,
      legajo,
      rol,
      superintendencia_id: superintendenciaId,
      modulos_permitidos: modulosPermitidos,
      activo: true,
      requiere_cambio_clave: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'crear_usuario',
      entidadTipo: 'usuario',
      entidadId: authData.user.id,
      superintendenciaId,
      detalles: {
        email,
        nombre_completo: nombreCompleto,
        rol,
        modulos_permitidos: modulosPermitidos,
      },
    });

    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo crear el usuario.');
  }
}

export async function editarUsuarioAction(formData: FormData): Promise<ResultadoAccion> {
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
    await validarSuperintendencia(superintendenciaId);

    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre,
        apellido,
        nombre_completo: `${nombre} ${apellido}`.trim(),
        dni,
        legajo,
        superintendencia_id: superintendenciaId,
        rol,
        modulos_permitidos: modulosPermitidos,
      })
      .eq('id', id);

    if (error) throw error;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'editar_usuario',
      entidadTipo: 'usuario',
      entidadId: id,
      superintendenciaId,
      detalles: {
        email: objetivo.email,
        nombre_completo: `${nombre} ${apellido}`.trim(),
        rol_anterior: objetivo.rol,
        rol_nuevo: rol,
        superintendencia_anterior: objetivo.superintendencia_id,
        modulos_permitidos: modulosPermitidos,
      },
    });

    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo editar el usuario.');
  }
}

export async function toggleEstadoUsuarioAction(userId: string): Promise<ResultadoAccion> {
  try {
    const actor = await obtenerActorAutorizado();
    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);

    if (actor.id === objetivo.id) {
      throw new ErrorDeAccion('No podés desactivar tu propia cuenta.');
    }

    const nuevoEstado = objetivo.activo === false;
    const supabaseAdmin = createAdminClient();

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { ban_duration: nuevoEstado ? 'none' : '876600h' },
    );

    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ activo: nuevoEstado })
      .eq('id', userId);

    if (profileError) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: objetivo.activo === false ? '876600h' : 'none',
      });
      throw profileError;
    }

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: nuevoEstado ? 'activar_usuario' : 'pausar_usuario',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      detalles: {
        email: objetivo.email,
        nombre_completo: objetivo.nombre_completo,
        rol: objetivo.rol,
      },
    });

    revalidatePath('/admin/usuarios');
    return { success: true, nuevoEstado };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar el estado del usuario.');
  }
}

export async function eliminarUsuarioAction(userId: string): Promise<ResultadoAccion> {
  try {
    const actor = await obtenerActorAutorizado();
    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);

    if (actor.rol !== 'administrador') {
      throw new ErrorDeAccion('Sólo un administrador puede eliminar usuarios.');
    }

    if (actor.id === objetivo.id) {
      throw new ErrorDeAccion('No podés eliminar tu propia cuenta.');
    }

    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'eliminar_usuario',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      detalles: {
        email: objetivo.email,
        nombre_completo: objetivo.nombre_completo,
        rol: objetivo.rol,
      },
    });

    // profiles.id tiene FK a auth.users con ON DELETE CASCADE.
    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo eliminar el usuario.');
  }
}

export async function resetearPasswordAction(
  userId: string,
  nuevaPassword: string,
): Promise<ResultadoAccion> {
  try {
    const actor = await obtenerActorAutorizado();
    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);

    const passwordError = validarPassword(nuevaPassword);
    if (passwordError) throw new ErrorDeAccion(passwordError);

    const supabaseAdmin = createAdminClient();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: nuevaPassword },
    );

    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: true })
      .eq('id', userId);

    if (profileError) throw profileError;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'restablecer_password',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      detalles: {
        email: objetivo.email,
        requiere_cambio_clave: true,
      },
    });

    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo restablecer la contraseña.');
  }
}

export async function cambiarPasswordObligatorioAction(
  nuevaPassword: string,
): Promise<ResultadoAccion> {
  try {
    const passwordError = validarPassword(nuevaPassword);
    if (passwordError) throw new ErrorDeAccion(passwordError);

    const supabaseSesion = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseSesion.auth.getUser();

    if (userError || !user) {
      throw new ErrorDeAccion('La sesión no es válida. Volvé a iniciar sesión.');
    }

    const { error: passwordUpdateError } = await supabaseSesion.auth.updateUser({
      password: nuevaPassword,
    });

    if (passwordUpdateError) throw passwordUpdateError;

    const supabaseAdmin = createAdminClient();
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: false })
      .eq('id', user.id);

    if (profileError) throw profileError;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor: {
        id: user.id,
        email: user.email || null,
        rol: 'usuario',
      },
      modulo: 'seguridad',
      accion: 'cambiar_password_obligatorio',
      entidadTipo: 'usuario',
      entidadId: user.id,
      detalles: { requiere_cambio_clave: false },
    });

    revalidatePath('/select-app');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar la contraseña.');
  }
}
