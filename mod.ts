import { format } from "node:util";

type Debug = (...args: unknown[]) => void;

type Option = {
  log?: Debug;
  extend?: Debug;
};

type FormatterOptions = {};
type Formatter = (val: unknown, options: FormatterOptions) => string;

const formatters: Record<string, Formatter> = {
  o(v) {
    return Deno.inspect(v).split("\n").map((s) => s.trim()).join(" ");
  },
  O(v) {
    return Deno.inspect(v);
  },
};

let namespace: string | undefined;
const names: string[] = [];
const skips: string[] = [];

export default function createDebug(
  name: string,
  { log }: Option = {},
): Debug {
  let prevTime: number | undefined;
  const useColors = getUseColors();
  const color = selectColor(name);

  function debug(...args: unknown[]) {
    if (!_enabled(name)) return;

    const curr = Number(new Date());
    const ms = curr - (prevTime ?? curr);
    prevTime = curr;

    let message;
    if (args[0] instanceof Error) {
      message = args[0].stack || args[0].message;
    } else if (typeof args[0] === "string") {
      message = args[0];
    } else {
      message = "%O";
      args.unshift(message);
    }

    let index = 0;
    args[0] = message.replace(/%([a-zA-Z%])/g, (match, format) => {
      if (match === "%%") return "%";

      index++;
      const formatter = formatters[format];
      if (typeof formatter === "function") {
        const v = args[index];
        match = formatter(v, {});
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    formatArgs(args as [string, ...unknown[]], {
      name,
      useColors,
      color,
      diff: ms,
    });

    (log ?? denoLog)(...args);
  }

  map.set(debug, name);
  _enable(Deno.env.get("DEBUG"));

  return debug;
}

const map = new WeakMap<Debug, string>();

export function enable(name: Debug | string | undefined): void {
  if (typeof name !== "function") {
    if (name) {
      Deno.env.set("DEBUG", name);
    } else {
      Deno.env.delete("DEBUG");
    }
    return _enable(name);
  }
  const ns = map.get(name);
  if (ns) names.push(ns);
}

function _enable(name: string | undefined) {
  namespace = name;
  names.length = 0;
  skips.length = 0;
  const split = (name ?? "")
    .trim()
    .replace(/\s+/g, ",")
    .split(",")
    .filter(Boolean);
  for (const ns of split) {
    if (ns[0] === "-") {
      skips.push(ns.slice(1));
    } else {
      names.push(ns);
    }
  }
}

export function enabled(name: Debug | string): boolean {
  if (typeof name === "function") {
    const ns = map.get(name);
    if (ns === undefined) return false;
    name = ns;
  }
  return _enabled(name);
}

function _enabled(name: string) {
  for (const skip of skips) {
    if (matchesTemplate(name, skip)) return false;
  }
  for (const ns of names) {
    if (matchesTemplate(name, ns)) return true;
  }
  return false;
}

function matchesTemplate(search: string, template: string) {
  let searchIndex = 0;
  let tempIndex = 0;
  let starIndex = -1;
  let matchIndex = 0;
  const searchLen = search.length;
  const tempLen = template.length;

  while (searchIndex < searchLen) {
    if (
      tempIndex < tempLen &&
      (template[tempIndex] === search[searchIndex] ||
        template[tempIndex] === "*")
    ) {
      if (template[tempIndex] === "*") {
        starIndex = tempIndex;
        matchIndex = searchIndex;
        tempIndex++;
      } else {
        searchIndex++;
        tempIndex++;
      }
    } else if (starIndex !== -1) {
      tempIndex = starIndex + 1;
      matchIndex++;
      searchIndex = matchIndex;
    } else {
      return false;
    }
  }
  while (tempIndex < tempLen && template[tempIndex] === "*") {
    tempIndex++;
  }

  return tempIndex === tempLen;
}

const colors = [6, 2, 3, 4, 5, 1];
function selectColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

const envs: Record<string, boolean | number | null | undefined> = {};
const yes = /^(yes|on|true|enabled)$/i;
const no = /^(no|off|false|disabled)$/i;
function getEnv(key: string) {
  if (key in envs) return envs[key];
  let res;
  const env = Deno.env.get(key);
  if (env === undefined) res = env;
  else if (yes.test(env)) res = true;
  else if (no.test(env)) res = false;
  else if (env === "null") res = null;
  else res = Number(env);
  envs[key] = res;
  return res;
}

function getUseColors() {
  const colors = getEnv("DEBUG_COLORS");
  return colors === undefined ? Deno.stderr.isTerminal() : Boolean(colors);
}

type FormatArgsOptions = {
  name: string;
  useColors: boolean;
  color: number;
  diff: number;
};

function formatArgs(
  args: [string, ...unknown[]],
  { name, useColors, color, diff }: FormatArgsOptions,
) {
  if (useColors) {
    const colorCode = `\u001B[3${color < 8 ? color : `8:5;${color}`}`;
    const prefix = `  ${colorCode};1m${name} \u001B[0m`;
    args[0] = prefix + args[0].split("\n").join(`\n${prefix}`);
    args.push(`${colorCode}m+${diff}\u001B[0m`);
  } else {
    args[0] = `${getDate()}${name} ${args[0]}`;
  }
}

function getDate() {
  if (getEnv("DEBUG_HIDE_DATE")) return "";
  return `${new Date().toISOString()} `;
}

const encoder = new TextEncoder();
function denoLog(...args: unknown[]) {
  return Deno.stderr.write(encoder.encode(`${format(...args)}\n`));
}
