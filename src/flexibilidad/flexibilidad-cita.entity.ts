import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Cita } from '../citas/cita.entity';
import { Flexibilidad } from '../reordenamiento/dominio/flexibilidad';

/** Preferencia de horario declarada por el paciente para una cita. Va en su propia tabla. */
@Entity('flexibilidades_cita')
export class FlexibilidadCita {
  @PrimaryColumn({ name: 'cita_id', type: 'int' })
  citaId!: number;

  @OneToOne(() => Cita, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cita_id' })
  cita?: Cita;

  @Column({ type: 'varchar', length: 20 })
  flexibilidad!: Flexibilidad;
}
