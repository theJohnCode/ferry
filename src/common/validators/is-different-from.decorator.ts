import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that a property differs from another property on the same object,
 * so a swap cannot target the currency it starts from.
 */
export function IsDifferentFrom(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyKey: string | symbol) {
    registerDecorator({
      target: object.constructor,
      propertyName: String(propertyKey),
      options: validationOptions,
      constraints: [property],
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          const other = args?.object as Record<string, unknown> | undefined;
          return other?.[property] !== value;
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} must be different from ${property}.`;
        },
      },
    });
  };
}
