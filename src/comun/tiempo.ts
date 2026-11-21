export const REGEX_HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function partesDeFecha(fecha: string): [number, number, number] {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return [anio, mes, dia];
}

export function horaAMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

export function minutosAHora(minutos: number): string {
  const horas = Math.floor(minutos / 60)
    .toString()
    .padStart(2, '0');
  const resto = (minutos % 60).toString().padStart(2, '0');
  return `${horas}:${resto}`;
}

export function fechaValida(fecha: string): boolean {
  if (!REGEX_FECHA.test(fecha)) return false;
  const [anio, mes, dia] = partesDeFecha(fecha);
  const objeto = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    objeto.getUTCFullYear() === anio &&
    objeto.getUTCMonth() === mes - 1 &&
    objeto.getUTCDate() === dia
  );
}

/** Devuelve 1 para lunes ... 7 para domingo. */
export function diaIso(fecha: string): number {
  const [anio, mes, dia] = partesDeFecha(fecha);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 ? 7 : diaSemana;
}

export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = partesDeFecha(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partesDeFecha(desde);
  const [a2, m2, d2] = partesDeFecha(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / MS_POR_DIA);
}
