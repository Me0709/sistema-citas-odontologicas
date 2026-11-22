import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DestinatarioNotificacion, Notificacion } from './notificacion.entity';

const DESTINATARIOS: DestinatarioNotificacion[] = ['paciente', 'administrador'];

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private readonly repositorio: Repository<Notificacion>,
  ) {}

  async listar(citaId?: string, destinatario?: string): Promise<Notificacion[]> {
    const where: { citaId?: number; destinatario?: DestinatarioNotificacion } = {};

    if (citaId !== undefined) {
      const id = Number(citaId);
      if (!Number.isInteger(id) || id < 1) {
        throw new BadRequestException('La cita debe indicarse con su id numérico');
      }
      where.citaId = id;
    }
    if (destinatario !== undefined) {
      if (!DESTINATARIOS.includes(destinatario as DestinatarioNotificacion)) {
        throw new BadRequestException(
          `El destinatario debe ser uno de: ${DESTINATARIOS.join(', ')}`,
        );
      }
      where.destinatario = destinatario as DestinatarioNotificacion;
    }

    return this.repositorio.find({ where, order: { id: 'DESC' } });
  }
}
