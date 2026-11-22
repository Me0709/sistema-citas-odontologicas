import { UMBRAL_NOTIFICACION_MIN } from '../constantes';
import { Flexibilidad, puedeAdelantar } from './flexibilidad';

const MS_POR_MINUTO = 60_000;

/** Cita que aún no comienza y cuya hora de inicio puede cambiar. */
export interface CitaPendiente {
  citaId: number;
  inicioPrevisto: Date;
  duracionMin: number;
  flexibilidad: Flexibilidad;
}

export interface HoraEstimada {
  citaId: number;
  inicioPrevisto: Date;
  inicioEstimado: Date;
  /** Minutos de diferencia con la hora prevista: positivo si se retrasa, negativo si se adelanta. */
  cambioMin: number;
  /** El cambio alcanza el umbral y hay que avisar al paciente. */
  notificar: boolean;
  /** El paciente debe mantener el horario y fue desplazado: hay que evaluar alternativas. */
  requiereAlternativas: boolean;
}

/**
 * Recalcula la hora estimada de inicio de las citas pendientes del día.
 *
 * @param citas citas que aún no comienzan
 * @param libreDesde momento en que el odontólogo queda libre (fin real o estimado de la cita anterior)
 */
export function recalcularHorasEstimadas(
  citas: readonly CitaPendiente[],
  libreDesde: Date,
): HoraEstimada[] {
  const ordenadas = [...citas].sort(
    (a, b) => a.inicioPrevisto.getTime() - b.inicioPrevisto.getTime(),
  );

  let libre = libreDesde.getTime();
  return ordenadas.map((cita) => {
    const previsto = cita.inicioPrevisto.getTime();
    const hayRetraso = libre > previsto;
    const seAdelanta = libre < previsto && puedeAdelantar(cita.flexibilidad);
    const estimado = hayRetraso || seAdelanta ? libre : previsto;
    libre = estimado + cita.duracionMin * MS_POR_MINUTO;

    const cambioMin = (estimado - previsto) / MS_POR_MINUTO;
    return {
      citaId: cita.citaId,
      inicioPrevisto: cita.inicioPrevisto,
      inicioEstimado: new Date(estimado),
      cambioMin,
      notificar: Math.abs(cambioMin) >= UMBRAL_NOTIFICACION_MIN,
      requiereAlternativas: cambioMin > 0 && cita.flexibilidad === Flexibilidad.MANTENER,
    };
  });
}
