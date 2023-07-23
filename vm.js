import ivm from "isolated-vm";
import workerpool from "workerpool";
import { inspect } from "util";

const debug = process.env.DEBUG === "true";
const consoleLog = (...args) => {
  debug && console.log(...args);
};

const run = async (code) => {
  consoleLog('worker received: %o', code);
  const isolate = new ivm.Isolate({ memoryLimit: 128 });

  const context = isolate.createContextSync();

  const jail = context.global;
  jail.setSync("global", jail.derefInto());

  let stdout = "";
  jail.setSync("log", function (...args) {
    consoleLog("log received:", args);
    stdout += args.join(" ") + "\n";
  });

  try {
    const result = await context.eval(code, { timeout: 5000 });
    consoleLog("result:", result);
    consoleLog("stdout:", stdout);
    return { result: inspect(result, { depth: null, maxArrayLength: null }), stdout };
  } catch (e) {
    consoleLog("error:", e);
    return { result: Error.prototype.toString.call(e), stdout };
  }
};

workerpool.worker({ run });