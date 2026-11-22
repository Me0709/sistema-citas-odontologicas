import { Global, Module } from '@nestjs/common';
import { EventosAgenda } from './eventos-agenda';
import { Reloj, RelojDelSistema } from './reloj';

@Global()
@Module({
  providers: [{ provide: Reloj, useClass: RelojDelSistema }, EventosAgenda],
  exports: [Reloj, EventosAgenda],
})
export class ComunModule {}
