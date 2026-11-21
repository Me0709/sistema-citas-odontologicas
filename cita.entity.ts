import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Paciente } from '../pacientes/paciente.entity';
import { Procedimiento } from '../procedimientos/procedimiento.entity';
import { EstadoCita } from './estado-cita';

@Entity('citas')
@Index(['fecha'])
export class Cita {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Paciente, { nullable: false })
  @JoinColumn({ name: 'paciente_id' })
  paciente?: Paciente;

  @Column({ name: 'paciente_id', type: 'int' })
  pacienteId!: number;

  @ManyToOne(() => Procedimiento, { nullable: false })
  @JoinColumn({ name: 'procedimiento_id' })
  procedimiento?: Procedimiento;

  @Column({ name: 'procedimiento_id', type: 'int' })
  procedimientoId!: number;

  /** AAAA-MM-DD, fecha de calendario sin zona horaria. */
  @Column({ type: 'varchar', length: 10 })
  fecha!: string;

  @Column({ name: 'hora_inicio', type: 'varchar', length: 5 })
  horaInicio!: string;

  @Column({ name: 'hora_fin', type: 'varchar', length: 5 })
  horaFin!: string;

  /** Copia de la duración del procedimiento al momento de programar la cita. */
  @Column({ name: 'duracion_min', type: 'int' })
  duracionMin!: number;

  @Column({ type: 'varchar', length: 20, default: EstadoCita.PROGRAMADA })
  estado!: EstadoCita;
}