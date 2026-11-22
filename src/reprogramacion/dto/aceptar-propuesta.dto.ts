import { IsEnum, IsOptional } from 'class-validator';
import { OrigenRespuesta } from '../estado-propuesta';

export class AceptarPropuestaDto {
  /** Por defecto acepta el paciente; el administrador la registra cuando el paciente aceptó por teléfono. */
  @IsOptional()
  @IsEnum(OrigenRespuesta, { message: 'El origen debe ser "paciente" o "administrador"' })
  origen?: OrigenRespuesta;
}
