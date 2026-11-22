import { Logger } from '@nestjs/common';
import { EventoAgenda, EventosAgenda } from './eventos-agenda';

const evento: EventoAgenda = { tipo: 'atencion_finalizada', fecha: '2026-11-23' };

describe('EventosAgenda', () => {
  let eventos: EventosAgenda;

  beforeEach(() => {
    eventos = new EventosAgenda();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('entrega el evento a cada suscriptor', async () => {
    const primero = jest.fn().mockResolvedValue(undefined);
    const segundo = jest.fn().mockResolvedValue(undefined);
    eventos.suscribir(primero);
    eventos.suscribir(segundo);

    await eventos.emitir(evento);

    expect(primero).toHaveBeenCalledWith(evento);
    expect(segundo).toHaveBeenCalledWith(evento);
  });

  it('espera a que termine cada suscriptor antes de continuar', async () => {
    const orden: string[] = [];
    eventos.suscribir(async () => {
      await Promise.resolve();
      orden.push('primero');
    });
    eventos.suscribir(() => {
      orden.push('segundo');
      return Promise.resolve();
    });

    await eventos.emitir(evento);

    expect(orden).toEqual(['primero', 'segundo']);
  });

  it('no falla si no hay suscriptores', async () => {
    await expect(eventos.emitir(evento)).resolves.toBeUndefined();
  });

  it('un suscriptor que falla no impide los demás ni hace fallar a quien emite', async () => {
    const fallido = jest.fn().mockRejectedValue(new Error('falló el recálculo'));
    const siguiente = jest.fn().mockResolvedValue(undefined);
    eventos.suscribir(fallido);
    eventos.suscribir(siguiente);

    await expect(eventos.emitir(evento)).resolves.toBeUndefined();

    expect(siguiente).toHaveBeenCalledWith(evento);
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });
});
