import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, Validate } from 'class-validator';
import { recortarTexto } from '../../comun/transformaciones';
import { REGEX_HORA } from '../../comun/tiempo';
import { FechaCalendario } from '../../comun/validadores';

export class CrearPropuestaDto {
  @Validate(FechaCalendario)
  fecha!: string;

  @Matches(REGEX_HORA, {
    message: 'La hora de inicio debe tener formato HH:mm (por ejemplo 09:00)',
  })
  horaInicio!: string;

  @Transform(recortarTexto)
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo del cambio es obligatorio' })
  @MaxLength(300, { message: 'El motivo no puede superar los 300 caracteres' })
  motivo!: string;
}
