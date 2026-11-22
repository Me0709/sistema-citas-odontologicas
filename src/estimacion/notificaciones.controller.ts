import { Controller, Get, Query } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly servicio: NotificacionesService) {}

  @Get()
  listar(@Query('citaId') citaId?: string, @Query('destinatario') destinatario?: string) {
    return this.servicio.listar(citaId, destinatario);
  }
}
