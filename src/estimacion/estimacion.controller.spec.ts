import { Test } from '@nestjs/testing';
import { EstimacionController } from './estimacion.controller';
import { EstimacionService } from './estimacion.service';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

describe('EstimacionController', () => {
  let controlador: EstimacionController;
  const servicio = { obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [EstimacionController],
      providers: [{ provide: EstimacionService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(EstimacionController);
  });

  it('obtener delega en el servicio con el id de la cita', async () => {
    servicio.obtener.mockResolvedValue({ citaId: 5, horaEstimada: '09:50' });

    await expect(controlador.obtener(5)).resolves.toEqual({ citaId: 5, horaEstimada: '09:50' });
    expect(servicio.obtener).toHaveBeenCalledWith(5);
  });
});

describe('NotificacionesController', () => {
  let controlador: NotificacionesController;
  const servicio = { listar: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [NotificacionesController],
      providers: [{ provide: NotificacionesService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(NotificacionesController);
  });

  it('listar pasa los filtros al servicio', async () => {
    servicio.listar.mockResolvedValue([]);

    await controlador.listar('7', 'paciente');

    expect(servicio.listar).toHaveBeenCalledWith('7', 'paciente');
  });
});
