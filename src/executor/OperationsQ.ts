import {ArbOperation} from "./aArbOperation";
import {SwapMoveOperationsType} from "./types";

export default class OperationsQ {
  constructor(public readonly operations: ArbOperation<SwapMoveOperationsType>[]) {
  }

  public async executeQ() {

  }

  public toString() {
    return this.operations.map(op => `${op.type()}.${op.id()}`);
  }
}
