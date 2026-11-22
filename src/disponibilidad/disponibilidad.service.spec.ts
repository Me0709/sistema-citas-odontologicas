import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { LLAVE_BLOQUEO_AGENDA } from '../comun/constantes';
import { Reloj } from '../comun/reloj';
import { DisponibilidadService } from './disponibilidad.service';
import { FranjaHoraria } from './franja-horaria.entity';

type FranjaParcial = Partial<FranjaHoraria>;

function crearEntorno() {
  const manager = {
    query: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((_clase: unknown, franjas: FranjaParcial[]) =>
      Promise.resolve(franjas.map((f, i) => ({ id: i + 1, ...f }))),
    ),
  };
  const dataSource = {
    transaction: jest.fn((accion: (m: typeof manager) => Promise<unknown>) => accion(manager)),
  };
  const repositorio = { find: jest.fn() };
  // Reloj falso: por defecto es el 21 de noviembre de 2026, anterior a todas las citas de estas pruebas.
  const reloj = { ahora: jest.fn(() => new Date('2026-11-21T15:00:00Z')) };
  return { manager, dataSource, repositorio, reloj };
}

const lunesManana = { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' };

describe('DisponibilidadService', () => {
  let servicio: DisponibilidadService;
  let entorno: ReturnType<typeof crearEntorno>;

  beforeEach(async () => {
    entorno = crearEntorno();
    const modulo = await Test.createTestingModule({
      providers: [
        DisponibilidadService,
        { provide: getRepositoryToken(FranjaHoraria), useValue: entorno.repositorio },
        { provide: DataSource, useValue: entorno.dataSource },
        { provide: Reloj, useValue: entorno.reloj },
      ],
    }).compile();
    servicio = modulo.get(DisponibilidadService);
  });

  describe('definir', () => {
    it('reemplaza el horario anterior y calcula los espacios por semana', async () => {
      const respuesta = await servicio.definir({
        franjas: [{ diaSemana: 2, horaInicio: '14:00', horaFin: '18:00' }, lunesManana],
      });

      expect(entorno.manager.query).toHaveBeenCalledWith('DELETE FROM franjas_horarias');
      expect(entorno.manager.save).toHaveBeenCalledTimes(1);
      expect(respuesta.espaciosPorSemana).toBe(32);
      expect(respuesta.franjas.map((f) => f.diaSemana)).toEqual([1, 2]);
    });

    it('acepta franjas del mismo día que solo se tocan', async () => {
      await expect(
        servicio.definir({
          franjas: [lunesManana, { diaSemana: 1, horaInicio: '12:00', horaFin: '14:00' }],
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza franjas que se superponen, indica cuáles y no guarda', async () => {
      const cruce = { diaSemana: 1, horaInicio: '11:00', horaFin: '14:00' };

      const intento = servicio.definir({ franjas: [lunesManana, cruce] });

      await expect(intento).rejects.toThrow(BadRequestException);
      await intento.catch((error: BadRequestException) => {
        const cuerpo = error.getResponse() as { conflictos: unknown[] };
        expect(cuerpo.conflictos).toHaveLength(1);
      });
      expect(entorno.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('no considera conflicto a franjas de días distintos', async () => {
      await expect(
        servicio.definir({ franjas: [lunesManana, { ...lunesManana, diaSemana: 2 }] }),
      ).resolves.toBeDefined();
    });

    it('rechaza una franja con inicio igual o posterior al fin', async () => {
      await expect(
        servicio.definir({ franjas: [{ diaSemana: 1, horaInicio: '12:00', horaFin: '12:00' }] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza horas que no son múltiplos de 15 minutos', async () => {
      await expect(
        servicio.definir({ franjas: [{ diaSemana: 1, horaInicio: '08:10', horaFin: '12:00' }] }),
      ).rejects.toThrow(BadRequestException);
      expect(entorno.dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('citas afectadas por el cambio de horario', () => {
    const citaDe = (datos: Partial<Cita>): Cita =>
      ({
        id: 1,
        pacienteId: 7,
        procedimientoId: 1,
        fecha: '2026-11-23',
        horaInicio: '09:00',
        horaFin: '09:30',
        duracionMin: 30,
        estado: EstadoCita.PROGRAMADA,
        ...datos,
      }) as Cita;

    it('toma el bloqueo de la agenda para no cruzarse con la creación de citas', async () => {
      await servicio.definir({ franjas: [lunesManana] });
      expect(entorno.manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        LLAVE_BLOQUEO_AGENDA,
      ]);
    });

    it('pasa a "Por reprogramar" las citas que quedan fuera del nuevo horario y las informa', async () => {
      entorno.manager.find.mockResolvedValue([
        citaDe({ id: 1 }),
        citaDe({ id: 2, horaInicio: '15:00', horaFin: '15:30' }),
        citaDe({ id: 3, fecha: '2026-11-24', estado: EstadoCita.CONFIRMADA }),
      ]);

      const respuesta = await servicio.definir({ franjas: [lunesManana] });

      expect(respuesta.citasAfectadas).toEqual([
        expect.objectContaining({
          id: 2,
          estadoAnterior: EstadoCita.PROGRAMADA,
          estado: EstadoCita.POR_REPROGRAMAR,
        }),
        expect.objectContaining({
          id: 3,
          estadoAnterior: EstadoCita.CONFIRMADA,
          estado: EstadoCita.POR_REPROGRAMAR,
        }),
      ]);
      expect(entorno.manager.save).toHaveBeenLastCalledWith(Cita, [
        expect.objectContaining({ id: 2, estado: EstadoCita.POR_REPROGRAMAR }),
        expect.objectContaining({ id: 3, estado: EstadoCita.POR_REPROGRAMAR }),
      ]);
    });

    it('no toca las citas que siguen cabiendo en el nuevo horario', async () => {
      entorno.manager.find.mockResolvedValue([citaDe({ id: 1 })]);

      const respuesta = await servicio.definir({ franjas: [lunesManana] });

      expect(respuesta.citasAfectadas).toEqual([]);
      expect(entorno.manager.save).toHaveBeenCalledTimes(1);
    });

    it('una cita que empieza dentro de la jornada pero termina después queda afectada', async () => {
      entorno.manager.find.mockResolvedValue([
        citaDe({ id: 4, horaInicio: '11:45', horaFin: '12:15' }),
      ]);

      const respuesta = await servicio.definir({ franjas: [lunesManana] });

      expect(respuesta.citasAfectadas).toHaveLength(1);
    });

    it('no toca las citas de días anteriores ni las que ya empezaron', async () => {
      // Lunes 2026-11-23 a las 10:00 en Colombia.
      entorno.reloj.ahora.mockReturnValue(new Date('2026-11-23T15:00:00Z'));
      entorno.manager.find.mockResolvedValue([
        citaDe({ id: 1, fecha: '2026-11-22' }),
        citaDe({ id: 2, horaInicio: '09:00', horaFin: '09:30' }),
        citaDe({ id: 3, horaInicio: '10:00', horaFin: '10:30' }),
        citaDe({ id: 4, horaInicio: '10:15', horaFin: '10:45' }),
        citaDe({ id: 5, horaInicio: '15:00', horaFin: '15:30' }),
      ]);

      // El nuevo horario solo atiende los martes, así que todas quedarían fuera.
      const respuesta = await servicio.definir({
        franjas: [{ diaSemana: 2, horaInicio: '08:00', horaFin: '12:00' }],
      });

      expect(respuesta.citasAfectadas.map((c) => c.id)).toEqual([4, 5]);
      expect(entorno.manager.save).toHaveBeenLastCalledWith(Cita, [
        expect.objectContaining({ id: 4 }),
        expect.objectContaining({ id: 5 }),
      ]);
    });

    it('compara en hora del consultorio (UTC-5) y no en UTC', async () => {
      // 03:00 UTC del martes = lunes 22:00 en Colombia.
      entorno.reloj.ahora.mockReturnValue(new Date('2026-11-24T03:00:00Z'));
      entorno.manager.find.mockResolvedValue([
        citaDe({ id: 1, horaInicio: '21:00', horaFin: '21:30' }),
        citaDe({ id: 2, fecha: '2026-11-24', horaInicio: '08:00', horaFin: '08:30' }),
      ]);

      // El nuevo horario solo atiende los miércoles.
      const respuesta = await servicio.definir({
        franjas: [{ diaSemana: 3, horaInicio: '08:00', horaFin: '12:00' }],
      });

      expect(respuesta.citasAfectadas.map((c) => c.id)).toEqual([2]);
    });
  });

  describe('espacios', () => {
    beforeEach(() => {
      entorno.repositorio.find.mockResolvedValue([{ id: 1, ...lunesManana }]);
    });

    it('genera bloques de 15 minutos solo en los días con atención', async () => {
      // Del lunes 2026-11-23 al domingo 2026-11-29 solo hay atención el lunes.
      const espacios = await servicio.espacios('2026-11-23', '2026-11-29');

      expect(espacios).toHaveLength(16);
      expect(espacios[0]).toEqual({ fecha: '2026-11-23', inicio: '08:00', fin: '08:15' });
      expect(espacios[15]).toEqual({ fecha: '2026-11-23', inicio: '11:45', fin: '12:00' });
    });

    it('repite los espacios en cada semana del rango', async () => {
      const espacios = await servicio.espacios('2026-11-23', '2026-12-06');
      expect(espacios).toHaveLength(32);
      expect(espacios[16].fecha).toBe('2026-11-30');
    });

    it('devuelve una lista vacía si no hay horario definido', async () => {
      entorno.repositorio.find.mockResolvedValue([]);
      await expect(servicio.espacios('2026-11-23', '2026-11-29')).resolves.toEqual([]);
    });

    it.each([
      [undefined, undefined],
      ['hoy', '2026-11-29'],
      ['2026-11-23', 'mañana'],
      ['2026-11-23', '2026-11-20'],
      ['2026-11-23', '2027-03-01'],
    ])('rechaza el rango %p a %p', async (desde, hasta) => {
      await expect(servicio.espacios(desde, hasta)).rejects.toThrow(BadRequestException);
    });
  });

  it('listar ordena por día y hora de inicio', async () => {
    entorno.repositorio.find.mockResolvedValue([]);
    await servicio.listar();
    expect(entorno.repositorio.find).toHaveBeenCalledWith({
      order: { diaSemana: 'ASC', horaInicio: 'ASC' },
    });
  });
});
