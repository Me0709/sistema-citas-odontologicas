import { join } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';

/** Carpeta con la interfaz web (HTML, CSS y JavaScript), junto a src y dist. */
export const RUTA_INTERFAZ = join(__dirname, '..', '..', 'public');

/** Sirve la interfaz web desde el mismo servidor de la API, de modo que no haga falta CORS. */
export function configurarInterfaz(
  app: Pick<NestExpressApplication, 'useStaticAssets'>,
  ruta: string = RUTA_INTERFAZ,
): void {
  app.useStaticAssets(ruta);
}
