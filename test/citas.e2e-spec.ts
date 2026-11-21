import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('HU-04 Programar una cita', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  const LUNES = '2026-11-23';
  const MARTES = '2026-11-24';

  const api = () => request(app.getHttpServer());

  const crearProcedimiento = async (duracionMin = 30): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/procedimientos')
      .send({ nombre: `Procedimiento ${contador}`, duracionMin })
      .expect(201);
    return body.id as number;
  };

  const crearPaciente = async (): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/pacientes')
      .send({
        nombre: `Paciente ${contador}`,
        documento: String(1000000000 + contador),
        telefono: '3001234567',
        correo: `paciente${contador}@correo.com`,
        autorizaTratamientoDatos: true,
      })
      .expect(201);
    return body.id as number;
  };

  const programar = (datos: object) => api().post('/citas').send(datos);
  const listarCitas = () => api().get('/citas').expect(200);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
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

  it('Escenario 1: programa la cita, reserva el espacio según la duración y queda "Programada"', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);

    const respuesta = await programar({
      pacienteId,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);

    expect(respuesta.body).toMatchObject({
      pacienteId,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
      horaFin: '09:30',
      duracionMin: 30,
      estado: 'Programada',
    });

    const citas = (await listarCitas()).body;
    expect(citas).toHaveLength(1);
  });

  it('el espacio queda reservado, pero una cita justo a continuación sí se acepta', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const paciente1 = await crearPaciente();
    const paciente2 = await crearPaciente();

    await programar({
      pacienteId: paciente1,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);
    await programar({
      pacienteId: paciente2,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(409);
    await programar({
      pacienteId: paciente2,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:30',
    }).expect(201);
  });

  it('Escenario 2: rechaza un horario ocupado y sugiere los próximos espacios', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const paciente1 = await crearPaciente();
    const paciente2 = await crearPaciente();
    await programar({
      pacienteId: paciente1,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);

    const respuesta = await programar({
      pacienteId: paciente2,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:15',
    }).expect(409);

    expect(String(respuesta.body.message)).toContain('ocupado');
    expect(respuesta.body.proximosEspacios).toHaveLength(3);
    expect(respuesta.body.proximosEspacios[0]).toEqual({
      fecha: LUNES,
      horaInicio: '09:30',
      horaFin: '10:00',
    });
    expect((await listarCitas()).body).toHaveLength(1);
  });

  it('Escenario 2: rechaza un horario donde no alcanza la duración del procedimiento', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(60);

    // A las 11:30 la jornada de la mañana termina a las 12:00: faltan 30 minutos.
    const respuesta = await programar({
      pacienteId,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '11:30',
    }).expect(409);

    expect(respuesta.body.proximosEspacios[0]).toEqual({
      fecha: LUNES,
      horaInicio: '14:00',
      horaFin: '15:00',
    });
    expect((await listarCitas()).body).toHaveLength(0);
  });

  it('Escenario 2: rechaza un día sin atención y sugiere el siguiente día con espacio', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);

    const respuesta = await programar({
      pacienteId,
      procedimientoId,
      fecha: MARTES,
      horaInicio: '09:00',
    }).expect(409);

    expect(String(respuesta.body.message)).toContain('horario de atención');
    expect(respuesta.body.proximosEspacios[0]).toEqual({
      fecha: '2026-11-30',
      horaInicio: '08:00',
      horaFin: '08:30',
    });
  });

  it('Escenario 3: rechaza la cita si el paciente ya tiene otra que se cruza e indica con cuál', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);
    const { body: existente } = await programar({
      pacienteId,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);

    const respuesta = await programar({
      pacienteId,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:15',
    }).expect(409);

    expect(String(respuesta.body.message)).toContain('ya tiene una cita');
    expect(respuesta.body.citaEnConflicto.id).toBe(existente.id);
    expect(respuesta.body.citaEnConflicto.horaInicio).toBe('09:00');
    expect((await listarCitas()).body).toHaveLength(1);
  });

  it('una cita cancelada libera el espacio', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const paciente1 = await crearPaciente();
    const paciente2 = await crearPaciente();
    await programar({
      pacienteId: paciente1,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);

    await dataSource.query(`UPDATE citas SET estado = 'Cancelada'`);

    await programar({
      pacienteId: paciente2,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);
  });

  it('rechaza un procedimiento desactivado', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);
    await api().patch(`/procedimientos/${procedimientoId}/desactivar`).expect(200);

    await programar({ pacienteId, procedimientoId, fecha: LUNES, horaInicio: '09:00' }).expect(400);
  });

  it('responde 404 si el paciente o el procedimiento no existen', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);

    await programar({
      pacienteId: 9999,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(404);
    await programar({
      pacienteId,
      procedimientoId: 9999,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(404);
  });

  it('rechaza datos con formato inválido', async () => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento(30);
    const base = { pacienteId, procedimientoId, fecha: LUNES, horaInicio: '09:00' };

    await programar({ ...base, horaInicio: '09:10' }).expect(400);
    await programar({ ...base, horaInicio: '9:00' }).expect(400);
    await programar({ ...base, fecha: '2026-02-30' }).expect(400);
    await programar({ ...base, pacienteId: undefined }).expect(400);
  });

  it('consulta una cita por id y filtra el listado por fecha y paciente', async () => {
    const procedimientoId = await crearProcedimiento(30);
    const paciente1 = await crearPaciente();
    const paciente2 = await crearPaciente();
    const { body: cita } = await programar({
      pacienteId: paciente1,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '09:00',
    }).expect(201);
    await programar({
      pacienteId: paciente2,
      procedimientoId,
      fecha: LUNES,
      horaInicio: '10:00',
    }).expect(201);

    await api().get(`/citas/${cita.id}`).expect(200);
    await api().get('/citas/9999').expect(404);

    const delPaciente = await api().get(`/citas?pacienteId=${paciente1}`).expect(200);
    expect(delPaciente.body).toHaveLength(1);

    const delDia = await api().get(`/citas?fecha=${LUNES}`).expect(200);
    expect(delDia.body).toHaveLength(2);

    await api().get('/citas?fecha=hoy').expect(400);
    await api().get('/citas?pacienteId=abc').expect(400);
  });
});
