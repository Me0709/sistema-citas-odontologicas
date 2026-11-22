import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrarInasistenciaDto } from './registrar-inasistencia.dto';

const validar = (datos: object) => validate(plainToInstance(RegistrarInasistenciaDto, datos));

describe('RegistrarInasistenciaDto', () => {
  it('acepta una hora válida', async () => {
    expect(await validar({ hora: '09:20' })).toHaveLength(0);
  });

  it('acepta que no se envíe la hora', async () => {
    expect(await validar({})).toHaveLength(0);
  });

  it.each(['9:20', '25:00', '09:60', 'tarde', 920])('rechaza la hora %p', async (hora) => {
    expect(await validar({ hora })).not.toHaveLength(0);
  });
});
