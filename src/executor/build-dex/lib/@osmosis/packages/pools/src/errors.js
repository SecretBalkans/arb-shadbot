"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotEnoughLiquidityError = exports.NoPoolsError = void 0;
class NoPoolsError extends Error {
    constructor() {
        super("There are no pools to proceed");
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, NoPoolsError.prototype);
    }
}
exports.NoPoolsError = NoPoolsError;
class NotEnoughLiquidityError extends Error {
    constructor() {
        super("Not enough liquidity");
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, NotEnoughLiquidityError.prototype);
    }
}
exports.NotEnoughLiquidityError = NotEnoughLiquidityError;
//# sourceMappingURL=errors.js.map