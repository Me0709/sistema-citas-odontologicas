import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('HU-05 Declarar flexibilidad de horario', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00.
  const LUNES = '2026-11-23';

  const api = () => request(app.getHttpServer());

  const crearCita = async (): Promise<number> => {
    const paciente = await api()
      .post('/pacientes')
      .send({
        nombre: 'Paciente de prueba',
        documento: '1000000001',
        telefono: '3001234567',
        correo: 'paciente@correo.com',
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    const procedimiento = await api()
      .post('/procedimientos')
      .send({ nombre: 'Limpieza', duracionMin: 30 })
      .expect(201);
    const cita = await api()
      .post('/citas')
      .send({
        pacienteId: paciente.body.id,
        procedimientoId: procedimiento.body.id,
        fecha: LUNES,
        horaInicio: '09:00',
      })
      .expect(201);
    return cita.body.id as number;
  };

  const declarar = (citaId: number, flexibilidad: unknown) =>
    api().put(`/citas/${citaId}/flexibilidad`).send({ flexibilidad });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE flexibilidades_cita, citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await api()
      .put('/disponibilidad')
      .send({ franjas: [{ diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Escenario 1: guarda la preferencia asociada a la cita', async () => {
    const citaId = await crearCita();

    const respuesta = await declarar(citaId, 'puede_adelantar').expect(200);

    expect(respuesta.body).toEqual({
      citaId,
      flexibilidad: 'puede_adelantar',
      declarada: true,
    });
    const consulta = await api().get(`/citas/${citaId}/flexibilidad`).expect(200);
    expect(consulta.body.flexibilidad).toBe('puede_adelantar');
  });

  it.each(['puede_adelantar', 'puede_atrasar', 'ambas', 'mantener'])(
    'Escenario 1: acepta la opción %s',
    async (flexibilidad) => {
      const citaId = await crearCita();
      const respuesta = await declarar(citaId, flexibilidad).expect(200);
      expect(respuesta.body.flexibilidad).toBe(flexibilidad);
    },
  );

  it('Escenario 2: actualiza la preferencia si cambia antes de la cita', async () => {
    const citaId = await crearCita();
    await declarar(citaId, 'mantener').expect(200);

    await declarar(citaId, 'ambas').expect(200);

    const consulta = await api().get(`/citas/${citaId}/flexibilidad`).expect(200);
    expect(consulta.body).toEqual({ citaId, flexibilidad: 'ambas', declarada: true });
    const [{ total }] = await dataSource.query(
      'SELECT COUNT(*)::int AS total FROM flexibilidades_cita',
    );
    expect(total).toBe(1);
  });

  it('Escenario 2: no permite cambiarla si la cita ya no está pendiente', async () => {
    const citaId = await crearCita();
    await dataSource.query("UPDATE citas SET estado = 'En atención' WHERE id = $1", [citaId]);

    const respuesta = await declarar(citaId, 'ambas').expect(409);

    expect(respuesta.body.message).toMatch(/ya no/i);
  });

  it('Escenario 3: sin preferencia declarada se trata como "debe mantener el horario"', async () => {
    const citaId = await crearCita();

    const consulta = await api().get(`/citas/${citaId}/flexibilidad`).expect(200);

    expect(consulta.body).toEqual({ citaId, flexibilidad: 'mantener', declarada: false });
  });

  it('rechaza una opción que no existe', async () => {
    const citaId = await crearCita();
    await declarar(citaId, 'siempre').expect(400);
  });

  it('responde 404 si la cita no existe', async () => {
    await declarar(999, 'ambas').expect(404);
    await api().get('/citas/999/flexibilidad').expect(404);
  });
});
