import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isMoneyString } from './money.util';

@ValidatorConstraint({ name: 'isMoneyString', async: false })
class MoneyStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isMoneyString(value);
  }

  defaultMessage(args: ValidationArguments): string {
    // Guard against JSON numbers sneaking through: amounts must be strings.
    if (typeof args.value === 'number') {
      return `${args.property} must be a string like "1500.50", not a number.`;
    }
    return `${args.property} must be a positive decimal string with at most 8 decimal places.`;
  }
}

export function IsMoneyString(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyKey: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      constraints: [],
      validator: MoneyStringConstraint,
    });
  };
}
