import { diaIso, horaAMinutos } from '../comun/tiempo';

interface FranjaBasica {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

/** Indica si el intervalo [inicioMin, finMin) cabe completo dentro de una franja de ese día. */
export function cabeEnHorario(
  franjas: FranjaBasica[],
  fecha: string,
  inicioMin: number,
  finMin: number,
): boolean {
  const dia = diaIso(fecha);
  return franjas.some(
    (f) =>
      f.diaSemana === dia &&
      horaAMinutos(f.horaInicio) <= inicioMin &&
      finMin <= horaAMinutos(f.horaFin),
  );
}
