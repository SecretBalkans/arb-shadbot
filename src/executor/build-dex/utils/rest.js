"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTimeout = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
function fetchTimeout(url, options = {}, timeout = 25000) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!url || url.startsWith('undefined')) {
            throw new Error(`Url not resolved - ${url}`);
        }
        let resolved = false;
        const response = yield Promise.race([
            (0, node_fetch_1.default)(url, Object.assign({}, options)).then((result) => !resolved && (resolved = true) && result).catch(err => {
                console.error(err, url);
            }),
            new Promise((_, reject) => setTimeout(() => !resolved && (resolved = true) && reject(new Error(`url timeout - ${url}`)), timeout)),
        ]);
        let text;
        try {
            text = yield response.text();
            return JSON.parse(text);
        }
        catch (err) {
            throw text ? new Error(`${text} / ${url}`) : err;
        }
    });
}
exports.fetchTimeout = fetchTimeout;
//# sourceMappingURL=rest.js.map