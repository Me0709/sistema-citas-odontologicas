import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-10 Proponer alternativas de reprogramación', () => {
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

  /** La cita se atiende desde las 09:00 y, con el reloj a las 09:50, ya se pasó de sus 30 minutos. */
  const atencionRetrasada = async (): Promise<number> => {
    const id = await crearCita('09:00');
    await api().post(`/citas/${id}/llegada`).send({ horaLlegada: '09:00' }).expect(200);
    await api().post(`/citas/${id}/inicio-atencion`).send({ hora: '09:00' }).expect(200);
    ahora = aLas('09:50');
    return id;
  };

  const analizar = (cuerpo: object) => api().post('/agenda/alternativas').send(cuerpo);
  const alertasAlAdministrador = async () =>
    (await api().get('/notificaciones').query({ destinatario: 'administrador' }).expect(200))
      .body as { tipo: string; citaId: number | null }[];

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

  it('Escenario 1: propone la alternativa con el menor desplazamiento total', async () => {
    const atendida = await atencionRetrasada();
    const segunda = await crearCita('09:30');
    const tercera = await crearCita('10:00');
    await declarar(segunda, 'ambas');
    await declarar(tercera, 'puede_atrasar');

    const { body } = await analizar({ evento: 'retraso', citaId: atendida }).expect(200);

    expect(body.hayAlternativa).toBe(true);
    expect(body.propuesta).toEqual({
      asignaciones: [
        { citaId: segunda, horaPrevista: '09:30', horaPropuesta: '09:50', desplazamientoMin: 20 },
        { citaId: tercera, horaPrevista: '10:00', horaPropuesta: '10:20', desplazamientoMin: 20 },
      ],
      desplazamientoTotalMin: 40,
      pacientesDesplazados: 2,
    });
    expect(body.otras.length).toBeGreaterThan(0);
  });

  it('Escenario 2: el paciente que debe mantener el horario no se desplaza', async () => {
    await atencionRetrasada();
    const segunda = await crearCita('09:30');
    const tercera = await crearCita('10:00', 15);
    await declarar(segunda, 'ambas');
    await declarar(tercera, 'mantener');

    const { body } = await analizar({ evento: 'retraso' }).expect(200);

    const asignacion = body.propuesta.asignaciones.find(
      (a: { citaId: number }) => a.citaId === tercera,
    );
    expect(asignacion).toMatchObject({ horaPropuesta: '10:00', desplazamientoMin: 0 });
  });

  it('Escenario 4: sin alternativas informa las citas en conflicto y alerta al administrador', async () => {
    const atendida = await atencionRetrasada();
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'mantener');

    const { body } = await analizar({ evento: 'inasistencia', citaId: atendida }).expect(200);

    expect(body.hayAlternativa).toBe(false);
    expect(body.citasEnConflicto).toEqual([
      { citaId: segunda, horaPrevista: '09:30', flexibilidad: 'mantener' },
    ]);
    const alertas = await alertasAlAdministrador();
    expect(alertas.map((a) => a.tipo)).toContain('sin_alternativas');
  });

  it('Escenario 5: explica el evento, a quién desplaza y por qué se eligió', async () => {
    const atendida = await atencionRetrasada();
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'ambas');

    const { body } = await analizar({ evento: 'retraso', citaId: atendida }).expect(200);

    expect(body.explicacion).toMatchObject({
      evento: { tipo: 'retraso', citaId: atendida },
      desplazados: [{ citaId: segunda, minutos: 20 }],
    });
    expect(body.explicacion.motivo).toEqual(expect.any(String));
    expect(body.explicacion.criterio).toEqual(expect.any(String));
  });

  it('con alternativa no se genera ninguna alerta para el administrador', async () => {
    await atencionRetrasada();
    const segunda = await crearCita('09:30');
    await declarar(segunda, 'ambas');

    await analizar({ evento: 'retraso' }).expect(200);

    expect(await alertasAlAdministrador()).toEqual([]);
  });

  it('rechaza un evento que no existe o una cita inválida', async () => {
    await analizar({ evento: 'emergencia' }).expect(400);
    await analizar({}).expect(400);
    await analizar({ evento: 'retraso', citaId: 0 }).expect(400);
  });

  it('responde 404 si la cita del evento no existe', async () => {
    await analizar({ evento: 'cancelacion', citaId: 999 }).expect(404);
  });
});
