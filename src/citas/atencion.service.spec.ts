import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { AtencionService } from './atencion.service';
import { Cita } from './cita.entity';
import { EstadoCita } from './estado-cita';

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
    estado: EstadoCita.EN_SALA,
    horaLlegada: '09:00',
    minutosRetraso: 0,
    horaInicioReal: null,
    horaFinReal: null,
    duracionRealMin: null,
    diferenciaDuracionMin: null,
    ...datos,
  }) as Cita;

const enAtencion = (datos: Partial<Cita> = {}): Cita =>
  cita({ estado: EstadoCita.EN_ATENCION, horaInicioReal: '09:00', ...datos });

async function capturar(promesa: Promise<unknown>): Promise<HttpException> {
  try {
    await promesa;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Se esperaba un error y no ocurrió');
}

describe('AtencionService', () => {
  let servicio: AtencionService;
  const repositorio = { findOneBy: jest.fn(), save: jest.fn(), query: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const reloj = { ahora: jest.fn() };
  const eventos = { emitir: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.transaction.mockImplementation(
      (accion: (m: typeof repositorio) => Promise<unknown>) => accion(repositorio),
    );
    repositorio.save.mockImplementation((c: Cita) => Promise.resolve(c));
    reloj.ahora.mockReturnValue(horaDelLunes(9));
    eventos.emitir.mockResolvedValue(undefined);
    const modulo = await Test.createTestingModule({
      providers: [
        AtencionService,
        { provide: DataSource, useValue: dataSource },
        { provide: Reloj, useValue: reloj },
        { provide: EventosAgenda, useValue: eventos },
      ],
    }).compile();
    servicio = modulo.get(AtencionService);
  });

  describe('iniciar', () => {
    it('Escenario 1: guarda la hora real de inicio y pasa a "En atención"', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.iniciar(5, { hora: '09:02' });

      expect(resultado).toMatchObject({
        estado: EstadoCita.EN_ATENCION,
        horaInicioReal: '09:02',
      });
      expect(repositorio.save).toHaveBeenCalledTimes(1);
    });

    it('permite iniciar justo a la hora de llegada', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ horaLlegada: '09:10' }));

      const resultado = await servicio.iniciar(5, { hora: '09:10' });

      expect(resultado.estado).toBe(EstadoCita.EN_ATENCION);
    });

    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA])(
      'Escenario 4: con la cita %s pide registrar primero la llegada',
      async (estado) => {
        repositorio.findOneBy.mockResolvedValue(cita({ estado, horaLlegada: null }));

        const error = await capturar(servicio.iniciar(5, { hora: '09:00' }));

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.message).toContain('llegada');
        expect(repositorio.save).not.toHaveBeenCalled();
      },
    );

    it.each([
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
      EstadoCita.POR_REPROGRAMAR,
    ])('rechaza iniciar una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      await expect(servicio.iniciar(5, { hora: '09:00' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('rechaza iniciar antes de la llegada del paciente', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ horaLlegada: '09:10' }));

      await expect(servicio.iniciar(5, { hora: '09:05' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(servicio.iniciar(99, { hora: '09:00' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sin hora indicada usa el reloj si la cita es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(horaDelLunes(9, 7));

      const resultado = await servicio.iniciar(5, {});

      expect(resultado.horaInicioReal).toBe('09:07');
    });

    it('sin hora indicada rechaza si la cita no es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date(Date.UTC(2026, 10, 24, 14, 7)));

      await expect(servicio.iniciar(5, {})).rejects.toBeInstanceOf(ConflictException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });

  describe('finalizar', () => {
    it('Escenario 2: guarda la hora de fin, calcula la duración real y pasa a "Atendida"', async () => {
      repositorio.findOneBy.mockResolvedValue(enAtencion());

      const resultado = await servicio.finalizar(5, { hora: '09:30' });

      expect(resultado).toMatchObject({
        estado: EstadoCita.ATENDIDA,
        horaFinReal: '09:30',
        duracionRealMin: 30,
        diferenciaDuracionMin: 0,
      });
      expect(repositorio.save).toHaveBeenCalledTimes(1);
    });

    it('Escenario 3: si dura más de lo estimado, la diferencia es positiva', async () => {
      repositorio.findOneBy.mockResolvedValue(enAtencion());

      const resultado = await servicio.finalizar(5, { hora: '09:45' });

      expect(resultado).toMatchObject({ duracionRealMin: 45, diferenciaDuracionMin: 15 });
    });

    it('si dura menos de lo estimado, la diferencia es negativa', async () => {
      repositorio.findOneBy.mockResolvedValue(enAtencion());

      const resultado = await servicio.finalizar(5, { hora: '09:20' });

      expect(resultado).toMatchObject({ duracionRealMin: 20, diferenciaDuracionMin: -10 });
    });

    it('pide iniciar primero la atención si el paciente está "En sala"', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const error = await capturar(servicio.finalizar(5, { hora: '09:30' }));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('inicie primero');
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it.each([
      EstadoCita.PROGRAMADA,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
    ])('rechaza finalizar una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      await expect(servicio.finalizar(5, { hora: '09:30' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it.each(['09:00', '08:50'])(
      'rechaza un fin que no es posterior al inicio (%s)',
      async (hora) => {
        repositorio.findOneBy.mockResolvedValue(enAtencion());

        await expect(servicio.finalizar(5, { hora })).rejects.toBeInstanceOf(BadRequestException);
        expect(repositorio.save).not.toHaveBeenCalled();
      },
    );

    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(servicio.finalizar(99, { hora: '09:30' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sin hora indicada usa el reloj si la cita es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(enAtencion());
      reloj.ahora.mockReturnValue(horaDelLunes(9, 35));

      const resultado = await servicio.finalizar(5, {});

      expect(resultado).toMatchObject({ horaFinReal: '09:35', duracionRealMin: 35 });
    });

    it('rechaza si la cita no es de hoy, aunque se indique la hora', async () => {
      repositorio.findOneBy.mockResolvedValue(enAtencion());
      reloj.ahora.mockReturnValue(new Date(Date.UTC(2026, 10, 24, 14, 35)));

      await expect(servicio.finalizar(5, { hora: '09:30' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });

  describe('zona horaria y concurrencia', () => {
    it('lee la hora del reloj en hora del consultorio, no en la del servidor', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date('2026-11-23T14:08:00Z'));

      const resultado = await servicio.iniciar(5, {});

      expect(resultado.horaInicioReal).toBe('09:08');
    });

    it.each(['iniciar', 'finalizar'] as const)(
      '%s toma el bloqueo de la agenda dentro de la transacción antes de leer la cita',
      async (accion) => {
        repositorio.findOneBy.mockResolvedValue(accion === 'iniciar' ? cita() : enAtencion());

        await servicio[accion](5, { hora: '09:30' });

        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        expect(repositorio.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
          LLAVE_BLOQUEO_AGENDA,
        ]);
        expect(repositorio.query.mock.invocationCallOrder[0]).toBeLessThan(
          repositorio.findOneBy.mock.invocationCallOrder[0],
        );
      },
    );
  });

  describe('eventos de la agenda', () => {
    it.each([
      ['iniciar', 'atencion_iniciada'],
      ['finalizar', 'atencion_finalizada'],
    ] as const)('%s avisa a la agenda con el día de la cita', async (accion, tipo) => {
      repositorio.findOneBy.mockResolvedValue(accion === 'iniciar' ? cita() : enAtencion());

      await servicio[accion](5, { hora: '09:30' });

      expect(eventos.emitir).toHaveBeenCalledTimes(1);
      expect(eventos.emitir).toHaveBeenCalledWith({ tipo, fecha: LUNES });
    });

    it('avisa después de confirmar la transacción, no dentro de ella', async () => {
      const orden: string[] = [];
      dataSource.transaction.mockImplementation(
        async (accion: (m: typeof repositorio) => Promise<unknown>) => {
          const resultado = await accion(repositorio);
          orden.push('commit');
          return resultado;
        },
      );
      eventos.emitir.mockImplementation(() => {
        orden.push('evento');
        return Promise.resolve();
      });
      repositorio.findOneBy.mockResolvedValue(cita());

      await servicio.iniciar(5, { hora: '09:02' });

      expect(orden).toEqual(['commit', 'evento']);
    });

    it.each(['iniciar', 'finalizar'] as const)(
      '%s no avisa si la operación falla',
      async (accion) => {
        repositorio.findOneBy.mockResolvedValue(null);

        await capturar(servicio[accion](5, { hora: '09:30' }));

        expect(eventos.emitir).not.toHaveBeenCalled();
      },
    );
  });
});
