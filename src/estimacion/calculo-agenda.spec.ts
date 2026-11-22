import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { odontologoLibreDesde, retrasoAvisado, sinAdelanto } from './calculo-agenda';

const cita = (estado: EstadoCita, extra: Partial<Cita> = {}): Cita =>
  ({ id: 1, horaInicio: '09:00', duracionMin: 30, estado, ...extra }) as Cita;

const hora = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

describe('odontologoLibreDesde', () => {
  it('con una atención en curso, queda libre cuando termine su duración prevista', () => {
    const citas = [cita(EstadoCita.EN_ATENCION, { horaInicioReal: '09:00' })];

    expect(odontologoLibreDesde(citas, hora('09:10'))).toBe(hora('09:30'));
  });

  it('si la atención en curso ya se pasó de su duración, queda libre ahora', () => {
    const citas = [cita(EstadoCita.EN_ATENCION, { horaInicioReal: '09:00' })];

    expect(odontologoLibreDesde(citas, hora('09:50'))).toBe(hora('09:50'));
  });

  it('sin atención en curso, queda libre desde la hora real de fin de la última atendida o ahora', () => {
    const citas = [
      cita(EstadoCita.ATENDIDA, { horaFinReal: '09:20' }),
      cita(EstadoCita.ATENDIDA, { horaFinReal: '09:45' }),
    ];

    expect(odontologoLibreDesde(citas, hora('09:40'))).toBe(hora('09:45'));
    expect(odontologoLibreDesde(citas, hora('10:00'))).toBe(hora('10:00'));
  });

  it('sin ninguna atención, queda libre ahora', () => {
    expect(odontologoLibreDesde([cita(EstadoCita.PROGRAMADA)], hora('08:30'))).toBe(hora('08:30'));
  });

  it('una atendida sin hora real de fin no cuenta', () => {
    const citas = [cita(EstadoCita.ATENDIDA, { horaFinReal: null })];

    expect(odontologoLibreDesde(citas, hora('09:00'))).toBe(hora('09:00'));
  });
});

describe('retrasoAvisado', () => {
  it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
    'devuelve los minutos avisados de una cita %s',
    (estado) => {
      expect(retrasoAvisado(cita(estado, { avisoRetrasoMin: 20 }))).toBe(20);
    },
  );

  it('es cero si no hubo aviso', () => {
    expect(retrasoAvisado(cita(EstadoCita.PROGRAMADA, { avisoRetrasoMin: null }))).toBe(0);
    expect(retrasoAvisado(cita(EstadoCita.PROGRAMADA))).toBe(0);
  });

  it('se ignora si el paciente ya llegó', () => {
    expect(retrasoAvisado(cita(EstadoCita.EN_SALA, { avisoRetrasoMin: 20 }))).toBe(0);
  });
});

describe('sinAdelanto', () => {
  it.each([
    [Flexibilidad.AMBAS, Flexibilidad.PUEDE_ATRASAR],
    [Flexibilidad.PUEDE_ADELANTAR, Flexibilidad.MANTENER],
    [Flexibilidad.PUEDE_ATRASAR, Flexibilidad.PUEDE_ATRASAR],
    [Flexibilidad.MANTENER, Flexibilidad.MANTENER],
  ])('%s pasa a %s', (entrada, esperada) => {
    expect(sinAdelanto(entrada)).toBe(esperada);
  });
});
