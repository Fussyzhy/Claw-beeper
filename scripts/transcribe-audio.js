#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { URL } = require("node:url");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BUNDLED_FFMPEG_DIR = path.join(PROJECT_ROOT, "tools", "ffmpeg", "bin");
const DEFAULT_MODEL = process.env.WHISPER_MODEL || "base";
const DEFAULT_FORMAT = "json";
const DEFAULT_AUTO_DOWNLOAD = parseEnvBoolean(process.env.WHISPER_AUTO_DOWNLOAD, false);
const DEFAULT_REMOVE_WAV = parseEnvBoolean(process.env.WHISPER_REMOVE_WAV_FILE, false);
const DEFAULT_WITH_CUDA = parseEnvBoolean(process.env.WHISPER_WITH_CUDA, false);
const DEFAULT_WORD_TIMESTAMPS = parseEnvBoolean(process.env.WHISPER_WORD_TIMESTAMPS, false);
const DEFAULT_TRANSLATE_TO_ENGLISH = parseEnvBoolean(process.env.WHISPER_TRANSLATE_TO_ENGLISH, false);
const DEFAULT_SPLIT_ON_WORD = parseEnvBoolean(process.env.WHISPER_SPLIT_ON_WORD, false);
const DEFAULT_TIMESTAMPS_LENGTH = parseOptionalNumber(process.env.WHISPER_TIMESTAMPS_LENGTH);

async function main() {
  await configureBundledBinaries();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  validateOptions(options);

  const source = await prepareInput(options.input);

  try {
    const result = await transcribe(source.filePath, options);
    await writeOutput(result, options);
  } finally {
    await source.cleanup();
  }
}

