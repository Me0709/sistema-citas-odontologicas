import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { horaAMinutos } from '../comun/tiempo';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';

/**
 * Minuto del día desde el que el odontólogo puede atender a la siguiente cita: cuando termine
 * la que está en curso (o termine la última atendida) y nunca antes de ahora.
 */
export function odontologoLibreDesde(citasDelDia: readonly Cita[], ahoraMin: number): number {
  const enAtencion = citasDelDia.filter((c) => c.estado === EstadoCita.EN_ATENCION);
  const terminaLaActual = enAtencion.map((c) => horaAMinutos(c.horaInicioReal!) + c.duracionMin);
  const terminaronAntes = citasDelDia
    .filter((c) => c.estado === EstadoCita.ATENDIDA && c.horaFinReal)
    .map((c) => horaAMinutos(c.horaFinReal!));

  const liberacion = enAtencion.length > 0 ? terminaLaActual : terminaronAntes;
  return Math.max(ahoraMin, ...liberacion);
}

/** Minutos que el paciente avisó que llegará tarde; no cuenta si ya está en sala. */
export function retrasoAvisado(cita: Cita): number {
  return cita.estado === EstadoCita.EN_SALA ? 0 : (cita.avisoRetrasoMin ?? 0);
}

/** Quien avisó que llega tarde no puede adelantarse a antes de su llegada. */
export function sinAdelanto(flexibilidad: Flexibilidad): Flexibilidad {
  if (flexibilidad === Flexibilidad.AMBAS) {
    return Flexibilidad.PUEDE_ATRASAR;
  }
  if (flexibilidad === Flexibilidad.PUEDE_ADELANTAR) {
    return Flexibilidad.MANTENER;
  }
  return flexibilidad;
}
