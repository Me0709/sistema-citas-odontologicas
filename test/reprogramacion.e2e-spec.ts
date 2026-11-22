import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-11 Confirmar o rechazar una reprogramación', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes; el horario de prueba es lunes 08:00-12:00 y 14:00-18:00.
  // La hora del consultorio es UTC-5: 13:00 UTC es la 08:00 del lunes en Colombia.
  const LUNES = '2026-11-23';
  const INICIO = new Date('2026-11-23T13:00:00Z');
  let ahora = INICIO;
  const pasarMinutos = (minutos: number) => new Date(INICIO.getTime() + minutos * 60_000);

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

  const proponer = (citaId: number, datos: object) =>
    api().post(`/citas/${citaId}/propuestas-reprogramacion`).send(datos);

  /** Crea una cita (por defecto a las 09:00) con una propuesta pendiente para la hora indicada. */
  const citaConPropuesta = async (horaPropuesta = '10:00', horaCita = '09:00') => {
    const citaId = await crearCita(horaCita);
    const respuesta = await proponer(citaId, {
      fecha: LUNES,
      horaInicio: horaPropuesta,
      motivo: 'El odontólogo se retrasó en una atención anterior',
    }).expect(201);
    return { citaId, propuestaId: respuesta.body.id as number };
  };

  const aceptar = (propuestaId: number, datos: object = {}) =>
    api().post(`/propuestas-reprogramacion/${propuestaId}/aceptacion`).send(datos);
  const rechazar = (propuestaId: number) =>
    api().post(`/propuestas-reprogramacion/${propuestaId}/rechazo`).send({});
  const obtenerPropuesta = async (id: number) =>
    (await api().get(`/propuestas-reprogramacion/${id}`).expect(200)).body;
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
    ahora = INICIO;
    await dataSource.query(
      'TRUNCATE TABLE propuestas_reprogramacion, citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
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

  describe('crear la propuesta', () => {
    it('guarda la propuesta pendiente con su plazo de 15 minutos y deja la cita "Por reprogramar"', async () => {
      const citaId = await crearCita('09:00');

      const respuesta = await proponer(citaId, {
        fecha: LUNES,
        horaInicio: '10:00',
        motivo: 'Retraso en la atención anterior',
      }).expect(201);

      expect(respuesta.body).toMatchObject({
        citaId,
        fecha: LUNES,
        horaInicio: '10:00',
        horaFin: '10:30',
        motivo: 'Retraso en la atención anterior',
        desplazamientoMin: 60,
        estado: 'Pendiente',
        venceEn: '2026-11-23T13:15:00.000Z',
      });
      expect((await obtenerCita(citaId)).estado).toBe('Por reprogramar');
    });

    it('la cita conserva su horario original mientras no se responda', async () => {
      const { citaId } = await citaConPropuesta();

      expect(await obtenerCita(citaId)).toMatchObject({ fecha: LUNES, horaInicio: '09:00' });
    });

    it('rechaza un horario ocupado por otra cita', async () => {
      const citaId = await crearCita('09:00');
      await crearCita('10:00');

      await proponer(citaId, { fecha: LUNES, horaInicio: '10:15', motivo: 'Prueba' }).expect(409);
    });

    it('rechaza un horario fuera de la jornada del odontólogo', async () => {
      const citaId = await crearCita('09:00');

      await proponer(citaId, { fecha: LUNES, horaInicio: '12:00', motivo: 'Prueba' }).expect(409);
    });

    it('rechaza una hora que no es múltiplo de 15 minutos', async () => {
      const citaId = await crearCita('09:00');

      await proponer(citaId, { fecha: LUNES, horaInicio: '10:10', motivo: 'Prueba' }).expect(400);
    });

    it('no admite una segunda propuesta pendiente para la misma cita', async () => {
      const { citaId } = await citaConPropuesta();

      await proponer(citaId, { fecha: LUNES, horaInicio: '11:00', motivo: 'Otra' }).expect(409);
    });

    it('no admite propuestas para una cita que ya llegó a la sala', async () => {
      const citaId = await crearCita('08:30');
      await dataSource.query(`UPDATE citas SET estado = 'En sala' WHERE id = $1`, [citaId]);

      await proponer(citaId, { fecha: LUNES, horaInicio: '10:00', motivo: 'Prueba' }).expect(409);
    });

    it('responde 400 con datos inválidos y 404 si la cita no existe', async () => {
      const citaId = await crearCita('09:00');

      await proponer(citaId, { fecha: '2026-02-30', horaInicio: '10:00', motivo: 'x' }).expect(400);
      await proponer(citaId, { fecha: LUNES, horaInicio: 'tarde', motivo: 'x' }).expect(400);
      await proponer(citaId, { fecha: LUNES, horaInicio: '10:00', motivo: '   ' }).expect(400);
      await proponer(999, { fecha: LUNES, horaInicio: '10:00', motivo: 'x' }).expect(404);
    });
  });

  describe('Escenario 5: explicación del cambio para el paciente', () => {
    it('al abrir la propuesta explica el motivo y cuántos minutos se mueve la cita', async () => {
      const { propuestaId } = await citaConPropuesta('10:00');

      const propuesta = await obtenerPropuesta(propuestaId);

      expect(propuesta.explicacion).toEqual({
        motivo: 'El odontólogo se retrasó en una atención anterior',
        minutosDesplazamiento: 60,
        sentido: 'atrasa',
        horarioActual: { fecha: LUNES, horaInicio: '09:00' },
        horarioPropuesto: { fecha: LUNES, horaInicio: '10:00' },
      });
    });

    it('si la propuesta adelanta la cita, lo indica', async () => {
      const { propuestaId } = await citaConPropuesta('08:30');

      const propuesta = await obtenerPropuesta(propuestaId);

      expect(propuesta.explicacion).toMatchObject({
        minutosDesplazamiento: 30,
        sentido: 'adelanta',
      });
    });

    it('responde 404 si la propuesta no existe', async () => {
      await api().get('/propuestas-reprogramacion/999').expect(404);
    });
  });

  describe('Escenario 1: aceptación de la propuesta', () => {
    it('mueve la cita al nuevo horario, la deja "Confirmada" y libera el espacio anterior', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');

      const respuesta = await aceptar(propuestaId).expect(200);

      expect(respuesta.body.propuesta).toMatchObject({
        estado: 'Aceptada',
        respondidaPor: 'paciente',
      });
      expect(respuesta.body.cita).toMatchObject({
        id: citaId,
        fecha: LUNES,
        horaInicio: '10:00',
        horaFin: '10:30',
        estado: 'Confirmada',
      });
      expect(await obtenerCita(citaId)).toMatchObject({
        horaInicio: '10:00',
        estado: 'Confirmada',
      });
      await crearCita('09:00');
    });

    it('rechaza la aceptación si el nuevo horario se ocupó mientras tanto y deja la propuesta pendiente', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');
      await crearCita('10:00');

      await aceptar(propuestaId).expect(409);

      expect((await obtenerPropuesta(propuestaId)).estado).toBe('Pendiente');
      expect(await obtenerCita(citaId)).toMatchObject({
        horaInicio: '09:00',
        estado: 'Por reprogramar',
      });
    });

    it('todavía se puede aceptar dentro de los 15 minutos', async () => {
      const { propuestaId } = await citaConPropuesta();
      ahora = pasarMinutos(14);

      await aceptar(propuestaId).expect(200);
    });

    it('no se puede responder dos veces', async () => {
      const { propuestaId } = await citaConPropuesta();
      await aceptar(propuestaId).expect(200);

      await aceptar(propuestaId).expect(409);
      await rechazar(propuestaId).expect(409);
    });
  });

  describe('Escenario 2: rechazo de la propuesta', () => {
    it('conserva la cita original, informa al administrador y pide evaluar la siguiente alternativa', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');

      const respuesta = await rechazar(propuestaId).expect(200);

      expect(respuesta.body).toMatchObject({
        propuesta: { estado: 'Rechazada', respondidaPor: 'paciente' },
        notificarAdministrador: true,
        evaluarSiguienteAlternativa: true,
      });
      expect(await obtenerCita(citaId)).toMatchObject({
        fecha: LUNES,
        horaInicio: '09:00',
        estado: 'Programada',
      });
    });

    it('una cita que estaba "Confirmada" vuelve a "Confirmada"', async () => {
      const citaId = await crearCita('09:00');
      await dataSource.query(`UPDATE citas SET estado = 'Confirmada' WHERE id = $1`, [citaId]);
      const propuesta = await proponer(citaId, {
        fecha: LUNES,
        horaInicio: '10:00',
        motivo: 'Prueba',
      }).expect(201);

      await rechazar(propuesta.body.id).expect(200);

      expect((await obtenerCita(citaId)).estado).toBe('Confirmada');
    });

    it('después del rechazo se puede hacer una nueva propuesta', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');
      await rechazar(propuestaId).expect(200);

      await proponer(citaId, { fecha: LUNES, horaInicio: '11:00', motivo: 'Otra opción' }).expect(
        201,
      );
    });
  });

  describe('Escenario 3: sin respuesta en el plazo', () => {
    it('vencido el plazo no se puede responder, la cita se mantiene y la propuesta queda vencida', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');
      ahora = pasarMinutos(15);

      const respuesta = await aceptar(propuestaId).expect(409);

      expect(String(respuesta.body.message)).toContain('15 minutos');
      expect((await obtenerPropuesta(propuestaId)).estado).toBe('Vencida');
      expect(await obtenerCita(citaId)).toMatchObject({
        horaInicio: '09:00',
        estado: 'Programada',
      });
    });

    it('el proceso de vencimientos cierra las propuestas vencidas y avisa al administrador', async () => {
      const vencida = await citaConPropuesta('10:00');
      ahora = pasarMinutos(10);
      const vigente = await citaConPropuesta('11:00', '08:00');
      ahora = pasarMinutos(16);

      const respuesta = await api().post('/propuestas-reprogramacion/vencimientos').expect(200);

      expect(respuesta.body.notificarAdministrador).toBe(true);
      expect(respuesta.body.vencidas.map((p: { id: number }) => p.id)).toEqual([
        vencida.propuestaId,
      ]);
      expect((await obtenerPropuesta(vencida.propuestaId)).estado).toBe('Vencida');
      expect((await obtenerPropuesta(vigente.propuestaId)).estado).toBe('Pendiente');
      expect((await obtenerCita(vencida.citaId)).estado).toBe('Programada');
    });

    it('sin propuestas vencidas no hay nada que avisar', async () => {
      await citaConPropuesta();

      const respuesta = await api().post('/propuestas-reprogramacion/vencimientos').expect(200);

      expect(respuesta.body).toEqual({ vencidas: [], notificarAdministrador: false });
    });
  });

  describe('Escenario 4: aceptación registrada por el administrador', () => {
    it('aplica el cambio igual que si lo hubiera confirmado el paciente', async () => {
      const { citaId, propuestaId } = await citaConPropuesta('10:00');

      const respuesta = await aceptar(propuestaId, { origen: 'administrador' }).expect(200);

      expect(respuesta.body.propuesta).toMatchObject({
        estado: 'Aceptada',
        respondidaPor: 'administrador',
      });
      expect(await obtenerCita(citaId)).toMatchObject({
        horaInicio: '10:00',
        estado: 'Confirmada',
      });
    });

    it('rechaza un origen que no existe', async () => {
      const { propuestaId } = await citaConPropuesta();

      await aceptar(propuestaId, { origen: 'vecino' }).expect(400);
    });

    it('responde 404 si la propuesta no existe', async () => {
      await aceptar(999).expect(404);
      await rechazar(999).expect(404);
    });
  });
});
