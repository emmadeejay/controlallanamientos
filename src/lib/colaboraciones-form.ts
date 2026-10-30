export type ColaboracionFormulario = {
  especialidad: string
  cant_solicitada: number
  cant_afectada: number
}

export function crearColaboracionVacia(): ColaboracionFormulario {
  return { especialidad: '', cant_solicitada: 0, cant_afectada: 0 }
}

export function tieneCantidadSinEspecialidad(
  colaboraciones: ColaboracionFormulario[],
): boolean {
  return colaboraciones.some((colaboracion) =>
    !colaboracion.especialidad.trim() &&
    (colaboracion.cant_solicitada !== 0 || colaboracion.cant_afectada !== 0),
  )
}
