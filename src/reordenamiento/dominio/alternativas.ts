import { MAX_CITAS_A_EVALUAR } from '../constantes';
import { Flexibilidad, puedeAdelantar } from './flexibilidad';
import { CitaPendiente, recalcularHorasEstimadas } from './hora-estimada';

const MS_POR_MINUTO = 60_000;
const MAX_OTRAS_ALTERNATIVAS = 3;

export type TipoEvento =
  'retraso' | 'cancelacion' | 'inasistencia' | 'propuesta_rechazada' | 'propuesta_vencida';

/** Hecho que alteró la agenda y originó la reprogramación. */
export interface EventoDisruptivo {
  tipo: TipoEvento;
  citaId?: number;
}

export interface OpcionesReprogramacion {
  /** Hora límite de la jornada: ninguna cita puede terminar después. */
  finJornada?: Date;
  /** Criterio propio sobre el horario en que puede atenderse una cita (por ejemplo, una pausa). */
  esHorarioValido?: (inicio: Date, fin: Date) => boolean;
}

export interface Asignacion {
  citaId: number;
  inicioPrevisto: Date;
  inicioPropuesto: Date;
  /** Positivo si la cita se atrasa, negativo si se adelanta. */
  desplazamientoMin: number;
}

export interface Alternativa {
  asignaciones: Asignacion[];
  /** Suma de los minutos que se mueve cada cita, sin importar el sentido. */
  desplazamientoTotalMin: number;
  pacientesDesplazados: number;
}

export type CriterioEleccion =
  'unica' | 'menor_desplazamiento' | 'menos_pacientes' | 'citas_mas_tardias' | 'equivalentes';

export interface Explicacion {
  evento: EventoDisruptivo;
  desplazados: { citaId: number; minutos: number }[];
  alternativasEvaluadas: number;
  criterio: CriterioEleccion;
  motivo: string;
}

export type ResultadoReprogramacion =
  | {
      hayAlternativa: true;
      propuesta: Alternativa;
      otras: Alternativa[];
      explicacion: Explicacion;
    }
  | {
      hayAlternativa: false;
      citasEnConflicto: CitaPendiente[];
      motivo: string;
    };

/** Indica si la hora de inicio respeta lo que el paciente declaró. */
function respetaFlexibilidad(cita: CitaPendiente, inicio: number): boolean {
  const previsto = cita.inicioPrevisto.getTime();
  switch (cita.flexibilidad) {
    case Flexibilidad.MANTENER:
      return inicio === previsto;
    case Flexibilidad.PUEDE_ADELANTAR:
      return inicio <= previsto;
    case Flexibilidad.PUEDE_ATRASAR:
      return inicio >= previsto;
    case Flexibilidad.AMBAS:
      return true;
  }
}

function citasAfectadas(alternativa: Alternativa): number[] {
  return alternativa.asignaciones
    .filter((a) => a.desplazamientoMin !== 0)
    .map((a) => a.inicioPrevisto.getTime())
    .sort((a, b) => a - b);
}

function firma(alternativa: Alternativa): string {
  return [...alternativa.asignaciones]
    .sort((a, b) => a.citaId - b.citaId)
    .map((a) => `${a.citaId}@${a.inicioPropuesto.getTime()}`)
    .join('|');
}

function compararAfectadasTardias(a: Alternativa, b: Alternativa): number {
  const previstasA = citasAfectadas(a);
  const previstasB = citasAfectadas(b);
  for (let i = 0; i < Math.min(previstasA.length, previstasB.length); i++) {
    if (previstasA[i] !== previstasB[i]) {
      return previstasB[i] - previstasA[i];
    }
  }
  return 0;
}

/**
 * Ordena alternativas de mejor a peor: menor desplazamiento total, luego menos
 * pacientes desplazados y, si persiste el empate, la que afecta a las citas más tardías.
 */
export function compararAlternativas(a: Alternativa, b: Alternativa): number {
  return (
    a.desplazamientoTotalMin - b.desplazamientoTotalMin ||
    a.pacientesDesplazados - b.pacientesDesplazados ||
    compararAfectadasTardias(a, b) ||
    firma(a).localeCompare(firma(b))
  );
}

function crearAlternativa(asignaciones: Asignacion[]): Alternativa {
  const ordenadas = [...asignaciones].sort(
    (a, b) => a.inicioPropuesto.getTime() - b.inicioPropuesto.getTime(),
  );
  return {
    asignaciones: ordenadas,
    desplazamientoTotalMin: ordenadas.reduce((suma, a) => suma + Math.abs(a.desplazamientoMin), 0),
    pacientesDesplazados: ordenadas.filter((a) => a.desplazamientoMin !== 0).length,
  };
}

/** Indica si atender entre esos dos instantes respeta la jornada y el criterio de horario válido. */
function cabeEnElHorario(opciones: OpcionesReprogramacion, inicio: number, fin: number): boolean {
  const { finJornada, esHorarioValido } = opciones;
  return (
    (finJornada === undefined || fin <= finJornada.getTime()) &&
    (esHorarioValido === undefined || esHorarioValido(new Date(inicio), new Date(fin)))
  );
}

/**
 * Genera todas las formas válidas de atender las citas: cada orden posible y, para quien
 * puede adelantar, la opción de empezar antes de su hora prevista.
 */
