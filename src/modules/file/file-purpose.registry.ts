import { Injectable } from '@nestjs/common';
import { isDetectableContentType } from '../../core/storage/content-type.util.js';
import { IMAGE_INPUT_CONTENT_TYPES } from '../../core/storage/storage.constants.js';
import type { FilePurpose } from './file-purpose.definition.js';

const PURPOSE_NAME_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const VARIANT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const RESERVED_VARIANT_NAMES = new Set(['master', 'original']);

@Injectable()
export class FilePurposeRegistry {
  private readonly purposes = new Map<string, FilePurpose>();

  register(purposes: readonly FilePurpose[]): void {
    for (const purpose of purposes) {
      assertValid(purpose);

      if (this.purposes.has(purpose.name)) {
        throw new Error(`File purpose "${purpose.name}" is registered twice`);
      }
      this.purposes.set(purpose.name, purpose);
    }
  }

  findByNameOrNull(name: string): FilePurpose | null {
    return this.purposes.get(name) ?? null;
  }
}

function assertValid(purpose: FilePurpose): void {
  if (!PURPOSE_NAME_PATTERN.test(purpose.name)) {
    throw new Error(
      `File purpose "${purpose.name}" must be named <module>.<name>`,
    );
  }

  if (purpose.contentTypes.length === 0 || purpose.maxBytes <= 0) {
    throw new Error(
      `File purpose "${purpose.name}" needs content types and a positive size limit`,
    );
  }

  const unsupported = purpose.contentTypes.filter((type) =>
    purpose.image
      ? !IMAGE_INPUT_CONTENT_TYPES.includes(type)
      : !isDetectableContentType(type),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `File purpose "${purpose.name}" allows content types that cannot be verified: ${unsupported.join(', ')}`,
    );
  }

  const invalidVariants = Object.keys(purpose.image?.variants ?? {}).filter(
    (name) =>
      !VARIANT_NAME_PATTERN.test(name) || RESERVED_VARIANT_NAMES.has(name),
  );
  if (invalidVariants.length > 0) {
    throw new Error(
      `File purpose "${purpose.name}" has invalid variant names: ${invalidVariants.join(', ')}`,
    );
  }
}
