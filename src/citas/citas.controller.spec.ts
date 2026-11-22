import { Test } from '@nestjs/testing';
import { CitasController } from './citas.controller';
import { CitasService } from './citas.service';

describe('CitasController', () => {
  let controlador: CitasController;
  const servicio = { crear: jest.fn(), listar: jest.fn(), obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [CitasController],
      providers: [{ provide: CitasService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(CitasController);
  });

  it('crear delega en el servicio', async () => {
    const dto = { pacienteId: 1, procedimientoId: 2, fecha: '2026-11-23', horaInicio: '09:00' };
    servicio.crear.mockResolvedValue({ id: 1, ...dto });

    await expect(controlador.crear(dto)).resolves.toEqual({ id: 1, ...dto });
    expect(servicio.crear).toHaveBeenCalledWith(dto);
  });

  it('listar pasa los filtros al servicio', async () => {
    servicio.listar.mockResolvedValue([]);
    await controlador.listar('2026-11-23', '4');
    expect(servicio.listar).toHaveBeenCalledWith('2026-11-23', '4');
  });

  it('obtener delega en el servicio', async () => {
    servicio.obtener.mockResolvedValue({ id: 6 });
    await expect(controlador.obtener(6)).resolves.toEqual({ id: 6 });
    expect(servicio.obtener).toHaveBeenCalledWith(6);
  });
});
