import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { recortarTexto } from '../../comun/transformaciones';

export class CrearPacienteDto {
  @Transform(recortarTexto)
  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  nombre!: string;

  @Transform(recortarTexto)
  @IsString({ message: 'El documento es obligatorio' })
  @IsNotEmpty({ message: 'El documento es obligatorio' })
  @Matches(/^[0-9A-Za-z-]{5,20}$/, {
    message: 'El documento debe tener entre 5 y 20 caracteres (letras, números o guion)',
  })
  documento!: string;

  @Transform(recortarTexto)
  @IsString({ message: 'El teléfono es obligatorio' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'El teléfono debe tener entre 7 y 15 dígitos' })
  telefono!: string;

  @Transform(recortarTexto)
  @IsString({ message: 'El correo es obligatorio' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @MaxLength(150, { message: 'El correo no puede superar 150 caracteres' })
  correo!: string;

  @Equals(true, {
    message: 'Se requiere la autorización para el tratamiento de datos personales',
  })
  autorizaTratamientoDatos!: boolean;
}
