import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Cita } from '../citas/cita.entity';

/** Hora estimada de inicio de una cita pendiente, recalculada cuando la agenda se retrasa o se adelanta. */
@Entity('estimaciones_cita')
export class EstimacionCita {
  @PrimaryColumn({ name: 'cita_id', type: 'int' })
  citaId!: number;

  @OneToOne(() => Cita, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cita_id' })
  cita?: Cita;

  /** HH:mm estimada de inicio. */
  @Column({ name: 'inicio_estimado', type: 'varchar', length: 5 })
  inicioEstimado!: string;

  /** Minutos de diferencia con la hora prevista: positivo si se retrasa, negativo si se adelanta. */
  @Column({ name: 'cambio_min', type: 'int' })
  cambioMin!: number;

  /** Última hora estimada que se le comunicó al paciente; vacío si nunca se le avisó. */
  @Column({ name: 'inicio_notificado', type: 'varchar', length: 5, nullable: true })
  inicioNotificado!: string | null;

  /** El paciente debe mantener el horario y fue desplazado: hay que evaluar alternativas (HU-10). */
  @Column({ name: 'requiere_alternativas', type: 'boolean', default: false })
  requiereAlternativas!: boolean;
}
