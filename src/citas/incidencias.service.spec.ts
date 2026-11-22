import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { Cita } from './cita.entity';
import { EstadoCita } from './estado-cita';
import { IncidenciasService } from './incidencias.service';
import { OrigenCancelacion } from './origen-cancelacion';

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
    avisoRetrasoMin: null,
    canceladaPor: null,
    motivoCancelacion: null,
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

describe('IncidenciasService', () => {
  let servicio: IncidenciasService;
  const repositorio = { findOneBy: jest.fn(), save: jest.fn(), query: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const reloj = { ahora: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.transaction.mockImplementation(
      (accion: (m: typeof repositorio) => Promise<unknown>) => accion(repositorio),
    );
    repositorio.save.mockImplementation((c: Cita) => Promise.resolve(c));
    reloj.ahora.mockReturnValue(horaDelLunes(9, 20));
    const modulo = await Test.createTestingModule({
      providers: [
        IncidenciasService,
        { provide: DataSource, useValue: dataSource },
        { provide: Reloj, useValue: reloj },
      ],
    }).compile();
    servicio = modulo.get(IncidenciasService);
  });

  describe('avisarRetraso (Escenario 1)', () => {
    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA])(
      'guarda los minutos avisados en una cita %s',
      async (estado) => {
        repositorio.findOneBy.mockResolvedValue(cita({ estado }));

        const resultado = await servicio.avisarRetraso(5, { minutos: 20 });

        expect(resultado).toMatchObject({ avisoRetrasoMin: 20, estado });
        expect(repositorio.save).toHaveBeenCalledTimes(1);
      },
    );

    it('un aviso nuevo reemplaza al anterior', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ avisoRetrasoMin: 10 }));

      const resultado = await servicio.avisarRetraso(5, { minutos: 30 });

      expect(resultado.avisoRetrasoMin).toBe(30);
    });

    it.each([
      EstadoCita.EN_SALA,
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
      EstadoCita.POR_REPROGRAMAR,
    ])('rechaza el aviso de una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      await expect(servicio.avisarRetraso(5, { minutos: 20 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(servicio.avisarRetraso(99, { minutos: 20 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('cancelar', () => {
    it('Escenario 2: la cancelación del paciente queda registrada y no ofrece reprogramar', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.cancelar(5, { origen: OrigenCancelacion.PACIENTE });

      expect(resultado).toMatchObject({
        estado: EstadoCita.CANCELADA,
        canceladaPor: 'paciente',
        motivoCancelacion: null,
        ofreceReprogramar: false,
      });
      expect(repositorio.save).toHaveBeenCalledTimes(1);
    });

    it('guarda el motivo que dé el paciente', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.cancelar(5, {
        origen: OrigenCancelacion.PACIENTE,
        motivo: 'Viaje',
      });

      expect(resultado.motivoCancelacion).toBe('Viaje');
    });

    it('Escenario 3: la cancelación del consultorio guarda el motivo y ofrece reprogramar', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());

      const resultado = await servicio.cancelar(5, {
        origen: OrigenCancelacion.CONSULTORIO,
        motivo: 'Emergencia del odontólogo',
      });

      expect(resultado).toMatchObject({
        estado: EstadoCita.CANCELADA,
        canceladaPor: 'consultorio',
        motivoCancelacion: 'Emergencia del odontólogo',
        ofreceReprogramar: true,
      });
    });

    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
      'el paciente puede cancelar una cita %s',
      async (estado) => {
        repositorio.findOneBy.mockResolvedValue(cita({ estado }));

        const resultado = await servicio.cancelar(5, { origen: OrigenCancelacion.PACIENTE });

        expect(resultado.estado).toBe(EstadoCita.CANCELADA);
      },
    );

    it('solo el consultorio puede cancelar con el paciente en sala', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado: EstadoCita.EN_SALA }));

      await expect(
        servicio.cancelar(5, { origen: OrigenCancelacion.PACIENTE }),
      ).rejects.toBeInstanceOf(ConflictException);

      const resultado = await servicio.cancelar(5, {
        origen: OrigenCancelacion.CONSULTORIO,
        motivo: 'Emergencia',
      });
      expect(resultado.estado).toBe(EstadoCita.CANCELADA);
    });

    it.each([
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
    ])('nadie puede cancelar una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      for (const origen of Object.values(OrigenCancelacion)) {
        await expect(servicio.cancelar(5, { origen, motivo: 'x' })).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(
        servicio.cancelar(99, { origen: OrigenCancelacion.PACIENTE }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('registrarInasistencia (Escenario 4)', () => {
    it.each(['09:16', '09:30', '12:00'])(
      'pasado el tiempo máximo de espera (%s) marca la inasistencia',
      async (hora) => {
        repositorio.findOneBy.mockResolvedValue(cita());

        const resultado = await servicio.registrarInasistencia(5, { hora });

        expect(resultado.estado).toBe(EstadoCita.INASISTENCIA);
        expect(repositorio.save).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['08:50', '09:00', '09:15'])(
      'antes de que venza el tiempo máximo (%s) no la registra',
      async (hora) => {
        repositorio.findOneBy.mockResolvedValue(cita());

        const error = await capturar(servicio.registrarInasistencia(5, { hora }));

        expect(error).toBeInstanceOf(ConflictException);
        expect(error.message).toContain('09:15');
        expect(repositorio.save).not.toHaveBeenCalled();
      },
    );

    it('también aplica a una cita confirmada', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado: EstadoCita.CONFIRMADA }));

      const resultado = await servicio.registrarInasistencia(5, { hora: '09:20' });

      expect(resultado.estado).toBe(EstadoCita.INASISTENCIA);
    });

    it.each([
      EstadoCita.EN_SALA,
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
      EstadoCita.POR_REPROGRAMAR,
    ])('rechaza la inasistencia de una cita en estado %s', async (estado) => {
      repositorio.findOneBy.mockResolvedValue(cita({ estado }));

      await expect(servicio.registrarInasistencia(5, { hora: '09:30' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('sin hora indicada usa el reloj si la cita es de hoy', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(horaDelLunes(9, 20));

      const resultado = await servicio.registrarInasistencia(5, {});

      expect(resultado.estado).toBe(EstadoCita.INASISTENCIA);
    });

    it('rechaza la inasistencia de una cita de un día futuro', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ fecha: '2026-11-24' }));

      await expect(servicio.registrarInasistencia(5, { hora: '09:30' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('acepta la inasistencia de una cita de un día anterior, que ya venció', async () => {
      repositorio.findOneBy.mockResolvedValue(cita({ fecha: '2026-11-20' }));

      const resultado = await servicio.registrarInasistencia(5, {});

      expect(resultado.estado).toBe(EstadoCita.INASISTENCIA);
    });

    it('lee la hora del reloj en hora del consultorio, no en la del servidor', async () => {
      repositorio.findOneBy.mockResolvedValue(cita());
      reloj.ahora.mockReturnValue(new Date('2026-11-23T14:15:00Z'));

      await expect(servicio.registrarInasistencia(5, {})).rejects.toBeInstanceOf(ConflictException);

      reloj.ahora.mockReturnValue(new Date('2026-11-23T14:16:00Z'));
      const resultado = await servicio.registrarInasistencia(5, {});

      expect(resultado.estado).toBe(EstadoCita.INASISTENCIA);
    });

    it('responde 404 si la cita no existe', async () => {
      repositorio.findOneBy.mockResolvedValue(null);

      await expect(servicio.registrarInasistencia(99, { hora: '09:30' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('concurrencia', () => {
    it.each([
      ['avisarRetraso', () => servicio.avisarRetraso(5, { minutos: 10 })],
      ['cancelar', () => servicio.cancelar(5, { origen: OrigenCancelacion.PACIENTE })],
      ['registrarInasistencia', () => servicio.registrarInasistencia(5, { hora: '09:30' })],
    ])(
      '%s toma el bloqueo de la agenda dentro de la transacción antes de leer la cita',
      async (_n, accion) => {
        repositorio.findOneBy.mockResolvedValue(cita());

        await accion();

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
});
