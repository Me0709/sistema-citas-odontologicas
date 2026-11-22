import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { Reloj } from '../comun/reloj';
import { FlexibilidadCitaService } from '../flexibilidad/flexibilidad-cita.service';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { DisponibilidadService } from '../disponibilidad/disponibilidad.service';
import { AgendaService, MENSAJE_SIN_CITAS } from './agenda.service';

const LUNES = '2026-11-23';

/** Instante que en el consultorio (UTC-5) es el lunes 23 a la hora indicada. */
const horaDelLunes = (hora: number, minutos = 0) =>
  new Date(Date.UTC(2026, 10, 23, hora + 5, minutos));

let siguienteId = 1;
const cita = (horaInicio: string, datos: Partial<Cita> = {}): Cita => {
  const id = siguienteId++;
  const [h, m] = horaInicio.split(':').map(Number);
  const fin = h * 60 + m + (datos.duracionMin ?? 30);
  return {
    id,
    pacienteId: 100 + id,
    procedimientoId: 200 + id,
    paciente: { id: 100 + id, nombre: `Paciente ${id}` },
    procedimiento: { id: 200 + id, nombre: `Procedimiento ${id}` },
    fecha: LUNES,
    horaInicio,
    horaFin: `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`,
    duracionMin: 30,
    estado: EstadoCita.PROGRAMADA,
    avisoRetrasoMin: null,
    horaLlegada: null,
    horaInicioReal: null,
    horaFinReal: null,
    ...datos,
  } as unknown as Cita;
};

