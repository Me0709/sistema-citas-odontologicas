import { Test } from '@nestjs/testing';
import { OrigenRespuesta } from './estado-propuesta';
import { ReprogramacionController } from './reprogramacion.controller';
import { ReprogramacionService } from './reprogramacion.service';

describe('ReprogramacionController', () => {
  let controlador: ReprogramacionController;
  const servicio = {
    crear: jest.fn(),
    obtener: jest.fn(),
    aceptar: jest.fn(),
    rechazar: jest.fn(),
    vencer: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [ReprogramacionController],
      providers: [{ provide: ReprogramacionService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(ReprogramacionController);
  });

  it('crear pasa la cita y los datos al servicio', async () => {
    const dto = { fecha: '2026-11-23', horaInicio: '10:00', motivo: 'Retraso' };
    servicio.crear.mockResolvedValue({ id: 1 });

    await expect(controlador.crear(5, dto)).resolves.toEqual({ id: 1 });
    expect(servicio.crear).toHaveBeenCalledWith(5, dto);
  });

  it('obtener pasa el id de la propuesta', async () => {
    servicio.obtener.mockResolvedValue({ id: 1 });

    await expect(controlador.obtener(1)).resolves.toEqual({ id: 1 });
    expect(servicio.obtener).toHaveBeenCalledWith(1);
  });

  it('aceptar pasa el id y el origen', async () => {
    servicio.aceptar.mockResolvedValue({ ok: true });

    await controlador.aceptar(1, { origen: OrigenRespuesta.ADMINISTRADOR });

    expect(servicio.aceptar).toHaveBeenCalledWith(1, { origen: OrigenRespuesta.ADMINISTRADOR });
  });

  it('rechazar pasa el id de la propuesta', async () => {
    servicio.rechazar.mockResolvedValue({ ok: true });

    await controlador.rechazar(1);

    expect(servicio.rechazar).toHaveBeenCalledWith(1);
  });

  it('vencer delega en el servicio', async () => {
    servicio.vencer.mockResolvedValue({ vencidas: [], notificarAdministrador: false });

    await expect(controlador.vencer()).resolves.toEqual({
      vencidas: [],
      notificarAdministrador: false,
    });
  });
});
