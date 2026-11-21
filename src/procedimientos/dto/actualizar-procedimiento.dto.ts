import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import { recortarTexto } from '../../comun/transformaciones';
import { DuracionValida } from './duracion-valida';

export class ActualizarProcedimientoDto {
  @IsOptional()
  @Transform(recortarTexto)
  @IsString({ message: 'El nombre no puede estar vacío' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @Validate(DuracionValida)
  duracionMin?: number;
}
