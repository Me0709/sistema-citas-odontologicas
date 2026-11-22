import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearPropuestaDto } from './crear-propuesta.dto';

const validos = {
  fecha: '2026-11-23',
  horaInicio: '10:00',
  motivo: 'Retraso en la atención anterior',
};
const validar = (datos: object) => validate(plainToInstance(CrearPropuestaDto, datos));

describe('CrearPropuestaDto', () => {
  it('acepta datos completos y válidos', async () => {
    expect(await validar(validos)).toHaveLength(0);
  });

  it.each(['fecha', 'horaInicio', 'motivo'])('rechaza si falta %s', async (campo) => {
    const datos: Record<string, unknown> = { ...validos };
    delete datos[campo];
    const errores = await validar(datos);
    expect(errores.map((e) => e.property)).toContain(campo);
  });

  it.each(['2026-02-30', '23-11-2026', 'hoy', 20261123])('rechaza la fecha %p', async (fecha) => {
    expect(await validar({ ...validos, fecha })).not.toHaveLength(0);
  });

  it.each(['9:00', '25:00', 'tarde'])('rechaza la hora %p', async (horaInicio) => {
    expect(await validar({ ...validos, horaInicio })).not.toHaveLength(0);
  });

  it.each(['', '   ', 12, null])('rechaza el motivo %p', async (motivo) => {
    expect(await validar({ ...validos, motivo })).not.toHaveLength(0);
  });

  it('rechaza un motivo de más de 300 caracteres', async () => {
    expect(await validar({ ...validos, motivo: 'a'.repeat(301) })).not.toHaveLength(0);
    expect(await validar({ ...validos, motivo: 'a'.repeat(300) })).toHaveLength(0);
  });

  it('recorta los espacios del motivo', () => {
    const dto = plainToInstance(CrearPropuestaDto, { ...validos, motivo: '  Retraso  ' });

    expect(dto.motivo).toBe('Retraso');
  });
});
