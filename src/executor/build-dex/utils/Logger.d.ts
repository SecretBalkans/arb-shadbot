export declare class Logger {
    private readonly label;
    private readonly errors;
    debugOnce(msg: string, ...args: any[]): void;
    private parseError;
    constructor(label: string);
    log(...args: any[]): void;
    line(str: string, append?: boolean): void;
    clearLine(): void;
    endLine(str?: string): void;
    error(...args: any[]): void;
    info(...args: any[]): void;
    time(label: any): void;
    timeEnd(label: any, ...args: any[]): void;
    debug(...args: any[]): void;
}