describe('AgendaService', () => {
  let servicio: AgendaService;
  const repositorio = { find: jest.fn() };
  const disponibilidad = { espacios: jest.fn() };
  const flexibilidad = { porCitas: jest.fn() };
  const reloj = { ahora: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    siguienteId = 1;
    reloj.ahora.mockReturnValue(horaDelLunes(7));
    flexibilidad.porCitas.mockImplementation((ids: number[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, Flexibilidad.MANTENER]))),
    );
    const modulo = await Test.createTestingModule({
      providers: [
        AgendaService,
        { provide: getRepositoryToken(Cita), useValue: repositorio },
        { provide: DisponibilidadService, useValue: disponibilidad },
        { provide: FlexibilidadCitaService, useValue: flexibilidad },
        { provide: Reloj, useValue: reloj },
      ],
    }).compile();
    servicio = modulo.get(AgendaService);
  });

  it.each([undefined, '', '2026-02-30', 'hoy', '23-11-2026'])(
    'rechaza la fecha %p',
    async (fecha) => {
      await expect(servicio.obtener(fecha)).rejects.toBeInstanceOf(BadRequestException);
      expect(repositorio.find).not.toHaveBeenCalled();
    },
  );

  it('Escenario 1: devuelve cada cita con sus datos, en el orden recibido', async () => {
    repositorio.find.mockResolvedValue([
      cita('09:00'),
      cita('10:00', { duracionMin: 60, avisoRetrasoMin: 15 }),
    ]);

    const agenda = await servicio.obtener(LUNES);

    expect(repositorio.find).toHaveBeenCalledWith({
      where: { fecha: LUNES },
      relations: { paciente: true, procedimiento: true },
      order: { horaInicio: 'ASC', id: 'ASC' },
    });
    expect(agenda.mensaje).toBeUndefined();
    expect(agenda.citas).toHaveLength(2);
    expect(agenda.citas[0]).toMatchObject({
      id: 1,
      paciente: { id: 101, nombre: 'Paciente 1' },
      procedimiento: { id: 201, nombre: 'Procedimiento 1' },
      horaProgramada: '09:00',
      horaFinProgramada: '09:30',
      duracionMin: 30,
      estado: EstadoCita.PROGRAMADA,
    });
    expect(agenda.citas[1]).toMatchObject({
      duracionMin: 60,
      horaFinProgramada: '11:00',
      avisoRetrasoMin: 15,
    });
  });

  describe('Escenario 2: hora estimada actualizada', () => {
    it('recalcula desde el fin estimado de la atención en curso', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 50));
      repositorio.find.mockResolvedValue([
        cita('09:00', { estado: EstadoCita.EN_ATENCION, horaInicioReal: '09:20' }),
        cita('09:30'),
        cita('10:00'),
      ]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas[0]).toMatchObject({ horaEstimada: null, cambioMin: null });
      expect(citas[1]).toMatchObject({
        horaProgramada: '09:30',
        horaEstimada: '09:50',
        cambioMin: 20,
      });
      expect(citas[2]).toMatchObject({
        horaProgramada: '10:00',
        horaEstimada: '10:20',
        cambioMin: 20,
      });
    });

    it('si la atención en curso ya pasó su fin estimado, el odontólogo queda libre desde ahora', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(10, 10));
      repositorio.find.mockResolvedValue([
        cita('09:00', { estado: EstadoCita.EN_ATENCION, horaInicioReal: '09:20' }),
        cita('09:30'),
      ]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas[1]).toMatchObject({ horaEstimada: '10:10', cambioMin: 40 });
    });

    it('sin atención en curso y a tiempo, no cambia nada', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 30));
      repositorio.find.mockResolvedValue([cita('10:00')]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas[0]).toMatchObject({ horaEstimada: '10:00', cambioMin: 0 });
    });

    it('un paciente en sala se estima desde ahora si ya pasó su hora', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 40));
      repositorio.find.mockResolvedValue([
        cita('09:30', { estado: EstadoCita.EN_SALA, horaLlegada: '09:30' }),
      ]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas[0]).toMatchObject({
        horaEstimada: '09:40',
        cambioMin: 10,
        horaLlegada: '09:30',
      });
    });

    it.each([EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
      'una cita %s también se recalcula',
      async (estado) => {
        reloj.ahora.mockReturnValue(horaDelLunes(10, 20));
        repositorio.find.mockResolvedValue([cita('10:00', { estado })]);

        const { citas } = await servicio.obtener(LUNES);

        expect(citas[0].horaEstimada).toBe('10:20');
      },
    );

    it.each([EstadoCita.ATENDIDA, EstadoCita.CANCELADA, EstadoCita.INASISTENCIA])(
      'una cita %s no lleva hora estimada',
      async (estado) => {
        repositorio.find.mockResolvedValue([cita('09:00', { estado })]);

        const { citas } = await servicio.obtener(LUNES);

        expect(citas[0]).toMatchObject({ horaEstimada: null, cambioMin: null, estado });
      },
    );

    it('otro día no se recalcula: cada cita conserva su hora', async () => {
      reloj.ahora.mockReturnValue(new Date(Date.UTC(2026, 10, 22, 20, 0)));
      repositorio.find.mockResolvedValue([cita('09:00'), cita('09:30')]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas.map((c) => [c.horaEstimada, c.cambioMin])).toEqual([
        ['09:00', 0],
        ['09:30', 0],
      ]);
    });

    it('un paciente que puede adelantar se estima antes si el odontólogo ya está libre', async () => {
      reloj.ahora.mockReturnValue(horaDelLunes(9, 30));
      repositorio.find.mockResolvedValue([cita('10:00')]);
      flexibilidad.porCitas.mockResolvedValue(new Map([[1, Flexibilidad.PUEDE_ADELANTAR]]));

      const { citas } = await servicio.obtener(LUNES);

      expect(flexibilidad.porCitas).toHaveBeenCalledWith([1]);
      expect(citas[0]).toMatchObject({ horaEstimada: '09:30', cambioMin: -30 });
    });

    it('solo pide la flexibilidad de las citas pendientes', async () => {
      repositorio.find.mockResolvedValue([
        cita('09:00', { estado: EstadoCita.ATENDIDA }),
        cita('10:00'),
      ]);

      await servicio.obtener(LUNES);

      expect(flexibilidad.porCitas).toHaveBeenCalledWith([2]);
    });

    it('el recálculo no depende de la zona horaria del servidor', async () => {
      reloj.ahora.mockReturnValue(new Date('2026-11-23T14:50:00Z'));
      repositorio.find.mockResolvedValue([cita('09:30')]);

      const { citas } = await servicio.obtener(LUNES);

      expect(citas[0].horaEstimada).toBe('09:50');
    });
  });

  describe('Escenario 3: día sin citas', () => {
    it('muestra el mensaje y los espacios disponibles', async () => {
      const espacios = [{ fecha: LUNES, inicio: '08:00', fin: '08:15' }];
      repositorio.find.mockResolvedValue([]);
      disponibilidad.espacios.mockResolvedValue(espacios);

      const agenda = await servicio.obtener(LUNES);

      expect(agenda).toEqual({
        fecha: LUNES,
        citas: [],
        mensaje: MENSAJE_SIN_CITAS,
        espaciosDisponibles: espacios,
      });
      expect(disponibilidad.espacios).toHaveBeenCalledWith(LUNES, LUNES);
    });
  });
});
