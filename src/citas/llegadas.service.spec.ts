import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Reloj } from '../comun/reloj';
import { Cita } from './cita.entity';
import { EstadoCita } from './estado-cita';
import { LlegadasService } from './llegadas.service';

const LUNES = '2026-11-23';

const cita = (datos: Partial<Cita> = {}): Cita =>
  ({
    id: 5,
    pacienteId: 7,
    procedimientoId: 1,
    fecha: LUNES,
    horaInicio: '09:00',
    horaFin: '09:30',
    duracionMin: 30,
    estado: EstadoCita.PROGRAMADA,
    horaLlegada: null,
    minutosRetraso: null,
    ...datos,
  }) as Cita;

async function capturar(promesa: Promise<unknown>): Promise<HttpException> {
  try {
    await promesa;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Se esperaba un error y no ocurrió');
}

describe('LlegadasService', () => {
  let servicio: LlegadasService;
  const repositorio = { findOneBy: jest.fn(), save: jest.fn() };
  const reloj = { ahora: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    repositorio.save.mockImplementation((c: Cita) => Promise.resolve(c));
    const modulo = await Test.createTestingModule({
      providers: [
        LlegadasService,
        { provide: getRepositoryToken(Cita), useValue: repositorio },
        { provide: Reloj, useValue: reloj },
      ],
    }).compile();
    servicio = modulo.get(LlegadasService);
  });

  describe('Escenario 1: llegada puntual', () => {
    it.each(['09:00', '09:03', '09:05'])(
      'dentro de la tolerancia (%s) guarda la hora y pasa a "En sala" sin retraso',
      async (hora) => {
        repositorio.findOneBy.mockResolvedValue(cita());

        const resultado = await servicio.registrar(5, { horaLlegada: hora });

        expect(resultado).toMatchObject({
          estado: EstadoCita.EN_SALA,
          horaLlegada: hora,
          minutosRetraso: 0,
        });
        expect(repositorio.save).toHaveBeenCalledTimes(1);
      },
    );

    it('también registra la llegada de una cita confirmada', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado: EstadoCita.CONFIRMADA }));

      const resultado = await servicio.registrar(5, { horaLlegada: '09:00' });

      expect(resultado.estado).toBe(EstadoCita.EN_SALA);
    });
  });

  describe('Escenario 2: llegada con retraso', () => {
    it.each([
      ['09:06', 6],
      ['09:12', 12],
      ['09:15', 15],
    ])('llegando a las %s guarda %i minutos de retraso', async (hora, retraso) => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.registrar(5, { horaLlegada: hora });

      expect(resultado).toMatchObject({
        estado: EstadoCita.EN_SALA,
        horaLlegada: hora,
        minutosRetraso: retraso,
      });
    });
  });

  describe('Escenario 3: llegada anticipada', () => {
    it('guarda la hora real, sin retraso, y pasa a "En sala"', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.registrar(5, { horaLlegada: '08:45' });

      expect(resultado).toMatchObject({
        estado: EstadoCita.EN_SALA,
        horaLlegada: '08:45',
        minutosRetraso: 0,
      });
    });
  });

  describe('Escenario 4: llegada después del tiempo máximo de espera', () => {
    it('informa que la cita ya es inasistencia y ofrece reprogramar', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado: EstadoCita.INASISTENCIA }));

      const error = await capturar(servicio.registrar(5, { horaLlegada: '09:40' }));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        ofreceReprogramar: true,
        message: expect.stringContaining('inasistencia'),
      });
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('rechaza una llegada pasados 15 minutos aunque aún no figure como inasistencia', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const error = await capturar(servicio.registrar(5, { horaLlegada: '09:16' }));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ ofreceReprogramar: true });
      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });

  describe('otros casos', () => {
    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(servicio.registrar(99, { horaLlegada: '09:00' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      EstadoCita.EN_SALA,
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.POR_REPROGRAMAR,
    ])('rechaza registrar la llegada de una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      const error = await capturar(servicio.registrar(5, { horaLlegada: '09:00' }));

      expect(error).toBeInstanceOf(ConflictException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('sin hora indicada usa el reloj si la cita es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date(2026, 10, 23, 9, 8));

      const resultado = await servicio.registrar(5, {});

      expect(resultado).toMatchObject({ horaLlegada: '09:08', minutosRetraso: 8 });
    });

    it('sin hora indicada rechaza si la cita no es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date(2026, 10, 24, 9, 0));

      await expect(servicio.registrar(5, {})).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });
});
