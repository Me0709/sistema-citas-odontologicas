import { Reloj } from '../comun/reloj';
import { SaludController } from './salud.controller';

class RelojFijo extends Reloj {
  ahora(): Date {
    return new Date('2026-01-15T08:00:00.000Z');
  }
}

describe('SaludController', () => {
  it('informa estado ok con la fecha del reloj inyectado', () => {
    const controlador = new SaludController(new RelojFijo());
    expect(controlador.estado()).toEqual({ estado: 'ok', fecha: '2026-01-15T08:00:00.000Z' });
  });
});
