export enum EstadoPropuesta {
  PENDIENTE = 'Pendiente',
  ACEPTADA = 'Aceptada',
  RECHAZADA = 'Rechazada',
  VENCIDA = 'Vencida',
}

/** Quién respondió la propuesta: el propio paciente o el administrador a nombre suyo. */
export enum OrigenRespuesta {
  PACIENTE = 'paciente',
  ADMINISTRADOR = 'administrador',
}
