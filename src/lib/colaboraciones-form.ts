export type ColaboracionFormulario = {
  especialidad: string
  cant_solicitada: number | string
  cant_afectada: number | string
}

export function crearColaboracionVacia(): ColaboracionFormulario {
  return { especialidad: '', cant_solicitada: 0, cant_afectada: 0 }
}

export function tieneCantidadSinEspecialidad(
  colaboraciones: ColaboracionFormulario[],
): boolean {
  return colaboraciones.some((colaboracion) =>
    !colaboracion.especialidad.trim() &&
    (Number(colaboracion.cant_solicitada) !== 0 || Number(colaboracion.cant_afectada) !== 0),
  )
}
