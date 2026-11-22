import { Test } from '@nestjs/testing';
import { AtencionController } from './atencion.controller';
import { AtencionService } from './atencion.service';

describe('AtencionController', () => {
  let controlador: AtencionController;
  const servicio = { iniciar: jest.fn(), finalizar: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [AtencionController],
      providers: [{ provide: AtencionService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(AtencionController);
  });

  it('iniciar delega en el servicio con el id y la hora', async () => {
    servicio.iniciar.mockResolvedValue({ id: 3, estado: 'En atención' });

    await expect(controlador.iniciar(3, { hora: '09:02' })).resolves.toEqual({
      id: 3,
      estado: 'En atención',
    });
    expect(servicio.iniciar).toHaveBeenCalledWith(3, { hora: '09:02' });
  });

  it('finalizar delega en el servicio con el id y la hora', async () => {
    servicio.finalizar.mockResolvedValue({ id: 3, estado: 'Atendida' });

    await expect(controlador.finalizar(3, { hora: '09:40' })).resolves.toEqual({
      id: 3,
      estado: 'Atendida',
    });
    expect(servicio.finalizar).toHaveBeenCalledWith(3, { hora: '09:40' });
  });
});
