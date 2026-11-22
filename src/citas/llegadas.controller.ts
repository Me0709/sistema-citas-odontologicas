import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { RegistrarLlegadaDto } from './dto/registrar-llegada.dto';
import { LlegadasService } from './llegadas.service';

@Controller('citas')
export class LlegadasController {
  constructor(private readonly servicio: LlegadasService) {}

  @Post(':id/llegada')
  @HttpCode(200)
  registrar(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarLlegadaDto) {
    return this.servicio.registrar(id, dto);
  }
}
