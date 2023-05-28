"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const lodash_1 = __importDefault(require("lodash"));
function getTS() {
    return (0, moment_timezone_1.default)().tz('Europe/Sofia').format('DD-MM-YY HH:mm:ss');
}
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
class Logger {
    debugOnce(msg, ...args) {
        if (!this.errors[msg]) {
            this.debug(msg, ...args);
            this.errors[msg] = true;
        }
    }
    constructor(label) {
        this.errors = {};
        this.parseError = (errOrAny) => {
            return (errOrAny === null || errOrAny === void 0 ? void 0 : errOrAny.toJSON) ? lodash_1.default.pick(errOrAny.toJSON(), ['message', 'stack', 'config.url', 'config.data'])
                : (errOrAny === null || errOrAny === void 0 ? void 0 : errOrAny.message) ? lodash_1.default.pick(errOrAny, ['message', 'stack'])
                    : errOrAny;
        };
        this.label = `[${label}]`;
    }
    log(...args) {
        console.log.apply(console, [getTS(), this.label, ...args]);
    }
    line(str, append = false) {
        if (!append) {
            this.clearLine();
        }
        process.stdout.write(`${append ? '' : `${(getTS())} ${this.label} `}${str}`, 'utf-8');
    }
    clearLine() {
        //process.stdout.clearLine(0);
        //process.stdout.cursorTo(0);
    }
    endLine(str = '') {
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
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map