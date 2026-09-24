'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { registrarEventoAuditoria } from '@/lib/auditoria';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  fechaHoyArgentina,
  fechaVigenciaNueva,
  normalizarRolUsuario,
  perfilTieneAcceso,
  sumarDiasFecha,
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

async function registrarAsignacionInicial(params: {
  usuarioId: string;
  superintendenciaId: string;
  actorId: string;
  referencia: string;
  motivo?: string;
}) {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.from('usuario_asignaciones').insert({
    usuario_id: params.usuarioId,
    superintendencia_id: params.superintendenciaId,
    vigente_desde: fechaHoyArgentina(),
    vigente_hasta: null,
    motivo: params.motivo || 'Alta inicial',
    referencia_documental: params.referencia,
    registrada_por: params.actorId,
  });
  if (error) throw error;
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
    const vigenciaHasta = fechaVigenciaNueva();
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
      estado_cuenta: 'activo',
      vigencia_institucional_hasta: vigenciaHasta,
      revalidado_at: new Date().toISOString(),
      revalidado_por: actor.id,
      referencia_vigencia: referencia.slice(0, 500),
      requiere_cambio_clave: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    try {
      await registrarAsignacionInicial({
        usuarioId: authData.user.id,
        superintendenciaId,
        actorId: actor.id,
        referencia,
      });
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw error;
    }

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'crear_usuario',
      entidadTipo: 'usuario',
      entidadId: authData.user.id,
      superintendenciaId,
      referenciaDocumental: referencia,
      detalles: { email, nombre_completo: nombreCompleto, rol, vigencia_hasta: vigenciaHasta },
    });

    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal, vigenciaHasta };
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
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre,
        apellido,
        nombre_completo: `${nombre} ${apellido}`.trim(),
        dni,
        legajo,
        rol,
        modulos_permitidos: modulosPermitidos,
        vigencia_institucional_hasta: rol === 'administrador' ? null : objetivo.vigencia_institucional_hasta,
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
        modulos_permitidos: modulosPermitidos,
      },
    });

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

    const vigenciaHasta = fechaVigenciaNueva();
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        activo: true,
        estado_cuenta: 'activo',
        vigencia_institucional_hasta: vigenciaHasta,
        revalidado_at: new Date().toISOString(),
        revalidado_por: actor.id,
        referencia_vigencia: referencia.slice(0, 500),
        motivo_estado: null,
      })
      .eq('id', userId);
    if (error) throw error;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'revalidar_usuario',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      motivo,
      referenciaDocumental: referencia,
      detalles: { email: objetivo.email, vigencia_hasta: vigenciaHasta },
    });

    revalidatePath('/admin/usuarios');
    return { success: true, vigenciaHasta };
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

    const vigenciaHasta = fechaVigenciaNueva();
    const supabaseAdmin = createAdminClient();
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        superintendencia_id: nuevaSuperintendenciaId,
        activo: true,
        estado_cuenta: 'activo',
        vigencia_institucional_hasta: vigenciaHasta,
        revalidado_at: new Date().toISOString(),
        revalidado_por: actor.id,
        referencia_vigencia: referencia.slice(0, 500),
        requiere_cambio_clave: true,
        motivo_estado: motivo.slice(0, 1000),
      })
      .eq('id', userId);
    if (profileError) throw profileError;

    const ayer = sumarDiasFecha(fechaHoyArgentina(), -1);
    const { error: cierreError } = await supabaseAdmin
      .from('usuario_asignaciones')
      .update({ vigente_hasta: ayer })
      .eq('usuario_id', userId)
      .is('vigente_hasta', null);
    const { error: nuevaError } = await supabaseAdmin.from('usuario_asignaciones').insert({
      usuario_id: userId,
      superintendencia_id: nuevaSuperintendenciaId,
      vigente_desde: fechaHoyArgentina(),
      vigente_hasta: null,
      motivo: motivo.slice(0, 1000),
      referencia_documental: referencia.slice(0, 500),
      registrada_por: actor.id,
    });

    if (cierreError || nuevaError) {
      await supabaseAdmin
        .from('profiles')
        .update({ superintendencia_id: objetivo.superintendencia_id })
        .eq('id', userId);
      throw cierreError ?? nuevaError;
    }

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'trasladar_usuario',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: nuevaSuperintendenciaId,
      motivo,
      referenciaDocumental: referencia,
      detalles: {
        email: objetivo.email,
        superintendencia_anterior: objetivo.superintendencia_id,
        superintendencia_nueva: nuevaSuperintendenciaId,
        vigencia_hasta: vigenciaHasta,
        requiere_cambio_clave: true,
      },
    });

    revalidatePath('/admin/usuarios');
    return { success: true, vigenciaHasta };
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

    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    if (actor.id === objetivo.id) throw new ErrorDeAccion('No podés cambiar el estado de tu propia cuenta.');

    const supabaseAdmin = createAdminClient();
    let temporaryPassword: string | undefined;
    let vigenciaHasta = objetivo.vigencia_institucional_hasta;

    if (estado === 'activo') {
      temporaryPassword = generarPasswordTemporal();
      vigenciaHasta = fechaVigenciaNueva();
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
        ban_duration: 'none',
      });
      if (authError) throw authError;
    } else {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: '876600h',
      });
      if (authError) throw authError;
    }

    const cambiosPerfil: Record<string, unknown> = {
      activo: estado === 'activo',
      estado_cuenta: estado,
      motivo_estado: motivo.slice(0, 1000),
      referencia_estado: referencia ? referencia.slice(0, 500) : null,
      estado_actualizado_at: new Date().toISOString(),
      estado_actualizado_por: actor.id,
    };
    if (estado === 'activo') {
      cambiosPerfil.vigencia_institucional_hasta = vigenciaHasta;
      cambiosPerfil.revalidado_at = new Date().toISOString();
      cambiosPerfil.revalidado_por = actor.id;
      cambiosPerfil.referencia_vigencia = referencia.slice(0, 500);
      cambiosPerfil.requiere_cambio_clave = true;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(cambiosPerfil)
      .eq('id', userId);

    if (profileError) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: estado === 'activo' ? '876600h' : 'none',
      });
      throw profileError;
    }

    if (estado === 'deshabilitado') {
      await supabaseAdmin
        .from('usuario_asignaciones')
        .update({ vigente_hasta: fechaHoyArgentina() })
        .eq('usuario_id', userId)
        .is('vigente_hasta', null);
    } else if (estado === 'activo') {
      const { data: asignacionAbierta } = await supabaseAdmin
        .from('usuario_asignaciones')
        .select('id')
        .eq('usuario_id', userId)
        .is('vigente_hasta', null)
        .limit(1);
      if (!asignacionAbierta?.length && objetivo.superintendencia_id) {
        await registrarAsignacionInicial({
          usuarioId: userId,
          superintendenciaId: objetivo.superintendencia_id,
          actorId: actor.id,
          referencia,
          motivo: `Reactivación: ${motivo}`,
        });
      }
    }

    const accion =
      estado === 'activo'
        ? 'reactivar_usuario'
        : estado === 'pausado'
          ? 'pausar_usuario'
          : 'deshabilitar_usuario';
    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion,
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      motivo,
      referenciaDocumental: referencia || null,
      detalles: {
        email: objetivo.email,
        estado_anterior: objetivo.estado_cuenta,
        estado_nuevo: estado,
        vigencia_hasta: vigenciaHasta,
      },
    });

    revalidatePath('/admin/usuarios');
    return {
      success: true,
      nuevoEstado: estado,
      temporaryPassword,
      vigenciaHasta: vigenciaHasta || undefined,
    };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar el estado del usuario.');
  }
}

