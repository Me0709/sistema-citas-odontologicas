import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { fechaValida } from './tiempo';

@ValidatorConstraint({ name: 'fechaCalendario', async: false })
export class FechaCalendario implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    return typeof valor === 'string' && fechaValida(valor);
  }

  defaultMessage(): string {
    return 'La fecha debe existir y tener formato AAAA-MM-DD';
  }
}
