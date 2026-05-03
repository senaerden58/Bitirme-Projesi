const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const python = isWindows ? "python" : "python3";

const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");

const processes = [
  {
    name: "expo",
    command: npm,
    args: ["start"],
    cwd: root,
  },
  {
    name: "fastapi",
    command: python,
    args: ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd: backend,
    port: 8000,
  },
  {
    name: "backend",
    command: "node",
    args: ["server.js"],
    cwd: backend,
    port: 3000,
  },
];

const children = [];
let shuttingDown = false;

function quoteWindows(value) {
  const text = String(value);

  if (/^[A-Za-z0-9._:/=-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function commandForPlatform(command, args) {
  if (!isWindows) {
    return { command, args };
  }

  const commandLine = [command, ...args].map(quoteWindows).join(" ");

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function prefix(name, data) {
  const lines = data.toString().split(/\r?\n/);

  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`[${name}] ${line}`);
    }
  }
}

function stopAll(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log("\nStopping all dev services...");

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(code), 800);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function startProcess(item) {
  if (item.port && (await isPortOpen(item.port))) {
    console.log(`[${item.name}] Port ${item.port} is already in use; assuming it is already running.`);
    return;
  }

  const runnable = commandForPlatform(item.command, item.args);

  const child = spawn(runnable.command, runnable.args, {
    cwd: item.cwd,
    env: process.env,
    shell: false,
  });

  children.push(child);

  child.stdout.on("data", (data) => prefix(item.name, data));
  child.stderr.on("data", (data) => prefix(item.name, data));

  child.on("error", (error) => {
    console.error(`[${item.name}] Failed to start: ${error.message}`);
    stopAll(1);
  });

  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[${item.name}] exited with code ${code}`);
      stopAll(code || 1);
    }
  });
}

async function main() {
  for (const item of processes) {
    await startProcess(item);
  }
}

main().catch((error) => {
  console.error(error);
  stopAll(1);
});

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
