import { Test } from '@nestjs/testing';
import { LlegadasController } from './llegadas.controller';
import { LlegadasService } from './llegadas.service';

describe('LlegadasController', () => {
  let controlador: LlegadasController;
  const servicio = { registrar: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [LlegadasController],
      providers: [{ provide: LlegadasService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(LlegadasController);
  });

  it('registrar delega en el servicio con el id y la hora', async () => {
    servicio.registrar.mockResolvedValue({ id: 3, estado: 'En sala' });

    await expect(controlador.registrar(3, { horaLlegada: '09:02' })).resolves.toEqual({
      id: 3,
      estado: 'En sala',
    });
    expect(servicio.registrar).toHaveBeenCalledWith(3, { horaLlegada: '09:02' });
  });
});
