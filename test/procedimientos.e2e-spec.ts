import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('HU-01 Catálogo de procedimientos', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const crear = (datos: object) => request(app.getHttpServer()).post('/procedimientos').send(datos);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE procedimientos RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Escenario 1: registra un procedimiento y lo ofrece al programar citas', async () => {
    const respuesta = await crear({ nombre: 'Limpieza dental', duracionMin: 30 }).expect(201);
    expect(respuesta.body.activo).toBe(true);

    const lista = await request(app.getHttpServer()).get('/procedimientos').expect(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].nombre).toBe('Limpieza dental');
  });

  it.each([0, -15, 20, 25])('Escenario 2: rechaza la duración inválida %p', async (duracion) => {
    const respuesta = await crear({ nombre: 'Limpieza dental', duracionMin: duracion }).expect(400);
    expect(String(respuesta.body.message)).toContain('múltiplo de 15');

    const lista = await request(app.getHttpServer()).get('/procedimientos').expect(200);
    expect(lista.body).toHaveLength(0);
  });

  it('Escenario 3: al cambiar la duración, aplica a citas nuevas y lo informa', async () => {
    const { body: creado } = await crear({ nombre: 'Endodoncia', duracionMin: 60 }).expect(201);

    const respuesta = await request(app.getHttpServer())
      .patch(`/procedimientos/${creado.id}`)
      .send({ duracionMin: 90 })
      .expect(200);

    expect(respuesta.body.procedimiento.duracionMin).toBe(90);
    expect(respuesta.body.aviso).toContain('citas nuevas');
  });

  it('Escenario 4: al desactivar, deja de ofrecerse pero se conserva', async () => {
    const { body: creado } = await crear({ nombre: 'Blanqueamiento', duracionMin: 45 }).expect(201);

    const respuesta = await request(app.getHttpServer())
      .patch(`/procedimientos/${creado.id}/desactivar`)
      .expect(200);
    expect(respuesta.body.activo).toBe(false);

    const activos = await request(app.getHttpServer()).get('/procedimientos').expect(200);
    expect(activos.body).toHaveLength(0);

    const todos = await request(app.getHttpServer())
      .get('/procedimientos?incluirInactivos=true')
      .expect(200);
    expect(todos.body).toHaveLength(1);

    await request(app.getHttpServer()).get(`/procedimientos/${creado.id}`).expect(200);
  });

  it('responde 404 si el procedimiento no existe', async () => {
    await request(app.getHttpServer()).get('/procedimientos/9999').expect(404);
  });
});
