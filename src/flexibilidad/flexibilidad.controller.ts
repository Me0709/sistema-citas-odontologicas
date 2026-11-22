import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Put } from '@nestjs/common';
import { DeclararFlexibilidadDto } from './dto/declarar-flexibilidad.dto';
import { FlexibilidadCitaService } from './flexibilidad-cita.service';

@Controller('citas/:citaId/flexibilidad')
export class FlexibilidadController {
  constructor(private readonly servicio: FlexibilidadCitaService) {}

  @Put()
  @HttpCode(200)
  declarar(@Param('citaId', ParseIntPipe) citaId: number, @Body() dto: DeclararFlexibilidadDto) {
    return this.servicio.declarar(citaId, dto.flexibilidad);
  }

  @Get()
  obtener(@Param('citaId', ParseIntPipe) citaId: number) {
    return this.servicio.obtener(citaId);
  }
}
