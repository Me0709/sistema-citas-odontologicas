import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { EstadoPropuesta, OrigenRespuesta } from './estado-propuesta';
import { PropuestaReprogramacion } from './propuesta-reprogramacion.entity';
import { ReprogramacionService } from './reprogramacion.service';

const LUNES = '2026-11-23';
/** Instante que en el consultorio (UTC-5) es el lunes 23 a las 08:00. */
const INICIO = new Date('2026-11-23T13:00:00Z');
const enMinutos = (minutos: number) => new Date(INICIO.getTime() + minutos * 60_000);

const JORNADA = [
  { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
  { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
] as FranjaHoraria[];

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
    ...datos,
  }) as Cita;

const propuesta = (datos: Partial<PropuestaReprogramacion> = {}): PropuestaReprogramacion =>
  ({
    id: 11,
    citaId: 5,
    fechaOriginal: LUNES,
    horaInicioOriginal: '09:00',
    fecha: LUNES,
    horaInicio: '10:00',
    horaFin: '10:30',
    motivo: 'Retraso en la atención anterior',
    desplazamientoMin: 60,
    estadoCitaAnterior: EstadoCita.PROGRAMADA,
    estado: EstadoPropuesta.PENDIENTE,
    creadaEn: INICIO,
    venceEn: enMinutos(15),
    respondidaEn: null,
    respondidaPor: null,
    ...datos,
  }) as PropuestaReprogramacion;

