import { RelojDelSistema } from './reloj';

describe('RelojDelSistema', () => {
  it('devuelve la fecha y hora actuales', () => {
    const antes = Date.now();
    const ahora = new RelojDelSistema().ahora().getTime();
    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});
