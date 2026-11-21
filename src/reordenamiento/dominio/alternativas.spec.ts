import {
  Alternativa,
  compararAlternativas,
  EventoDisruptivo,
  proponerAlternativas,
  ResultadoReprogramacion,
} from './alternativas';
import { Flexibilidad } from './flexibilidad';
import { CitaPendiente } from './hora-estimada';

const hora = (hhmm: string): Date => new Date(`2026-03-02T${hhmm}:00`);

const cita = (
  citaId: number,
  inicio: string,
  duracionMin: number,
  flexibilidad: Flexibilidad,
): CitaPendiente => ({ citaId, inicioPrevisto: hora(inicio), duracionMin, flexibilidad });

const retraso: EventoDisruptivo = { tipo: 'retraso' };

function conAlternativa(resultado: ResultadoReprogramacion) {
  if (!resultado.hayAlternativa) {
    throw new Error('Se esperaba una alternativa');
  }
  return resultado;
}

const asignacionDe = (alternativa: Alternativa, citaId: number) =>
  alternativa.asignaciones.find((a) => a.citaId === citaId);

describe('proponerAlternativas', () => {
  describe('Escenario 1: alternativa con el menor impacto', () => {
    it('propone reordenar para que la cita corta no espere a la larga', () => {
      const citas = [
        cita(1, '10:00', 60, Flexibilidad.AMBAS),
        cita(2, '10:30', 15, Flexibilidad.PUEDE_ATRASAR),
      ];

      const { propuesta } = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      expect(propuesta.desplazamientoTotalMin).toBe(45);
      expect(propuesta.pacientesDesplazados).toBe(1);
      expect(asignacionDe(propuesta, 2)?.inicioPropuesto).toEqual(hora('10:30'));
      expect(asignacionDe(propuesta, 1)?.inicioPropuesto).toEqual(hora('10:45'));
      expect(asignacionDe(propuesta, 1)?.desplazamientoMin).toBe(45);
    });

    it('mantiene el orden cuando reordenar no reduce el desplazamiento', () => {
      const citas = [
        cita(1, '10:00', 30, Flexibilidad.PUEDE_ATRASAR),
        cita(2, '10:30', 30, Flexibilidad.PUEDE_ATRASAR),
      ];

      const { propuesta } = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      expect(propuesta.desplazamientoTotalMin).toBe(40);
      expect(asignacionDe(propuesta, 1)?.inicioPropuesto).toEqual(hora('10:20'));
      expect(asignacionDe(propuesta, 2)?.inicioPropuesto).toEqual(hora('10:50'));
    });

    it('no desplaza a nadie si el odontólogo se libera a tiempo', () => {
      const citas = [cita(1, '10:00', 30, Flexibilidad.AMBAS)];

      const { propuesta } = conAlternativa(
        proponerAlternativas(citas, hora('09:30'), { tipo: 'cancelacion', citaId: 9 }),
      );

      expect(propuesta.desplazamientoTotalMin).toBe(0);
      expect(propuesta.pacientesDesplazados).toBe(0);
      expect(asignacionDe(propuesta, 1)?.inicioPropuesto).toEqual(hora('10:00'));
    });

    it('no adelanta a quien no lo necesita para reducir el desplazamiento', () => {
      const citas = [cita(1, '10:30', 30, Flexibilidad.PUEDE_ADELANTAR)];

      const { propuesta } = conAlternativa(proponerAlternativas(citas, hora('10:00'), retraso));

      expect(asignacionDe(propuesta, 1)?.inicioPropuesto).toEqual(hora('10:30'));
    });

    it('devuelve una propuesta vacía si no hay citas pendientes', () => {
      const { propuesta } = conAlternativa(proponerAlternativas([], hora('10:00'), retraso));

      expect(propuesta.asignaciones).toEqual([]);
      expect(propuesta.desplazamientoTotalMin).toBe(0);
    });

    it('no modifica la lista recibida', () => {
      const citas = [
        cita(2, '10:30', 15, Flexibilidad.PUEDE_ATRASAR),
        cita(1, '10:00', 60, Flexibilidad.AMBAS),
      ];

      proponerAlternativas(citas, hora('10:20'), retraso);

      expect(citas.map((c) => c.citaId)).toEqual([2, 1]);
    });

    it('rechaza evaluar más citas de las que admite la búsqueda', () => {
      const citas = Array.from({ length: 7 }, (_, i) =>
        cita(i + 1, `${String(8 + i).padStart(2, '0')}:00`, 15, Flexibilidad.AMBAS),
      );

      expect(() => proponerAlternativas(citas, hora('08:00'), retraso)).toThrow(RangeError);
    });
  });

  describe('Escenario 2: paciente que debe mantener el horario', () => {
    const citas = [
      cita(2, '10:00', 30, Flexibilidad.PUEDE_ATRASAR),
      cita(1, '10:30', 30, Flexibilidad.MANTENER),
    ];

    it('no desplaza al paciente que debe mantener el horario', () => {
      const { propuesta } = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      expect(asignacionDe(propuesta, 1)?.inicioPropuesto).toEqual(hora('10:30'));
      expect(asignacionDe(propuesta, 1)?.desplazamientoMin).toBe(0);
    });

    it('busca la alternativa entre los pacientes con flexibilidad', () => {
      const { propuesta } = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      expect(asignacionDe(propuesta, 2)?.inicioPropuesto).toEqual(hora('11:00'));
      expect(propuesta.pacientesDesplazados).toBe(1);
      expect(propuesta.desplazamientoTotalMin).toBe(60);
    });

    it('ninguna de las alternativas mueve al paciente que debe mantener el horario', () => {
      const resultado = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      for (const alternativa of [resultado.propuesta, ...resultado.otras]) {
        expect(asignacionDe(alternativa, 1)?.desplazamientoMin).toBe(0);
      }
    });
  });

  describe('Escenario 3: empate entre alternativas', () => {
    it('elige la que desplaza a menos pacientes cuando el desplazamiento total es igual', () => {
      const citas = [
        cita(1, '10:00', 15, Flexibilidad.PUEDE_ATRASAR),
        cita(2, '10:15', 15, Flexibilidad.PUEDE_ATRASAR),
      ];

      const resultado = conAlternativa(proponerAlternativas(citas, hora('10:15'), retraso));

      expect(resultado.propuesta.desplazamientoTotalMin).toBe(30);
      expect(resultado.propuesta.pacientesDesplazados).toBe(1);
      expect(asignacionDe(resultado.propuesta, 2)?.desplazamientoMin).toBe(0);
      expect(resultado.otras[0].desplazamientoTotalMin).toBe(30);
      expect(resultado.otras[0].pacientesDesplazados).toBe(2);
      expect(resultado.explicacion.criterio).toBe('menos_pacientes');
    });
  });

  describe('Escenario 4: sin alternativas posibles', () => {
    it('informa y devuelve las citas en conflicto si ninguna combinación respeta las restricciones', () => {
      const citas = [cita(1, '10:00', 30, Flexibilidad.MANTENER)];

      const resultado = proponerAlternativas(citas, hora('10:20'), retraso);

      expect(resultado.hayAlternativa).toBe(false);
      if (!resultado.hayAlternativa) {
        expect(resultado.citasEnConflicto.map((c) => c.citaId)).toEqual([1]);
        expect(resultado.motivo).toContain('manualmente');
      }
    });

    it('considera en conflicto a quien solo puede adelantar y ya no llega a tiempo', () => {
      const citas = [cita(1, '10:00', 30, Flexibilidad.PUEDE_ADELANTAR)];

      const resultado = proponerAlternativas(citas, hora('10:20'), retraso);

      expect(resultado.hayAlternativa).toBe(false);
    });

    it('no incluye en el conflicto a los pacientes que sí se pueden acomodar', () => {
      const citas = [
        cita(1, '10:00', 30, Flexibilidad.MANTENER),
        cita(2, '10:30', 30, Flexibilidad.PUEDE_ATRASAR),
      ];

      const resultado = proponerAlternativas(citas, hora('10:20'), retraso);

      expect(resultado.hayAlternativa).toBe(false);
      if (!resultado.hayAlternativa) {
        expect(resultado.citasEnConflicto.map((c) => c.citaId)).toEqual([1]);
      }
    });

    it('descarta las alternativas que terminan después de la jornada', () => {
      const citas = [
        cita(1, '10:00', 60, Flexibilidad.AMBAS),
        cita(2, '10:30', 15, Flexibilidad.PUEDE_ATRASAR),
      ];

      const resultado = conAlternativa(
        proponerAlternativas(citas, hora('10:20'), retraso, { finJornada: hora('11:40') }),
      );

      expect(resultado.propuesta.desplazamientoTotalMin).toBe(70);
      expect(resultado.otras).toEqual([]);
    });

    it('informa que no hay alternativa si la jornada no alcanza', () => {
      const citas = [cita(1, '10:00', 30, Flexibilidad.PUEDE_ATRASAR)];

      const resultado = proponerAlternativas(citas, hora('10:20'), retraso, {
        finJornada: hora('10:40'),
      });

      expect(resultado.hayAlternativa).toBe(false);
    });
  });

  describe('Escenario 5: explicación de la propuesta', () => {
    const citas = [
      cita(1, '10:00', 60, Flexibilidad.AMBAS),
      cita(2, '10:30', 15, Flexibilidad.PUEDE_ATRASAR),
    ];

    it('indica el evento, a quién desplaza y cuántos minutos', () => {
      const { explicacion } = conAlternativa(proponerAlternativas(citas, hora('10:20'), retraso));

      expect(explicacion.evento).toEqual(retraso);
      expect(explicacion.desplazados).toEqual([{ citaId: 1, minutos: 45 }]);
    });

    it('explica por qué se eligió frente a las otras alternativas', () => {
      const { explicacion, otras } = conAlternativa(
        proponerAlternativas(citas, hora('10:20'), retraso),
      );

      expect(explicacion.alternativasEvaluadas).toBe(2);
      expect(explicacion.criterio).toBe('menor_desplazamiento');
      expect(explicacion.motivo).toContain('45');
      expect(explicacion.motivo).toContain('70');
      expect(otras).toHaveLength(1);
      expect(otras[0].desplazamientoTotalMin).toBe(70);
    });

    it('indica que es la única alternativa cuando no hay otra', () => {
      const unica = [
        cita(2, '10:00', 30, Flexibilidad.PUEDE_ATRASAR),
        cita(1, '10:30', 30, Flexibilidad.MANTENER),
      ];

      const { explicacion } = conAlternativa(proponerAlternativas(unica, hora('10:20'), retraso));

      expect(explicacion.criterio).toBe('unica');
      expect(explicacion.motivo).toContain('única');
    });

    it('registra el evento que originó la propuesta', () => {
      const evento: EventoDisruptivo = { tipo: 'inasistencia', citaId: 7 };

      const { explicacion } = conAlternativa(proponerAlternativas(citas, hora('10:20'), evento));

      expect(explicacion.evento).toEqual({ tipo: 'inasistencia', citaId: 7 });
    });
  });
});

