import type { NS } from "@ns"

const LOG_LEVELS = {
  fatal: 0,
  error: 10,
  warning: 20,
  info: 30,
  debug: 40,
  trace: 50,
}

export type LogLevelType = number | keyof typeof LOG_LEVELS

export class Logger {
  ns: NS
  logLevel = LOG_LEVELS.info
  tprint = false

  constructor(ns: NS, logLevel?: LogLevelType) {
    this.ns = ns
    if (logLevel !== undefined) {
      this.setLogLevel(logLevel)
    }
  }

  setLogLevel(logLevel: LogLevelType) {
    if (typeof logLevel === "number") {
      this.logLevel = logLevel
    } else {
      this.logLevel = LOG_LEVELS[logLevel]
      if (this.logLevel === undefined) {
        throw `Unknown log level ${logLevel}`
      }
    }
  }

  emit(level: string, msg: string) {
    const print = this.tprint ? this.ns.tprint : this.ns.print
    print(
      `${new Date().toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "long",
      })} [${level}] ${msg}`
    )
  }

  fatal(msg: string) {
    if (this.logLevel >= LOG_LEVELS.fatal) {
      this.emit("F", msg)
    }
  }

  error(msg: string) {
    if (this.logLevel >= LOG_LEVELS.error) {
      this.emit("E", msg)
    }
  }

  warning(msg: string) {
    if (this.logLevel >= LOG_LEVELS.warning) {
      this.emit("W", msg)
    }
  }

  info(msg: string) {
    if (this.logLevel >= LOG_LEVELS.info) {
      this.emit("I", msg)
    }
  }

  debug(msg: string) {
    if (this.logLevel >= LOG_LEVELS.debug) {
      this.emit("D", msg)
    }
  }

  trace(msg: string) {
    if (this.logLevel >= LOG_LEVELS.trace) {
      this.emit("T", msg)
    }
  }
}
