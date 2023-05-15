import moment from 'moment-timezone';
import _ from 'lodash';

function getTS() {
  return moment().tz('Europe/Sofia').format('DD-MM-YY HH:mm:ss');
}

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export class Logger {
  private readonly label: string;
  private readonly errors = {};

  public debugOnce(msg: string, ...args) {
    if (!this.errors[msg]) {
      this.debug(msg, ...args);
      this.errors[msg] = true;
    }
  }

  private parseError = (errOrAny) => {
    return errOrAny?.toJSON ? _.pick(errOrAny.toJSON(), ['message', 'stack', 'config.url', 'config.data'])
      : errOrAny?.message ? _.pick(errOrAny, ['message', 'stack'])
        : errOrAny;
  };

  constructor(label: string) {
    this.label = `[${label}]`;
  }

  log(...args) {
    console.log.apply(console, [getTS(), this.label, ...args]);
  }

  line(str: string, append = false) {
    if (!append) {
      this.clearLine();
    }
    process.stdout.write(`${append ? '' : `${(getTS())} ${this.label} `}${str}`, 'utf-8');
  }

  clearLine() {
    //process.stdout.clearLine(0);
    //process.stdout.cursorTo(0);
  }

  endLine(str: string = '') {
    process.stdout.write(`${str}\n`, 'utf-8');
  }

  error(...args) {
    console.error.apply(console, [getTS(), this.label, ...args.map(this.parseError)]);
  }

  info(...args) {
    console.info.apply(console, [getTS(), this.label, ...args]);
  }

  time(label) {
    console.time(label);
  }

  timeEnd(label, ...args) {
    console.timeLog.apply(console, [label, getTS(), this.label, ...args]);
  }

  debug(...args) {
    console.debug.apply(console, [getTS(), this.label, ...args]);
  }
}
