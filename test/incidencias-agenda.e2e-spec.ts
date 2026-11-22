import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-08 Las incidencias recalculan la agenda del día (HU-09)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes y el 2026-11-30 también; el horario de prueba es lunes 08:00-12:00.
  const LUNES = '2026-11-23';
  const LUNES_SIGUIENTE = '2026-11-30';

  // La hora del consultorio es UTC-5.
  const aLas = (hora: string) => new Date(`2026-11-23T${hora}:00-05:00`);
  let ahora = aLas('09:00');

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio: string, fecha = LUNES): Promise<number> => {
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
        fecha,
        horaInicio,
      })
      .expect(201);
    return cita.body.id as number;
  };

  const declarar = (id: number, flexibilidad: string) =>
    api().put(`/citas/${id}/flexibilidad`).send({ flexibilidad }).expect(200);

  const horaEstimada = async (id: number) =>
    (await api().get(`/citas/${id}/hora-estimada`).expect(200)).body;

  const avisosAlPaciente = async (citaId: number) =>
    (await api().get('/notificaciones').query({ citaId, destinatario: 'paciente' }).expect(200))
      .body as { tipo: string; mensaje: string }[];

  /** Cuántas citas tienen una estimación guardada: solo existe si se recalculó la agenda. */
  const estimacionesGuardadas = async (): Promise<number> => {
    const filas = (await dataSource.query(
      'SELECT COUNT(*)::int AS total FROM estimaciones_cita',
    )) as {
      total: number;
    }[];
    return filas[0].total;
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

  it('Escenario 1: el aviso de retraso recalcula las horas estimadas del día', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');

    await api().post(`/citas/${primera}/aviso-retraso`).send({ minutos: 20 }).expect(200);

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:30', cambioMin: 0 });
    expect(await estimacionesGuardadas()).toBe(2);
  });

  it('Escenario 2: al cancelar una cita se adelanta y se avisa a quien puede adelantar', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_adelantar');

    await api().post(`/citas/${primera}/cancelacion`).send({ origen: 'paciente' }).expect(200);

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:00', cambioMin: -30 });
    expect((await avisosAlPaciente(segunda)).map((a) => a.tipo)).toEqual(['adelanto']);
  });

  it('Escenario 4: al registrar la inasistencia se recalculan las citas siguientes', async () => {
    const primera = await crearCita('09:00');
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'puede_adelantar');

    ahora = aLas('09:20');
    await api().post(`/citas/${primera}/inasistencia`).send({}).expect(200);

    expect(await horaEstimada(segunda)).toMatchObject({ horaEstimada: '09:20', cambioMin: -10 });
    expect((await avisosAlPaciente(segunda)).map((a) => a.tipo)).toEqual(['adelanto']);
  });

  it('no recalcula la agenda si la incidencia falla', async () => {
    await crearCita('09:00');

    await api().post('/citas/999/cancelacion').send({ origen: 'paciente' }).expect(404);
    await api().post('/citas/999/aviso-retraso').send({ minutos: 10 }).expect(404);
    await api().post('/citas/999/inasistencia').send({}).expect(404);

    expect(await estimacionesGuardadas()).toBe(0);
  });

  it('una incidencia de una cita de otro día no recalcula la agenda de hoy', async () => {
    const hoy = await crearCita('09:30');
    const otroDia = await crearCita('09:00', LUNES_SIGUIENTE);
    await declarar(hoy, 'puede_adelantar');

    await api().post(`/citas/${otroDia}/cancelacion`).send({ origen: 'paciente' }).expect(200);

    expect(await estimacionesGuardadas()).toBe(0);
    expect(await horaEstimada(hoy)).toMatchObject({ horaEstimada: '09:30', cambioMin: 0 });
  });
});
