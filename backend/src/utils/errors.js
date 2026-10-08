export class AppError extends Error {
  constructor(code, message, status = 400, hint) {
    super(message);
    this.code = code;
    this.status = status;
    this.hint = hint;
  }
}

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err.name === 'ZodError') {
      return res
        .status(400)
        .json({
          error: {
            code: 'INVALID_INPUT',
            message: err.issues.map((i) => i.message).join('; '),
            hint: 'Check the search input and try again.',
          },
        });
    }
    const status = err.status || 500;
    if (status >= 500) logger.error({ err }, 'unhandled error');
    res
      .status(status)
      .json({
        error: {
          code: err.code || 'INTERNAL',
          message: status >= 500 ? 'Something went wrong on the server.' : err.message,
          hint: err.hint,
        },
      });
  };
}
