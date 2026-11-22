import { Test } from '@nestjs/testing';
import { AlternativasController } from './alternativas.controller';
import { AlternativasService } from './alternativas.service';

describe('AlternativasController', () => {
  let controlador: AlternativasController;
  const servicio = { proponer: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const modulo = await Test.createTestingModule({
      controllers: [AlternativasController],
      providers: [{ provide: AlternativasService, useValue: servicio }],
    }).compile();
    controlador = modulo.get(AlternativasController);
  });

  it('proponer delega en el servicio con el evento recibido', async () => {
    const dto = { evento: 'cancelacion' as const, citaId: 3 };
    servicio.proponer.mockResolvedValue({ hayAlternativa: true });

    await expect(controlador.proponer(dto)).resolves.toEqual({ hayAlternativa: true });
    expect(servicio.proponer).toHaveBeenCalledWith(dto);
  });
});
