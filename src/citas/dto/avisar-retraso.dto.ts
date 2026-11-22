import { IsInt, Min } from 'class-validator';

export class AvisarRetrasoDto {
  @IsInt({ message: 'Los minutos de retraso deben ser un número entero' })
  @Min(1, { message: 'Los minutos de retraso deben ser al menos 1' })
  minutos!: number;
}
