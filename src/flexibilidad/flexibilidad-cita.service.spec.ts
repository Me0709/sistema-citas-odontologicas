import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cita } from '../citas/cita.entity';
import { CitasService } from '../citas/citas.service';
import { EstadoCita } from '../citas/estado-cita';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';
import { FlexibilidadCita } from './flexibilidad-cita.entity';
import { FlexibilidadCitaService } from './flexibilidad-cita.service';

const cita = (estado: EstadoCita = EstadoCita.PROGRAMADA): Cita => ({ id: 5, estado }) as Cita;

describe('FlexibilidadCitaService', () => {
  let servicio: FlexibilidadCitaService;
  const repositorio = { findOneBy: jest.fn(), find: jest.fn(), save: jest.fn() };
  const citas = { obtener: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    citas.obtener.mockResolvedValue(cita());
    repositorio.findOneBy.mockResolvedValue(null);
    repositorio.find.mockResolvedValue([]);
    repositorio.save.mockImplementation((datos: FlexibilidadCita) => Promise.resolve(datos));

    const modulo = await Test.createTestingModule({
      providers: [
        FlexibilidadCitaService,
        { provide: getRepositoryToken(FlexibilidadCita), useValue: repositorio },
        { provide: CitasService, useValue: citas },
      ],
    }).compile();
    servicio = modulo.get(FlexibilidadCitaService);
  });

  describe('declarar', () => {
    it.each(Object.values(Flexibilidad))(
      'guarda la preferencia %s asociada a la cita',
      async (flexibilidad) => {
        const respuesta = await servicio.declarar(5, flexibilidad);

        expect(repositorio.save).toHaveBeenCalledWith({ citaId: 5, flexibilidad });
        expect(respuesta).toEqual({ citaId: 5, flexibilidad, declarada: true });
      },
    );

    it('actualiza la preferencia cuando ya había una declarada', async () => {
      repositorio.findOneBy.mockResolvedValue({ citaId: 5, flexibilidad: Flexibilidad.MANTENER });

      const respuesta = await servicio.declarar(5, Flexibilidad.PUEDE_ADELANTAR);

      expect(repositorio.save).toHaveBeenCalledWith({
        citaId: 5,
        flexibilidad: Flexibilidad.PUEDE_ADELANTAR,
      });
      expect(respuesta.flexibilidad).toBe(Flexibilidad.PUEDE_ADELANTAR);
    });

    it.each([EstadoCita.PROGRAMADA, EstadoCita.CONFIRMADA, EstadoCita.POR_REPROGRAMAR])(
      'permite declarar en una cita %s',
      async (estado) => {
        citas.obtener.mockResolvedValue(cita(estado));
        await expect(servicio.declarar(5, Flexibilidad.AMBAS)).resolves.toBeDefined();
      },
    );

    it.each([
      EstadoCita.EN_SALA,
      EstadoCita.EN_ATENCION,
      EstadoCita.ATENDIDA,
      EstadoCita.CANCELADA,
      EstadoCita.INASISTENCIA,
    ])('rechaza con 409 si la cita ya está %s', async (estado) => {
      citas.obtener.mockResolvedValue(cita(estado));

      await expect(servicio.declarar(5, Flexibilidad.AMBAS)).rejects.toThrow(ConflictException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });

    it('propaga el 404 si la cita no existe', async () => {
      citas.obtener.mockRejectedValue(new NotFoundException('No existe la cita 5'));

      await expect(servicio.declarar(5, Flexibilidad.AMBAS)).rejects.toThrow(NotFoundException);
      expect(repositorio.save).not.toHaveBeenCalled();
    });
  });

  describe('obtener', () => {
    it('devuelve la preferencia declarada', async () => {
      repositorio.findOneBy.mockResolvedValue({ citaId: 5, flexibilidad: Flexibilidad.AMBAS });

      await expect(servicio.obtener(5)).resolves.toEqual({
        citaId: 5,
        flexibilidad: Flexibilidad.AMBAS,
        declarada: true,
      });
    });

    it('sin preferencia declarada la trata como "debe mantener el horario"', async () => {
      await expect(servicio.obtener(5)).resolves.toEqual({
        citaId: 5,
        flexibilidad: Flexibilidad.MANTENER,
        declarada: false,
      });
    });

    it('propaga el 404 si la cita no existe', async () => {
      citas.obtener.mockRejectedValue(new NotFoundException('No existe la cita 5'));
      await expect(servicio.obtener(5)).rejects.toThrow(NotFoundException);
    });
  });

  describe('porCitas', () => {
    it('devuelve la flexibilidad de cada cita y "mantener" para las que no declararon', async () => {
      repositorio.find.mockResolvedValue([
        { citaId: 1, flexibilidad: Flexibilidad.PUEDE_ATRASAR },
        { citaId: 3, flexibilidad: Flexibilidad.AMBAS },
      ]);

      const resultado = await servicio.porCitas([1, 2, 3]);

      expect(resultado.get(1)).toBe(Flexibilidad.PUEDE_ATRASAR);
      expect(resultado.get(2)).toBe(Flexibilidad.MANTENER);
      expect(resultado.get(3)).toBe(Flexibilidad.AMBAS);
    });

    it('no consulta la base de datos si no hay citas', async () => {
      const resultado = await servicio.porCitas([]);

      expect(resultado.size).toBe(0);
      expect(repositorio.find).not.toHaveBeenCalled();
    });
  });
});
