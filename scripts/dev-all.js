const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const npx = isWindows ? "npx.cmd" : "npx";
const root = path.resolve(__dirname, "..");
const backend = path.join(root, "backend");
const n8nPort = Number(process.env.N8N_PORT || 5678);
const expoPort = Number(process.env.EXPO_PORT || 8081);
const expoOffline = String(process.env.EXPO_OFFLINE || "1") !== "0";
const whisperModelSize = process.env.WHISPER_MODEL_SIZE || "small";

function canRun(command, args = []) {
  try {
    const probe = spawnSync(command, [...args, "--version"], {
      stdio: "ignore",
      shell: false,
    });

    return !probe.error && probe.status === 0;
  } catch {
    return false;
  }
}

function resolvePythonRuntime() {
  const configured = process.env.PYTHON_CMD || process.env.PYTHON_PATH;
  const candidates = [];

  if (configured) {
    candidates.push({ command: configured, args: [] });
  }

  if (isWindows) {
    candidates.push(
      { command: "python", args: [] },
      { command: "py", args: ["-3"] },
      { command: "D:\\python\\python.exe", args: [] },
      {
        command: path.join(
          process.env.LOCALAPPDATA || "",
          "Programs",
          "Python",
          "Python313",
          "python.exe",
        ),
        args: [],
      },
    );
  } else {
    candidates.push(
      { command: "python3", args: [] },
      { command: "python", args: [] },
    );
  }

  for (const candidate of candidates) {
    if (!candidate.command) {
      continue;
    }

    const isAbsolutePath = path.isAbsolute(candidate.command);
    if (isAbsolutePath && !fs.existsSync(candidate.command)) {
      continue;
    }

    if (canRun(candidate.command, candidate.args)) {
      return candidate;
    }
  }

  throw new Error(
    "Python runtime bulunamadi. Lutfen PYTHON_CMD ortamini ayarlayin (ornek: D:\\python\\python.exe).",
  );
}

let pythonRuntime = null;

try {
  pythonRuntime = resolvePythonRuntime();
} catch (error) {
  console.warn(`[fastapi] ${error.message}`);
  console.warn(
    "[fastapi] FastAPI baslatilamadi; text/backend calismaya devam edecek.",
  );
}

const processes = [
  {
    name: "n8n",
    command: npx,
    args: ["--yes", "n8n", "start"],
    cwd: root,
    port: n8nPort,
    url: `http://localhost:${n8nPort}`,
    env: {
      N8N_PORT: String(n8nPort),
    },
  },
  {
    name: "expo",
    command: npm,
    args: [
      "run",
      "start",
      "--",
      "--port",
      String(expoPort),
      ...(expoOffline ? ["--offline"] : []),
    ],
    cwd: root,
    port: expoPort,
    url: `http://localhost:${expoPort}`,
    stdio: "inherit",
  },
  ...(pythonRuntime
    ? [
        {
          name: "fastapi",
          command: pythonRuntime.command,
          args: [
            ...pythonRuntime.args,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
          ],
          cwd: backend,
          port: 8000,
          waitForPortReady: true,
          startupTimeoutMs: Number(
            process.env.FASTAPI_STARTUP_TIMEOUT_MS || 180000,
          ),
          env: {
            USE_CUDA: "0",
            WHISPER_DEVICE: "cpu",
            WHISPER_COMPUTE_TYPE: process.env.WHISPER_COMPUTE_TYPE || "float32",
            WHISPER_MODEL_SIZE: whisperModelSize,
            WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE || "tr",
            WHISPER_BEAM_SIZE: process.env.WHISPER_BEAM_SIZE || "10",
            WHISPER_VAD_FILTER: process.env.WHISPER_VAD_FILTER || "0",
            WHISPER_VAD_MIN_SILENCE_MS:
              process.env.WHISPER_VAD_MIN_SILENCE_MS || "120",
            WHISPER_VAD_SPEECH_PAD_MS:
              process.env.WHISPER_VAD_SPEECH_PAD_MS || "250",
            WHISPER_ENABLE_AUTO_LANGUAGE_FALLBACK:
              process.env.WHISPER_ENABLE_AUTO_LANGUAGE_FALLBACK || "0",
            WHISPER_EXPECTED_LANGUAGE:
              process.env.WHISPER_EXPECTED_LANGUAGE || "tr",
            WHISPER_CONDITION_ON_PREVIOUS_TEXT:
              process.env.WHISPER_CONDITION_ON_PREVIOUS_TEXT || "0",
            WHISPER_LOG_PROB_THRESHOLD:
              process.env.WHISPER_LOG_PROB_THRESHOLD || "-1.2",
            WHISPER_NO_SPEECH_THRESHOLD:
              process.env.WHISPER_NO_SPEECH_THRESHOLD || "0.5",
            WHISPER_COMPRESSION_RATIO_THRESHOLD:
              process.env.WHISPER_COMPRESSION_RATIO_THRESHOLD || "2.4",
            EMOTION_FUSION_MODE:
              process.env.EMOTION_FUSION_MODE || "highest_confidence",
            N8N_WEBHOOK_URL:
              process.env.N8N_WEBHOOK_URL ||
              `http://127.0.0.1:${n8nPort}/webhook/chat`,
            N8N_WEBHOOK_METHOD: process.env.N8N_WEBHOOK_METHOD || "POST",
            CUDA_VISIBLE_DEVICES: "-1",
            HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
          },
        },
      ]
    : []),
  {
    name: "backend",
    command: "node",
    args: ["server.js"],
    cwd: backend,
    port: 3000,
    env: {
      N8N_WEBHOOK_URL:
        process.env.N8N_WEBHOOK_URL ||
        `http://127.0.0.1:${n8nPort}/webhook/chat`,
      N8N_WEBHOOK_METHOD: process.env.N8N_WEBHOOK_METHOD || "POST",
    },
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

function shouldUseCmdWrapper(command) {
  if (!isWindows) {
    return false;
  }

  const lower = String(command).toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function commandForPlatform(command, args) {
  if (!isWindows || !shouldUseCmdWrapper(command)) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPortOpen(port, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }

    await sleep(250);
  }

  return false;
}

async function startProcess(item) {
  if (item.port && (await isPortOpen(item.port))) {
    console.log(
      `[${item.name}] Port ${item.port} is already in use; assuming it is already running.`,
    );
    if (item.url) {
      console.log(`[${item.name}] Open it manually at ${item.url}`);
    }
    return;
  }

  const runnable = commandForPlatform(item.command, item.args);

  const child = spawn(runnable.command, runnable.args, {
    cwd: item.cwd,
    env: { ...process.env, ...item.env },
    stdio: item.stdio || "pipe",
    shell: false,
  });

  children.push(child);

  if (child.stdout) {
    child.stdout.on("data", (data) => prefix(item.name, data));
  }

  if (child.stderr) {
    child.stderr.on("data", (data) => prefix(item.name, data));
  }

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

  if (item.waitForPortReady && item.port) {
    const isReady = await waitForPortOpen(
      item.port,
      item.startupTimeoutMs || 30000,
    );

    if (!isReady) {
      console.error(
        `[${item.name}] Port ${item.port} expected to be ready but timed out.`,
      );
      stopAll(1);
      return;
    }
  }

  if (item.url) {
    console.log(`[${item.name}] Open it manually at ${item.url}`);
  }
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