async function capturar(promesa: Promise<unknown>): Promise<HttpException> {
  try {
    await promesa;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Se esperaba un error y no ocurrió');
}

describe('ReprogramacionService', () => {
  let servicio: ReprogramacionService;
  const manager = {
    query: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = { transaction: jest.fn(), manager };
  const reloj = { ahora: jest.fn() };

  /** Configura lo que ve la base de datos: la cita, la propuesta pendiente y las otras citas del día. */
  const escenario = (
    datos: {
      cita?: Cita | null;
      propuesta?: PropuestaReprogramacion | null;
      pendiente?: PropuestaReprogramacion | null;
      otrasCitas?: Cita[];
      franjas?: FranjaHoraria[];
    } = {},
  ) => {
    const { cita: laCita = cita(), propuesta: laPropuesta = propuesta() } = datos;
    manager.findOneBy.mockImplementation((entidad: unknown, where: { estado?: string }) => {
      if (entidad === Cita) return Promise.resolve(laCita);
      return Promise.resolve(where.estado ? (datos.pendiente ?? null) : laPropuesta);
    });
    manager.find.mockImplementation((entidad: unknown) => {
      if (entidad === FranjaHoraria) return Promise.resolve(datos.franjas ?? JORNADA);
      return Promise.resolve(datos.otrasCitas ?? []);
    });
  };

  const datosDeCrear = { fecha: LUNES, horaInicio: '10:00', motivo: 'Retraso' };

  beforeEach(async () => {
    jest.resetAllMocks();
    dataSource.transaction.mockImplementation((accion: (m: typeof manager) => Promise<unknown>) =>
      accion(manager),
    );
    manager.create.mockImplementation((_e: unknown, datos: object) => ({ ...datos }));
    manager.save.mockImplementation((entidad: unknown) => Promise.resolve(entidad));
    reloj.ahora.mockReturnValue(INICIO);
    const modulo = await Test.createTestingModule({
      providers: [
        ReprogramacionService,
        { provide: DataSource, useValue: dataSource },
        { provide: Reloj, useValue: reloj },
      ],
    }).compile();
    servicio = modulo.get(ReprogramacionService);
  });

  describe('crear', () => {
    it('guarda la propuesta pendiente con plazo de 15 minutos y deja la cita "Por reprogramar"', async () => {
      escenario();

      const resultado = await servicio.crear(5, datosDeCrear);

      expect(resultado).toMatchObject({
        citaId: 5,
        fechaOriginal: LUNES,
        horaInicioOriginal: '09:00',
        fecha: LUNES,
        horaInicio: '10:00',
        horaFin: '10:30',
        motivo: 'Retraso',
        desplazamientoMin: 60,
        estadoCitaAnterior: EstadoCita.PROGRAMADA,
        estado: EstadoPropuesta.PENDIENTE,
        creadaEn: INICIO,
        venceEn: enMinutos(15),
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, estado: EstadoCita.POR_REPROGRAMAR }),
      );
    });

    it('calcula un desplazamiento negativo si adelanta y cuenta los días si cambia de fecha', async () => {
      escenario();
      expect(
        (await servicio.crear(5, { ...datosDeCrear, horaInicio: '08:30' })).desplazamientoMin,
      ).toBe(-30);

      escenario({
        franjas: [
          ...JORNADA,
          { diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' } as FranjaHoraria,
        ],
      });
      const otroDia = await servicio.crear(5, {
        ...datosDeCrear,
        fecha: '2026-11-24',
        horaInicio: '09:00',
      });
      expect(otroDia.desplazamientoMin).toBe(24 * 60);
    });

    it('toma el bloqueo de la agenda antes de leer la cita', async () => {
      escenario();

      await servicio.crear(5, datosDeCrear);

      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        LLAVE_BLOQUEO_AGENDA,
      ]);
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.findOneBy.mock.invocationCallOrder[0],
      );
    });

    it('responde 404 si la cita no existe', async () => {
      escenario({ cita: null });

      await expect(servicio.crear(99, datosDeCrear)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      EstadoCita.EN_SALA,
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
    ])('rechaza proponer a una cita en estado %s', async (estado) => {
      escenario({ cita: cita({ estado }) });

      await expect(servicio.crear(5, datosDeCrear)).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
      'admite proponer a una cita %s y recuerda su estado anterior',
      async (estado) => {
        escenario({ cita: cita({ estado }) });

        const resultado = await servicio.crear(5, datosDeCrear);

        expect(resultado.estadoCitaAnterior).toBe(estado);
      },
    );

    it('rechaza una segunda propuesta pendiente', async () => {
      escenario({ pendiente: propuesta() });

      const error = await capturar(servicio.crear(5, datosDeCrear));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('11');
    });

    it('rechaza proponer el mismo horario que ya tiene la cita', async () => {
      escenario();

      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '09:00' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una hora que no es múltiplo de 15 minutos', async () => {
      escenario();

      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '10:10' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un horario fuera de la jornada, también si la cita no alcanza a terminar', async () => {
      escenario();

      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '12:00' }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '11:45' }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        servicio.crear(5, { ...datosDeCrear, fecha: '2026-11-24' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un horario que se cruza con otra cita, pero no uno que solo la toca', async () => {
      escenario({ otrasCitas: [cita({ id: 6, horaInicio: '10:00', horaFin: '10:30' })] });
      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '10:15' }),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '10:30' }),
      ).resolves.toMatchObject({ horaInicio: '10:30' });
    });

    it('no cuenta la propia cita como un cruce', async () => {
      escenario({ otrasCitas: [cita()] });

      await expect(
        servicio.crear(5, { ...datosDeCrear, horaInicio: '09:15' }),
      ).resolves.toMatchObject({ horaInicio: '09:15' });
    });
  });

  describe('obtener (Escenario 5)', () => {
    it('explica el motivo y los minutos que se mueve la cita', async () => {
      escenario();

      const resultado = await servicio.obtener(11);

      expect(resultado.explicacion).toEqual({
        motivo: 'Retraso en la atención anterior',
        minutosDesplazamiento: 60,
        sentido: 'atrasa',
        horarioActual: { fecha: LUNES, horaInicio: '09:00' },
        horarioPropuesto: { fecha: LUNES, horaInicio: '10:00' },
      });
      expect(resultado.estado).toBe(EstadoPropuesta.PENDIENTE);
    });

    it('si adelanta la cita lo indica con minutos positivos', async () => {
      escenario({ propuesta: propuesta({ desplazamientoMin: -30, horaInicio: '08:30' }) });

      const { explicacion } = await servicio.obtener(11);

      expect(explicacion).toMatchObject({ minutosDesplazamiento: 30, sentido: 'adelanta' });
    });

    it('responde 404 si la propuesta no existe', async () => {
      escenario({ propuesta: null });

      await expect(servicio.obtener(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('aceptar (Escenarios 1 y 4)', () => {
    const citaPorReprogramar = () => cita({ estado: EstadoCita.POR_REPROGRAMAR });

    it('mueve la cita al nuevo horario y la deja "Confirmada"', async () => {
      escenario({ cita: citaPorReprogramar() });

      const resultado = await servicio.aceptar(11, {});

      expect(resultado.cita).toMatchObject({
        fecha: LUNES,
        horaInicio: '10:00',
        horaFin: '10:30',
        estado: EstadoCita.CONFIRMADA,
      });
      expect(resultado.propuesta).toMatchObject({
        estado: EstadoPropuesta.ACEPTADA,
        respondidaEn: INICIO,
        respondidaPor: OrigenRespuesta.PACIENTE,
      });
    });

    it('si la registra el administrador, aplica el mismo cambio y deja constancia de quién fue', async () => {
      escenario({ cita: citaPorReprogramar() });

      const resultado = await servicio.aceptar(11, { origen: OrigenRespuesta.ADMINISTRADOR });

      expect(resultado.propuesta.respondidaPor).toBe(OrigenRespuesta.ADMINISTRADOR);
      expect(resultado.cita.estado).toBe(EstadoCita.CONFIRMADA);
    });

    it('todavía se acepta un minuto antes de que venza el plazo', async () => {
      escenario({ cita: citaPorReprogramar() });
      reloj.ahora.mockReturnValue(enMinutos(14));

      await expect(servicio.aceptar(11, {})).resolves.toMatchObject({
        propuesta: { estado: EstadoPropuesta.ACEPTADA },
      });
    });

    it('vencido el plazo no se acepta: cierra la propuesta y la cita vuelve a su estado anterior (Escenario 3)', async () => {
      const laCita = citaPorReprogramar();
      const laPropuesta = propuesta();
      escenario({ cita: laCita, propuesta: laPropuesta });
      reloj.ahora.mockReturnValue(enMinutos(15));

      const error = await capturar(servicio.aceptar(11, {}));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('15 minutos');
      expect(laPropuesta.estado).toBe(EstadoPropuesta.VENCIDA);
      expect(laCita).toMatchObject({ estado: EstadoCita.PROGRAMADA, horaInicio: '09:00' });
      expect(manager.save).toHaveBeenCalledWith(laPropuesta);
    });

    it('rechaza la aceptación si el nuevo horario se ocupó mientras tanto', async () => {
      escenario({
        cita: citaPorReprogramar(),
        otrasCitas: [cita({ id: 6, horaInicio: '10:00', horaFin: '10:30' })],
      });

      await expect(servicio.aceptar(11, {})).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('responde 404 si la propuesta no existe', async () => {
      escenario({ propuesta: null });

      await expect(servicio.aceptar(99, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([EstadoPropuesta.ACEPTADA, EstadoPropuesta.RECHAZADA, EstadoPropuesta.VENCIDA])(
      'no se puede responder una propuesta %s',
      async (estado) => {
        escenario({ propuesta: propuesta({ estado }) });

        await expect(servicio.aceptar(11, {})).rejects.toBeInstanceOf(ConflictException);
        await expect(servicio.rechazar(11)).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it('no se acepta si la cita ya no está pendiente de reprogramar', async () => {
      escenario({ cita: cita({ estado: EstadoCita.CANCELADA }) });

      await expect(servicio.aceptar(11, {})).rejects.toBeInstanceOf(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('rechazar (Escenario 2)', () => {
    it('conserva la cita original, avisa al administrador y pide evaluar la siguiente alternativa', async () => {
      const laCita = cita({ estado: EstadoCita.POR_REPROGRAMAR });
      escenario({ cita: laCita });

      const resultado = await servicio.rechazar(11);

      expect(resultado).toMatchObject({
        propuesta: {
          estado: EstadoPropuesta.RECHAZADA,
          respondidaEn: INICIO,
          respondidaPor: 'paciente',
        },
        notificarAdministrador: true,
        evaluarSiguienteAlternativa: true,
      });
      expect(laCita).toMatchObject({ estado: EstadoCita.PROGRAMADA, horaInicio: '09:00' });
    });

    it('la cita vuelve al estado que tenía antes de la propuesta', async () => {
      const laCita = cita({ estado: EstadoCita.POR_REPROGRAMAR });
      escenario({
        cita: laCita,
        propuesta: propuesta({ estadoCitaAnterior: EstadoCita.CONFIRMADA }),
      });

      await servicio.rechazar(11);

      expect(laCita.estado).toBe(EstadoCita.CONFIRMADA);
    });

    it('si el plazo ya venció, queda vencida y no rechazada', async () => {
      const laPropuesta = propuesta();
      escenario({ cita: cita({ estado: EstadoCita.POR_REPROGRAMAR }), propuesta: laPropuesta });
      reloj.ahora.mockReturnValue(enMinutos(20));

      await expect(servicio.rechazar(11)).rejects.toBeInstanceOf(ConflictException);
      expect(laPropuesta.estado).toBe(EstadoPropuesta.VENCIDA);
    });

    it('responde 404 si la propuesta no existe', async () => {
      escenario({ propuesta: null });

      await expect(servicio.rechazar(99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('vencer (Escenario 3)', () => {
    it('cierra las propuestas vencidas, restaura sus citas y avisa al administrador', async () => {
      const laCita = cita({ estado: EstadoCita.POR_REPROGRAMAR });
      const laPropuesta = propuesta();
      manager.find.mockImplementation((entidad: unknown) =>
        Promise.resolve(entidad === Cita ? [laCita] : [laPropuesta]),
      );
      reloj.ahora.mockReturnValue(enMinutos(16));

      const resultado = await servicio.vencer();

      expect(resultado).toEqual({ vencidas: [laPropuesta], notificarAdministrador: true });
      expect(laPropuesta.estado).toBe(EstadoPropuesta.VENCIDA);
      expect(laCita.estado).toBe(EstadoCita.PROGRAMADA);
    });

    it('busca solo las pendientes cuyo plazo ya terminó', async () => {
      manager.find.mockResolvedValue([]);
      reloj.ahora.mockReturnValue(enMinutos(16));

      await servicio.vencer();

      expect(manager.find).toHaveBeenCalledWith(
        PropuestaReprogramacion,
        expect.objectContaining({
          where: expect.objectContaining({ estado: EstadoPropuesta.PENDIENTE }),
        }),
      );
    });

    it('sin propuestas vencidas no hay nada que avisar', async () => {
      manager.find.mockResolvedValue([]);

      await expect(servicio.vencer()).resolves.toEqual({
        vencidas: [],
        notificarAdministrador: false,
      });
    });

    it('no toca la cita si ya cambió de estado por otro lado', async () => {
      const laCita = cita({ estado: EstadoCita.CANCELADA });
      const laPropuesta = propuesta();
      manager.find.mockImplementation((entidad: unknown) =>
        Promise.resolve(entidad === Cita ? [laCita] : [laPropuesta]),
      );
      reloj.ahora.mockReturnValue(enMinutos(16));

      await servicio.vencer();

      expect(laCita.estado).toBe(EstadoCita.CANCELADA);
      expect(laPropuesta.estado).toBe(EstadoPropuesta.VENCIDA);
    });
  });
});