async function configureBundledBinaries() {
  await prependBundledExecutableDir(BUNDLED_FFMPEG_DIR, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
}

function parseArgs(argv) {
  const options = {
    model: DEFAULT_MODEL,
    autoDownloadModel: DEFAULT_AUTO_DOWNLOAD,
    removeWavFileAfterTranscription: DEFAULT_REMOVE_WAV,
    withCuda: DEFAULT_WITH_CUDA,
    wordTimestamps: DEFAULT_WORD_TIMESTAMPS,
    translateToEnglish: DEFAULT_TRANSLATE_TO_ENGLISH,
    splitOnWord: DEFAULT_SPLIT_ON_WORD,
    timestampsLength: DEFAULT_TIMESTAMPS_LENGTH,
    format: DEFAULT_FORMAT,
    output: "",
    verbose: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case "--input":
        options.input = argv[++i];
        break;
      case "--model":
        options.model = argv[++i];
        break;
      case "--auto-download":
        options.autoDownloadModel = true;
        break;
      case "--no-auto-download":
        options.autoDownloadModel = false;
        break;
      case "--remove-wav-file":
        options.removeWavFileAfterTranscription = true;
        break;
      case "--keep-wav-file":
        options.removeWavFileAfterTranscription = false;
        break;
      case "--with-cuda":
        options.withCuda = true;
        break;
      case "--word-timestamps":
        options.wordTimestamps = true;
        break;
      case "--translate-to-english":
        options.translateToEnglish = true;
        break;
      case "--split-on-word":
        options.splitOnWord = true;
        break;
      case "--no-split-on-word":
        options.splitOnWord = false;
        break;
      case "--timestamps-length":
        options.timestampsLength = Number(argv[++i]);
        break;
      case "--format":
        options.format = argv[++i];
        break;
      case "--output":
        options.output = argv[++i];
        break;
      case "--verbose":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function prependBundledExecutableDir(directory, executableName) {
  const executablePath = path.join(directory, executableName);

  try {
    await fs.access(executablePath);
  } catch {
    return;
  }

  const { key: pathKey, value: currentValue } = resolvePathEnvEntry();
  const delimiter = resolvePathDelimiter(currentValue);
  const segments = currentValue.split(delimiter).filter(Boolean);

  if (!segments.some((segment) => samePath(segment, directory))) {
    const nextValue = [directory, ...segments].join(delimiter);
    removeDuplicatePathKeys(pathKey);
    process.env[pathKey] = nextValue;
  }
}

function validateOptions(options) {
  if (!options.input) {
    throw new Error("Missing required argument: --input");
  }

  if (!["json", "text"].includes(options.format)) {
    throw new Error("--format must be either 'json' or 'text'.");
  }

  if (
    options.timestampsLength !== null &&
    (!Number.isFinite(options.timestampsLength) || options.timestampsLength <= 0)
  ) {
    throw new Error("--timestamps-length must be a positive number.");
  }
}

async function prepareInput(input) {
  if (isHttpUrl(input)) {
    return downloadInputFile(input);
  }

  const filePath = path.resolve(input);
  await fs.access(filePath);

  return {
    filePath,
    sourceName: path.basename(filePath),
    cleanup: async () => {},
  };
}

async function downloadInputFile(input) {
  const response = await fetch(input);

  if (!response.ok) {
    throw new Error(`Failed to download input audio: ${response.status} ${response.statusText}`);
  }

  const url = new URL(input);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-beeper-voice-"));
  const extension = extensionFromSource(
    path.extname(url.pathname),
    response.headers.get("content-type") || "",
  );
  const fileName = `input${extension}`;
  const filePath = path.join(tempDir, fileName);
  const arrayBuffer = await response.arrayBuffer();

  await fs.writeFile(filePath, Buffer.from(arrayBuffer));

  return {
    filePath,
    sourceName: path.basename(url.pathname) || fileName,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function transcribe(filePath, options) {
  const nodewhisper = await loadNodeWhisper();
  const packageOptions = buildNodeWhisperOptions(options);
  const raw = await nodewhisper(filePath, packageOptions);

  return normalizeResult(raw, {
    provider: "nodejs-whisper",
    model: options.model,
    sourcePath: filePath,
    sourceName: path.basename(filePath),
  });
}

async function loadNodeWhisper() {
  let moduleNamespace;

  try {
    moduleNamespace = await import("nodejs-whisper");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "Failed to load 'nodejs-whisper'. Install it with `npm i nodejs-whisper` and " +
        "make sure its native build prerequisites are available. " +
        `Original error: ${message}`,
    );
  }

  const nodewhisper =
    typeof moduleNamespace.nodewhisper === "function"
      ? moduleNamespace.nodewhisper
      : typeof moduleNamespace.default === "function"
        ? moduleNamespace.default
        : null;

  if (!nodewhisper) {
    throw new Error("The 'nodejs-whisper' package did not expose a usable transcription function.");
  }

  return nodewhisper;
}

function buildNodeWhisperOptions(options) {
  const packageOptions = {
    modelName: options.model,
    removeWavFileAfterTranscription: options.removeWavFileAfterTranscription,
    withCuda: options.withCuda,
    logger: buildLogger(options.verbose),
    whisperOptions: {
      outputInCsv: false,
      outputInJson: false,
      outputInJsonFull: false,
      outputInLrc: false,
      outputInSrt: false,
      outputInText: false,
      outputInVtt: false,
      outputInWords: false,
      translateToEnglish: options.translateToEnglish,
      wordTimestamps: options.wordTimestamps,
      splitOnWord: options.splitOnWord,
    },
  };

  if (options.autoDownloadModel) {
    packageOptions.autoDownloadModelName = options.model;
  }

  if (options.timestampsLength !== null) {
    packageOptions.whisperOptions.timestamps_length = options.timestampsLength;
  }

  return packageOptions;
}

function buildLogger(verbose) {
  if (verbose) {
    return console;
  }

  return {
    debug() {},
    log() {},
    info() {},
    warn() {},
    error: console.error.bind(console),
  };
}

function normalizeResult(raw, metadata) {
  return {
    ...metadata,
    text: extractTranscriptText(raw),
    raw,
  };
}

function extractTranscriptText(raw) {
  if (typeof raw === "string") {
    return raw.trim();
  }

  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (Array.isArray(item)) {
          return String(item[2] || item[1] || item[0] || "");
        }

        if (item && typeof item === "object") {
          if (typeof item.text === "string") {
            return item.text;
          }

          if (typeof item.speech === "string") {
            return item.speech;
          }
        }

        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  if (raw && typeof raw === "object") {
    if (typeof raw.text === "string") {
      return raw.text.trim();
    }

    if (typeof raw.transcript === "string") {
      return raw.transcript.trim();
    }
  }

  return "";
}

async function writeOutput(result, options) {
  if (options.output) {
    const outputBody =
      options.format === "text"
        ? `${result.text || ""}\n`
        : `${JSON.stringify(result, null, 2)}\n`;

    await fs.writeFile(path.resolve(options.output), outputBody, "utf8");
    return;
  }

  if (options.format === "text") {
    process.stdout.write(`${result.text || ""}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function extensionFromSource(pathExtension, contentType) {
  const normalizedExtension = (pathExtension || "").toLowerCase();

  if (normalizedExtension) {
    return normalizedExtension;
  }

  const normalizedContentType = contentType.toLowerCase();

  switch (normalizedContentType) {
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
      return ".m4a";
    case "audio/aac":
      return ".aac";
    case "audio/ogg":
      return ".ogg";
    case "audio/webm":
      return ".webm";
    default:
      return ".bin";
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function resolvePathEnvEntry() {
  const candidates = Object.keys(process.env)
    .filter((envKey) => envKey.toLowerCase() === "path")
    .map((envKey) => ({ key: envKey, value: process.env[envKey] || "" }));

  if (candidates.length === 0) {
    return { key: "PATH", value: "" };
  }

  if (process.platform === "win32") {
    const windowsStyleCandidate =
      candidates.find((candidate) => candidate.key === "Path" && candidate.value.includes(";")) ||
      candidates.find((candidate) => candidate.value.includes(";")) ||
      candidates.find((candidate) => /^[A-Za-z]:[\\/]/.test(candidate.value));

    if (windowsStyleCandidate) {
      return windowsStyleCandidate;
    }
  }

  return candidates[0];
}

function resolvePathDelimiter(currentValue) {
  if (process.platform === "win32" && currentValue.includes(";")) {
    return ";";
  }

  if (currentValue.includes(":")) {
    return ":";
  }

  return path.delimiter;
}

function removeDuplicatePathKeys(keepKey) {
  for (const envKey of Object.keys(process.env)) {
    if (envKey !== keepKey && envKey.toLowerCase() === "path") {
      delete process.env[envKey];
    }
  }
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left).replace(/[\\/]+$/, "");
  const normalizedRight = path.resolve(right).replace(/[\\/]+$/, "");

  if (process.platform === "win32") {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }

  return normalizedLeft === normalizedRight;
}

function parseEnvBoolean(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseOptionalNumber(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function printHelp() {
  const helpText = `
Usage:
  node scripts/transcribe-audio.js --input <file-or-url> [options]

Required:
  --input <path|url>           Local audio file path or remote URL

Options:
  --model <name>               Whisper model name. Default: ${DEFAULT_MODEL}
  --auto-download              Auto-download the selected model if missing
  --no-auto-download           Do not auto-download the model
  --remove-wav-file            Remove intermediate WAV files after transcription
  --keep-wav-file              Keep intermediate WAV files after transcription
  --with-cuda                  Ask nodejs-whisper to use CUDA when available
  --word-timestamps            Request word-level timestamps
  --translate-to-english       Translate source audio to English
  --split-on-word              Split on words instead of tokens
  --no-split-on-word           Disable split-on-word mode
  --timestamps-length <n>      Dialogue length per timestamp pair
  --format <json|text>         Local output format. Default: ${DEFAULT_FORMAT}
  --output <path>              Write the result to a file instead of stdout
  --verbose                    Print nodejs-whisper debug logs
  --help, -h                   Show this help

Environment variables:
  WHISPER_MODEL
  WHISPER_AUTO_DOWNLOAD
  WHISPER_REMOVE_WAV_FILE
  WHISPER_WITH_CUDA
  WHISPER_WORD_TIMESTAMPS
  WHISPER_TRANSLATE_TO_ENGLISH
  WHISPER_SPLIT_ON_WORD
  WHISPER_TIMESTAMPS_LENGTH

Prerequisites:
  npm i nodejs-whisper
  Provide the selected ggml model under node_modules/nodejs-whisper/cpp/whisper.cpp/models
  Provide whisper-cli.exe under node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin or install a build toolchain
  Keep bundled ffmpeg under tools/ffmpeg/bin when you want project-local media conversion
`.trim();

  process.stdout.write(`${helpText}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
