/** Base class for all ichkil errors. */
export class IchkilError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The downloaded model file does not match its expected SHA-256. */
export class ChecksumError extends IchkilError {}

/** The model artifact or its config is missing, invalid or unreadable. */
export class ModelLoadError extends IchkilError {}

/** Inference failed (bad input shape, runtime error, ...). */
export class InferenceError extends IchkilError {}
