import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { Cita } from './cita.entity';
import { EstadoCita } from './estado-cita';
import { LlegadasService } from './llegadas.service';

const LUNES = '2026-11-23';

/** Instante que en el consultorio (UTC-5) es el lunes 23 a la hora indicada. */
const horaDelLunes = (hora: number, minutos = 0) =>
  new Date(Date.UTC(2026, 10, 23, hora + 5, minutos));

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
  const repositorio = { findOneBy: jest.fn(), save: jest.fn(), query: jest.fn() };
  const dataSource = {
    transaction: jest.fn((accion: (m: typeof repositorio) => Promise<unknown>) =>
      accion(repositorio),
    ),
  };
  const reloj = { ahora: jest.fn() };
  const eventos = { emitir: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.transaction.mockImplementation((accion) => accion(repositorio));
    repositorio.save.mockImplementation((c: Cita) => Promise.resolve(c));
    reloj.ahora.mockReturnValue(horaDelLunes(9));
    eventos.emitir.mockResolvedValue(undefined);
    const modulo = await Test.createTestingModule({
      providers: [
        LlegadasService,
        { provide: DataSource, useValue: dataSource },
        { provide: Reloj, useValue: reloj },
        { provide: EventosAgenda, useValue: eventos },
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
      reloj.ahora.mockReturnValue(horaDelLunes(9, 8));

      const resultado = await servicio.registrar(5, {});

      expect(resultado).toMatchObject({ horaLlegada: '09:08', minutosRetraso: 8 });
    });

    it('rechaza si la cita no es de hoy, aunque se indique la hora', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date(Date.UTC(2026, 10, 24, 14, 0)));

      await expect(servicio.registrar(5, { horaLlegada: '09:00' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(servicio.registrar(5, {})).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('la hora del reloj se lee en hora del consultorio, no en la del servidor', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date('2026-11-23T14:08:00Z'));

      const resultado = await servicio.registrar(5, {});

      expect(resultado).toMatchObject({ horaLlegada: '09:08', minutosRetraso: 8 });
    });

    it('después de las 7 p. m. en Colombia el día sigue siendo el de la cita', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ horaInicio: '19:30' }));
      reloj.ahora.mockReturnValue(new Date('2026-11-24T00:35:00Z'));

      const resultado = await servicio.registrar(5, {});

      expect(resultado).toMatchObject({ horaLlegada: '19:35', minutosRetraso: 0 });
    });
  });

  describe('concurrencia', () => {
    it('toma el bloqueo de la agenda dentro de la transacción antes de leer la cita', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      await servicio.registrar(5, { horaLlegada: '09:00' });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(repositorio.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        LLAVE_BLOQUEO_AGENDA,
      ]);
      expect(repositorio.query.mock.invocationCallOrder[0]).toBeLessThan(
        repositorio.findOneBy.mock.invocationCallOrder[0],
      );
    });

    it('lee y guarda la cita con el mismo manager de la transacción', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      await servicio.registrar(5, { horaLlegada: '09:00' });

      expect(repositorio.findOneBy).toHaveBeenCalledWith(Cita, { id: 5 });
    });
  });

  describe('aviso a la agenda (recálculo de horas estimadas, HU-09)', () => {
    it.each(['09:00', '09:10', '08:50'])(
      'avisa a la agenda del día de la cita al registrar la llegada a las %s',
      async (hora) => {
        repositorio.findOneBy.mockResolvedValue(cita());

        await servicio.registrar(5, { horaLlegada: hora });

        expect(eventos.emitir).toHaveBeenCalledTimes(1);
        expect(eventos.emitir).toHaveBeenCalledWith({ tipo: 'llegada_registrada', fecha: LUNES });
      },
    );

    it('avisa después de confirmar la transacción, no dentro de ella', async () => {
      const orden: string[] = [];
      dataSource.transaction.mockImplementation(async (accion) => {
        const resultado = await accion(repositorio);
        orden.push('commit');
        return resultado;
      });
      eventos.emitir.mockImplementation(() => {
        orden.push('evento');
        return Promise.resolve();
      });
      repositorio.findOneBy.mockResolvedValue(cita());

      await servicio.registrar(5, { horaLlegada: '09:00' });

      expect(orden).toEqual(['commit', 'evento']);
    });

    it('no avisa si la llegada no se pudo registrar', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await capturar(servicio.registrar(5, { horaLlegada: '09:00' }));

      expect(eventos.emitir).not.toHaveBeenCalled();
    });
  });
});
