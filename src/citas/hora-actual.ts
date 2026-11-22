import { ConflictException } from '@nestjs/common';
import { minutosAHora, InstanteLocal } from '../comun/tiempo';
import { Cita } from './cita.entity';

/**
 * Devuelve la hora indicada, o la actual del consultorio si no se indicó ninguna.
 * La cita tiene que ser de hoy en ambos casos.
 */
export function horaIndicadaOActual(ahora: InstanteLocal, cita: Cita, hora?: string): string {
  if (cita.fecha !== ahora.fecha) {
    throw new ConflictException(
      `La cita es del ${cita.fecha}; la atención solo se registra el día de la cita`,
    );
  }
  return hora ?? minutosAHora(ahora.minutos);
}
