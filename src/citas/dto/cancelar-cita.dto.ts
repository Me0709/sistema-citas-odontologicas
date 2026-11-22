import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { recortarTexto } from '../../comun/transformaciones';
import { OrigenCancelacion } from '../origen-cancelacion';

export class CancelarCitaDto {
  @IsEnum(OrigenCancelacion, { message: 'El origen debe ser "paciente" o "consultorio"' })
  origen!: OrigenCancelacion;

  /** Obligatorio cuando cancela el consultorio; opcional si cancela el paciente. */
  @ValidateIf(
    (o: CancelarCitaDto) => o.origen === OrigenCancelacion.CONSULTORIO || o.motivo !== undefined,
  )
  @Transform(recortarTexto)
  @IsString({ message: 'El motivo debe ser un texto' })
  @IsNotEmpty({ message: 'El motivo es obligatorio cuando cancela el consultorio' })
  @MaxLength(200, { message: 'El motivo no puede superar los 200 caracteres' })
  motivo?: string;
}
