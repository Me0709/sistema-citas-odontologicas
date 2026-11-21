import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Matches, Max, Min, ValidateNested } from 'class-validator';
import { REGEX_HORA } from '../../comun/tiempo';

export class FranjaDto {
  @IsInt({ message: 'El día debe ser un número entero de 1 (lunes) a 7 (domingo)' })
  @Min(1, { message: 'El día debe ser un número de 1 (lunes) a 7 (domingo)' })
  @Max(7, { message: 'El día debe ser un número de 1 (lunes) a 7 (domingo)' })
  diaSemana!: number;

  @Matches(REGEX_HORA, {
    message: 'La hora de inicio debe tener formato HH:mm (por ejemplo 08:00)',
  })
  horaInicio!: string;

  @Matches(REGEX_HORA, { message: 'La hora de fin debe tener formato HH:mm (por ejemplo 12:00)' })
  horaFin!: string;
}

export class DefinirDisponibilidadDto {
  @IsArray({ message: 'Las franjas deben enviarse como una lista' })
  @ArrayMinSize(1, { message: 'Debe indicar al menos una franja de atención' })
  @ValidateNested({ each: true })
  @Type(() => FranjaDto)
  franjas!: FranjaDto[];
}
