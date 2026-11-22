import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarLlegadaDto } from './registrar-llegada.dto';

const validar = (datos: object) => validate(plainToInstance(RegistrarLlegadaDto, datos));

describe('RegistrarLlegadaDto', () => {
  it('acepta una hora válida', async () => {
    expect(await validar({ horaLlegada: '09:05' })).toHaveLength(0);
  });

  it('acepta que no se envíe la hora', async () => {
    expect(await validar({})).toHaveLength(0);
  });

  it.each(['9:05', '25:00', '09:60', 'ahora', 905])('rechaza la hora %p', async (hora) => {
    expect(await validar({ horaLlegada: hora })).not.toHaveLength(0);
  });
});
