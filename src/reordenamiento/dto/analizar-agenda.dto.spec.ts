import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalizarAgendaDto } from './analizar-agenda.dto';

const validar = (datos: object) => validate(plainToInstance(AnalizarAgendaDto, datos));

describe('AnalizarAgendaDto', () => {
  it.each(['retraso', 'cancelacion', 'inasistencia'])('acepta el evento %s', async (evento) => {
    expect(await validar({ evento })).toHaveLength(0);
  });

  it('acepta una cita opcional', async () => {
    expect(await validar({ evento: 'retraso', citaId: 4 })).toHaveLength(0);
  });

  it('rechaza si falta el evento', async () => {
    const errores = await validar({});
    expect(errores.map((e) => e.property)).toContain('evento');
  });

  it.each(['emergencia', 'RETRASO', '', 1, null])('rechaza el evento %p', async (evento) => {
    expect(await validar({ evento })).not.toHaveLength(0);
  });

  it.each([0, -1, 1.5, '1'])('rechaza el id de cita %p', async (citaId) => {
    expect(await validar({ evento: 'retraso', citaId })).not.toHaveLength(0);
  });
});
