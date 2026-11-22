import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarHoraAtencionDto } from './registrar-hora-atencion.dto';

const validar = (datos: object) => validate(plainToInstance(RegistrarHoraAtencionDto, datos));

describe('RegistrarHoraAtencionDto', () => {
  it('acepta una hora válida', async () => {
    expect(await validar({ hora: '09:05' })).toHaveLength(0);
  });

  it('acepta que no se envíe la hora', async () => {
    expect(await validar({})).toHaveLength(0);
  });

  it.each(['9:05', '25:00', '09:60', 'ahora', 905])('rechaza la hora %p', async (hora) => {
    expect(await validar({ hora })).not.toHaveLength(0);
  });
});
