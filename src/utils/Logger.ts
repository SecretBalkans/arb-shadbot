import moment from 'moment-timezone';
import _ from 'lodash';
import fs from "fs";
import path from "path";

function getTS() {
  return moment().tz('Europe/Sofia').format('DD-MM-YY HH:mm:ss');
}

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export class Logger {
  private readonly label: string;
  private readonly errors = {};
  private readonly cachedErrors = {};
  private cachedErrorsBuffer: string[] = [];
  private readonly cacheFileKey: string;

  constructor(label: string, private readonly hasCache = false) {
    this.label = `[${label}]`;
    if (hasCache) {
      this.cacheFileKey = path.resolve(path.join(__dirname, `cached_errors/${label}.txt`));
      try {
        const cachedErrorsKeys = JSON.parse(fs.readFileSync(this.cacheFileKey, {encoding: 'utf8'}));
        this.cachedErrors = _.zipObject(cachedErrorsKeys, _.times(cachedErrorsKeys.length, _.constant(true)));
      } catch (e) {
        // do nothing as file doesn't exist
      }
      setInterval(() => {
        if (this.cachedErrorsBuffer.length > 0) {
          this.writeCached()
        }
      }, 1500)
    }
  }

  writeCached() {
    if (this.hasCache) {
      try {
        fs.writeFileSync(this.cacheFileKey, JSON.stringify(_.uniq(this.cachedErrorsBuffer.concat(Object.keys(this.cachedErrors))), null, 2), {encoding: 'utf-8'});
        this.cachedErrorsBuffer = [];
      } catch (err) {
        this.debugOnce('Error writing cached logs'.red)
      }
    }
  }

  public debugOnce(msg: string, ...args) {
    if (!this.errors[msg]) {
      this.debug(msg, ...args);
      this.errors[msg] = true;
    }
  }

  public debugCachedOnce(msg: string, ...args) {
    if (!this.hasCache) {
      return this.debug('Cache not enabled for logger.')
    }
    if (!this.cachedErrors[msg]) {
      this.debug(msg.magenta, ...args);
      this.cachedErrors[msg] = true;
      this.cachedErrorsBuffer.push(msg);
    }
  }

  private parseError = (errOrAny) => {
    return errOrAny?.toJSON ? _.pick(errOrAny.toJSON(), ['message', 'stack', 'config.url', 'config.data'])
      : errOrAny?.message ? _.pick(errOrAny, ['message', 'stack'])
        : errOrAny;
  };

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
