import { Global, Module } from '@nestjs/common';
import { Reloj, RelojDelSistema } from './reloj';

@Global()
@Module({
  providers: [{ provide: Reloj, useClass: RelojDelSistema }],
  exports: [Reloj],
})
export class ComunModule {}
