import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-08 Registrar retraso, cancelación o inasistencia', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  const LUNES = '2026-11-23';

  // La hora del consultorio es UTC-5: 14:00 UTC es la 09:00 del lunes en Colombia.
  let ahora = new Date('2026-11-23T14:00:00Z');

  const api = () => request(app.getHttpServer());

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

  const crearProcedimiento = async (): Promise<number> => {
    contador += 1;
    const { body } = await api()
      .post('/procedimientos')
      .send({ nombre: `Procedimiento ${contador}`, duracionMin: 30 })
      .expect(201);
    return body.id as number;
  };

  const programar = (pacienteId: number, procedimientoId: number, horaInicio: string) =>
    api().post('/citas').send({ pacienteId, procedimientoId, fecha: LUNES, horaInicio });

  /** Programa una cita de 30 minutos y devuelve los datos para reutilizarlos. */
  const crearCita = async (horaInicio = '09:00') => {
    const pacienteId = await crearPaciente();
    const procedimientoId = await crearProcedimiento();
    const cita = await programar(pacienteId, procedimientoId, horaInicio).expect(201);
    return { id: cita.body.id as number, pacienteId, procedimientoId };
  };

  const avisarRetraso = (id: number, datos: object) =>
    api().post(`/citas/${id}/aviso-retraso`).send(datos);
  const cancelar = (id: number, datos: object) =>
    api().post(`/citas/${id}/cancelacion`).send(datos);
  const registrarInasistencia = (id: number, datos: object = {}) =>
    api().post(`/citas/${id}/inasistencia`).send(datos);
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

  describe('Escenario 1: aviso de retraso del paciente', () => {
    it('guarda el aviso con los minutos estimados y la cita sigue programada', async () => {
      const { id } = await crearCita();

      const respuesta = await avisarRetraso(id, { minutos: 20 }).expect(200);

      expect(respuesta.body).toMatchObject({ id, avisoRetrasoMin: 20, estado: 'Programada' });
      expect((await obtenerCita(id)).avisoRetrasoMin).toBe(20);
    });

    it('un nuevo aviso reemplaza al anterior', async () => {
      const { id } = await crearCita();
      await avisarRetraso(id, { minutos: 20 }).expect(200);

      const respuesta = await avisarRetraso(id, { minutos: 35 }).expect(200);

      expect(respuesta.body.avisoRetrasoMin).toBe(35);
    });

    it.each([0, -5, 1.5, '10'])('responde 400 con los minutos %p', async (minutos) => {
      const { id } = await crearCita();

      await avisarRetraso(id, { minutos }).expect(400);
    });

    it('no admite el aviso de una cita cuyo paciente ya llegó', async () => {
      const { id } = await crearCita();
      await api().post(`/citas/${id}/llegada`).send({ horaLlegada: '09:00' }).expect(200);

      await avisarRetraso(id, { minutos: 10 }).expect(409);
    });
  });

  describe('Escenario 2: cancelación solicitada por el paciente', () => {
    it('cancela la cita, queda en el historial del paciente y libera el espacio', async () => {
      const { id, pacienteId, procedimientoId } = await crearCita('09:00');

      const respuesta = await cancelar(id, { origen: 'paciente' }).expect(200);

      expect(respuesta.body).toMatchObject({
        id,
        estado: 'Cancelada',
        canceladaPor: 'paciente',
        ofreceReprogramar: false,
      });

      const historial = (await api().get(`/citas?pacienteId=${pacienteId}`).expect(200)).body;
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatchObject({ id, estado: 'Cancelada' });

      const otroPaciente = await crearPaciente();
      await programar(otroPaciente, procedimientoId, '09:00').expect(201);
    });

    it('guarda el motivo si el paciente lo da', async () => {
      const { id } = await crearCita();

      const respuesta = await cancelar(id, { origen: 'paciente', motivo: '  Viaje  ' }).expect(200);

      expect(respuesta.body.motivoCancelacion).toBe('Viaje');
    });
  });

  describe('Escenario 3: cancelación por parte del consultorio', () => {
    it('cancela sin contarla como del paciente, guarda el motivo y ofrece reprogramar', async () => {
      const { id } = await crearCita();

      const respuesta = await cancelar(id, {
        origen: 'consultorio',
        motivo: 'Emergencia del odontólogo',
      }).expect(200);

      expect(respuesta.body).toMatchObject({
        estado: 'Cancelada',
        canceladaPor: 'consultorio',
        motivoCancelacion: 'Emergencia del odontólogo',
        ofreceReprogramar: true,
      });
    });

    it('exige el motivo', async () => {
      const { id } = await crearCita();

      await cancelar(id, { origen: 'consultorio' }).expect(400);
      await cancelar(id, { origen: 'consultorio', motivo: '   ' }).expect(400);
      expect((await obtenerCita(id)).estado).toBe('Programada');
    });

    it('puede cancelar aunque el paciente ya esté en sala', async () => {
      const { id } = await crearCita();
      await api().post(`/citas/${id}/llegada`).send({ horaLlegada: '09:00' }).expect(200);

      await cancelar(id, { origen: 'consultorio', motivo: 'Emergencia' }).expect(200);
    });
  });

  describe('Escenario 4: inasistencia', () => {
    it('pasado el tiempo máximo de espera marca la cita como inasistencia y libera el espacio', async () => {
      const { id, procedimientoId } = await crearCita('09:00');

      const respuesta = await registrarInasistencia(id, { hora: '09:16' }).expect(200);

      expect(respuesta.body).toMatchObject({ id, estado: 'Inasistencia' });

      const otroPaciente = await crearPaciente();
      await programar(otroPaciente, procedimientoId, '09:00').expect(201);
    });

    it('sin hora indicada usa el reloj en hora del consultorio', async () => {
      const { id } = await crearCita('09:00');

      ahora = new Date('2026-11-23T14:15:00Z');
      await registrarInasistencia(id).expect(409);

      ahora = new Date('2026-11-23T14:16:00Z');
      await registrarInasistencia(id).expect(200);
      expect((await obtenerCita(id)).estado).toBe('Inasistencia');
    });

    it('no se puede registrar la inasistencia de una cita de un día futuro', async () => {
      const { id } = await crearCita('09:00');
      ahora = new Date('2026-11-22T14:00:00Z');

      await registrarInasistencia(id, { hora: '09:30' }).expect(409);
      expect((await obtenerCita(id)).estado).toBe('Programada');
    });

    it('queda en el historial del paciente', async () => {
      const { id, pacienteId } = await crearCita();
      await registrarInasistencia(id, { hora: '09:30' }).expect(200);

      const historial = (await api().get(`/citas?pacienteId=${pacienteId}`).expect(200)).body;

      expect(historial[0]).toMatchObject({ id, estado: 'Inasistencia' });
    });

    it('antes de que venza el tiempo máximo de espera no se puede registrar', async () => {
      const { id } = await crearCita('09:00');

      const respuesta = await registrarInasistencia(id, { hora: '09:15' }).expect(409);

      expect(String(respuesta.body.message)).toContain('09:15');
      expect((await obtenerCita(id)).estado).toBe('Programada');
    });

    it('si el paciente llega después, se le informa que ya figura como inasistencia', async () => {
      const { id } = await crearCita('09:00');
      await registrarInasistencia(id, { hora: '09:20' }).expect(200);

      const respuesta = await api()
        .post(`/citas/${id}/llegada`)
        .send({ horaLlegada: '09:30' })
        .expect(409);

      expect(respuesta.body.ofreceReprogramar).toBe(true);
    });

    it('no se puede registrar la inasistencia de un paciente que ya llegó', async () => {
      const { id } = await crearCita('09:00');
      await api().post(`/citas/${id}/llegada`).send({ horaLlegada: '09:00' }).expect(200);

      await registrarInasistencia(id, { hora: '09:30' }).expect(409);
    });
  });

  describe('casos comunes', () => {
    it('no se puede cancelar una cita ya cancelada ni una ya atendida', async () => {
      const cancelada = await crearCita('09:00');
      await cancelar(cancelada.id, { origen: 'paciente' }).expect(200);
      await cancelar(cancelada.id, { origen: 'paciente' }).expect(409);

      const atendida = await crearCita('10:00');
      await api().post(`/citas/${atendida.id}/llegada`).send({ horaLlegada: '10:00' });
      await api().post(`/citas/${atendida.id}/inicio-atencion`).send({ hora: '10:00' });
      await api().post(`/citas/${atendida.id}/fin-atencion`).send({ hora: '10:30' });
      await cancelar(atendida.id, { origen: 'consultorio', motivo: 'Error' }).expect(409);
    });

    it('responde 404 si la cita no existe', async () => {
      await avisarRetraso(999, { minutos: 10 }).expect(404);
      await cancelar(999, { origen: 'paciente' }).expect(404);
      await registrarInasistencia(999, { hora: '09:30' }).expect(404);
    });

    it('responde 400 si el origen no es válido o la hora no tiene formato HH:mm', async () => {
      const { id } = await crearCita();

      await cancelar(id, { origen: 'alguien' }).expect(400);
      await registrarInasistencia(id, { hora: 'tarde' }).expect(400);
    });
  });
});
