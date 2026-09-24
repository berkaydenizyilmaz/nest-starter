export type ImageFit = 'cover' | 'inside';

export interface ImageSpec {
  fit: ImageFit;
  maxEdge: number;
  variants: Readonly<Record<string, readonly [width: number, height: number]>>;
}

export interface RenderedImage {
  data: Buffer;
  width: number;
  height: number;
  size: number;
}

export interface ProcessedImage {
  contentType: string;
  master: RenderedImage;
  variants: (RenderedImage & { name: string })[];
}
