import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-06 Registrar la llegada del paciente', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  const LUNES = '2026-11-23';

  // La hora del consultorio es UTC-5: 14:00 UTC es la 09:00 del lunes en Colombia.
  let ahora = new Date('2026-11-23T14:00:00Z');

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio = '09:00'): Promise<number> => {
    contador += 1;
    const procedimiento = await api()
      .post('/procedimientos')
      .send({ nombre: `Procedimiento ${contador}`, duracionMin: 30 })
      .expect(201);
    const paciente = await api()
      .post('/pacientes')
      .send({
        nombre: `Paciente ${contador}`,
        documento: String(1000000000 + contador),
        telefono: '3001234567',
        correo: `paciente${contador}@correo.com`,
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    const cita = await api()
      .post('/citas')
      .send({
        pacienteId: paciente.body.id,
        procedimientoId: procedimiento.body.id,
        fecha: LUNES,
        horaInicio,
      })
      .expect(201);
    return cita.body.id as number;
  };

  const registrarLlegada = (id: number, datos: object = {}) =>
    api().post(`/citas/${id}/llegada`).send(datos);

  const obtenerCita = async (id: number) => (await api().get(`/citas/${id}`).expect(200)).body;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Reloj)
      .useValue({ ahora: () => ahora })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    ahora = new Date('2026-11-23T14:00:00Z');
    await dataSource.query(
      'TRUNCATE TABLE citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await api()
      .put('/disponibilidad')
      .send({
        franjas: [
          { diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' },
          { diaSemana: 1, horaInicio: '14:00', horaFin: '18:00' },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Escenario 1: llegada dentro de la tolerancia guarda la hora real y pasa a "En sala"', async () => {
    const id = await crearCita('09:00');

    const respuesta = await registrarLlegada(id, { horaLlegada: '09:04' }).expect(200);

    expect(respuesta.body).toMatchObject({
      id,
      estado: 'En sala',
      horaLlegada: '09:04',
      minutosRetraso: 0,
    });
    expect((await obtenerCita(id)).estado).toBe('En sala');
  });

  it('la tolerancia de 5 minutos todavía cuenta como puntual', async () => {
    const id = await crearCita('09:00');

    const respuesta = await registrarLlegada(id, { horaLlegada: '09:05' }).expect(200);

    expect(respuesta.body.minutosRetraso).toBe(0);
  });

  it('Escenario 2: llegada con retraso guarda los minutos de retraso y pasa a "En sala"', async () => {
    const id = await crearCita('09:00');

    const respuesta = await registrarLlegada(id, { horaLlegada: '09:12' }).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'En sala',
      horaLlegada: '09:12',
      minutosRetraso: 12,
    });
  });

  it('Escenario 3: llegada anticipada guarda la hora real y pasa a "En sala"', async () => {
    const id = await crearCita('09:00');

    const respuesta = await registrarLlegada(id, { horaLlegada: '08:45' }).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'En sala',
      horaLlegada: '08:45',
      minutosRetraso: 0,
    });
  });

  it('Escenario 4: si la cita ya figura como inasistencia, lo informa y ofrece reprogramar', async () => {
    const id = await crearCita('09:00');
    await dataSource.query(`UPDATE citas SET estado = 'Inasistencia' WHERE id = $1`, [id]);

    const respuesta = await registrarLlegada(id, { horaLlegada: '09:40' }).expect(409);

    expect(String(respuesta.body.message)).toContain('inasistencia');
    expect(respuesta.body.ofreceReprogramar).toBe(true);
    expect((await obtenerCita(id)).estado).toBe('Inasistencia');
  });

  it('pasados 15 minutos de espera no se registra la llegada y se ofrece reprogramar', async () => {
    const id = await crearCita('09:00');

    const respuesta = await registrarLlegada(id, { horaLlegada: '09:16' }).expect(409);

    expect(respuesta.body.ofreceReprogramar).toBe(true);
    expect((await obtenerCita(id)).estado).toBe('Programada');
  });

  it('sin horaLlegada usa el reloj en hora del consultorio', async () => {
    const id = await crearCita('09:00');
    ahora = new Date('2026-11-23T14:08:00Z');

    const respuesta = await registrarLlegada(id).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'En sala',
      horaLlegada: '09:08',
      minutosRetraso: 8,
    });
  });

  it('con el reloj, llegar a las 09:06 cuenta 6 minutos de retraso y a las 09:15 todavía se acepta', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');

    ahora = new Date('2026-11-23T14:06:00Z');
    expect((await registrarLlegada(primera).expect(200)).body.minutosRetraso).toBe(6);

    ahora = new Date('2026-11-23T14:45:00Z');
    expect((await registrarLlegada(segunda).expect(200)).body.minutosRetraso).toBe(15);
  });

  it('con el reloj, a las 09:16 ya no se acepta y se ofrece reprogramar', async () => {
    const id = await crearCita('09:00');
    ahora = new Date('2026-11-23T14:16:00Z');

    const respuesta = await registrarLlegada(id).expect(409);

    expect(respuesta.body.ofreceReprogramar).toBe(true);
  });

  it('solo se registra la llegada el día de la cita, también cuando se envía la hora', async () => {
    const id = await crearCita('09:00');
    ahora = new Date('2026-11-24T14:00:00Z');

    await registrarLlegada(id, { horaLlegada: '09:00' }).expect(409);
    await registrarLlegada(id).expect(409);
    expect((await obtenerCita(id)).estado).toBe('Programada');
  });

  it('no permite registrar la llegada dos veces', async () => {
    const id = await crearCita('09:00');
    await registrarLlegada(id, { horaLlegada: '09:00' }).expect(200);

    await registrarLlegada(id, { horaLlegada: '09:01' }).expect(409);
  });

  it('responde 404 si la cita no existe', async () => {
    await registrarLlegada(999, { horaLlegada: '09:00' }).expect(404);
  });

  it('responde 400 si la hora no tiene formato HH:mm', async () => {
    const id = await crearCita('09:00');

    await registrarLlegada(id, { horaLlegada: '9 y cuarto' }).expect(400);
  });
});
