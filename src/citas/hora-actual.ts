import { ConflictException } from '@nestjs/common';
import { Reloj } from '../comun/reloj';
import { Cita } from './cita.entity';

const dosDigitos = (n: number): string => n.toString().padStart(2, '0');
const fechaLocal = (d: Date): string =>
  `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
const horaLocal = (d: Date): string => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

/** Devuelve la hora indicada; sin ella usa el reloj, y entonces la cita tiene que ser de hoy. */
export function horaIndicadaOActual(reloj: Reloj, cita: Cita, hora?: string): string {
  if (hora !== undefined) return hora;
  const ahora = reloj.ahora();
  if (fechaLocal(ahora) !== cita.fecha) {
    throw new ConflictException(
      `La cita es del ${cita.fecha}; indique la hora para poder registrarla`,
    );
  }
  return horaLocal(ahora);
}
