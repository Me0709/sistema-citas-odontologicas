/** Disponibilidad que declara el paciente respecto al horario de su cita. */
export enum Flexibilidad {
  PUEDE_ADELANTAR = 'puede_adelantar',
  PUEDE_ATRASAR = 'puede_atrasar',
  AMBAS = 'ambas',
  MANTENER = 'mantener',
}

export function puedeAdelantar(flexibilidad: Flexibilidad): boolean {
  return flexibilidad === Flexibilidad.PUEDE_ADELANTAR || flexibilidad === Flexibilidad.AMBAS;
}
