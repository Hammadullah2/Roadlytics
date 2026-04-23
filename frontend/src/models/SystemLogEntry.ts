export enum LogLevel {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

class LogLevelColors {
  public static readonly info = "#2ea043";
  public static readonly warning = "#d29922";
  public static readonly error = "#f85149";
  public static readonly debug = "#8b949e";
}

class LogLevelBackgrounds {
  public static readonly info = "rgba(46,160,67,0.10)";
  public static readonly warning = "rgba(210,153,34,0.10)";
  public static readonly error = "rgba(248,81,73,0.10)";
  public static readonly debug = "rgba(139,148,158,0.10)";
}

export class SystemLogEntry {
  public readonly id: string;
  public readonly timestamp: string;
  public readonly level: LogLevel;
  public readonly message: string;

  public constructor(
    id: string,
    timestamp: string,
    level: LogLevel,
    message: string,
  ) {
    this.id = id;
    this.timestamp = timestamp;
    this.level = level;
    this.message = message;
  }

  public get levelColor(): string {
    switch (this.level) {
      case LogLevel.INFO:
        return LogLevelColors.info;
      case LogLevel.WARNING:
        return LogLevelColors.warning;
      case LogLevel.ERROR:
        return LogLevelColors.error;
      case LogLevel.DEBUG:
        return LogLevelColors.debug;
      default:
        return LogLevelColors.debug;
    }
  }

  public get levelBgColor(): string {
    switch (this.level) {
      case LogLevel.INFO:
        return LogLevelBackgrounds.info;
      case LogLevel.WARNING:
        return LogLevelBackgrounds.warning;
      case LogLevel.ERROR:
        return LogLevelBackgrounds.error;
      case LogLevel.DEBUG:
        return LogLevelBackgrounds.debug;
      default:
        return LogLevelBackgrounds.debug;
    }
  }

  public get formattedLine(): string {
    return `${this.timestamp}  ${this.level}  ${this.message}`;
  }
}
