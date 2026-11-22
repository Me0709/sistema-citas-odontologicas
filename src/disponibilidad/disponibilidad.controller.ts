import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { DisponibilidadService } from './disponibilidad.service';
import { DefinirDisponibilidadDto } from './dto/definir-disponibilidad.dto';

@Controller('disponibilidad')
export class DisponibilidadController {
  constructor(private readonly servicio: DisponibilidadService) {}

  @Put()
  definir(@Body() dto: DefinirDisponibilidadDto) {
    return this.servicio.definir(dto);
  }

  @Get()
  obtener() {
    return this.servicio.listar();
  }

  @Get('espacios')
  espacios(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.servicio.espacios(desde, hasta);
  }
}
