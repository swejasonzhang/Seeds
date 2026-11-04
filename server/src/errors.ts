import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { toFieldIssues, type ApiError } from '@seeds/shared';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`, 'not_found');
export const conflict = (message: string) => new HttpError(409, message, 'conflict');

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const body: ApiError = { error: 'validation', message: 'Please fix the highlighted fields', issues: toFieldIssues(err) };
    return res.status(400).json(body);
  }
  if (err instanceof HttpError) {
    const body: ApiError = { error: err.code, message: err.message };
    return res.status(err.status).json(body);
  }
  if (err?.name === 'CastError') {
    return res.status(404).json({ error: 'not_found', message: 'Not found' } satisfies ApiError);
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request', message: 'Malformed JSON' } satisfies ApiError);
  }
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' } satisfies ApiError);
};
