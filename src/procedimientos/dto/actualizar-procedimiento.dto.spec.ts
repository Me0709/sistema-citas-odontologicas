import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActualizarProcedimientoDto } from './actualizar-procedimiento.dto';

const validar = (datos: object) => validate(plainToInstance(ActualizarProcedimientoDto, datos));

describe('ActualizarProcedimientoDto', () => {
  it('acepta un cuerpo vacío porque todos los campos son opcionales', async () => {
    expect(await validar({})).toHaveLength(0);
  });

  it('acepta solo el nombre', async () => {
    expect(await validar({ nombre: 'Limpieza profunda' })).toHaveLength(0);
  });

  it('acepta solo una duración válida', async () => {
    expect(await validar({ duracionMin: 45 })).toHaveLength(0);
  });

  it.each([0, -15, 20, '30'])('rechaza la duración %p', async (duracion) => {
    expect(await validar({ duracionMin: duracion })).not.toHaveLength(0);
  });

  it('rechaza un nombre en blanco', async () => {
    expect(await validar({ nombre: '   ' })).not.toHaveLength(0);
  });

  it('quita los espacios sobrantes del nombre', () => {
    const dto = plainToInstance(ActualizarProcedimientoDto, { nombre: '  Limpieza  ' });
    expect(dto.nombre).toBe('Limpieza');
  });
});
