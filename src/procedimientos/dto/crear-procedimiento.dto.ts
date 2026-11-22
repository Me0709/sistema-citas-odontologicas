import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, Validate } from 'class-validator';
import { recortarTexto } from '../../comun/transformaciones';
import { DuracionValida } from './duracion-valida';

export class CrearProcedimientoDto {
  @Transform(recortarTexto)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(100)
  nombre!: string;

  @Validate(DuracionValida)
  duracionMin!: number;
}
