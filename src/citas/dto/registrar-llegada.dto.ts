import { IsOptional, Matches } from 'class-validator';
import { REGEX_HORA } from '../../comun/tiempo';

export class RegistrarLlegadaDto {
  /** Si no se envía, se usa la hora actual del consultorio. */
  @IsOptional()
  @Matches(REGEX_HORA, {
    message: 'La hora de llegada debe tener formato HH:mm (por ejemplo 09:05)',
  })
  horaLlegada?: string;
}
