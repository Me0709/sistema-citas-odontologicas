/** Fuente de fecha y hora. Se inyecta para que las reglas no dependan del reloj del sistema. */
export abstract class Reloj {
  abstract ahora(): Date;
}

export class RelojDelSistema extends Reloj {
  ahora(): Date {
    return new Date();
  }
}
