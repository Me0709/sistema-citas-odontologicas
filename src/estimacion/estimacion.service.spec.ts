import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { EventoAgenda, EventosAgenda } from '../comun/eventos-agenda';
import { Reloj } from '../comun/reloj';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { Paciente } from '../pacientes/paciente.entity';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { EstimacionCita } from './estimacion-cita.entity';
import { EstimacionService } from './estimacion.service';
import { Notificacion } from './notificacion.entity';

const LUNES = '2026-11-23';

/** Instante que en el consultorio (UTC-5) es el lunes 23 a la hora indicada. */
const horaDelLunes = (hora: number, minutos = 0) =>
  new Date(Date.UTC(2026, 10, 23, hora + 5, minutos));

const cita = (
  id: number,
  horaInicio: string,
  duracionMin = 30,
  estado: EstadoCita = EstadoCita.PROGRAMADA,
  extra: Partial<Cita> = {},
): Cita =>
  ({
    id,
    pacienteId: 100 + id,
    procedimientoId: 1,
    fecha: LUNES,
    horaInicio,
    horaFin: '00:00',
    duracionMin,
    estado,
    horaInicioReal: null,
    horaFinReal: null,
    ...extra,
  }) as Cita;

/** La cita 1, que el odontólogo atiende desde las 09:00 y debería terminar a las 09:30. */
const atencionEnCurso = () =>
  cita(1, '09:00', 30, EstadoCita.EN_ATENCION, { horaInicioReal: '09:00' });

const estimacionPrevia = (datos: Partial<EstimacionCita>): EstimacionCita =>
  ({
    citaId: 2,
    inicioEstimado: '09:30',
    cambioMin: 0,
    inicioNotificado: null,
    requiereAlternativas: false,
    ...datos,
  }) as EstimacionCita;

