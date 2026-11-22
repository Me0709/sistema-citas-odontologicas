import { IsEnum } from 'class-validator';
import { Flexibilidad } from '../../reordenamiento/dominio/flexibilidad';

export class DeclararFlexibilidadDto {
  @IsEnum(Flexibilidad, {
    message: `La flexibilidad debe ser una de estas opciones: ${Object.values(Flexibilidad).join(', ')}`,
  })
  flexibilidad!: Flexibilidad;
}
