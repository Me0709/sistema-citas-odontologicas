import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { EstimacionService } from './estimacion.service';

@Controller('citas/:citaId/hora-estimada')
export class EstimacionController {
  constructor(private readonly servicio: EstimacionService) {}

  @Get()
  obtener(@Param('citaId', ParseIntPipe) citaId: number) {
    return this.servicio.obtener(citaId);
  }
}
