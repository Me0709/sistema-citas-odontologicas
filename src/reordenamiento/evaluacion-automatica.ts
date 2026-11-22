import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventoAgenda, EventosAgenda } from '../comun/eventos-agenda';
import { AlternativasService } from './alternativas.service';
import { TipoEvento } from './dominio/alternativas';

/** Hechos de la agenda que obligan a evaluar alternativas de reprogramación (HU-10). */
const EVENTOS_QUE_EVALUAN: Partial<Record<EventoAgenda['tipo'], TipoEvento>> = {
  cita_cancelada: 'cancelacion',
  inasistencia_registrada: 'inasistencia',
  aviso_retraso: 'retraso',
  propuesta_rechazada: 'propuesta_rechazada',
  propuesta_vencida: 'propuesta_vencida',
};

@Injectable()
export class EvaluacionAutomatica implements OnModuleInit {
  constructor(
    private readonly eventos: EventosAgenda,
    private readonly alternativas: AlternativasService,
  ) {}

  onModuleInit(): void {
    this.eventos.suscribir(async (evento) => {
      const tipo = EVENTOS_QUE_EVALUAN[evento.tipo];
      if (tipo) {
        await this.alternativas.evaluarAutomaticamente({ tipo });
      }
    });
  }
}
