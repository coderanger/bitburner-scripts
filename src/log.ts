import type { NS } from "@ns"

export const LOG_LEVELS = {
  fatal: 0,
  error: 10,
  warning: 20,
  info: 30,
  debug: 40,
  trace: 50,
}

export type LogLevelType = number | keyof typeof LOG_LEVELS

type Loggable = string | (() => string)

export class Logger {
  ns: NS
  logLevel = LOG_LEVELS.info
  tprint = false
  buffered = false
  buffer: string[] = []
  sink!: (msg: string) => void

  constructor(ns: NS, logLevel?: LogLevelType) {
    this.ns = ns
    if (logLevel !== undefined) {
      this.setLogLevel(logLevel)
    }
    this._updateSink()
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

  setTprint(val: boolean) {
    this.tprint = val
    this._updateSink()
  }

  setBuffered(val: boolean) {
    this.buffered = val
    this._updateSink()
  }

  _updateSink() {
    if (this.buffered) {
      this.sink = this.buffer.push.bind(this.buffer)
    } else if (this.tprint) {
      this.sink = this.ns.tprint
    } else {
      this.sink = this.ns.print
    }
  }

  flushBuffer() {
    if (this.buffer.length === 0) {
      return
    }
    const msg = this.buffer.join("\n")
    const sink = this.tprint ? this.ns.tprint : this.ns.print
    sink(msg)
    this.buffer.splice(0, this.buffer.length)
  }

  emit(level: string, msg: Loggable) {
    const finalMsg = typeof msg === "function" ? msg() : msg
    this.sink(
      `${new Date().toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "long",
      })} [${level}] ${finalMsg}`
    )
  }

  fatal(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.fatal) {
      this.emit("F", msg)
    }
  }

  error(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.error) {
      this.emit("E", msg)
    }
  }

  warning(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.warning) {
      this.emit("W", msg)
    }
  }

  info(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.info) {
      this.emit("I", msg)
    }
  }

  debug(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.debug) {
      this.emit("D", msg)
    }
  }

  trace(msg: Loggable) {
    if (this.logLevel >= LOG_LEVELS.trace) {
      this.emit("T", msg)
    }
  }
}
