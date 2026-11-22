import {
  aInstanteLocal,
  diaIso,
  diasEntre,
  esPosteriorA,
  fechaValida,
  horaAMinutos,
  minutosAHora,
  sumarDias,
} from './tiempo';

describe('tiempo', () => {
  it('convierte horas a minutos y viceversa', () => {
    expect(horaAMinutos('08:30')).toBe(510);
    expect(minutosAHora(510)).toBe('08:30');
    expect(minutosAHora(0)).toBe('00:00');
  });

  it.each(['2026-11-23', '2028-02-29'])('acepta la fecha %p', (fecha) => {
    expect(fechaValida(fecha)).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '23-11-2026', 'hoy'])('rechaza la fecha %p', (fecha) => {
    expect(fechaValida(fecha)).toBe(false);
  });

  it('calcula el día de la semana (1 = lunes, 7 = domingo)', () => {
    expect(diaIso('2026-11-23')).toBe(1);
    expect(diaIso('2026-11-29')).toBe(7);
  });

  it('suma días cruzando de mes', () => {
    expect(sumarDias('2026-11-29', 2)).toBe('2026-12-01');
  });

  it('cuenta los días entre dos fechas', () => {
    expect(diasEntre('2026-11-23', '2026-11-23')).toBe(0);
    expect(diasEntre('2026-11-23', '2026-12-06')).toBe(13);
  });
});

describe('hora del consultorio', () => {
  it('convierte un instante UTC a la fecha y los minutos de Colombia (UTC-5)', () => {
    expect(aInstanteLocal(new Date('2026-11-23T15:00:00Z'), -300)).toEqual({
      fecha: '2026-11-23',
      minutos: 600,
    });
  });

  it('mantiene el día anterior cuando en UTC ya cambió de día', () => {
    expect(aInstanteLocal(new Date('2026-11-24T03:00:00Z'), -300)).toEqual({
      fecha: '2026-11-23',
      minutos: 1320,
    });
    expect(aInstanteLocal(new Date('2026-11-23T02:00:00Z'), -300)).toEqual({
      fecha: '2026-11-22',
      minutos: 1260,
    });
  });

  describe('esPosteriorA', () => {
    const ahora = { fecha: '2026-11-23', minutos: 600 }; // 10:00

    it.each([
      ['2026-11-24', '08:00', true],
      ['2026-11-22', '23:00', false],
      ['2026-11-23', '10:15', true],
      ['2026-11-23', '10:00', false],
      ['2026-11-23', '09:00', false],
    ])('la cita del %s a las %s es posterior: %p', (fecha, hora, esperado) => {
      expect(esPosteriorA(fecha, hora, ahora)).toBe(esperado);
    });
  });
});
