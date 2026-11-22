import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AtencionService } from './atencion.service';
import { RegistrarHoraAtencionDto } from './dto/registrar-hora-atencion.dto';

@Controller('citas')
export class AtencionController {
  constructor(private readonly servicio: AtencionService) {}

  @Post(':id/inicio-atencion')
  @HttpCode(200)
  iniciar(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarHoraAtencionDto) {
    return this.servicio.iniciar(id, dto);
  }

  @Post(':id/fin-atencion')
  @HttpCode(200)
  finalizar(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarHoraAtencionDto) {
    return this.servicio.finalizar(id, dto);
  }
}
