import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AlternativasService } from './alternativas.service';
import { AnalizarAgendaDto } from './dto/analizar-agenda.dto';

@Controller('agenda/alternativas')
export class AlternativasController {
  constructor(private readonly servicio: AlternativasService) {}

  @Post()
  @HttpCode(200)
  proponer(@Body() dto: AnalizarAgendaDto) {
    return this.servicio.proponer(dto);
  }
}
