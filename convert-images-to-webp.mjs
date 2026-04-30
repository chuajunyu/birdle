#!/usr/bin/env node

import { readdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const sourceDir = path.resolve(rootDir, process.argv[2] ?? "public/images");
const qualityArg = process.argv[3];
const overwrite = process.argv.includes("--overwrite");
const quality = Number.isFinite(Number(qualityArg)) ? Number(qualityArg) : 80;
const supportedExtensions = new Set([".jpg", ".jpeg", ".png"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (supportedExtensions.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function convertToWebp(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const process = spawn("cwebp", ["-q", String(quality), inputPath, "-o", outputPath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `cwebp failed for ${inputPath}`));
    });
  });
}

async function run() {
  const sourceStats = await stat(sourceDir).catch(() => null);
  if (!sourceStats || !sourceStats.isDirectory()) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  const files = await walk(sourceDir);
  if (files.length === 0) {
    console.log("No .jpg/.jpeg/.png files found.");
    return;
  }

  let converted = 0;
  let skipped = 0;

  for (const inputPath of files) {
    const outputPath = inputPath.replace(/\.(jpe?g|png)$/i, ".webp");

    if (!overwrite && (await exists(outputPath))) {
      skipped += 1;
      continue;
    }

    await convertToWebp(inputPath, outputPath);
    converted += 1;
    console.log(`Converted: ${path.relative(rootDir, inputPath)} -> ${path.relative(rootDir, outputPath)}`);
  }

  console.log(`Done. Converted: ${converted}, Skipped: ${skipped}, Total: ${files.length}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