describe('EstimacionService', () => {
  let servicio: EstimacionService;

  let citasDelDia: Cita[];
  let estimacionesPrevias: EstimacionCita[];
  let flexibilidades: Record<number, Flexibilidad>;

  const manager = { query: jest.fn(), find: jest.fn(), save: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const reloj = { ahora: jest.fn() };
  const flexibilidad = { porCitas: jest.fn() };
  const eventos = { suscribir: jest.fn() };
  const repositorioCitas = { findOneBy: jest.fn() };
  const repositorioEstimaciones = { findOneBy: jest.fn() };

  /** Lo que se guardó de una entidad, sin importar en cuántas llamadas se hizo. */
  const guardado = <T>(entidad: new () => T): Partial<T>[] =>
    manager.save.mock.calls
      .filter(([objetivo]) => objetivo === entidad)
      .flatMap(([, datos]) => datos as Partial<T>[]);

  const estimacion = (citaId: number) => guardado(EstimacionCita).find((e) => e.citaId === citaId);
  const notificaciones = () => guardado(Notificacion);

  beforeEach(async () => {
    jest.resetAllMocks();
    citasDelDia = [];
    estimacionesPrevias = [];
    flexibilidades = {};

    reloj.ahora.mockReturnValue(horaDelLunes(9, 40));
    dataSource.transaction.mockImplementation((accion: (m: typeof manager) => Promise<unknown>) =>
      accion(manager),
    );
    manager.find.mockImplementation((entidad: unknown) => {
      if (entidad === Cita) return Promise.resolve(citasDelDia);
      if (entidad === EstimacionCita) return Promise.resolve(estimacionesPrevias);
      if (entidad === Paciente) {
        return Promise.resolve(
          citasDelDia.map((c) => ({
            id: c.pacienteId,
            correo: `p${c.pacienteId}@correo.com`,
            telefono: `300${c.pacienteId}`,
          })),
        );
      }
      return Promise.resolve([]);
    });
    manager.save.mockImplementation((_entidad: unknown, datos: unknown) => Promise.resolve(datos));
    flexibilidad.porCitas.mockImplementation((ids: number[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, flexibilidades[id] ?? Flexibilidad.PUEDE_ATRASAR])),
      ),
    );

    const modulo = await Test.createTestingModule({
      providers: [
        EstimacionService,
        { provide: DataSource, useValue: dataSource },
        { provide: Reloj, useValue: reloj },
        { provide: FlexibilidadCitaService, useValue: flexibilidad },
        { provide: EventosAgenda, useValue: eventos },
        { provide: getRepositoryToken(Cita), useValue: repositorioCitas },
        { provide: getRepositoryToken(EstimacionCita), useValue: repositorioEstimaciones },
      ],
    }).compile();
    servicio = modulo.get(EstimacionService);
  });

  describe('Escenario 1: recálculo por retraso de la cita anterior', () => {
    it('desplaza las citas siguientes el mismo tiempo que se retrasa la atención en curso', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30'), cita(3, '10:00')];

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:50', cambioMin: 20 });
      expect(estimacion(3)).toMatchObject({ inicioEstimado: '10:20', cambioMin: 20 });
    });

    it('absorbe el retraso cuando hay un hueco entre citas', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30'), cita(3, '11:00')];

      await servicio.recalcular(LUNES);

      expect(estimacion(3)).toMatchObject({ inicioEstimado: '11:00', cambioMin: 0 });
    });

    it('mientras la atención no se pase de su duración prevista, no hay retraso', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 10));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30')];

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:30', cambioMin: 0 });
      expect(notificaciones()).toHaveLength(0);
    });

    it('si no hay atención en curso, el odontólogo queda libre desde la hora real de fin', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 45));
      citasDelDia = [
        cita(1, '09:00', 30, EstadoCita.ATENDIDA, {
          horaInicioReal: '09:00',
          horaFinReal: '09:45',
        }),
        cita(2, '09:30'),
      ];

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:45', cambioMin: 15 });
    });

    it('un paciente que ya está en sala también cuenta: las citas siguientes esperan por él', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30, EstadoCita.EN_SALA), cita(3, '10:00')];

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:50', cambioMin: 20 });
      expect(estimacion(3)).toMatchObject({ inicioEstimado: '10:20', cambioMin: 20 });
    });

    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA, EstadoCita.EN_SALA])(
      'recalcula la cita en estado %s',
      async (estado) => {
        reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
        citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30, estado)];

        await servicio.recalcular(LUNES);

        expect(estimacion(2)).toBeDefined();
      },
    );

    it.each([
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
      EstadoCita.POR_REPROGRAMAR,
    ])('no recalcula ni cuenta una cita en estado %s', async (estado) => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(4, '09:30', 60, estado), cita(2, '10:00')];

      await servicio.recalcular(LUNES);

      expect(estimacion(4)).toBeUndefined();
      expect(estimacion(2)).toMatchObject({ inicioEstimado: '10:00', cambioMin: 0 });
    });

    it('no guarda nada si no hay citas pendientes', async () => {
      citasDelDia = [atencionEnCurso()];

      await servicio.recalcular(LUNES);

      expect(manager.save).not.toHaveBeenCalled();
    });

    it('toma el bloqueo de la agenda antes de leer las citas', async () => {
      citasDelDia = [atencionEnCurso(), cita(2, '09:30')];

      await servicio.recalcular(LUNES);

      expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        LLAVE_BLOQUEO_AGENDA,
      ]);
      expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
        manager.find.mock.invocationCallOrder[0],
      );
    });
  });

  describe('Escenario 2: notificación del nuevo horario estimado', () => {
    beforeEach(() => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30')];
    });

    it('notifica al paciente, por su medio de contacto, cuando el cambio llega a 10 minutos', async () => {
      await servicio.recalcular(LUNES);

      expect(notificaciones()).toEqual([
        expect.objectContaining({
          destinatario: 'paciente',
          pacienteId: 102,
          citaId: 2,
          tipo: 'retraso',
          destino: expect.stringContaining('p102@correo.com'),
          mensaje: expect.stringContaining('09:50'),
        }),
      ]);
      expect(estimacion(2)?.inicioNotificado).toBe('09:50');
    });

    it('no notifica si el cambio es menor al umbral', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 39));

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:39', cambioMin: 9 });
      expect(notificaciones()).toHaveLength(0);
      expect(estimacion(2)?.inicioNotificado).toBeNull();
    });

    it('no repite el aviso si la hora estimada casi no cambió desde el último aviso', async () => {
      estimacionesPrevias = [estimacionPrevia({ inicioNotificado: '09:50' })];
      reloj.ahora.mockReturnValue(horaDelLunes(9, 55));

      await servicio.recalcular(LUNES);

      expect(notificaciones()).toHaveLength(0);
      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:55', inicioNotificado: '09:50' });
    });

    it('vuelve a avisar si la hora estimada cambia 10 minutos o más respecto al último aviso', async () => {
      estimacionesPrevias = [estimacionPrevia({ inicioNotificado: '09:50' })];
      reloj.ahora.mockReturnValue(horaDelLunes(10, 5));

      await servicio.recalcular(LUNES);

      expect(notificaciones()).toHaveLength(1);
      expect(estimacion(2)?.inicioNotificado).toBe('10:05');
    });

    it('no guarda notificaciones si no hay nada que avisar', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 39));

      await servicio.recalcular(LUNES);

      expect(guardado(Notificacion)).toEqual([]);
    });
  });

  describe('Escenario 3: adelanto por una cita más corta', () => {
    beforeEach(() => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 10));
      citasDelDia = [
        cita(1, '09:00', 30, EstadoCita.ATENDIDA, {
          horaInicioReal: '09:00',
          horaFinReal: '09:10',
        }),
        cita(2, '09:30'),
      ];
    });

    it('adelanta y notifica al paciente que declaró poder adelantar su cita', async () => {
      flexibilidades[2] = Flexibilidad.PUEDE_ADELANTAR;

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:10', cambioMin: -20 });
      expect(notificaciones()).toEqual([
        expect.objectContaining({
          destinatario: 'paciente',
          citaId: 2,
          tipo: 'adelanto',
          mensaje: expect.stringContaining('09:10'),
        }),
      ]);
    });

    it.each([Flexibilidad.PUEDE_ATRASAR, Flexibilidad.MANTENER])(
      'no adelanta ni notifica al paciente con flexibilidad %s',
      async (valor) => {
        flexibilidades[2] = valor;

        await servicio.recalcular(LUNES);

        expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:30', cambioMin: 0 });
        expect(notificaciones().filter((n) => n.destinatario === 'paciente')).toHaveLength(0);
      },
    );

    it('trata como "debe mantener el horario" al paciente que no declaró nada', async () => {
      flexibilidad.porCitas.mockResolvedValue(new Map([[2, Flexibilidad.MANTENER]]));

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:30' });
      expect(flexibilidad.porCitas).toHaveBeenCalledWith([2]);
    });
  });

  describe('Escenario 4: paciente que debe mantener el horario', () => {
    beforeEach(() => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      citasDelDia = [atencionEnCurso(), cita(2, '09:30')];
      flexibilidades[2] = Flexibilidad.MANTENER;
    });

    it('lo marca para evaluar alternativas y alerta al administrador', async () => {
      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ requiereAlternativas: true });
      expect(notificaciones()).toContainEqual(
        expect.objectContaining({
          destinatario: 'administrador',
          pacienteId: 102,
          citaId: 2,
          tipo: 'requiere_alternativas',
          destino: 'administrador',
          mensaje: expect.stringContaining('09:50'),
        }),
      );
    });

    it('lo marca aunque el retraso sea menor al umbral de notificación', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 35));

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ cambioMin: 5, requiereAlternativas: true });
      expect(notificaciones().map((n) => n.destinatario)).toEqual(['administrador']);
    });

    it('no repite la alerta si ya estaba marcado', async () => {
      estimacionesPrevias = [estimacionPrevia({ requiereAlternativas: true })];

      await servicio.recalcular(LUNES);

      expect(notificaciones().filter((n) => n.destinatario === 'administrador')).toHaveLength(0);
      expect(estimacion(2)?.requiereAlternativas).toBe(true);
    });

    it('quita la marca cuando el retraso desaparece', async () => {
      estimacionesPrevias = [estimacionPrevia({ requiereAlternativas: true })];
      reloj.ahora.mockReturnValue(horaDelLunes(9, 20));

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ cambioMin: 0, requiereAlternativas: false });
    });

    it('no alerta ni avisa a un paciente que ya está en sala', async () => {
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30, EstadoCita.EN_SALA)];

      await servicio.recalcular(LUNES);

      expect(estimacion(2)).toMatchObject({ inicioEstimado: '09:50' });
      expect(notificaciones()).toHaveLength(0);
    });
  });

  describe('suscripción a los eventos de la agenda', () => {
    it('al iniciar se suscribe y recalcula el día de cada evento', async () => {
      citasDelDia = [atencionEnCurso(), cita(2, '09:30')];
      servicio.onModuleInit();

      expect(eventos.suscribir).toHaveBeenCalledTimes(1);
      const manejador = eventos.suscribir.mock.calls[0][0] as (e: EventoAgenda) => Promise<void>;
      await manejador({ tipo: 'atencion_finalizada', fecha: LUNES });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.find).toHaveBeenCalledWith(
        Cita,
        expect.objectContaining({ where: { fecha: LUNES } }),
      );
    });
  });

  describe('obtener', () => {
    it('responde 404 si la cita no existe', async () => {
      repositorioCitas.findOneBy.mockResolvedValue(null);

      await expect(servicio.obtener(9)).rejects.toThrow(NotFoundException);
    });

    it('sin estimación guardada, la hora estimada es la prevista', async () => {
      repositorioCitas.findOneBy.mockResolvedValue(cita(2, '09:30'));
      repositorioEstimaciones.findOneBy.mockResolvedValue(null);

      await expect(servicio.obtener(2)).resolves.toEqual({
        citaId: 2,
        fecha: LUNES,
        horaInicioPrevista: '09:30',
        horaEstimada: '09:30',
        cambioMin: 0,
        requiereAlternativas: false,
      });
    });

    it('con estimación guardada, devuelve la hora estimada y el cambio', async () => {
      repositorioCitas.findOneBy.mockResolvedValue(cita(2, '09:30'));
      repositorioEstimaciones.findOneBy.mockResolvedValue(
        estimacionPrevia({ inicioEstimado: '09:50', cambioMin: 20, requiereAlternativas: true }),
      );

      await expect(servicio.obtener(2)).resolves.toEqual({
        citaId: 2,
        fecha: LUNES,
        horaInicioPrevista: '09:30',
        horaEstimada: '09:50',
        cambioMin: 20,
        requiereAlternativas: true,
      });
    });
  });
});
