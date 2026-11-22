import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-09 Hora estimada en tiempo real', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00.
  const LUNES = '2026-11-23';

  // La hora del consultorio es UTC-5: 14:00 UTC es la 09:00 del lunes en Colombia.
  const aLas = (hora: string) => new Date(`2026-11-23T${hora}:00-05:00`);
  let ahora = aLas('09:00');

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio: string): Promise<number> => {
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

  const declarar = (id: number, flexibilidad: string) =>
    api().put(`/citas/${id}/flexibilidad`).send({ flexibilidad }).expect(200);
  const llegada = (id: number, horaLlegada: string) =>
    api().post(`/citas/${id}/llegada`).send({ horaLlegada }).expect(200);
  const iniciar = (id: number, hora: string) =>
    api().post(`/citas/${id}/inicio-atencion`).send({ hora }).expect(200);
  const finalizar = (id: number, hora: string) =>
    api().post(`/citas/${id}/fin-atencion`).send({ hora }).expect(200);

  const horaEstimada = async (id: number) =>
    (await api().get(`/citas/${id}/hora-estimada`).expect(200)).body;
  const notificaciones = async (citaId: number, destinatario: string) =>
    (await api().get('/notificaciones').query({ citaId, destinatario }).expect(200)).body as {
      tipo: string;
      destino: string;
      mensaje: string;
    }[];

  /** Atiende la cita desde la hora de inicio indicada, con llegada a esa misma hora. */
  const atender = async (id: number, inicio: string) => {
    ahora = aLas(inicio);
    await llegada(id, inicio);
    await iniciar(id, inicio);
  };

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
    ahora = aLas('09:00');
    await dataSource.query(
      'TRUNCATE TABLE notificaciones, estimaciones_cita, citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await api()
      .put('/disponibilidad')
      .send({ franjas: [{ diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sin eventos, la hora estimada es la prevista', async () => {
    const id = await crearCita('09:30');

    expect(await horaEstimada(id)).toEqual({
      citaId: id,
      fecha: LUNES,
      horaInicioPrevista: '09:30',
      horaEstimada: '09:30',
      cambioMin: 0,
      requiereAlternativas: false,
    });
  });

  it('Escenario 1: al terminar tarde una cita, recalcula las siguientes del día', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    const tercera = await crearCita('10:00');
    await declarar(segunda, 'puede_atrasar');
    await declarar(tercera, 'puede_atrasar');
    await atender(primera, '09:00');

    ahora = aLas('09:50');
    await finalizar(primera, '09:50');

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:50', cambioMin: 20 });
    expect(await horaEstimada(tercera)).toMatchObject({ horaEstimada: '10:20', cambioMin: 20 });
  });

  it('Escenario 1: al iniciar tarde una cita, también recalcula las siguientes', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');

    await atender(primera, '09:15');

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:45', cambioMin: 15 });
  });

  it('Escenario 2: notifica al paciente si el cambio llega a 10 minutos', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');
    await atender(primera, '09:00');

    ahora = aLas('09:50');
    await finalizar(primera, '09:50');

    const avisos = await notificaciones(segunda, 'paciente');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tipo).toBe('retraso');
    expect(avisos[0].mensaje).toContain('09:50');
    expect(avisos[0].destino).toContain('@correo.com');
  });

  it('Escenario 2: no notifica si el cambio es menor al umbral', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');
    await atender(primera, '09:00');

    ahora = aLas('09:39');
    await finalizar(primera, '09:39');

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:39', cambioMin: 9 });
    expect(await notificaciones(segunda, 'paciente')).toHaveLength(0);
  });

  it('Escenario 3: adelanta y notifica a quien declaró poder adelantar su cita', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_adelantar');
    await atender(primera, '09:00');

    ahora = aLas('09:10');
    await finalizar(primera, '09:10');

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:10', cambioMin: -20 });
    const avisos = await notificaciones(segunda, 'paciente');
    expect(avisos.map((a) => a.tipo)).toEqual(['adelanto']);
  });

  it('Escenario 3: no adelanta a quien no declaró poder adelantar', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');
    await atender(primera, '09:00');

    ahora = aLas('09:10');
    await finalizar(primera, '09:10');

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:30', cambioMin: 0 });
    expect(await notificaciones(segunda, 'paciente')).toHaveLength(0);
  });

  it('Escenario 4: marca para evaluar alternativas y alerta al administrador', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'mantener');
    await atender(primera, '09:00');

    ahora = aLas('09:50');
    await finalizar(primera, '09:50');

    expect(await horaEstimada(segunda)).toMatchObject({ requiereAlternativas: true });
    const alertas = await notificaciones(segunda, 'administrador');
    expect(alertas.map((a) => a.tipo)).toEqual(['requiere_alternativas']);
  });

  it('Escenario 4: un paciente sin preferencia declarada se trata como "debe mantener el horario"', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await atender(primera, '09:00');

    ahora = aLas('09:50');
    await finalizar(primera, '09:50');

    expect(await horaEstimada(segunda)).toMatchObject({ requiereAlternativas: true });
  });

  it('responde 404 si la cita no existe', async () => {
    await api().get('/citas/999/hora-estimada').expect(404);
  });

  it('rechaza filtros inválidos al listar notificaciones', async () => {
    await api().get('/notificaciones').query({ citaId: 'abc' }).expect(400);
    await api().get('/notificaciones').query({ destinatario: 'todos' }).expect(400);
  });
});
