import { Test } from '@nestjs/testing';
import { ProcedimientosController } from './procedimientos.controller';
import { ProcedimientosService } from './procedimientos.service';

describe('ProcedimientosController', () => {
  let controlador: ProcedimientosController;

  const servicio = {
    crear: jest.fn(),
    listar: jest.fn(),
    obtener: jest.fn(),
    actualizar: jest.fn(),
    desactivar: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [ProcedimientosController],
      providers: [{ provide: ProcedimientosService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(ProcedimientosController);
  });

  it('crear delega en el servicio', async () => {
    const dto = { nombre: 'Limpieza', duracionMin: 30 };
    servicio.crear.mockResolvedValue({ id: 1, ...dto, activo: true });

    await expect(controlador.crear(dto)).resolves.toEqual({ id: 1, ...dto, activo: true });
    expect(servicio.crear).toHaveBeenCalledWith(dto);
  });

  it('listar pide solo los activos por defecto', async () => {
    servicio.listar.mockResolvedValue([]);
    await controlador.listar();
    expect(servicio.listar).toHaveBeenCalledWith(false);
  });

  it('listar incluye los inactivos con incluirInactivos=true', async () => {
    servicio.listar.mockResolvedValue([]);
    await controlador.listar('true');
    expect(servicio.listar).toHaveBeenCalledWith(true);
  });

  it('obtener delega en el servicio', async () => {
    servicio.obtener.mockResolvedValue({ id: 5 });
    await expect(controlador.obtener(5)).resolves.toEqual({ id: 5 });
    expect(servicio.obtener).toHaveBeenCalledWith(5);
  });

  it('actualizar delega en el servicio', async () => {
    servicio.actualizar.mockResolvedValue({ procedimiento: { id: 5 } });
    await controlador.actualizar(5, { duracionMin: 45 });
    expect(servicio.actualizar).toHaveBeenCalledWith(5, { duracionMin: 45 });
  });

  it('desactivar delega en el servicio', async () => {
    servicio.desactivar.mockResolvedValue({ id: 5, activo: false });
    await controlador.desactivar(5);
    expect(servicio.desactivar).toHaveBeenCalledWith(5);
  });
});
