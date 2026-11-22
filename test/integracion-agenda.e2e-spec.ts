import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('Integración de la agenda: llegada, cancelación y reprogramación', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00.
  const LUNES = '2026-11-23';

  // La hora del consultorio es UTC-5: 14:00 UTC es la 09:00 del lunes en Colombia.
  const aLas = (hora: string) => new Date(`2026-11-23T${hora}:00-05:00`);
  let ahora = aLas('09:00');

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio: string, duracionMin = 30): Promise<number> => {
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

  const declarar = (id: number, flexibilidad: string) =>
    api().put(`/citas/${id}/flexibilidad`).send({ flexibilidad }).expect(200);
  const horaEstimada = async (id: number) =>
    (await api().get(`/citas/${id}/hora-estimada`).expect(200)).body;
  const avisos = async (citaId: number, destinatario: string) =>
    (await api().get('/notificaciones').query({ citaId, destinatario }).expect(200)).body as {
      tipo: string;
      mensaje: string;
    }[];

  const proponer = (id: number, horaInicio: string) =>
    api()
      .post(`/citas/${id}/propuestas-reprogramacion`)
      .send({ fecha: LUNES, horaInicio, motivo: 'Retraso en la atención anterior' });

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
      'TRUNCATE TABLE notificaciones, estimaciones_cita, propuestas_reprogramacion, citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
    );
    await api()
      .put('/disponibilidad')
      .send({ franjas: [{ diaSemana: 1, horaInicio: '08:00', horaFin: '12:00' }] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('HU-06: al registrar la llegada con retraso se recalculan las horas estimadas', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');
    await api().post(`/citas/${primera}/llegada`).send({ horaLlegada: '09:00' }).expect(200);
    await api().post(`/citas/${primera}/inicio-atencion`).send({ hora: '09:00' }).expect(200);
    // Con la atención en curso hasta las 09:30, la segunda cita todavía está a tiempo.
    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:30', cambioMin: 0 });

    ahora = aLas('09:42');
    await api().post(`/citas/${segunda}/llegada`).send({ horaLlegada: '09:42' }).expect(200);

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:42', cambioMin: 12 });
  });

  it('HU-08: cuando cancela el consultorio se notifica al paciente y se le ofrece reprogramar', async () => {
    const cita = await crearCita('09:00');

    await api()
      .post(`/citas/${cita}/cancelacion`)
      .send({ origen: 'consultorio', motivo: 'Emergencia del odontólogo' })
      .expect(200);

    const aviso = await avisos(cita, 'paciente');
    expect(aviso.map((a) => a.tipo)).toEqual(['cita_cancelada']);
    expect(aviso[0].mensaje).toContain('Emergencia del odontólogo');
  });

  it('HU-08: cuando cancela el paciente no se genera ninguna notificación', async () => {
    const cita = await crearCita('09:00');

    await api().post(`/citas/${cita}/cancelacion`).send({ origen: 'paciente' }).expect(200);

    expect(await avisos(cita, 'paciente')).toEqual([]);
  });

  it('HU-11: el rechazo de una propuesta alerta al administrador', async () => {
    const cita = await crearCita('09:00');
    const propuesta = await proponer(cita, '10:00').expect(201);

    await api()
      .post(`/propuestas-reprogramacion/${propuesta.body.id}/rechazo`)
      .send({})
      .expect(200);

    expect((await avisos(cita, 'administrador')).map((a) => a.tipo)).toEqual([
      'propuesta_rechazada',
    ]);
  });

  it('HU-11: una propuesta sin respuesta en el plazo alerta al administrador al vencer', async () => {
    const cita = await crearCita('09:00');
    await proponer(cita, '10:00').expect(201);

    ahora = aLas('09:16');
    await api().post('/propuestas-reprogramacion/vencimientos').send({}).expect(200);

    expect((await avisos(cita, 'administrador')).map((a) => a.tipo)).toEqual(['propuesta_vencida']);
  });

  it('HU-11: al aceptar una propuesta se recalcula la agenda con el nuevo horario', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_atrasar');
    const propuesta = await proponer(primera, '10:00').expect(201);

    await api()
      .post(`/propuestas-reprogramacion/${propuesta.body.id}/aceptacion`)
      .send({})
      .expect(200);

    expect(await horaEstimada(primera)).toMatchObject({
      horaInicioPrevista: '10:00',
      horaEstimada: '10:00',
      cambioMin: 0,
    });
  });
});
