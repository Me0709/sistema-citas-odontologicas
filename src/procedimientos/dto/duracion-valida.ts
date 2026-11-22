import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { BLOQUE_MINIMO_MIN } from '../../comun/constantes';

@ValidatorConstraint({ name: 'duracionValida', async: false })
export class DuracionValida implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    return (
      typeof valor === 'number' &&
      Number.isInteger(valor) &&
      valor > 0 &&
      valor % BLOQUE_MINIMO_MIN === 0
    );
  }

  defaultMessage(): string {
    return `La duración debe ser un número entero de minutos, mayor que 0 y múltiplo de ${BLOQUE_MINIMO_MIN} (por ejemplo 15, 30, 45, 60)`;
  }
}
