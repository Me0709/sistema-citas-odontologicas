import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DefinirDisponibilidadDto } from './definir-disponibilidad.dto';

const franjaValida = { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' };
const validar = (datos: object) => validate(plainToInstance(DefinirDisponibilidadDto, datos));

describe('DefinirDisponibilidadDto', () => {
  it('acepta una lista de franjas válidas', async () => {
    expect(
      await validar({ franjas: [franjaValida, { ...franjaValida, diaSemana: 7 }] }),
    ).toHaveLength(0);
  });

  it('rechaza la lista vacía o ausente', async () => {
    expect(await validar({ franjas: [] })).not.toHaveLength(0);
    expect(await validar({})).not.toHaveLength(0);
  });

  it.each([0, 8, 1.5, '1'])('rechaza el día %p', async (dia) => {
    expect(await validar({ franjas: [{ ...franjaValida, diaSemana: dia }] })).not.toHaveLength(0);
  });

  it.each(['8:00', '25:00', '08:60', 'mañana', ''])('rechaza la hora %p', async (hora) => {
    expect(await validar({ franjas: [{ ...franjaValida, horaInicio: hora }] })).not.toHaveLength(0);
    expect(await validar({ franjas: [{ ...franjaValida, horaFin: hora }] })).not.toHaveLength(0);
  });

  it('rechaza si falta un campo de la franja', async () => {
    expect(await validar({ franjas: [{ diaSemana: 1, horaInicio: '08:00' }] })).not.toHaveLength(0);
  });
});
