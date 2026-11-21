import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearPacienteDto } from './crear-paciente.dto';

const validos = {
  nombre: 'María Pérez',
  documento: '1102345678',
  telefono: '3001234567',
  correo: 'maria@correo.com',
  autorizaTratamientoDatos: true,
};

const validar = (datos: object) => validate(plainToInstance(CrearPacienteDto, datos));

describe('CrearPacienteDto', () => {
  it('acepta datos completos y válidos', async () => {
    expect(await validar(validos)).toHaveLength(0);
  });

  it.each(['nombre', 'documento', 'telefono', 'correo', 'autorizaTratamientoDatos'])(
    'rechaza si falta %s',
    async (campo) => {
      const datos: Record<string, unknown> = { ...validos };
      delete datos[campo];
      const errores = await validar(datos);
      expect(errores.map((e) => e.property)).toContain(campo);
    },
  );

  it.each(['abc', 'sin-arroba.com', 'a@'])('rechaza el correo %p', async (correo) => {
    expect(await validar({ ...validos, correo })).not.toHaveLength(0);
  });

  it.each(['123', '300 123 4567', 'abcdefghij', '+573001234567'])(
    'rechaza el teléfono %p',
    async (telefono) => {
      expect(await validar({ ...validos, telefono })).not.toHaveLength(0);
    },
  );

  it.each(['1234', 'doc con espacios', 'x'.repeat(21), 'ABC12345', '12-345'])(
    'rechaza el documento %p',
    async (documento) => {
      expect(await validar({ ...validos, documento })).not.toHaveLength(0);
    },
  );

  it.each([false, 'true', 1])('rechaza la autorización %p', async (autoriza) => {
    expect(await validar({ ...validos, autorizaTratamientoDatos: autoriza })).not.toHaveLength(0);
  });

  it('quita los espacios sobrantes', () => {
    const dto = plainToInstance(CrearPacienteDto, {
      ...validos,
      nombre: '  María  ',
      correo: ' maria@correo.com ',
    });
    expect(dto.nombre).toBe('María');
    expect(dto.correo).toBe('maria@correo.com');
  });
});
