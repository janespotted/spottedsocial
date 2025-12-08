// Structured logging utility for debugging and monitoring

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  action: string;
  data?: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}

class Logger {
  private userId: string | null = null;

  setUserId(userId: string | null) {
    this.userId = userId;
  }

  private log(level: LogLevel, action: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      action,
      data,
      timestamp: new Date().toISOString(),
      ...(this.userId && { userId: this.userId }),
    };

    const prefix = `[${level.toUpperCase()}]`;
    const message = `${prefix} ${action}`;

    switch (level) {
      case 'error':
        console.error(message, data || '');
        break;
      case 'warn':
        console.warn(message, data || '');
        break;
      case 'debug':
        if (process.env.NODE_ENV === 'development') {
          console.log(message, data || '');
        }
        break;
      default:
        console.log(message, data || '');
    }

    return entry;
  }

  info(action: string, data?: Record<string, unknown>) {
    return this.log('info', action, data);
  }

  warn(action: string, data?: Record<string, unknown>) {
    return this.log('warn', action, data);
  }

  error(action: string, data?: Record<string, unknown>) {
    return this.log('error', action, data);
  }

  debug(action: string, data?: Record<string, unknown>) {
    return this.log('debug', action, data);
  }

  // Pre-defined action loggers for common operations
  checkIn(venueName: string, venueId?: string) {
    return this.info('user:check_in', { venueName, venueId });
  }

  post(postId: string, hasImage: boolean, venueName?: string) {
    return this.info('user:create_post', { postId, hasImage, venueName });
  }

  dm(threadId: string, recipientId: string) {
    return this.info('user:send_dm', { threadId, recipientId });
  }

  meetUp(recipientId: string, recipientName: string) {
    return this.info('user:send_meetup', { recipientId, recipientName });
  }

  mapLoad(friendCount: number, venueCount: number) {
    return this.info('map:load', { friendCount, venueCount });
  }

  apiError(endpoint: string, error: unknown) {
    return this.error('api:error', { 
      endpoint, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }

  authEvent(event: string) {
    return this.info(`auth:${event}`, {});
  }
}

export const logger = new Logger();
