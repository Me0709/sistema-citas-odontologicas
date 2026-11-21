import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearProcedimientoDto } from './crear-procedimiento.dto';

const validar = (datos: object) => validate(plainToInstance(CrearProcedimientoDto, datos));

describe('CrearProcedimientoDto', () => {
  it.each([15, 30, 45, 60, 120])('acepta %i minutos', async (duracion) => {
    expect(await validar({ nombre: 'Limpieza', duracionMin: duracion })).toHaveLength(0);
  });

  it.each([0, -15, 10, 20, 22.5, '30', null])('rechaza la duración %p', async (duracion) => {
    expect(await validar({ nombre: 'Limpieza', duracionMin: duracion })).not.toHaveLength(0);
  });

  it('rechaza un nombre vacío', async () => {
    expect(await validar({ nombre: '   ', duracionMin: 30 })).not.toHaveLength(0);
  });

  it('quita los espacios sobrantes del nombre', () => {
    const dto = plainToInstance(CrearProcedimientoDto, { nombre: '  Limpieza  ', duracionMin: 30 });
    expect(dto.nombre).toBe('Limpieza');
  });
});
