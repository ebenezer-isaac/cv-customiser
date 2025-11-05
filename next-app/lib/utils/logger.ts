/**
 * Privacy-aware logging utility
 * 
 * This logger ensures we NEVER log sensitive user data like:
 * - File contents
 * - Job descriptions
 * - CV content
 * - Email addresses
 * - Personal information
 * 
 * Use this instead of console.log for any production code.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  userId?: string;
  sessionId?: string;
  action?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Sanitize data before logging - remove sensitive fields
   */
  private sanitize(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    // List of sensitive field names that should never be logged
    const sensitiveFields = [
      'content',
      'cvContent',
      'jobDescription',
      'originalCV',
      'extensiveCV',
      'cvStrategy',
      'coverLetterStrategy',
      'coldEmailStrategy',
      'feedback',
      'email',
      'password',
      'token',
      'privateKey',
      'apiKey',
      'secret'
    ];

    const sanitized: any = Array.isArray(data) ? [] : {};

    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();
        
        // Check if this is a sensitive field
        if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof data[key] === 'object' && data[key] !== null) {
          // Recursively sanitize nested objects
          sanitized[key] = this.sanitize(data[key]);
        } else if (typeof data[key] === 'string' && data[key].length > 100) {
          // Truncate long strings (likely to be content)
          sanitized[key] = `[STRING: ${data[key].length} chars]`;
        } else {
          sanitized[key] = data[key];
        }
      }
    }

    return sanitized;
  }

  /**
   * Format log message with context
   */
  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(this.sanitize(context))}` : '';
    return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}`;
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    const formatted = this.format('info', message, context);
    console.log(formatted);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    const formatted = this.format('warn', message, context);
    console.warn(formatted);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      ...context,
      errorMessage: error.message,
      errorStack: this.isDevelopment ? error.stack : undefined
    } : context;
    
    const formatted = this.format('error', message, errorContext);
    console.error(formatted);
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const formatted = this.format('debug', message, context);
      console.debug(formatted);
    }
  }

  /**
   * Log API request (never logs body content)
   */
  apiRequest(method: string, path: string, userId?: string): void {
    this.info('API Request', {
      method,
      path,
      userId: userId || 'anonymous'
    });
  }

  /**
   * Log API response (never logs response content)
   */
  apiResponse(method: string, path: string, status: number, userId?: string): void {
    this.info('API Response', {
      method,
      path,
      status,
      userId: userId || 'anonymous'
    });
  }

  /**
   * Log file operation (never logs file content)
   */
  fileOperation(operation: string, filePath: string, userId?: string, metadata?: any): void {
    this.info('File Operation', {
      operation,
      filePath,
      userId,
      ...this.sanitize(metadata)
    });
  }

  /**
   * Log AI operation (never logs prompts or responses)
   */
  aiOperation(operation: string, userId?: string, metadata?: any): void {
    this.info('AI Operation', {
      operation,
      userId,
      ...this.sanitize(metadata)
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export { Logger };
