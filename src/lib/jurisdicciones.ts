// 23 provincias y la Ciudad Autónoma de Buenos Aires (24 jurisdicciones).
export const JURISDICCIONES_ARGENTINA = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco',
  'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy',
  'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
  'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe',
  'Santiago del Estero', 'Tierra del Fuego, Antártida e Islas del Atlántico Sur',
  'Tucumán',
] as const

export function ubicacionAllanamiento(item: { partido?: string | null; localidad?: string | null; provincia?: string | null }) {
  const destino = item.provincia === 'Buenos Aires' || !item.provincia ? item.partido : item.localidad
  return [destino, item.provincia && item.provincia !== 'Buenos Aires' ? item.provincia : null]
    .filter(Boolean).join(', ') || 'Sin ubicación'
}

export function horarioAllanamiento(item: { en_el_acto?: boolean | null; horario_ejecucion?: string | null }) {
  return item.en_el_acto ? 'En el acto' : item.horario_ejecucion ? `${item.horario_ejecucion.slice(0, 5)} hs` : 'Sin horario'
}
