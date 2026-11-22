import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Reloj } from '../src/comun/reloj';

describe('HU-12 Agenda diaria del odontólogo', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let contador = 0;

  // El 2026-11-23 es lunes y el 2026-11-24 martes. El horario de prueba es solo de los lunes:
  // 08:00-12:00 y 14:00-18:00. La hora del consultorio es UTC-5.
  const LUNES = '2026-11-23';
  const MARTES = '2026-11-24';
  const horaDelLunes = (hora: number, minutos = 0) =>
    new Date(Date.UTC(2026, 10, 23, hora + 5, minutos));

  let ahora = horaDelLunes(7);

  const api = () => request(app.getHttpServer());

  const crearCita = async (horaInicio: string, duracionMin = 30) => {
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
    return {
      id: cita.body.id as number,
      paciente: paciente.body.nombre as string,
      procedimiento: procedimiento.body.nombre as string,
    };
  };

  const llegar = (id: number, horaLlegada: string) =>
    api().post(`/citas/${id}/llegada`).send({ horaLlegada }).expect(200);
  const iniciar = (id: number, hora: string) =>
    api().post(`/citas/${id}/inicio-atencion`).send({ hora }).expect(200);
  const finalizar = (id: number, hora: string) =>
    api().post(`/citas/${id}/fin-atencion`).send({ hora }).expect(200);
  const agenda = (fecha: string) => api().get(`/agenda?fecha=${fecha}`);

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
    ahora = horaDelLunes(7);
    await dataSource.query(
      'TRUNCATE TABLE flexibilidades_cita, citas, pacientes, procedimientos, franjas_horarias RESTART IDENTITY CASCADE',
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

  it('Escenario 1: muestra las citas del día ordenadas por hora con paciente, procedimiento, duración y estado', async () => {
    const tarde = await crearCita('11:00', 45);
    const temprano = await crearCita('09:00', 30);
    const medio = await crearCita('10:00', 60);

    const respuesta = await agenda(LUNES).expect(200);

    expect(respuesta.body.fecha).toBe(LUNES);
    expect(respuesta.body.mensaje).toBeUndefined();
    expect(respuesta.body.citas.map((c: { id: number }) => c.id)).toEqual([
      temprano.id,
      medio.id,
      tarde.id,
    ]);
    expect(respuesta.body.citas[0]).toMatchObject({
      id: temprano.id,
      paciente: { nombre: temprano.paciente },
      procedimiento: { nombre: temprano.procedimiento },
      horaProgramada: '09:00',
      horaFinProgramada: '09:30',
      duracionMin: 30,
      estado: 'Programada',
    });
    expect(respuesta.body.citas[2]).toMatchObject({ duracionMin: 45, horaFinProgramada: '11:45' });
  });

  describe('Escenario 2: hora estimada actualizada', () => {
    it('si la atención en curso se atrasó, muestra la hora estimada vigente junto a la programada', async () => {
      const primera = await crearCita('09:00', 30);
      const segunda = await crearCita('09:30', 30);
      const tercera = await crearCita('10:00', 30);
      await llegar(primera.id, '09:00');
      await iniciar(primera.id, '09:20');
      ahora = horaDelLunes(9, 50);

      const { citas } = (await agenda(LUNES).expect(200)).body;
      const porId = (id: number) => citas.find((c: { id: number }) => c.id === id);

      expect(porId(primera.id)).toMatchObject({
        estado: 'En atención',
        horaInicioReal: '09:20',
        horaEstimada: null,
      });
      expect(porId(segunda.id)).toMatchObject({
        horaProgramada: '09:30',
        horaEstimada: '09:50',
        cambioMin: 20,
      });
      expect(porId(tercera.id)).toMatchObject({
        horaProgramada: '10:00',
        horaEstimada: '10:20',
        cambioMin: 20,
      });
    });

    it('si el odontólogo va a tiempo, la hora estimada coincide con la programada', async () => {
      const cita = await crearCita('10:00');
      ahora = horaDelLunes(9, 30);

      const { citas } = (await agenda(LUNES).expect(200)).body;

      expect(citas[0]).toMatchObject({
        id: cita.id,
        horaProgramada: '10:00',
        horaEstimada: '10:00',
        cambioMin: 0,
      });
    });

    it('un paciente que declaró que puede adelantar se estima antes si el odontólogo ya está libre', async () => {
      const cita = await crearCita('10:00');
      await api()
        .put(`/citas/${cita.id}/flexibilidad`)
        .send({ flexibilidad: 'puede_adelantar' })
        .expect(200);
      ahora = horaDelLunes(9, 30);

      const { citas } = (await agenda(LUNES).expect(200)).body;

      expect(citas[0]).toMatchObject({
        horaProgramada: '10:00',
        horaEstimada: '09:30',
        cambioMin: -30,
      });
    });

    it('un paciente en sala que ya esperó se estima desde ahora', async () => {
      const cita = await crearCita('09:30');
      await llegar(cita.id, '09:30');
      ahora = horaDelLunes(9, 40);

      const { citas } = (await agenda(LUNES).expect(200)).body;

      expect(citas[0]).toMatchObject({ estado: 'En sala', horaEstimada: '09:40', cambioMin: 10 });
    });

    it('otro día no se recalcula: cada cita conserva su hora', async () => {
      await crearCita('09:00');
      ahora = new Date(Date.UTC(2026, 10, 22, 20, 0));

      const { citas } = (await agenda(LUNES).expect(200)).body;

      expect(citas[0]).toMatchObject({
        horaProgramada: '09:00',
        horaEstimada: '09:00',
        cambioMin: 0,
      });
    });

    it('las citas atendidas, canceladas o con inasistencia no llevan hora estimada', async () => {
      const atendida = await crearCita('08:00');
      const cancelada = await crearCita('08:30');
      const inasistente = await crearCita('09:00');
      await llegar(atendida.id, '08:00');
      await iniciar(atendida.id, '08:00');
      await finalizar(atendida.id, '08:30');
      await api()
        .post(`/citas/${cancelada.id}/cancelacion`)
        .send({ origen: 'paciente' })
        .expect(200);
      await api().post(`/citas/${inasistente.id}/inasistencia`).send({ hora: '09:30' }).expect(200);
      ahora = horaDelLunes(10);

      const { citas } = (await agenda(LUNES).expect(200)).body;

      expect(citas.map((c: { estado: string }) => c.estado)).toEqual([
        'Atendida',
        'Cancelada',
        'Inasistencia',
      ]);
      expect(citas.map((c: { horaEstimada: string | null }) => c.horaEstimada)).toEqual([
        null,
        null,
        null,
      ]);
      expect(citas[0]).toMatchObject({ horaInicioReal: '08:00', horaFinReal: '08:30' });
    });
  });

  describe('Escenario 3: día sin citas', () => {
    it('muestra el mensaje y los espacios disponibles del horario de atención', async () => {
      const respuesta = await agenda(LUNES).expect(200);

      expect(respuesta.body).toMatchObject({
        fecha: LUNES,
        citas: [],
        mensaje: 'No hay citas programadas',
      });
      expect(respuesta.body.espaciosDisponibles).toHaveLength(32);
      expect(respuesta.body.espaciosDisponibles[0]).toEqual({
        fecha: LUNES,
        inicio: '08:00',
        fin: '08:15',
      });
    });

    it('un día sin horario de atención muestra el mensaje y ningún espacio', async () => {
      const respuesta = await agenda(MARTES).expect(200);

      expect(respuesta.body).toMatchObject({
        citas: [],
        mensaje: 'No hay citas programadas',
        espaciosDisponibles: [],
      });
    });
  });

  it.each(['', '2026-02-30', 'hoy', '23-11-2026'])(
    'responde 400 con la fecha "%s"',
    async (fecha) => {
      await agenda(fecha).expect(400);
    },
  );

  it('responde 400 si no se indica la fecha', async () => {
    await api().get('/agenda').expect(400);
  });
});
