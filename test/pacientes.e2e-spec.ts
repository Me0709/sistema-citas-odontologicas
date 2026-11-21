import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('HU-02 Registrar paciente', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const datosValidos = {
    nombre: 'María Pérez',
    documento: '1102345678',
    telefono: '3001234567',
    correo: 'maria@correo.com',
    autorizaTratamientoDatos: true,
  };

  const registrar = (datos: object) => request(app.getHttpServer()).post('/pacientes').send(datos);
  const listar = () => request(app.getHttpServer()).get('/pacientes').expect(200);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE pacientes RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Escenario 1: registra al paciente con historial vacío y lo muestra en el listado', async () => {
    const respuesta = await registrar(datosValidos).expect(201);
    expect(respuesta.body.documento).toBe('1102345678');
    expect(respuesta.body.historialCitas).toEqual([]);

    const lista = await listar();
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].nombre).toBe('María Pérez');
  });

  it('Escenario 2: indica qué campos faltan y no guarda al paciente', async () => {
    const respuesta = await registrar({
      nombre: 'María Pérez',
      autorizaTratamientoDatos: true,
    }).expect(400);
    const mensajes = JSON.stringify(respuesta.body.message);
    expect(mensajes).toContain('documento');
    expect(mensajes).toContain('teléfono');
    expect(mensajes).toContain('correo');

    expect((await listar()).body).toHaveLength(0);
  });

  it('Escenario 3: rechaza un documento ya registrado', async () => {
    await registrar(datosValidos).expect(201);

    const respuesta = await registrar({
      ...datosValidos,
      nombre: 'Otra Persona',
      correo: 'otra@correo.com',
    }).expect(409);
    expect(String(respuesta.body.message)).toContain('ya existe');

    expect((await listar()).body).toHaveLength(1);
  });

  it.each([false, undefined])(
    'Escenario 4: no guarda sin autorización de datos (%p)',
    async (autoriza) => {
      const respuesta = await registrar({
        ...datosValidos,
        autorizaTratamientoDatos: autoriza,
      }).expect(400);
      expect(JSON.stringify(respuesta.body.message)).toContain('autorización');

      expect((await listar()).body).toHaveLength(0);
    },
  );

  it('responde 404 si el paciente no existe', async () => {
    await request(app.getHttpServer()).get('/pacientes/9999').expect(404);
  });
});
