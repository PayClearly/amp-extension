type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    // In production, send to telemetry service
    // For now, console.log (Chrome extension console)
    if (level === 'error') {
      console.error(`[${timestamp}] ${level.toUpperCase()}: ${message}`, context);
    } else if (level === 'warn') {
      console.warn(`[${timestamp}] ${level.toUpperCase()}: ${message}`, context);
    } else {
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, context);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    };
    this.log('error', message, errorContext);
  }
}

export const logger = new Logger();

