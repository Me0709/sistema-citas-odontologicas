import { Controller, Get, Query } from '@nestjs/common';
import { AgendaService } from './agenda.service';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly servicio: AgendaService) {}

  @Get()
  obtener(@Query('fecha') fecha?: string) {
    return this.servicio.obtener(fecha);
  }
}
