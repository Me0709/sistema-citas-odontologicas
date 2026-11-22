import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Notificacion } from './notificacion.entity';
import { NotificacionesService } from './notificaciones.service';

describe('NotificacionesService', () => {
  let servicio: NotificacionesService;
  const repositorio = { find: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.find.mockResolvedValue([]);
    const modulo = await Test.createTestingModule({
      providers: [
        NotificacionesService,
        { provide: getRepositoryToken(Notificacion), useValue: repositorio },
      ],
    }).compile();
    servicio = modulo.get(NotificacionesService);
  });

  it('lista las notificaciones, la más reciente primero', async () => {
    const guardadas = [{ id: 2 }, { id: 1 }];
    repositorio.find.mockResolvedValue(guardadas);

    await expect(servicio.listar()).resolves.toEqual(guardadas);
    expect(repositorio.find).toHaveBeenCalledWith({ where: {}, order: { id: 'DESC' } });
  });

  it('filtra por cita y por destinatario', async () => {
    await servicio.listar('7', 'administrador');

    expect(repositorio.find).toHaveBeenCalledWith({
      where: { citaId: 7, destinatario: 'administrador' },
      order: { id: 'DESC' },
    });
  });

  it.each(['0', '-1', '1.5', 'abc'])('rechaza el id de cita %p', async (citaId) => {
    await expect(servicio.listar(citaId)).rejects.toThrow(BadRequestException);
  });

  it('rechaza un destinatario que no existe', async () => {
    await expect(servicio.listar(undefined, 'todos')).rejects.toThrow(BadRequestException);
    expect(repositorio.find).not.toHaveBeenCalled();
  });
});
