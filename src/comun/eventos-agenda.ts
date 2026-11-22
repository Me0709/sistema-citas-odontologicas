import { Injectable, Logger } from '@nestjs/common';

/** Hecho de la agenda del día que puede obligar a recalcular las horas estimadas. */
export interface EventoAgenda {
  tipo:
    | 'atencion_iniciada'
    | 'atencion_finalizada'
    | 'aviso_retraso'
    | 'cita_cancelada'
    | 'inasistencia_registrada'
    | 'llegada_registrada'
    | 'propuesta_aceptada'
    | 'propuesta_rechazada'
    | 'propuesta_vencida';
  /** Día de la agenda afectada, AAAA-MM-DD. */
  fecha: string;
}

type Suscriptor = (evento: EventoAgenda) => Promise<void>;

/**
 * Aviso interno entre módulos: quien registra un hecho lo emite y quien necesita reaccionar
 * se suscribe, sin que los módulos se importen entre sí.
 */
@Injectable()
export class EventosAgenda {
  private readonly logger = new Logger(EventosAgenda.name);
  private readonly suscriptores: Suscriptor[] = [];

  suscribir(suscriptor: Suscriptor): void {
    this.suscriptores.push(suscriptor);
  }

  /**
   * Espera a que cada suscriptor termine. Un fallo se registra y no se propaga: el hecho que
   * originó el evento ya está confirmado y no debe aparecer como fallido.
   */
  async emitir(evento: EventoAgenda): Promise<void> {
    for (const suscriptor of this.suscriptores) {
      try {
        await suscriptor(evento);
      } catch (error) {
        this.logger.error(
          `Falló un suscriptor del evento ${evento.tipo} (${evento.fecha})`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
