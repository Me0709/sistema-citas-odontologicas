import { EventoAgenda } from '../comun/eventos-agenda';
import { AlternativasService } from './alternativas.service';
import { EvaluacionAutomatica } from './evaluacion-automatica';

describe('EvaluacionAutomatica', () => {
  const eventos = { suscribir: jest.fn() };
  const alternativas = { evaluarAutomaticamente: jest.fn() };
  let manejador: (evento: EventoAgenda) => Promise<void>;

  beforeEach(() => {
    jest.resetAllMocks();
    alternativas.evaluarAutomaticamente.mockResolvedValue(undefined);
    const evaluacion = new EvaluacionAutomatica(
      eventos as never,
      alternativas as unknown as AlternativasService,
    );
    evaluacion.onModuleInit();
    manejador = eventos.suscribir.mock.calls[0][0] as typeof manejador;
  });

  it('se suscribe a los eventos de la agenda al iniciar', () => {
    expect(eventos.suscribir).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['cita_cancelada', 'cancelacion'],
    ['inasistencia_registrada', 'inasistencia'],
    ['aviso_retraso', 'retraso'],
    ['propuesta_rechazada', 'propuesta_rechazada'],
    ['propuesta_vencida', 'propuesta_vencida'],
  ] as const)('el evento %s dispara la evaluación como %s', async (tipo, esperado) => {
    await manejador({ tipo, fecha: '2026-11-23' });

    expect(alternativas.evaluarAutomaticamente).toHaveBeenCalledWith({ tipo: esperado });
  });

  it.each([
    'atencion_iniciada',
    'atencion_finalizada',
    'llegada_registrada',
    'propuesta_aceptada',
  ] as const)('el evento %s no dispara la evaluación', async (tipo) => {
    await manejador({ tipo, fecha: '2026-11-23' });

    expect(alternativas.evaluarAutomaticamente).not.toHaveBeenCalled();
  });
});
