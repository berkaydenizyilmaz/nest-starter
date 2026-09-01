import { z } from 'zod';

export const emailAddress = () =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.email(),
  );
