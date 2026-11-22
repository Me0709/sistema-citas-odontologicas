import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Flexibilidad } from '../../reordenamiento/dominio/flexibilidad';
import { DeclararFlexibilidadDto } from './declarar-flexibilidad.dto';

const validar = (datos: object) => validate(plainToInstance(DeclararFlexibilidadDto, datos));

describe('DeclararFlexibilidadDto', () => {
  it.each(Object.values(Flexibilidad))('acepta la opción %s', async (flexibilidad) => {
    expect(await validar({ flexibilidad })).toHaveLength(0);
  });

  it('rechaza si falta la flexibilidad', async () => {
    const errores = await validar({});
    expect(errores.map((e) => e.property)).toContain('flexibilidad');
  });

  it.each(['siempre', 'MANTENER', '', 1, null])('rechaza la opción %p', async (flexibilidad) => {
    expect(await validar({ flexibilidad })).not.toHaveLength(0);
  });
});
