import { IsInt, Matches, Min, Validate } from 'class-validator';
import { REGEX_HORA } from '../../comun/tiempo';
import { FechaCalendario } from '../../comun/validadores';

export class CrearCitaDto {
  @IsInt({ message: 'El paciente es obligatorio y debe indicarse con su id numérico' })
  @Min(1, { message: 'El paciente es obligatorio y debe indicarse con su id numérico' })
  pacienteId!: number;

  @IsInt({ message: 'El procedimiento es obligatorio y debe indicarse con su id numérico' })
  @Min(1, { message: 'El procedimiento es obligatorio y debe indicarse con su id numérico' })
  procedimientoId!: number;

  @Validate(FechaCalendario)
  fecha!: string;

  @Matches(REGEX_HORA, { message: 'La hora de inicio debe tener formato HH:mm (por ejemplo 09:00)' })
  horaInicio!: string;
}