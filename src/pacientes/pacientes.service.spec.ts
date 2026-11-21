import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Paciente } from './paciente.entity';
import { PacientesService } from './pacientes.service';

const dto = {
  nombre: 'María Pérez',
  documento: '1102345678',
  telefono: '3001234567',
  correo: 'maria@correo.com',
  autorizaTratamientoDatos: true,
};

function crearRepositorioFalso() {
  return {
    create: jest.fn((datos: Partial<Paciente>) => datos),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
}

describe('PacientesService', () => {
  let servicio: PacientesService;
  let repositorio: ReturnType<typeof crearRepositorioFalso>;

  beforeEach(async () => {
    repositorio = crearRepositorioFalso();
    const modulo = await Test.createTestingModule({
      providers: [
        PacientesService,
        { provide: getRepositoryToken(Paciente), useValue: repositorio },
      ],
    }).compile();
    servicio = modulo.get(PacientesService);
  });

  it('crea al paciente con el historial de citas vacío', async () => {
    repositorio.findOneBy.mockResolvedValue(null);
    repositorio.save.mockImplementation((p: Partial<Paciente>) => Promise.resolve({ id: 1, ...p }));

    const creado = await servicio.crear(dto);

    expect(creado.id).toBe(1);
    expect(creado.historialCitas).toEqual([]);
  });

  it('rechaza un documento ya registrado sin guardar', async () => {
    repositorio.findOneBy.mockResolvedValue({ id: 1, ...dto });

    await expect(servicio.crear(dto)).rejects.toThrow(ConflictException);
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('convierte la violación de unicidad de PostgreSQL en 409', async () => {
    repositorio.findOneBy.mockResolvedValue(null);
    repositorio.save.mockRejectedValue({ driverError: { code: '23505' } });

    await expect(servicio.crear(dto)).rejects.toThrow(ConflictException);
  });

  it('relanza los demás errores de base de datos', async () => {
    repositorio.findOneBy.mockResolvedValue(null);
    repositorio.save.mockRejectedValue(new Error('conexión caída'));

    await expect(servicio.crear(dto)).rejects.toThrow('conexión caída');
  });

  it('lista los pacientes ordenados por nombre', async () => {
    repositorio.find.mockResolvedValue([{ id: 1, ...dto }]);

    const lista = await servicio.listar();

    expect(repositorio.find).toHaveBeenCalledWith({ order: { nombre: 'ASC' } });
    expect(lista[0].historialCitas).toEqual([]);
  });

  it('obtiene un paciente por id', async () => {
    repositorio.findOneBy.mockResolvedValue({ id: 3, ...dto });
    await expect(servicio.obtener(3)).resolves.toMatchObject({ id: 3, documento: '1102345678' });
  });

  it('lanza NotFound si el paciente no existe', async () => {
    repositorio.findOneBy.mockResolvedValue(null);
    await expect(servicio.obtener(99)).rejects.toThrow(NotFoundException);
  });
});