function generarAlternativas(
  citas: readonly CitaPendiente[],
  libreDesde: Date,
  opciones: OpcionesReprogramacion,
): Alternativa[] {
  const encontradas = new Map<string, Alternativa>();
  const usadas = citas.map(() => false);
  const asignaciones: Asignacion[] = [];

  const recorrer = (cursor: number): void => {
    if (asignaciones.length === citas.length) {
      const alternativa = crearAlternativa(asignaciones);
      encontradas.set(firma(alternativa), alternativa);
      return;
    }
    citas.forEach((cita, i) => {
      if (usadas[i]) return;
      const previsto = cita.inicioPrevisto.getTime();
      const retenido = Math.max(cursor, previsto);
      const inicios =
        puedeAdelantar(cita.flexibilidad) && cursor < retenido ? [retenido, cursor] : [retenido];

      for (const inicio of inicios) {
        const fin = inicio + cita.duracionMin * MS_POR_MINUTO;
        if (!respetaFlexibilidad(cita, inicio) || !cabeEnElHorario(opciones, inicio, fin)) continue;
        usadas[i] = true;
        asignaciones.push({
          citaId: cita.citaId,
          inicioPrevisto: cita.inicioPrevisto,
          inicioPropuesto: new Date(inicio),
          desplazamientoMin: (inicio - previsto) / MS_POR_MINUTO,
        });
        recorrer(fin);
        asignaciones.pop();
        usadas[i] = false;
      }
    });
  };

  recorrer(libreDesde.getTime());
  return [...encontradas.values()];
}

function citasQueNoSePuedenAcomodar(
  citas: readonly CitaPendiente[],
  libreDesde: Date,
  opciones: OpcionesReprogramacion,
): CitaPendiente[] {
  const porId = new Map(citas.map((c) => [c.citaId, c]));
  return recalcularHorasEstimadas(citas, libreDesde)
    .map((estimada) => ({ cita: porId.get(estimada.citaId)!, estimada }))
    .filter(({ cita, estimada }) => {
      const inicio = estimada.inicioEstimado.getTime();
      const fin = inicio + cita.duracionMin * MS_POR_MINUTO;
      return !respetaFlexibilidad(cita, inicio) || !cabeEnElHorario(opciones, inicio, fin);
    })
    .map(({ cita }) => cita);
}

/** Explica por qué la mejor alternativa se prefirió frente a la siguiente. */
export function explicarEleccion(
  mejor: Alternativa,
  segunda: Alternativa | undefined,
): { criterio: CriterioEleccion; motivo: string } {
  if (!segunda) {
    return {
      criterio: 'unica',
      motivo: 'Es la única alternativa que respeta las restricciones de los pacientes.',
    };
  }
  if (mejor.desplazamientoTotalMin !== segunda.desplazamientoTotalMin) {
    return {
      criterio: 'menor_desplazamiento',
      motivo:
        `Menor desplazamiento total: ${mejor.desplazamientoTotalMin} min frente a ` +
        `${segunda.desplazamientoTotalMin} min de la siguiente mejor alternativa.`,
    };
  }
  if (mejor.pacientesDesplazados !== segunda.pacientesDesplazados) {
    return {
      criterio: 'menos_pacientes',
      motivo:
        `Mismo desplazamiento total (${mejor.desplazamientoTotalMin} min) que otra alternativa, ` +
        `pero desplaza a menos pacientes (${mejor.pacientesDesplazados} frente a ${segunda.pacientesDesplazados}).`,
    };
  }
  if (compararAfectadasTardias(mejor, segunda) !== 0) {
    return {
      criterio: 'citas_mas_tardias',
      motivo:
        'Mismo desplazamiento total y mismo número de pacientes desplazados; ' +
        'se eligió la que afecta a las citas más tardías del día.',
    };
  }
  return {
    criterio: 'equivalentes',
    motivo:
      'Hay alternativas equivalentes en desplazamiento, pacientes y citas afectadas; ' +
      'se eligió una de ellas.',
  };
}

/**
 * Propone cómo reprogramar las citas pendientes tras un evento que alteró la agenda.
 *
 * @param citas citas que aún no comienzan (máximo {@link MAX_CITAS_A_EVALUAR})
 * @param libreDesde momento en que el odontólogo queda libre
 * @param evento retraso, cancelación o inasistencia que originó el análisis
 */
export function proponerAlternativas(
  citas: readonly CitaPendiente[],
  libreDesde: Date,
  evento: EventoDisruptivo,
  opciones: OpcionesReprogramacion = {},
): ResultadoReprogramacion {
  if (citas.length > MAX_CITAS_A_EVALUAR) {
    throw new RangeError(
      `Solo se pueden evaluar hasta ${MAX_CITAS_A_EVALUAR} citas a la vez (se recibieron ${citas.length})`,
    );
  }

  const alternativas = generarAlternativas(citas, libreDesde, opciones).sort(compararAlternativas);

  if (alternativas.length === 0) {
    return {
      hayAlternativa: false,
      citasEnConflicto: citasQueNoSePuedenAcomodar(citas, libreDesde, opciones),
      motivo:
        'Ninguna combinación respeta las restricciones de los pacientes; ' +
        'el administrador debe decidir manualmente.',
    };
  }

  const [propuesta, ...restantes] = alternativas;
  const { criterio, motivo } = explicarEleccion(propuesta, restantes[0]);
  return {
    hayAlternativa: true,
    propuesta,
    otras: restantes.slice(0, MAX_OTRAS_ALTERNATIVAS),
    explicacion: {
      evento,
      desplazados: propuesta.asignaciones
        .filter((a) => a.desplazamientoMin !== 0)
        .map((a) => ({ citaId: a.citaId, minutos: Math.abs(a.desplazamientoMin) })),
      alternativasEvaluadas: alternativas.length,
      criterio,
      motivo,
    },
  };
}
