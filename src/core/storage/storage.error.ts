export class ObjectChangedError extends Error {
  constructor(key: string, options?: ErrorOptions) {
    super(`Object ${key} changed after it was inspected`, options);
    this.name = new.target.name;
  }
}

export class ObjectMissingError extends Error {
  constructor(key: string, options?: ErrorOptions) {
    super(`Object ${key} does not exist`, options);
    this.name = new.target.name;
  }
}

export class ObjectStorageUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Object storage is unreachable', options);
    this.name = new.target.name;
  }
}

export class InvalidImageError extends Error {
  constructor(options?: ErrorOptions) {
    super('Input could not be decoded as an image', options);
    this.name = new.target.name;
  }
}

export class ImageProcessorBusyError extends Error {
  constructor() {
    super('Image processor is at capacity');
    this.name = new.target.name;
  }
}
