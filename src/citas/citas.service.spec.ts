import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FranjaHoraria } from '../disponibilidad/franja-horaria.entity';
import { PacientesService } from '../pacientes/pacientes.service';
import { ProcedimientosService } from '../procedimientos/procedimientos.service';
import { Cita } from './cita.entity';
import { CitasService } from './citas.service';
import { EstadoCita } from './estado-cita';

const LUNES = '2026-11-23';
const MARTES = '2026-11-24';

const franjasLunes = [
  { id: 1, diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
  { id: 2, diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
];

const procedimiento30 = { id: 1, nombre: 'Limpieza', duracionMin: 30, activo: true };

const citaExistente = (datos: Partial<Cita>): Cita =>
  ({
    id: 1,
    pacienteId: 8,
    procedimientoId: 1,
    fecha: LUNES,
    horaInicio: '09:00',
    horaFin: '09:30',
    duracionMin: 30,
    estado: EstadoCita.PROGRAMADA,
    ...datos,
  }) as Cita;

const solicitud = { pacienteId: 7, procedimientoId: 1, fecha: LUNES, horaInicio: '09:00' };

async function capturar(promesa: Promise<unknown>): Promise<HttpException> {
  try {
    await promesa;
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Se esperaba un error y no ocurrió');
}

function crearEntorno() {
  // Lo que "hay en la base de datos" dentro de la transacción: el horario y las citas.
  const estado: { franjas: typeof franjasLunes; citas: Cita[] } = {
    franjas: franjasLunes,
    citas: [],
  };

  const manager = {
    query: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_clase: unknown, datos: Partial<Cita>) => datos),
    save: jest.fn((_clase: unknown, cita: Partial<Cita>) => Promise.resolve({ id: 10, ...cita })),
  };
  // Según la entidad consultada devuelve el horario o las citas.
  manager.find.mockImplementation((entidad: unknown) =>
    Promise.resolve(entidad === FranjaHoraria ? estado.franjas : estado.citas),
  );

  const dataSource = {
    transaction: jest.fn((accion: (m: typeof manager) => Promise<unknown>) => accion(manager)),
  };
  const repositorio = { findOneBy: jest.fn(), find: jest.fn() };
  // El servicio de pacientes se usa solo con existe(); obtener() carga el historial y no debe llamarse.
  const pacientes = { existe: jest.fn(), obtener: jest.fn() };
  const procedimientos = { obtener: jest.fn() };
  return { estado, manager, dataSource, repositorio, pacientes, procedimientos };
}

describe('CitasService', () => {
  let servicio: CitasService;
  let entorno: ReturnType<typeof crearEntorno>;

  beforeEach(async () => {
    entorno = crearEntorno();
    // existe() no devuelve nada; si el paciente no existe, lanza 404.
    entorno.pacientes.existe.mockResolvedValue(undefined);
    entorno.procedimientos.obtener.mockResolvedValue(procedimiento30);

    const modulo = await Test.createTestingModule({
      providers: [
        CitasService,
        { provide: getRepositoryToken(Cita), useValue: entorno.repositorio },
        { provide: DataSource, useValue: entorno.dataSource },
        { provide: PacientesService, useValue: entorno.pacientes },
        { provide: ProcedimientosService, useValue: entorno.procedimientos },
      ],
    }).compile();
    servicio = modulo.get(CitasService);
  });

  describe('crear', () => {
    it('programa la cita con la hora de fin, la duración copiada y el estado Programada', async () => {
      const cita = await servicio.crear(solicitud);

      expect(entorno.manager.save).toHaveBeenCalledWith(
        Cita,
        expect.objectContaining({
          pacienteId: 7,
          procedimientoId: 1,
          fecha: LUNES,
          horaInicio: '09:00',
          horaFin: '09:30',
          duracionMin: 30,
          estado: EstadoCita.PROGRAMADA,
        }),
      );
      expect(cita.id).toBe(10);
    });

    it('toma el bloqueo de la agenda ANTES de leer el horario y las citas', async () => {
      await servicio.crear(solicitud);

      expect(entorno.manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
        expect.any(Number),
      ]);
      const ordenBloqueo = entorno.manager.query.mock.invocationCallOrder[0];
      const ordenLecturas = entorno.manager.find.mock.invocationCallOrder;

      expect(ordenLecturas).toHaveLength(2);
      ordenLecturas.forEach((orden) => expect(orden).toBeGreaterThan(ordenBloqueo));
    });

    it('lee el horario dentro de la transacción, con el mismo manager que toma el bloqueo', async () => {
      await servicio.crear(solicitud);

      expect(entorno.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(entorno.manager.find).toHaveBeenCalledWith(FranjaHoraria, expect.anything());
      expect(entorno.manager.find).toHaveBeenCalledWith(Cita, expect.anything());
    });

    it('valida contra el horario vigente al obtener el bloqueo, aunque antes fuera otro', async () => {
      // El horario que ve la transacción ya no incluye la mañana.
      entorno.estado.franjas = [franjasLunes[1]];

      const error = await capturar(servicio.crear(solicitud));

      expect(error).toBeInstanceOf(ConflictException);
      const cuerpo = error.getResponse() as { message: string; proximosEspacios: unknown[] };
      expect(cuerpo.message).toContain('horario de atención');
      expect(cuerpo.proximosEspacios[0]).toEqual({
        fecha: LUNES,
        horaInicio: '14:00',
        horaFin: '14:30',
      });
      expect(entorno.manager.save).not.toHaveBeenCalled();
    });

    it('acepta una cita que empieza justo cuando termina otra', async () => {
      entorno.estado.citas = [citaExistente({ horaInicio: '08:30', horaFin: '09:00' })];
      await expect(servicio.crear(solicitud)).resolves.toBeDefined();
    });

    it('ignora las citas de otros días al validar el cruce', async () => {
      entorno.estado.citas = [citaExistente({ fecha: MARTES })];
      await expect(servicio.crear(solicitud)).resolves.toBeDefined();
    });

    it('rechaza un horario ocupado y sugiere los próximos espacios', async () => {
      entorno.estado.citas = [citaExistente({})];

      const error = await capturar(servicio.crear({ ...solicitud, horaInicio: '09:15' }));

      expect(error).toBeInstanceOf(ConflictException);
      const cuerpo = error.getResponse() as { message: string; proximosEspacios: unknown[] };
      expect(cuerpo.message).toContain('ocupado');
      expect(cuerpo.proximosEspacios).toEqual([
        { fecha: LUNES, horaInicio: '09:30', horaFin: '10:00' },
        { fecha: LUNES, horaInicio: '10:00', horaFin: '10:30' },
        { fecha: LUNES, horaInicio: '10:30', horaFin: '11:00' },
      ]);
      expect(entorno.manager.save).not.toHaveBeenCalled();
    });

    it('rechaza cuando el procedimiento no cabe antes de que termine la jornada', async () => {
      entorno.procedimientos.obtener.mockResolvedValue({ ...procedimiento30, duracionMin: 60 });

      const error = await capturar(servicio.crear({ ...solicitud, horaInicio: '11:30' }));

      const cuerpo = error.getResponse() as { proximosEspacios: unknown[] };
      expect(cuerpo.proximosEspacios[0]).toEqual({
        fecha: LUNES,
        horaInicio: '14:00',
        horaFin: '15:00',
      });
    });

    it('rechaza un día sin atención y sugiere el siguiente día con espacio', async () => {
      const error = await capturar(servicio.crear({ ...solicitud, fecha: MARTES }));

      expect(error).toBeInstanceOf(ConflictException);
      const cuerpo = error.getResponse() as { message: string; proximosEspacios: unknown[] };
      expect(cuerpo.message).toContain('horario de atención');
      expect(cuerpo.proximosEspacios[0]).toEqual({
        fecha: '2026-11-30',
        horaInicio: '08:00',
        horaFin: '08:30',
      });
    });

    it('devuelve una lista vacía de sugerencias si no hay horario definido', async () => {
      entorno.estado.franjas = [];

      const error = await capturar(servicio.crear(solicitud));

      const cuerpo = error.getResponse() as { proximosEspacios: unknown[] };
      expect(cuerpo.proximosEspacios).toEqual([]);
    });

    it('rechaza la cita si el paciente ya tiene otra que se cruza e indica con cuál', async () => {
      entorno.estado.citas = [citaExistente({ id: 5, pacienteId: 7 })];

      const error = await capturar(servicio.crear({ ...solicitud, horaInicio: '09:15' }));

      expect(error).toBeInstanceOf(ConflictException);
      const cuerpo = error.getResponse() as { message: string; citaEnConflicto: { id: number } };
      expect(cuerpo.message).toContain('ya tiene una cita');
      expect(cuerpo.citaEnConflicto.id).toBe(5);
      expect(entorno.manager.save).not.toHaveBeenCalled();
    });

    it('rechaza un procedimiento desactivado', async () => {
      entorno.procedimientos.obtener.mockResolvedValue({ ...procedimiento30, activo: false });
      await expect(servicio.crear(solicitud)).rejects.toThrow(BadRequestException);
      expect(entorno.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rechaza una hora de inicio que no es múltiplo de 15 minutos', async () => {
      await expect(servicio.crear({ ...solicitud, horaInicio: '09:10' })).rejects.toThrow(
        BadRequestException,
      );
      expect(entorno.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('propaga el 404 si el paciente no existe', async () => {
      entorno.pacientes.existe.mockRejectedValue(new NotFoundException('No existe el paciente 7'));
      await expect(servicio.crear(solicitud)).rejects.toThrow(NotFoundException);
      expect(entorno.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('verifica al paciente con existe() y no con obtener(), que carga el historial', async () => {
      await servicio.crear(solicitud);

      expect(entorno.pacientes.existe).toHaveBeenCalledWith(7);
      expect(entorno.pacientes.obtener).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve la cita si existe', async () => {
      entorno.repositorio.findOneBy.mockResolvedValue({ id: 3 });
      await expect(servicio.obtener(3)).resolves.toEqual({ id: 3 });
    });

    it('lanza NotFound si no existe', async () => {
      entorno.repositorio.findOneBy.mockResolvedValue(null);
      await expect(servicio.obtener(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listar', () => {
    beforeEach(() => {
      entorno.repositorio.find.mockResolvedValue([]);
    });

    it('sin filtros lista todas las citas ordenadas', async () => {
      await servicio.listar();
      expect(entorno.repositorio.find).toHaveBeenCalledWith({
        where: {},
        order: { fecha: 'ASC', horaInicio: 'ASC' },
      });
    });

    it('filtra por fecha y por paciente', async () => {
      await servicio.listar(LUNES, '7');
      expect(entorno.repositorio.find).toHaveBeenCalledWith({
        where: { fecha: LUNES, pacienteId: 7 },
        order: { fecha: 'ASC', horaInicio: 'ASC' },
      });
    });

    it('rechaza una fecha inválida', () => {
      expect(() => servicio.listar('hoy')).toThrow(BadRequestException);
    });

    it.each(['abc', '0', '1.5'])('rechaza el id de paciente %p', (id) => {
      expect(() => servicio.listar(undefined, id)).toThrow(BadRequestException);
    });
  });
});
