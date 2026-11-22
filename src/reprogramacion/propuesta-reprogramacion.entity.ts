import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { EstadoCita } from '../citas/estado-cita';
import { EstadoPropuesta, OrigenRespuesta } from './estado-propuesta';

/** Nuevo horario que el consultorio propone para una cita, a la espera de la respuesta del paciente. */
@Entity('propuestas_reprogramacion')
@Index(['citaId', 'estado'])
export class PropuestaReprogramacion {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Cita, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cita_id' })
  cita?: Cita;

  @Column({ name: 'cita_id', type: 'int' })
  citaId!: number;

  /** Horario de la cita cuando se hizo la propuesta; se conserva para explicar el cambio. */
  @Column({ name: 'fecha_original', type: 'varchar', length: 10 })
  fechaOriginal!: string;

  @Column({ name: 'hora_inicio_original', type: 'varchar', length: 5 })
  horaInicioOriginal!: string;

  /** AAAA-MM-DD del horario propuesto. */
  @Column({ type: 'varchar', length: 10 })
  fecha!: string;

  @Column({ name: 'hora_inicio', type: 'varchar', length: 5 })
  horaInicio!: string;

  @Column({ name: 'hora_fin', type: 'varchar', length: 5 })
  horaFin!: string;

  @Column({ type: 'varchar', length: 300 })
  motivo!: string;

  /** Minutos que se mueve la cita: positivo si se atrasa, negativo si se adelanta. */
  @Column({ name: 'desplazamiento_min', type: 'int' })
  desplazamientoMin!: number;

  /** Estado de la cita antes de la propuesta, al que vuelve si no se acepta. */
  @Column({ name: 'estado_cita_anterior', type: 'varchar', length: 20 })
  estadoCitaAnterior!: EstadoCita;

  @Column({ type: 'varchar', length: 20, default: EstadoPropuesta.PENDIENTE })
  estado!: EstadoPropuesta;

  @Column({ name: 'creada_en', type: 'timestamptz' })
  creadaEn!: Date;

  @Column({ name: 'vence_en', type: 'timestamptz' })
  venceEn!: Date;

  @Column({ name: 'respondida_en', type: 'timestamptz', nullable: true })
  respondidaEn!: Date | null;

  @Column({ name: 'respondida_por', type: 'varchar', length: 20, nullable: true })
  respondidaPor!: OrigenRespuesta | null;
}
