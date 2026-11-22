import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Procedimiento } from './procedimiento.entity';
import { ProcedimientosService } from './procedimientos.service';

function crearRepositorioFalso() {
  return {
    create: jest.fn((datos: Partial<Procedimiento>) => datos),
    save: jest.fn((p: Partial<Procedimiento>) => Promise.resolve(p)),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
}

describe('ProcedimientosService', () => {
  let servicio: ProcedimientosService;
  let repositorio: ReturnType<typeof crearRepositorioFalso>;

  beforeEach(async () => {
    repositorio = crearRepositorioFalso();
    const modulo = await Test.createTestingModule({
      providers: [
        ProcedimientosService,
        { provide: getRepositoryToken(Procedimiento), useValue: repositorio },
      ],
    }).compile();
    servicio = modulo.get(ProcedimientosService);
  });

  it('crea un procedimiento con nombre y duración', async () => {
    const creado = await servicio.crear({ nombre: 'Limpieza', duracionMin: 30 });
    expect(repositorio.save).toHaveBeenCalledWith({ nombre: 'Limpieza', duracionMin: 30 });
    expect(creado.nombre).toBe('Limpieza');
  });

  it('lista solo los activos por defecto', async () => {
    repositorio.find.mockResolvedValue([]);
    await servicio.listar();
    expect(repositorio.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });

  it('lista también los inactivos si se pide', async () => {
    repositorio.find.mockResolvedValue([]);
    await servicio.listar(true);
    expect(repositorio.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('lanza NotFound si el procedimiento no existe', async () => {
    repositorio.findOneBy.mockResolvedValue(null);
    await expect(servicio.obtener(99)).rejects.toThrow(NotFoundException);
  });

  it('avisa cuando cambia la duración', async () => {
    repositorio.findOneBy.mockResolvedValue({
      id: 1,
      nombre: 'Limpieza',
      duracionMin: 30,
      activo: true,
    });
    const resultado = await servicio.actualizar(1, { duracionMin: 45 });
    expect(resultado.procedimiento.duracionMin).toBe(45);
    expect(resultado.aviso).toContain('citas nuevas');
  });

  it('no avisa si la duración no cambia', async () => {
    repositorio.findOneBy.mockResolvedValue({
      id: 1,
      nombre: 'Limpieza',
      duracionMin: 30,
      activo: true,
    });
    const resultado = await servicio.actualizar(1, { nombre: 'Limpieza profunda' });
    expect(resultado.aviso).toBeUndefined();
    expect(resultado.procedimiento.nombre).toBe('Limpieza profunda');
  });

  it('desactiva sin borrar', async () => {
    repositorio.findOneBy.mockResolvedValue({
      id: 1,
      nombre: 'Limpieza',
      duracionMin: 30,
      activo: true,
    });
    const resultado = await servicio.desactivar(1);
    expect(resultado.activo).toBe(false);
  });
});
