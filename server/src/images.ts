import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { AdminImage } from "../../shared/index.ts";
import { ApiFailure } from "./errors.ts";

const pendingLifetime = 24 * 60 * 60 * 1000;
const mimeByFormat: Readonly<Record<string, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

sharp.cache(false);
sharp.concurrency(1);

export function imagePaths(id: string) {
  return { imageUrl: `/uploads/${id}.jpg`, thumbnailUrl: `/uploads/${id}-thumb.jpg` };
}

export function adminImage(id: string): AdminImage {
  return { id, ...imagePaths(id) };
}

function isAnimatedPng(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + bytes.readUInt32BE(offset);
  }
  return false;
}

async function compress(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const source = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning" });
    const { format, pages, loop, width, height } = await source.metadata();
    if (!format || mimeByFormat[format] !== file.type || !width || !height ||
        (pages ?? 1) > 1 || loop !== undefined || (format === "png" && isAnimatedPng(bytes))) {
      throw new ApiFailure("INVALID_IMAGE");
    }

    const full = await source
      .autoOrient()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const thumbnail = await sharp(full)
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { full, thumbnail };
  } catch {
    throw new ApiFailure("INVALID_IMAGE");
  }
}

export function createImages(db: DatabaseSync, directory: string, now: () => number) {
  mkdirSync(directory, { recursive: true });
  const reserve = db.prepare("INSERT INTO images (id, expires_at) VALUES (?, 0)");
  const extend = db.prepare("UPDATE images SET expires_at = ? WHERE id = ?");
  const expired = db.prepare("SELECT id FROM images WHERE expires_at <= ? ORDER BY expires_at LIMIT 100");
  const remove = db.prepare("DELETE FROM images WHERE id = ?");

  function cleanup() {
    for (const { id } of expired.all(now()) as { id: string }[]) {
      try {
        rmSync(join(directory, `${id}.jpg`), { force: true });
        rmSync(join(directory, `${id}-thumb.jpg`), { force: true });
        remove.run(id);
      } catch (error) {
        console.error("商品图片清理失败，下次重试。", id, error);
      }
    }
  }

  return {
    cleanup,
    async upload(file: File) {
      const { full, thumbnail } = await compress(file);
      const id = randomUUID();
      reserve.run(id);
      try {
        writeFileSync(join(directory, `${id}.jpg`), full, { flag: "wx" });
        writeFileSync(join(directory, `${id}-thumb.jpg`), thumbnail, { flag: "wx" });
        extend.run(now() + pendingLifetime, id);
      } catch (error) {
        cleanup();
        throw error;
      }
      return adminImage(id);
    },
    async read(filename: string) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-thumb)?\.jpg$/.test(filename)) return null;
      try {
        const file = await open(join(directory, filename), "r");
        return file.readableWebStream({ autoClose: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
