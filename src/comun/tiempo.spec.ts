import { diaIso, diasEntre, fechaValida, horaAMinutos, minutosAHora, sumarDias } from './tiempo';

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
