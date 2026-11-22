import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { TipoEvento } from '../dominio/alternativas';

const EVENTOS: TipoEvento[] = ['retraso', 'cancelacion', 'inasistencia'];

export class AnalizarAgendaDto {
  @IsIn(EVENTOS, { message: `El evento debe ser uno de: ${EVENTOS.join(', ')}` })
  evento!: TipoEvento;

  /** Cita que originó el evento, si la hay. */
  @IsOptional()
  @IsInt({ message: 'La cita debe indicarse con su id numérico' })
  @Min(1, { message: 'La cita debe indicarse con su id numérico' })
  citaId?: number;
}
