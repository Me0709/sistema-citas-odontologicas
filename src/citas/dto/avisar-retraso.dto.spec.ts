import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AvisarRetrasoDto } from './avisar-retraso.dto';

const validar = (datos: object) => validate(plainToInstance(AvisarRetrasoDto, datos));

describe('AvisarRetrasoDto', () => {
  it.each([1, 15, 90])('acepta %p minutos', async (minutos) => {
    expect(await validar({ minutos })).toHaveLength(0);
  });

  it('rechaza si falta', async () => {
    expect(await validar({})).not.toHaveLength(0);
  });

  it.each([0, -1, 1.5, '10', null])('rechaza %p', async (minutos) => {
    expect(await validar({ minutos })).not.toHaveLength(0);
  });
});
