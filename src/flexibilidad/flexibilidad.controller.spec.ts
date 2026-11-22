import { Test } from '@nestjs/testing';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { FlexibilidadCitaService } from './flexibilidad-cita.service';
import { FlexibilidadController } from './flexibilidad.controller';

describe('FlexibilidadController', () => {
  let controlador: FlexibilidadController;
  const servicio = { declarar: jest.fn(), obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [FlexibilidadController],
      providers: [{ provide: FlexibilidadCitaService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(FlexibilidadController);
  });

  it('declarar delega en el servicio con el id de la cita y la opción elegida', async () => {
    const respuesta = { citaId: 5, flexibilidad: Flexibilidad.AMBAS, declarada: true };
    servicio.declarar.mockResolvedValue(respuesta);

    await expect(controlador.declarar(5, { flexibilidad: Flexibilidad.AMBAS })).resolves.toEqual(
      respuesta,
    );
    expect(servicio.declarar).toHaveBeenCalledWith(5, Flexibilidad.AMBAS);
  });

  it('obtener delega en el servicio', async () => {
    const respuesta = { citaId: 5, flexibilidad: Flexibilidad.MANTENER, declarada: false };
    servicio.obtener.mockResolvedValue(respuesta);

    await expect(controlador.obtener(5)).resolves.toEqual(respuesta);
    expect(servicio.obtener).toHaveBeenCalledWith(5);
  });
});
