import { Test } from '@nestjs/testing';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

describe('AgendaController', () => {
  let controlador: AgendaController;
  const servicio = { obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [AgendaController],
      providers: [{ provide: AgendaService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(AgendaController);
  });

  it('obtener pasa la fecha al servicio', async () => {
    servicio.obtener.mockResolvedValue({ fecha: '2026-11-23', citas: [] });

    await expect(controlador.obtener('2026-11-23')).resolves.toEqual({
      fecha: '2026-11-23',
      citas: [],
    });
    expect(servicio.obtener).toHaveBeenCalledWith('2026-11-23');
  });
});
