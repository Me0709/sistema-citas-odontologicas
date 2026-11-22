import { Test } from '@nestjs/testing';
import { OrigenCancelacion } from './origen-cancelacion';
import { IncidenciasController } from './incidencias.controller';
import { IncidenciasService } from './incidencias.service';

describe('IncidenciasController', () => {
  let controlador: IncidenciasController;
  const servicio = {
    avisarRetraso: jest.fn(),
    cancelar: jest.fn(),
    registrarInasistencia: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [IncidenciasController],
      providers: [{ provide: IncidenciasService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(IncidenciasController);
  });

  it('avisarRetraso delega en el servicio', async () => {
    servicio.avisarRetraso.mockResolvedValue({ id: 3 });

    await expect(controlador.avisarRetraso(3, { minutos: 20 })).resolves.toEqual({ id: 3 });
    expect(servicio.avisarRetraso).toHaveBeenCalledWith(3, { minutos: 20 });
  });

  it('cancelar delega en el servicio', async () => {
    const dto = { origen: OrigenCancelacion.PACIENTE };
    servicio.cancelar.mockResolvedValue({ id: 3 });

    await expect(controlador.cancelar(3, dto)).resolves.toEqual({ id: 3 });
    expect(servicio.cancelar).toHaveBeenCalledWith(3, dto);
  });

  it('registrarInasistencia delega en el servicio', async () => {
    servicio.registrarInasistencia.mockResolvedValue({ id: 3 });

    await expect(controlador.registrarInasistencia(3, { hora: '09:20' })).resolves.toEqual({
      id: 3,
    });
    expect(servicio.registrarInasistencia).toHaveBeenCalledWith(3, { hora: '09:20' });
  });
});
