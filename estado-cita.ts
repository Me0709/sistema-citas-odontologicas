export enum EstadoCita {
  PROGRAMADA = 'Programada',
  CONFIRMADA = 'Confirmada',
  POR_REPROGRAMAR = 'Por reprogramar',
  EN_SALA = 'En sala',
  EN_ATENCION = 'En atención',
  ATENDIDA = 'Atendida',
  CANCELADA = 'Cancelada',
  INASISTENCIA = 'Inasistencia',
}

/** Estados en los que la cita ocupa su espacio en la agenda del odontólogo. */
export const ESTADOS_QUE_OCUPAN_AGENDA: EstadoCita[] = [
  EstadoCita.PROGRAMADA,
  EstadoCita.CONFIRMADA,
  EstadoCita.EN_SALA,
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
];