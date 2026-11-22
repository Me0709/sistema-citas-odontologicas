import { cabeEnHorario } from './cabe-en-horario';

const franjas = [
  { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
  { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
];

describe('cabeEnHorario', () => {
  it('acepta un intervalo dentro de una franja', () => {
    expect(cabeEnHorario(franjas, '2026-11-23', 540, 570)).toBe(true);
  });

  it('acepta un intervalo que ocupa toda la franja', () => {
    expect(cabeEnHorario(franjas, '2026-11-23', 480, 720)).toBe(true);
  });

  it('rechaza un intervalo que termina después de la franja', () => {
    expect(cabeEnHorario(franjas, '2026-11-23', 705, 735)).toBe(false);
  });

  it('rechaza un intervalo que cae entre dos franjas', () => {
    expect(cabeEnHorario(franjas, '2026-11-23', 720, 840)).toBe(false);
  });

  it('rechaza un día sin franjas', () => {
    expect(cabeEnHorario(franjas, '2026-11-24', 540, 570)).toBe(false);
  });
});