describe('compararAlternativas', () => {
  const alternativa = (
    desplazamientoTotalMin: number,
    desplazadasPrevistas: string[],
  ): Alternativa => ({
    desplazamientoTotalMin,
    pacientesDesplazados: desplazadasPrevistas.length,
    asignaciones: desplazadasPrevistas.map((previsto, i) => ({
      citaId: i + 1,
      inicioPrevisto: hora(previsto),
      inicioPropuesto: hora(previsto),
      desplazamientoMin: 15,
    })),
  });

  it('prefiere el menor desplazamiento total', () => {
    expect(
      compararAlternativas(alternativa(30, ['10:00']), alternativa(45, ['10:00'])),
    ).toBeLessThan(0);
  });

  it('con igual desplazamiento, prefiere el que mueve a menos pacientes', () => {
    const una = alternativa(30, ['10:00']);
    const dos = alternativa(30, ['10:00', '10:15']);

    expect(compararAlternativas(una, dos)).toBeLessThan(0);
    expect(compararAlternativas(dos, una)).toBeGreaterThan(0);
  });

  it('con igual desplazamiento y pacientes, prefiere el que afecta a las citas más tardías', () => {
    const temprana = alternativa(30, ['10:00', '10:15']);
    const tardia = alternativa(30, ['10:00', '10:30']);

    expect(compararAlternativas(tardia, temprana)).toBeLessThan(0);
    expect(compararAlternativas(temprana, tardia)).toBeGreaterThan(0);
  });

  it('considera iguales a dos alternativas idénticas', () => {
    expect(compararAlternativas(alternativa(30, ['10:00']), alternativa(30, ['10:00']))).toBe(0);
  });
});