export async function eliminarUsuarioAction(userId: string): Promise<ResultadoAccionUsuario> {
  try {
    const actor = await obtenerActorAutorizado();
    const objetivo = await obtenerPerfilObjetivo(userId);
    exigirPuedeGestionarObjetivo(actor, objetivo);
    if (actor.rol !== 'administrador') throw new ErrorDeAccion('Sólo el administrador puede eliminar usuarios.');
    if (actor.id === objetivo.id) throw new ErrorDeAccion('No podés eliminar tu propia cuenta.');

    const supabaseAdmin = createAdminClient();
    const { count } = await supabaseAdmin
      .from('allanamientos')
      .select('id', { count: 'exact', head: true })
      .eq('operador_id', userId);
    if ((count ?? 0) > 0) {
      throw new ErrorDeAccion('El usuario posee actividad histórica. Utilizá Baja operativa para conservar la trazabilidad.');
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'eliminar_usuario',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      motivo: 'Eliminación excepcional de cuenta sin actividad operativa',
      detalles: { email: objetivo.email, nombre_completo: objetivo.nombre_completo, rol: objetivo.rol },
    });
    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo eliminar el usuario.');
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

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: true })
      .eq('id', userId);
    if (profileError) throw profileError;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: passwordTemporal,
    });
    if (authError) {
      await supabaseAdmin
        .from('profiles')
        .update({ requiere_cambio_clave: objetivo.requiere_cambio_clave ?? false })
        .eq('id', userId);
      throw authError;
    }

    await registrarEventoAuditoria(supabaseAdmin, {
      actor,
      modulo: 'usuarios',
      accion: 'restablecer_password',
      entidadTipo: 'usuario',
      entidadId: userId,
      superintendenciaId: objetivo.superintendencia_id,
      detalles: { email: objetivo.email, requiere_cambio_clave: true },
    });
    revalidatePath('/admin/usuarios');
    return { success: true, temporaryPassword: passwordTemporal };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo restablecer la contraseña.');
  }
}

export async function cambiarPasswordObligatorioAction(
  nuevaPassword: string,
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

    const { error: passwordUpdateError } = await supabaseSesion.auth.updateUser({ password: nuevaPassword });
    if (passwordUpdateError) throw passwordUpdateError;

    const supabaseAdmin = createAdminClient();
    const { data: perfil } = await supabaseAdmin
      .from('profiles')
      .select('rol, superintendencia_id')
      .eq('id', user.id)
      .maybeSingle();
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ requiere_cambio_clave: false, password_changed_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileError) throw profileError;

    await registrarEventoAuditoria(supabaseAdmin, {
      actor: { id: user.id, email: user.email || null, rol: perfil?.rol || 'usuario' },
      modulo: 'seguridad',
      accion: 'cambiar_password_obligatorio',
      entidadTipo: 'usuario',
      entidadId: user.id,
      superintendenciaId: perfil?.superintendencia_id || null,
      detalles: { requiere_cambio_clave: false },
    });
    revalidatePath('/select-app');
    return { success: true };
  } catch (error) {
    return respuestaDeError(error, 'No se pudo cambiar la contraseña.');
  }
}
