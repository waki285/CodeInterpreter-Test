import { intro, isCancel, spinner, text } from "@clack/prompts";
import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";
import workerpool from "workerpool";
import path from "node:path";
import { fileURLToPath } from "node:url";
dotenv.config();

const debug = process.env.DEBUG === "true";
const consoleLog = (...args) => {
  debug && console.log(...args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = workerpool.pool(__dirname + "/vm.js");

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

/** @type {import("openai").ChatCompletionFunctions[]} */
const functions = [
  {
    name: "javascript",
    description: "A function that runs javascript code. The result of the last execution is returned. You can use log() instead of console.log(). Useful for calculating, etc.",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code to run."
        },
        minified: {
          type: "boolean",
        }
      },
      required: ["code", "minified"]
    }
  }
]

const isParseableJSON = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

intro(`Code Interpreter test`);

const messages = [
  { role: "system", content: "You are a helpful assistant." },
];

while (true) {
  const prompt = await text({
    message: `Enter prompt: `,
    validate(value) {
      if (value.length < 1) {
        return `Prompt cannot be empty`;
      }
    }
  });
  if (isCancel(prompt)) {
    break;
  }
  let s = spinner();
  s.start("Requesting to OpenAI API...");
  messages.push({ role: "user", content: prompt });
  const { data: result } = await openai.createChatCompletion({
    model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
    messages,
    functions
  });
  const message = result.choices[0].message;
  consoleLog(message);
  consoleLog("\n\n\n\n");
  let lastMessage = message;
  while (lastMessage.function_call) {
    const arg = lastMessage.function_call.arguments;
    if (!isParseableJSON(arg)) {
      s.stop();
      console.error(`Error(Cannot parseable JSON): ${arg}\n\n`);
      messages.pop();
      break;
    }
    const { code } = JSON.parse(arg);
    if (!code) {
      s.stop();
      console.error(`Error(Code Not Found): ${arg}\n\n`);
      messages.pop();
      break;
    }
    s.stop();
    s = spinner();
    s.start("Running code...");
    const { result: lastResult, stdout } = await pool.exec("run", [code]);
    messages.push({
      role: "function",
      name: lastMessage.function_call.name,
      content: JSON.stringify({ result: lastResult, stdout })
    });
    const { data: result2 } = await openai.createChatCompletion({
      model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
      messages,
      functions
    });
    lastMessage = result2.choices[0].message;
    consoleLog(lastMessage);
    console.log(`${lastMessage.content}`);
    if (lastMessage.function_call) {
      messages.push({
        role: "function",
        function_call: lastMessage.function_call,
        content: lastMessage.content
      });
    } else {
      messages.push({ role: "assistant", content: lastMessage.content });
    }
  }
  s.stop();
  console.log(`${lastMessage.content}`);
  messages.push({ role: "assistant", content: lastMessage.content });
}
process.exit(0);