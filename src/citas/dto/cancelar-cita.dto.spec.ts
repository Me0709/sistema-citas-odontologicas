import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelarCitaDto } from './cancelar-cita.dto';

const validar = (datos: object) => validate(plainToInstance(CancelarCitaDto, datos));

describe('CancelarCitaDto', () => {
  it('acepta la cancelación del paciente sin motivo', async () => {
    expect(await validar({ origen: 'paciente' })).toHaveLength(0);
  });

  it('acepta la cancelación del paciente con motivo', async () => {
    expect(await validar({ origen: 'paciente', motivo: 'Viaje' })).toHaveLength(0);
  });

  it('acepta la cancelación del consultorio con motivo', async () => {
    expect(await validar({ origen: 'consultorio', motivo: 'Emergencia' })).toHaveLength(0);
  });

  it.each([undefined, '', '   '])('rechaza al consultorio con el motivo %p', async (motivo) => {
    expect(await validar({ origen: 'consultorio', motivo })).not.toHaveLength(0);
  });

  it('rechaza un motivo vacío o que no es texto aunque cancele el paciente', async () => {
    expect(await validar({ origen: 'paciente', motivo: '' })).not.toHaveLength(0);
    expect(await validar({ origen: 'paciente', motivo: 5 })).not.toHaveLength(0);
  });

  it('rechaza un motivo de más de 200 caracteres', async () => {
    expect(await validar({ origen: 'paciente', motivo: 'a'.repeat(201) })).not.toHaveLength(0);
  });

  it.each([undefined, 'alguien', 1])('rechaza el origen %p', async (origen) => {
    expect(await validar({ origen })).not.toHaveLength(0);
  });
});
