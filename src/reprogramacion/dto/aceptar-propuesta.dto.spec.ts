import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AceptarPropuestaDto } from './aceptar-propuesta.dto';

const validar = (datos: object) => validate(plainToInstance(AceptarPropuestaDto, datos));

describe('AceptarPropuestaDto', () => {
  it('acepta un cuerpo vacío: responde el paciente', async () => {
    expect(await validar({})).toHaveLength(0);
  });

  it.each(['paciente', 'administrador'])('acepta el origen %s', async (origen) => {
    expect(await validar({ origen })).toHaveLength(0);
  });

  it.each(['vecino', '', 1])('rechaza el origen %p', async (origen) => {
    expect(await validar({ origen })).not.toHaveLength(0);
  });
});
