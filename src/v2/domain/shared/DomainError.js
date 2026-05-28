export class DomainError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends DomainError {
  constructor(message) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity, id) {
    super(`${entity} con id "${id}" non trovato`, "NOT_FOUND", 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message) {
    super(message, "CONFLICT", 409);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Accesso negato") {
    super(message, "FORBIDDEN", 403);
  }
}
