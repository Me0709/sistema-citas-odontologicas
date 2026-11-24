import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarInterfaz } from '../src/interfaz/configurar-interfaz';

describe('Interfaz web', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarInterfaz(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('la raíz entrega la página principal', async () => {
    const respuesta = await request(app.getHttpServer()).get('/').expect(200);

    expect(respuesta.headers['content-type']).toMatch(/text\/html/);
    expect(respuesta.text).toContain('Agenda odontológica');
  });

  it.each(['/css/estilos.css', '/js/app.js', '/js/api.js', '/js/vistas/agenda.js'])(
    'entrega el archivo estático %s',
    async (ruta) => {
      await request(app.getHttpServer()).get(ruta).expect(200);
    },
  );

  it('la API sigue respondiendo JSON junto a la interfaz', async () => {
    const respuesta = await request(app.getHttpServer()).get('/salud').expect(200);

    expect(respuesta.body).toMatchObject({ estado: 'ok' });
  });

  it('una ruta de la API que no existe sigue siendo 404', async () => {
    await request(app.getHttpServer()).get('/ruta-que-no-existe').expect(404);
  });
});
