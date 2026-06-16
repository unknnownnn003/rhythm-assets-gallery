import { execFileSync } from "node:child_process";
import path from "node:path";

const SAFE_TEMPLATE_VALUES = new Map([
  ["DEPLOY_HOST", "your-server.example.com"],
  ["DEPLOY_USER", "deploy"],
  ["DEPLOY_PORT", "22"],
  ["DEPLOY_PATH", "/www/wwwroot/example.com"],
  ["DEPLOY_SITE_URL", "https://example.com"],
  ["DEPLOY_REMOTE_WORK_PATH", "/www/wwwroot/example.com.build-work"],
  ["DEPLOY_MIN_FREE_MB", "2048"],
  ["DEPLOY_USE_SSH_CONFIG", "false"],
  ["DEPLOY_PROGRESS_POLL_SECONDS", "3"],
  ["DEPLOY_REMOTE_SHARP_CONCURRENCY", "1"],
  ["DEPLOY_REMOTE_SHARP_CACHE_MEMORY_MB", "64"],
]);

const REQUIRED_TEMPLATE_COMMENTS = [
  "# DEPLOY_REMOTE_ASSET_ROOT=/media/webpan/your-assets",
  "# DEPLOY_IDENTITY_FILE=C:\\Users\\<your-user>\\.ssh\\id_ed25519",
];

const PRIVATE_KEY_PATTERNS = [
  /-----BEGIN OPENSSH PRIVATE KEY-----/,
  /-----BEGIN RSA PRIVATE KEY-----/,
  /-----BEGIN DSA PRIVATE KEY-----/,
  /-----BEGIN EC PRIVATE KEY-----/,
  /-----BEGIN PRIVATE KEY-----/,
];
const BLOCKED_ADDRESS_PATTERNS = [
  /\b127\.0\.0\.1\b/,
  /\b0\.0\.0\.0\b/,
  /\bDEPLOY_HOST=(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/,
  /\bhttps?:\/\/(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?::\d+)?\b/,
];

const PRIVATE_KEY_BASENAME = /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i;
const CERTIFICATE_ARCHIVE_BASENAME = /.+\.(pem|p12|pfx)$/i;
const TEMPLATE_DOC_PATHS = new Set([".deploy.env.example", "README.md"]);
const README_ALLOWED_VALUES = new Map([
  ["DEPLOY_HOST", "your-server.example.com"],
  ["DEPLOY_USER", "deploy"],
  ["DEPLOY_PORT", "22"],
  ["DEPLOY_PATH", "/www/wwwroot/example.com"],
  ["DEPLOY_SITE_URL", "https://example.com"],
  ["DEPLOY_REMOTE_WORK_PATH", "/www/wwwroot/example.com.build-work"],
]);

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function getStagedPaths() {
  const output = runGit(
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "utf8" }
  );

  return output.split("\0").filter(Boolean);
}

function readStagedBuffer(filePath) {
  return runGit(["show", `:${filePath}`], { encoding: "buffer" });
}

function normalizeText(buffer) {
  return buffer.toString("utf8").replace(/\r\n/g, "\n");
}

function parseKeyValueLines(content) {
  const values = new Map();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  return values;
}

function validateTemplateValues(filePath, content, findings) {
  const values = parseKeyValueLines(content);
  const expectedValues =
    filePath === "README.md" ? README_ALLOWED_VALUES : SAFE_TEMPLATE_VALUES;

  for (const [key, safeValue] of expectedValues) {
    if (!values.has(key)) {
      continue;
    }

    const actualValue = values.get(key);
    if (actualValue !== safeValue) {
      findings.push(
        `${filePath}: ${key} must stay as the safe placeholder "${safeValue}", found "${actualValue}".`
      );
    }
  }

  if (filePath === ".deploy.env.example" && values.has("DEPLOY_IDENTITY_FILE")) {
    findings.push(
      `${filePath}: DEPLOY_IDENTITY_FILE must stay commented out in committed templates and docs.`
    );
  }

  if (filePath === ".deploy.env.example") {
    for (const requiredLine of REQUIRED_TEMPLATE_COMMENTS) {
      if (!content.includes(requiredLine)) {
        findings.push(
          `${filePath}: missing required safe placeholder line "${requiredLine}".`
        );
      }
    }
  }
}

function main() {
  const stagedPaths = getStagedPaths();
  if (stagedPaths.length === 0) {
    return;
  }

  const findings = [];

  for (const filePath of stagedPaths) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const baseName = path.posix.basename(normalizedPath);

    if (normalizedPath === ".deploy.env" || normalizedPath.endsWith("/.deploy.env")) {
      findings.push(`${filePath}: .deploy.env must never be committed.`);
      continue;
    }

    if (
      PRIVATE_KEY_BASENAME.test(baseName) ||
      CERTIFICATE_ARCHIVE_BASENAME.test(baseName)
    ) {
      findings.push(`${filePath}: looks like a private key or certificate archive.`);
      continue;
    }

    const buffer = readStagedBuffer(filePath);
    const looksBinary = buffer.includes(0);
    if (looksBinary) {
      continue;
    }

    const content = normalizeText(buffer);

    const skipPrivateKeyContentCheck =
      normalizedPath === "scripts/check-sensitive-staged.mjs";

    for (const pattern of PRIVATE_KEY_PATTERNS) {
      if (!skipPrivateKeyContentCheck && pattern.test(content)) {
        findings.push(`${filePath}: contains private key material.`);
        break;
      }
    }

    for (const pattern of BLOCKED_ADDRESS_PATTERNS) {
      if (pattern.test(content)) {
        findings.push(`${filePath}: contains a blocked literal IP address or IP-based endpoint.`);
        break;
      }
    }

    if (TEMPLATE_DOC_PATHS.has(normalizedPath)) {
      validateTemplateValues(normalizedPath, content, findings);
    }
  }

  if (findings.length === 0) {
    return;
  }

  console.error("Sensitive commit guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  console.error("");
  console.error("Move real deployment values into .deploy.env and keep committed templates as placeholders.");
  process.exit(1);
}

main();
