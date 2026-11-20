import { Controller, Get } from '@nestjs/common';
import { Reloj } from '../comun/reloj';

@Controller('salud')
export class SaludController {
  constructor(private readonly reloj: Reloj) {}

  @Get()
  estado() {
    return { estado: 'ok', fecha: this.reloj.ahora().toISOString() };
  }
}
