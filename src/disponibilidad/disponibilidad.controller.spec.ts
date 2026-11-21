import { Test } from '@nestjs/testing';
import { DisponibilidadController } from './disponibilidad.controller';
import { DisponibilidadService } from './disponibilidad.service';

describe('DisponibilidadController', () => {
  let controlador: DisponibilidadController;
  const servicio = { definir: jest.fn(), listar: jest.fn(), espacios: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [DisponibilidadController],
      providers: [{ provide: DisponibilidadService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(DisponibilidadController);
  });

  it('definir delega en el servicio', async () => {
    const dto = { franjas: [{ diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }] };
    servicio.definir.mockResolvedValue({ franjas: [], espaciosPorSemana: 16 });

    await expect(controlador.definir(dto)).resolves.toEqual({ franjas: [], espaciosPorSemana: 16 });
    expect(servicio.definir).toHaveBeenCalledWith(dto);
  });

  it('obtener devuelve el horario guardado', async () => {
    servicio.listar.mockResolvedValue([]);
    await expect(controlador.obtener()).resolves.toEqual([]);
  });

  it('espacios pasa el rango de fechas al servicio', async () => {
    servicio.espacios.mockResolvedValue([]);
    await controlador.espacios('2026-11-23', '2026-11-29');
    expect(servicio.espacios).toHaveBeenCalledWith('2026-11-23', '2026-11-29');
  });
});
