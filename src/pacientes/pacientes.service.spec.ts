import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { Paciente } from './paciente.entity';
import { PacientesService } from './pacientes.service';

const dto = {
  nombre: 'María Pérez',
  documento: '1102345678',
  telefono: '3001234567',
  correo: 'maria@correo.com',
  autorizaTratamientoDatos: true,
};

const citaDe = (datos: Partial<Cita>): Cita =>
  ({
    id: 1,
    pacienteId: 1,
    procedimientoId: 5,
    fecha: '2026-11-23',
    horaInicio: '09:00',
    horaFin: '09:30',
    duracionMin: 30,
    estado: EstadoCita.PROGRAMADA,
    procedimiento: { id: 5, nombre: 'Limpieza dental' },
    ...datos,
  }) as Cita;

function crearRepositoriosFalsos() {
  return {
    pacientes: {
      create: jest.fn((datos: Partial<Paciente>) => datos),
      save: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
    },
    citas: { find: jest.fn() },
  };
}

describe('PacientesService', () => {
  let servicio: PacientesService;
  let repos: ReturnType<typeof crearRepositoriosFalsos>;

  beforeEach(async () => {
    repos = crearRepositoriosFalsos();
    const modulo = await Test.createTestingModule({
      providers: [
        PacientesService,
        { provide: getRepositoryToken(Paciente), useValue: repos.pacientes },
        { provide: getRepositoryToken(Cita), useValue: repos.citas },
      ],
    }).compile();
    servicio = modulo.get(PacientesService);
  });

  describe('crear', () => {
    it('crea al paciente con el historial de citas vacío, sin consultar citas', async () => {
      repos.pacientes.findOneBy.mockResolvedValue(null);
      repos.pacientes.save.mockImplementation((p: Partial<Paciente>) =>
        Promise.resolve({ id: 1, ...p }),
      );

      const creado = await servicio.crear(dto);

      expect(creado.id).toBe(1);
      expect(creado.historialCitas).toEqual([]);
      expect(repos.citas.find).not.toHaveBeenCalled();
    });

    it('rechaza un documento ya registrado sin guardar', async () => {
      repos.pacientes.findOneBy.mockResolvedValue({ id: 1, ...dto });

      await expect(servicio.crear(dto)).rejects.toThrow(ConflictException);
      expect(repos.pacientes.save).not.toHaveBeenCalled();
    });

    it('convierte la violación de unicidad de PostgreSQL en 409', async () => {
      repos.pacientes.findOneBy.mockResolvedValue(null);
      repos.pacientes.save.mockRejectedValue({ driverError: { code: '23505' } });

      await expect(servicio.crear(dto)).rejects.toThrow(ConflictException);
    });

    it('relanza los demás errores de base de datos', async () => {
      repos.pacientes.findOneBy.mockResolvedValue(null);
      repos.pacientes.save.mockRejectedValue(new Error('conexión caída'));

      await expect(servicio.crear(dto)).rejects.toThrow('conexión caída');
    });
  });

  describe('listar', () => {
    it('trae el historial de cada paciente con una sola consulta de citas', async () => {
      repos.pacientes.find.mockResolvedValue([
        { id: 1, ...dto },
        { id: 2, ...dto, documento: '1102345679' },
      ]);
      repos.citas.find.mockResolvedValue([
        citaDe({ id: 10, pacienteId: 1, horaInicio: '15:00', horaFin: '15:30' }),
        citaDe({ id: 11, pacienteId: 1 }),
      ]);

      const lista = await servicio.listar();

      expect(repos.pacientes.find).toHaveBeenCalledWith({ order: { nombre: 'ASC' } });
      expect(repos.citas.find).toHaveBeenCalledTimes(1);
      expect(repos.citas.find).toHaveBeenCalledWith(
        expect.objectContaining({ relations: { procedimiento: true } }),
      );
      expect(lista[0].historialCitas.map((c) => c.id)).toEqual([10, 11]);
      expect(lista[1].historialCitas).toEqual([]);
    });

    it('devuelve una lista vacía sin consultar citas si no hay pacientes', async () => {
      repos.pacientes.find.mockResolvedValue([]);

      await expect(servicio.listar()).resolves.toEqual([]);
      expect(repos.citas.find).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve al paciente con su historial y el nombre del procedimiento', async () => {
      repos.pacientes.findOneBy.mockResolvedValue({ id: 3, ...dto });
      repos.citas.find.mockResolvedValue([citaDe({ id: 7, pacienteId: 3 })]);

      const paciente = await servicio.obtener(3);

      expect(paciente).toMatchObject({ id: 3, documento: '1102345678' });
      expect(paciente.historialCitas).toEqual([
        {
          id: 7,
          fecha: '2026-11-23',
          horaInicio: '09:00',
          horaFin: '09:30',
          duracionMin: 30,
          estado: EstadoCita.PROGRAMADA,
          procedimiento: { id: 5, nombre: 'Limpieza dental' },
        },
      ]);
    });

    it('deja el procedimiento en null si la cita no lo trae', async () => {
      repos.pacientes.findOneBy.mockResolvedValue({ id: 3, ...dto });
      repos.citas.find.mockResolvedValue([citaDe({ procedimiento: undefined })]);

      const paciente = await servicio.obtener(3);

      expect(paciente.historialCitas[0].procedimiento).toBeNull();
    });

    it('lanza NotFound si el paciente no existe, sin consultar citas', async () => {
      repos.pacientes.findOneBy.mockResolvedValue(null);

      await expect(servicio.obtener(99)).rejects.toThrow(NotFoundException);
      expect(repos.citas.find).not.toHaveBeenCalled();
    });
  });
});
