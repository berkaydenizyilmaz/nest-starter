import { Injectable } from '@nestjs/common';
import sharp, { type Sharp } from 'sharp';
import { detectContentType } from './content-type.util.js';
import {
  IMAGE_CONCURRENCY,
  IMAGE_CONTENT_TYPE,
  IMAGE_MAX_INPUT_PIXELS,
  IMAGE_WEBP_QUALITY,
} from './storage.constants.js';
import { ImageProcessorBusyError, InvalidImageError } from './storage.error.js';
import type {
  ImageSpec,
  ProcessedImage,
  RenderedImage,
} from './storage.types.js';

@Injectable()
export class ImageProcessor {
  private active = 0;

  async process(
    spec: ImageSpec,
    load: () => Promise<Buffer>,
  ): Promise<ProcessedImage> {
    if (this.active >= IMAGE_CONCURRENCY) {
      throw new ImageProcessorBusyError();
    }

    this.active++;
    try {
      return await render(spec, await load());
    } finally {
      this.active--;
    }
  }
}

async function render(spec: ImageSpec, input: Buffer): Promise<ProcessedImage> {
  const detected = await detectContentType(input);
  if (!detected || !spec.contentTypes.includes(detected)) {
    throw new InvalidImageError();
  }

  const source = sharp(input, {
    limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
    autoOrient: true,
  });

  try {
    const [master, variants] = await Promise.all([
      encode(
        source.clone().resize(spec.maxEdge, spec.maxEdge, {
          fit: 'inside',
          withoutEnlargement: true,
        }),
      ),
      Promise.all(
        Object.entries(spec.variants).map(async ([name, [width, height]]) => ({
          name,
          ...(await encode(
            source.clone().resize(width, height, {
              fit: spec.fit,
              withoutEnlargement: true,
            }),
          )),
        })),
      ),
    ]);

    return { contentType: IMAGE_CONTENT_TYPE, master, variants };
  } catch (error) {
    throw new InvalidImageError({ cause: error });
  }
}

async function encode(pipeline: Sharp): Promise<RenderedImage> {
  const { data, info } = await pipeline
    .webp({ quality: IMAGE_WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, size: info.size };
}
