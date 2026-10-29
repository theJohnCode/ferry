import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field check: the property must differ from another property in the
 * same object (so a swap cannot be cNGN -> cNGN, which is a no-op).
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
