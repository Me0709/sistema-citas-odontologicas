import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { Reloj } from '../comun/reloj';
import { DisponibilidadService } from '../disponibilidad/disponibilidad.service';
import { Notificacion } from '../estimacion/notificacion.entity';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { AlternativasService } from './alternativas.service';
import { Flexibilidad } from './dominio/flexibilidad';

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
    fecha: LUNES,
    horaInicio,
    duracionMin,
    estado,
    horaInicioReal: null,
    horaFinReal: null,
    avisoRetrasoMin: null,
    ...extra,
  }) as Cita;

/** Atención de la cita 1 desde las 09:00; con el reloj a las 09:50 se pasó de su duración. */
const atencionEnCurso = () =>
  cita(1, '09:00', 30, EstadoCita.EN_ATENCION, { horaInicioReal: '09:00' });

const franjasDelLunes = [
  { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
  { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
];

describe('AlternativasService', () => {
  let servicio: AlternativasService;
  let citasDelDia: Cita[];
  let flexibilidades: Record<number, Flexibilidad>;

  const repositorioCitas = { find: jest.fn(), findOneBy: jest.fn() };
  const repositorioNotificaciones = { save: jest.fn() };
  const disponibilidad = { listar: jest.fn() };
  const flexibilidad = { porCitas: jest.fn() };
  const reloj = { ahora: jest.fn() };

  const proponer = (
    evento: 'retraso' | 'cancelacion' | 'inasistencia' = 'retraso',
    citaId?: number,
  ) => servicio.proponer({ evento, citaId });

  beforeEach(async () => {
    jest.resetAllMocks();
    citasDelDia = [];
    flexibilidades = {};
    reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
    repositorioCitas.find.mockImplementation(() => Promise.resolve(citasDelDia));
    repositorioCitas.findOneBy.mockResolvedValue(null);
    repositorioNotificaciones.save.mockImplementation((n: unknown) => Promise.resolve(n));
    disponibilidad.listar.mockResolvedValue(franjasDelLunes);
    flexibilidad.porCitas.mockImplementation((ids: number[]) =>
      Promise.resolve(
        new Map(ids.map((id) => [id, flexibilidades[id] ?? Flexibilidad.PUEDE_ATRASAR])),
      ),
    );

    const modulo = await Test.createTestingModule({
      providers: [
        AlternativasService,
        { provide: getRepositoryToken(Cita), useValue: repositorioCitas },
        { provide: getRepositoryToken(Notificacion), useValue: repositorioNotificaciones },
        { provide: DisponibilidadService, useValue: disponibilidad },
        { provide: FlexibilidadCitaService, useValue: flexibilidad },
        { provide: Reloj, useValue: reloj },
      ],
    }).compile();
    servicio = modulo.get(AlternativasService);
  });

  describe('Escenario 1: alternativa con el menor impacto', () => {
    beforeEach(() => {
      flexibilidades[2] = Flexibilidad.AMBAS;
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30), cita(3, '10:00', 15)];
    });

    it('propone la alternativa de menor desplazamiento total, con las horas en HH:mm', async () => {
      const respuesta = await proponer();

      expect(respuesta).toMatchObject({ hayAlternativa: true, fecha: LUNES });
      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.propuesta).toEqual({
        asignaciones: [
          { citaId: 2, horaPrevista: '09:30', horaPropuesta: '09:50', desplazamientoMin: 20 },
          { citaId: 3, horaPrevista: '10:00', horaPropuesta: '10:20', desplazamientoMin: 20 },
        ],
        desplazamientoTotalMin: 40,
        pacientesDesplazados: 2,
      });
    });

    it('incluye las otras alternativas, de mejor a peor', async () => {
      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.otras.length).toBeGreaterThan(0);
      expect(respuesta.otras[0].desplazamientoTotalMin).toBeGreaterThan(
        respuesta.propuesta.desplazamientoTotalMin,
      );
    });

    it('analiza la agenda de hoy, según el reloj del consultorio', async () => {
      await proponer();

      expect(repositorioCitas.find).toHaveBeenCalledWith({ where: { fecha: LUNES } });
    });

    it('no guarda notificaciones cuando hay alternativa', async () => {
      await proponer();

      expect(repositorioNotificaciones.save).not.toHaveBeenCalled();
    });

    it('solo evalúa las citas pendientes: ignora las atendidas, canceladas y con inasistencia', async () => {
      citasDelDia = [
        atencionEnCurso(),
        cita(4, '09:00', 60, EstadoCita.ATENDIDA, { horaFinReal: '09:30' }),
        cita(5, '09:15', 60, EstadoCita.CANCELADA),
        cita(6, '09:20', 60, EstadoCita.INASISTENCIA),
        cita(2, '09:30', 30),
      ];

      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.propuesta.asignaciones.map((a) => a.citaId)).toEqual([2]);
      expect(respuesta.citasEvaluadas).toBe(1);
    });

    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
      'evalúa una cita %s',
      async (estado) => {
        citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30, estado)];

        const respuesta = await proponer();

        expect(respuesta.citasEvaluadas).toBe(1);
      },
    );

    it('los pacientes que ya están en sala se atienden primero y retrasan a los demás', async () => {
      citasDelDia = [
        atencionEnCurso(),
        cita(2, '09:30', 30, EstadoCita.EN_SALA),
        cita(3, '10:00', 15),
      ];

      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      // El de la sala empieza a las 09:50 y termina a las 10:20; la cita 3 espera hasta entonces.
      expect(respuesta.propuesta.asignaciones).toEqual([
        { citaId: 3, horaPrevista: '10:00', horaPropuesta: '10:20', desplazamientoMin: 20 },
      ]);
    });

    it('sin citas pendientes, la propuesta no mueve a nadie', async () => {
      citasDelDia = [atencionEnCurso()];

      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.propuesta).toEqual({
        asignaciones: [],
        desplazamientoTotalMin: 0,
        pacientesDesplazados: 0,
      });
      expect(respuesta.citasEvaluadas).toBe(0);
    });

    it('evalúa como máximo 6 citas e informa cuántas quedaron sin evaluar', async () => {
      citasDelDia = [
        atencionEnCurso(),
        ...['09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00'].map((h, i) =>
          cita(10 + i, h, 15),
        ),
      ];

      const respuesta = await proponer();

      expect(respuesta.citasEvaluadas).toBe(6);
      expect(respuesta.citasNoEvaluadas).toBe(2);
    });
  });

  describe('Escenario 2: paciente que debe mantener el horario', () => {
    it('no lo desplaza y busca la alternativa entre los pacientes con flexibilidad', async () => {
      flexibilidades[2] = Flexibilidad.AMBAS;
      flexibilidades[3] = Flexibilidad.MANTENER;
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30), cita(3, '10:00', 15)];

      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      const mantenida = respuesta.propuesta.asignaciones.find((a) => a.citaId === 3);
      expect(mantenida).toMatchObject({ horaPropuesta: '10:00', desplazamientoMin: 0 });
      expect(respuesta.propuesta.pacientesDesplazados).toBe(1);
    });
  });

  describe('Aviso de retraso del paciente', () => {
    it('no se propone atender a quien avisó que llega tarde antes de su llegada', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 0));
      flexibilidades[2] = Flexibilidad.AMBAS;
      citasDelDia = [cita(2, '09:30', 30, EstadoCita.PROGRAMADA, { avisoRetrasoMin: 30 })];

      const respuesta = await proponer();

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.propuesta.asignaciones).toEqual([
        { citaId: 2, horaPrevista: '09:30', horaPropuesta: '10:00', desplazamientoMin: 30 },
      ]);
    });
  });

  describe('Escenario 4: sin alternativas posibles', () => {
    beforeEach(() => {
      flexibilidades[2] = Flexibilidad.MANTENER;
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30)];
    });

    it('informa las citas en conflicto y el motivo', async () => {
      const respuesta = await proponer('retraso', undefined);

      expect(respuesta).toMatchObject({
        hayAlternativa: false,
        citasEnConflicto: [{ citaId: 2, horaPrevista: '09:30', flexibilidad: 'mantener' }],
        motivo: expect.stringContaining('administrador'),
      });
    });

    it('deja una alerta registrada para el administrador', async () => {
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30)];
      repositorioCitas.findOneBy.mockResolvedValue(cita(1, '09:00'));

      await proponer('inasistencia', 1);

      expect(repositorioNotificaciones.save).toHaveBeenCalledTimes(1);
      expect(repositorioNotificaciones.save).toHaveBeenCalledWith(
        expect.objectContaining({
          destinatario: 'administrador',
          destino: 'administrador',
          tipo: 'sin_alternativas',
          citaId: 1,
          mensaje: expect.stringContaining('2'),
        }),
      );
    });

    it('si el evento no tiene cita, la alerta queda sin cita asociada', async () => {
      await proponer('retraso');

      expect(repositorioNotificaciones.save).toHaveBeenCalledWith(
        expect.objectContaining({ citaId: null, pacienteId: null }),
      );
    });

    it('una cita que solo cabe en la pausa entre franjas queda en conflicto', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(11, 45));
      citasDelDia = [cita(2, '11:30', 30)];

      const respuesta = await proponer();

      expect(respuesta.hayAlternativa).toBe(false);
    });
  });

  describe('Escenario 5: explicación de la propuesta', () => {
    it('indica el evento, a quién desplaza, cuántas alternativas se evaluaron y el criterio', async () => {
      flexibilidades[2] = Flexibilidad.AMBAS;
      citasDelDia = [atencionEnCurso(), cita(2, '09:30', 30), cita(3, '10:00', 15)];
      repositorioCitas.findOneBy.mockResolvedValue(cita(1, '09:00'));

      const respuesta = await proponer('retraso', 1);

      if (!respuesta.hayAlternativa) throw new Error('Se esperaba una alternativa');
      expect(respuesta.explicacion).toMatchObject({
        evento: { tipo: 'retraso', citaId: 1 },
        desplazados: [
          { citaId: 2, minutos: 20 },
          { citaId: 3, minutos: 20 },
        ],
        criterio: 'menor_desplazamiento',
      });
      expect(respuesta.explicacion.alternativasEvaluadas).toBeGreaterThan(1);
      expect(respuesta.explicacion.motivo).toEqual(expect.any(String));
    });
  });

  describe('cita del evento', () => {
    it('responde 404 si se indica una cita que no existe', async () => {
      repositorioCitas.findOneBy.mockResolvedValue(null);

      await expect(proponer('cancelacion', 99)).rejects.toThrow(NotFoundException);
    });

    it('no consulta la cita si no se indica', async () => {
      await proponer('retraso');

      expect(repositorioCitas.findOneBy).not.toHaveBeenCalled();
    });
  });
});
