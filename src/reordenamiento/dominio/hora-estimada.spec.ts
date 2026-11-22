import { Flexibilidad } from './flexibilidad';
import { CitaPendiente, recalcularHorasEstimadas } from './hora-estimada';

const hora = (hhmm: string): Date => new Date(`2026-03-02T${hhmm}:00`);

const cita = (
  citaId: number,
  inicio: string,
  duracionMin: number,
  flexibilidad: Flexibilidad = Flexibilidad.MANTENER,
): CitaPendiente => ({ citaId, inicioPrevisto: hora(inicio), duracionMin, flexibilidad });

describe('recalcularHorasEstimadas', () => {
  describe('Escenario 1: recálculo por retraso de la cita anterior', () => {
    it('desplaza las citas siguientes el mismo tiempo que se retrasó la anterior', () => {
      const citas = [cita(1, '10:00', 30), cita(2, '10:30', 30)];

      const resultado = recalcularHorasEstimadas(citas, hora('10:20'));

      expect(resultado[0].inicioEstimado).toEqual(hora('10:20'));
      expect(resultado[0].cambioMin).toBe(20);
      expect(resultado[1].inicioEstimado).toEqual(hora('10:50'));
      expect(resultado[1].cambioMin).toBe(20);
    });

    it('no cambia nada si el odontólogo se libera a tiempo', () => {
      const citas = [cita(1, '10:00', 30), cita(2, '10:30', 30)];

      const resultado = recalcularHorasEstimadas(citas, hora('10:00'));

      expect(resultado.map((r) => r.cambioMin)).toEqual([0, 0]);
    });

    it('absorbe parte del retraso cuando hay un hueco entre citas', () => {
      const citas = [cita(1, '10:00', 30), cita(2, '11:00', 30)];

      const resultado = recalcularHorasEstimadas(citas, hora('10:20'));

      expect(resultado[0].cambioMin).toBe(20);
      expect(resultado[1].inicioEstimado).toEqual(hora('11:00'));
      expect(resultado[1].cambioMin).toBe(0);
    });

    it('conserva el inicio previsto original de cada cita', () => {
      const resultado = recalcularHorasEstimadas([cita(1, '10:00', 30)], hora('10:20'));

      expect(resultado[0].inicioPrevisto).toEqual(hora('10:00'));
    });

    it('ordena por hora prevista aunque lleguen desordenadas', () => {
      const citas = [cita(2, '10:30', 30), cita(1, '10:00', 30)];

      const resultado = recalcularHorasEstimadas(citas, hora('10:20'));

      expect(resultado.map((r) => r.citaId)).toEqual([1, 2]);
      expect(resultado[1].inicioEstimado).toEqual(hora('10:50'));
    });

    it('devuelve una lista vacía si no hay citas pendientes', () => {
      expect(recalcularHorasEstimadas([], hora('10:00'))).toEqual([]);
    });

    it('no modifica la lista recibida', () => {
      const citas = [cita(2, '10:30', 30), cita(1, '10:00', 30)];

      recalcularHorasEstimadas(citas, hora('10:20'));

      expect(citas.map((c) => c.citaId)).toEqual([2, 1]);
    });
  });

  describe('Escenario 2: notificación del nuevo horario estimado', () => {
    it('no notifica si el cambio es menor al umbral de 10 minutos', () => {
      const resultado = recalcularHorasEstimadas([cita(1, '10:00', 30)], hora('10:09'));

      expect(resultado[0].cambioMin).toBe(9);
      expect(resultado[0].notificar).toBe(false);
    });

    it('notifica si el cambio llega exactamente al umbral de 10 minutos', () => {
      const resultado = recalcularHorasEstimadas([cita(1, '10:00', 30)], hora('10:10'));

      expect(resultado[0].notificar).toBe(true);
    });

    it('notifica si el cambio supera el umbral', () => {
      const resultado = recalcularHorasEstimadas([cita(1, '10:00', 30)], hora('10:45'));

      expect(resultado[0].notificar).toBe(true);
    });
  });

  describe('Escenario 3: adelanto por una cita más corta', () => {
    it('adelanta y notifica al paciente que declaró poder adelantar', () => {
      const citas = [cita(1, '10:00', 30, Flexibilidad.PUEDE_ADELANTAR)];

      const resultado = recalcularHorasEstimadas(citas, hora('09:40'));

      expect(resultado[0].inicioEstimado).toEqual(hora('09:40'));
      expect(resultado[0].cambioMin).toBe(-20);
      expect(resultado[0].notificar).toBe(true);
    });

    it('también adelanta al paciente que puede adelantar y atrasar', () => {
      const resultado = recalcularHorasEstimadas(
        [cita(1, '10:00', 30, Flexibilidad.AMBAS)],
        hora('09:40'),
      );

      expect(resultado[0].cambioMin).toBe(-20);
    });

    it.each([Flexibilidad.PUEDE_ATRASAR, Flexibilidad.MANTENER])(
      'no adelanta al paciente con flexibilidad %s',
      (flexibilidad) => {
        const resultado = recalcularHorasEstimadas(
          [cita(1, '10:00', 30, flexibilidad)],
          hora('09:40'),
        );

        expect(resultado[0].inicioEstimado).toEqual(hora('10:00'));
        expect(resultado[0].cambioMin).toBe(0);
        expect(resultado[0].notificar).toBe(false);
      },
    );

    it('no adelanta a quien viene después de una cita que no se puede adelantar', () => {
      const citas = [
        cita(1, '10:00', 30, Flexibilidad.MANTENER),
        cita(2, '10:30', 30, Flexibilidad.PUEDE_ADELANTAR),
      ];

      const resultado = recalcularHorasEstimadas(citas, hora('09:40'));

      expect(resultado[1].inicioEstimado).toEqual(hora('10:30'));
    });

    it('adelanta en cadena a quienes pueden adelantar', () => {
      const citas = [
        cita(1, '10:00', 30, Flexibilidad.PUEDE_ADELANTAR),
        cita(2, '10:30', 30, Flexibilidad.PUEDE_ADELANTAR),
      ];

      const resultado = recalcularHorasEstimadas(citas, hora('09:40'));

      expect(resultado.map((r) => r.inicioEstimado)).toEqual([hora('09:40'), hora('10:10')]);
    });

    it('no notifica un adelanto menor al umbral', () => {
      const resultado = recalcularHorasEstimadas(
        [cita(1, '10:00', 30, Flexibilidad.PUEDE_ADELANTAR)],
        hora('09:55'),
      );

      expect(resultado[0].cambioMin).toBe(-5);
      expect(resultado[0].notificar).toBe(false);
    });
  });

  describe('Escenario 4: paciente que debe mantener el horario', () => {
    it('marca para evaluar alternativas al paciente que debe mantener el horario y es desplazado', () => {
      const resultado = recalcularHorasEstimadas(
        [cita(1, '10:00', 30, Flexibilidad.MANTENER)],
        hora('10:20'),
      );

      expect(resultado[0].requiereAlternativas).toBe(true);
    });

    it('no marca al paciente que debe mantener el horario si no es desplazado', () => {
      const resultado = recalcularHorasEstimadas(
        [cita(1, '10:00', 30, Flexibilidad.MANTENER)],
        hora('10:00'),
      );

      expect(resultado[0].requiereAlternativas).toBe(false);
    });

    it.each([Flexibilidad.PUEDE_ATRASAR, Flexibilidad.AMBAS])(
      'no marca al paciente con flexibilidad %s aunque sea desplazado',
      (flexibilidad) => {
        const resultado = recalcularHorasEstimadas(
          [cita(1, '10:00', 30, flexibilidad)],
          hora('10:20'),
        );

        expect(resultado[0].requiereAlternativas).toBe(false);
      },
    );

    it('marca también al paciente que debe mantener el horario aunque el retraso sea menor al umbral', () => {
      const resultado = recalcularHorasEstimadas(
        [cita(1, '10:00', 30, Flexibilidad.MANTENER)],
        hora('10:05'),
      );

      expect(resultado[0].notificar).toBe(false);
      expect(resultado[0].requiereAlternativas).toBe(true);
    });
  });
});
