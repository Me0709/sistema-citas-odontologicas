import { Test } from '@nestjs/testing';
import { PacientesController } from './pacientes.controller';
import { PacientesService } from './pacientes.service';

describe('PacientesController', () => {
  let controlador: PacientesController;
  const servicio = { crear: jest.fn(), listar: jest.fn(), obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [PacientesController],
      providers: [{ provide: PacientesService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(PacientesController);
  });

  it('crear delega en el servicio', async () => {
    const dto = {
      nombre: 'María Pérez',
      documento: '1102345678',
      telefono: '3001234567',
      correo: 'maria@correo.com',
      autorizaTratamientoDatos: true,
    };
    servicio.crear.mockResolvedValue({ id: 1, ...dto });

    await expect(controlador.crear(dto)).resolves.toEqual({ id: 1, ...dto });
    expect(servicio.crear).toHaveBeenCalledWith(dto);
  });

  it('listar delega en el servicio', async () => {
    servicio.listar.mockResolvedValue([]);
    await expect(controlador.listar()).resolves.toEqual([]);
  });

  it('obtener delega en el servicio', async () => {
    servicio.obtener.mockResolvedValue({ id: 4 });
    await expect(controlador.obtener(4)).resolves.toEqual({ id: 4 });
    expect(servicio.obtener).toHaveBeenCalledWith(4);
  });
});
