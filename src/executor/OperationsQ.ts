import {ArbOperation} from "./aArbOperation";
import {MoveOperationType} from "./types";

export default class OperationsQ {
  constructor(public readonly operations: ArbOperation<MoveOperationType>[]) {
  }

  public async executeQ() {

  }

  public toString() {
    return this.operations.map(op => `${op.type()}.${op.id()}`);
  }
}
