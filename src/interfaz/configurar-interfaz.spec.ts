import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { configurarInterfaz, RUTA_INTERFAZ } from './configurar-interfaz';

describe('configurarInterfaz', () => {
  it('sirve la carpeta public como archivos estáticos', () => {
    const app = { useStaticAssets: jest.fn() };

    configurarInterfaz(app);

    expect(app.useStaticAssets).toHaveBeenCalledTimes(1);
    expect(app.useStaticAssets).toHaveBeenCalledWith(RUTA_INTERFAZ);
  });

  it('permite indicar otra carpeta', () => {
    const app = { useStaticAssets: jest.fn() };

    configurarInterfaz(app, '/otra/ruta');

    expect(app.useStaticAssets).toHaveBeenCalledWith('/otra/ruta');
  });

  it('la ruta por defecto apunta a la carpeta public del proyecto, con su index.html', () => {
    expect(RUTA_INTERFAZ).toBe(join(__dirname, '..', '..', 'public'));
    expect(existsSync(join(RUTA_INTERFAZ, 'index.html'))).toBe(true);
  });
});
