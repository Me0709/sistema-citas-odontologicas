import { IsOptional, Matches } from 'class-validator';
import { REGEX_HORA } from '../../comun/tiempo';

export class RegistrarHoraAtencionDto {
  /** Si no se envía, se usa la hora actual del consultorio. */
  @IsOptional()
  @Matches(REGEX_HORA, { message: 'La hora debe tener formato HH:mm (por ejemplo 09:05)' })
  hora?: string;
}
