/** Field-level validation failure — the equivalent of Laravel's ValidationException. */
export class ValidationError extends Error {
    constructor(public readonly errors: Record<string, string>) {
        super(Object.values(errors)[0] ?? 'The given data was invalid.');
        this.name = 'ValidationError';
    }

    static withMessages(errors: Record<string, string>): ValidationError {
        return new ValidationError(errors);
    }
}
