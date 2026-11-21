import { ESTADOS_QUE_OCUPAN_AGENDA, EstadoCita } from './estado-cita';

describe('ESTADOS_QUE_OCUPAN_AGENDA', () => {
  it.each([
    EstadoCita.PROGRAMADA,
    EstadoCita.CONFIRMADA,
    EstadoCita.POR_REPROGRAMAR,
    EstadoCita.EN_SALA,
    EstadoCita.EN_ATENCION,
    EstadoCita.ATENDIDA,
  ])('%s ocupa su espacio en la agenda', (estado) => {
    expect(ESTADOS_QUE_OCUPAN_AGENDA).toContain(estado);
  });

  it.each([EstadoCita.CANCELADA, EstadoCita.INASISTENCIA])('%s libera su espacio', (estado) => {
    expect(ESTADOS_QUE_OCUPAN_AGENDA).not.toContain(estado);
  });
});
