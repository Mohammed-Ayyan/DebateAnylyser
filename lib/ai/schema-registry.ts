import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv"
import addFormats from "ajv-formats"

export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; errors: readonly ErrorObject[] }

export class StageSchemaRegistry {
  private readonly ajv: Ajv
  private readonly validators = new Map<string, ValidateFunction>()

  constructor() {
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      coerceTypes: false,
      removeAdditional: false,
      useDefaults: false,
    })
    addFormats(this.ajv)
  }

  register(key: string, schema: AnySchema): void {
    if (this.validators.has(key)) throw new Error(`Stage schema already registered: ${key}`)
    this.validators.set(key, this.ajv.compile(schema))
  }

  validate<T>(key: string, candidate: unknown): ValidationResult<T> {
    const validator = this.validators.get(key)
    if (!validator) throw new Error(`Unknown stage schema: ${key}`)
    if (validator(candidate)) return { valid: true, value: candidate as T }
    return { valid: false, errors: validator.errors ?? [] }
  }
}
