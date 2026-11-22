import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearCitaDto } from './crear-cita.dto';

const validos = { pacienteId: 1, procedimientoId: 2, fecha: '2026-11-23', horaInicio: '09:00' };
const validar = (datos: object) => validate(plainToInstance(CrearCitaDto, datos));

describe('CrearCitaDto', () => {
  it('acepta datos completos y válidos', async () => {
    expect(await validar(validos)).toHaveLength(0);
  });

  it.each(['pacienteId', 'procedimientoId', 'fecha', 'horaInicio'])(
    'rechaza si falta %s',
    async (campo) => {
      const datos: Record<string, unknown> = { ...validos };
      delete datos[campo];
      const errores = await validar(datos);
      expect(errores.map((e) => e.property)).toContain(campo);
    },
  );

  it.each([0, -1, 1.5, '1', null])('rechaza el id de paciente %p', async (id) => {
    expect(await validar({ ...validos, pacienteId: id })).not.toHaveLength(0);
  });

  it.each(['2026-02-30', '2026-13-01', '23-11-2026', 'hoy', 20261123])(
    'rechaza la fecha %p',
    async (fecha) => {
      expect(await validar({ ...validos, fecha })).not.toHaveLength(0);
    },
  );

  it.each(['9:00', '25:00', '09:60', 'mañana'])('rechaza la hora %p', async (hora) => {
    expect(await validar({ ...validos, horaInicio: hora })).not.toHaveLength(0);
  });
});
