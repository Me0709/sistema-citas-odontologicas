import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-07 Iniciar y finalizar la atención', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  const LUNES = '2026-11-23';

  // La hora del consultorio es UTC-5: 14:00 UTC es la 09:00 del lunes en Colombia.
  let ahora = new Date('2026-11-23T14:00:00Z');

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio = '09:00', duracionMin = 30): Promise<number> => {
    contador += 1;
    const procedimiento = await api()
      .post('/procedimientos')
      .send({ nombre: `Procedimiento ${contador}`, duracionMin })
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

  const registrarLlegada = (id: number, horaLlegada: string) =>
    api().post(`/citas/${id}/llegada`).send({ horaLlegada });
  const iniciar = (id: number, datos: object = {}) =>
    api().post(`/citas/${id}/inicio-atencion`).send(datos);
  const finalizar = (id: number, datos: object = {}) =>
    api().post(`/citas/${id}/fin-atencion`).send(datos);

  /** Deja la cita "En sala", con la llegada a la hora indicada. */
  const citaEnSala = async (horaLlegada = '09:00', duracionMin = 30): Promise<number> => {
    const id = await crearCita('09:00', duracionMin);
    await registrarLlegada(id, horaLlegada).expect(200);
    return id;
  };

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

  it('Escenario 1: con el paciente "En sala", guarda la hora real de inicio y pasa a "En atención"', async () => {
    const id = await citaEnSala('09:00');

    const respuesta = await iniciar(id, { hora: '09:02' }).expect(200);

    expect(respuesta.body).toMatchObject({
      id,
      estado: 'En atención',
      horaInicioReal: '09:02',
    });
    expect((await obtenerCita(id)).estado).toBe('En atención');
  });

  it('Escenario 2: al finalizar guarda la hora de fin, calcula la duración real y pasa a "Atendida"', async () => {
    const id = await citaEnSala('09:00', 30);
    await iniciar(id, { hora: '09:00' }).expect(200);

    const respuesta = await finalizar(id, { hora: '09:30' }).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'Atendida',
      horaInicioReal: '09:00',
      horaFinReal: '09:30',
      duracionRealMin: 30,
      diferenciaDuracionMin: 0,
    });
  });

  it('Escenario 3: si la atención dura más de lo estimado, registra la diferencia', async () => {
    const id = await citaEnSala('09:00', 30);
    await iniciar(id, { hora: '09:00' }).expect(200);

    const respuesta = await finalizar(id, { hora: '09:45' }).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'Atendida',
      duracionRealMin: 45,
      diferenciaDuracionMin: 15,
    });
  });

  it('si la atención dura menos de lo estimado, la diferencia es negativa', async () => {
    const id = await citaEnSala('09:00', 30);
    await iniciar(id, { hora: '09:00' }).expect(200);

    const respuesta = await finalizar(id, { hora: '09:20' }).expect(200);

    expect(respuesta.body).toMatchObject({ duracionRealMin: 20, diferenciaDuracionMin: -10 });
  });

  it('Escenario 4: sin la llegada registrada, pide registrarla primero y no inicia', async () => {
    const id = await crearCita('09:00');

    const respuesta = await iniciar(id, { hora: '09:00' }).expect(409);

    expect(String(respuesta.body.message)).toContain('llegada');
    expect((await obtenerCita(id)).estado).toBe('Programada');
  });

  it('no permite iniciar la atención dos veces', async () => {
    const id = await citaEnSala('09:00');
    await iniciar(id, { hora: '09:00' }).expect(200);

    await iniciar(id, { hora: '09:05' }).expect(409);
  });

  it('no permite finalizar una atención que no se ha iniciado', async () => {
    const id = await citaEnSala('09:00');

    const respuesta = await finalizar(id, { hora: '09:30' }).expect(409);

    expect(String(respuesta.body.message)).toContain('inicie primero');
    expect((await obtenerCita(id)).estado).toBe('En sala');
  });

  it('no permite finalizar dos veces', async () => {
    const id = await citaEnSala('09:00');
    await iniciar(id, { hora: '09:00' }).expect(200);
    await finalizar(id, { hora: '09:30' }).expect(200);

    await finalizar(id, { hora: '09:40' }).expect(409);
  });

  it('responde 400 si la atención inicia antes de la llegada del paciente', async () => {
    const id = await citaEnSala('09:10');

    await iniciar(id, { hora: '09:05' }).expect(400);
    expect((await obtenerCita(id)).estado).toBe('En sala');
  });

  it('responde 400 si el fin no es posterior al inicio', async () => {
    const id = await citaEnSala('09:00');
    await iniciar(id, { hora: '09:10' }).expect(200);

    await finalizar(id, { hora: '09:10' }).expect(400);
    expect((await obtenerCita(id)).estado).toBe('En atención');
  });

  it('responde 404 si la cita no existe', async () => {
    await iniciar(999, { hora: '09:00' }).expect(404);
    await finalizar(999, { hora: '09:30' }).expect(404);
  });

  it('sin hora indicada usa el reloj en hora del consultorio', async () => {
    const id = await citaEnSala('09:00');
    ahora = new Date('2026-11-23T14:05:00Z');
    expect((await iniciar(id).expect(200)).body.horaInicioReal).toBe('09:05');

    ahora = new Date('2026-11-23T14:40:00Z');
    const respuesta = await finalizar(id).expect(200);

    expect(respuesta.body).toMatchObject({
      estado: 'Atendida',
      horaFinReal: '09:40',
      duracionRealMin: 35,
    });
  });

  it('solo se registra la atención el día de la cita, también cuando se envía la hora', async () => {
    const id = await citaEnSala('09:00');
    ahora = new Date('2026-11-24T14:00:00Z');

    await iniciar(id, { hora: '09:00' }).expect(409);
    await iniciar(id).expect(409);
    expect((await obtenerCita(id)).estado).toBe('En sala');
  });

  it('responde 400 si la hora no tiene formato HH:mm', async () => {
    const id = await citaEnSala('09:00');

    await iniciar(id, { hora: 'a las nueve' }).expect(400);
  });
});
