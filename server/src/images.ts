import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  const unreferenced = `
    NOT EXISTS (SELECT 1 FROM products WHERE main_image_id = images.id)
    AND NOT EXISTS (SELECT 1 FROM product_detail_images WHERE image_id = images.id)
    AND NOT EXISTS (SELECT 1 FROM categories WHERE icon_image_id = images.id)
    AND NOT EXISTS (SELECT 1 FROM storefront_banners WHERE background_image_id = images.id)
  `;
  const reserve = db.prepare("INSERT INTO images (id, expires_at) VALUES (?, 0)");
  const extend = db.prepare("UPDATE images SET expires_at = ? WHERE id = ?");
  const expired = db.prepare(`
    SELECT id FROM images WHERE expires_at <= ? AND ${unreferenced} ORDER BY expires_at LIMIT 100
  `);
  const remove = db.prepare("DELETE FROM images WHERE id = ?");
  const claim = db.prepare("UPDATE images SET expires_at = NULL WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)");
  const release = db.prepare(`UPDATE images SET expires_at = ? WHERE id = ? AND ${unreferenced}`);
  const available = db.prepare("SELECT 1 FROM images WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)");

  function filePath(id: string, variant: "full" | "thumbnail") {
    return join(directory, variant === "full" ? `${id}.jpg` : `${id}-thumb.jpg`);
  }

  function urlIfAvailable(id: string, variant: "full" | "thumbnail") {
    try {
      const info = statSync(filePath(id, variant), { throwIfNoEntry: false });
      if (!info?.isFile() || info.size === 0) return null;
      const paths = imagePaths(id);
      return variant === "full" ? paths.imageUrl : paths.thumbnailUrl;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EACCES") return null;
      throw error;
    }
  }

  function cleanup() {
    for (const { id } of expired.all(now()) as { id: string }[]) {
      try {
        rmSync(filePath(id, "full"), { force: true });
        rmSync(filePath(id, "thumbnail"), { force: true });
        remove.run(id);
      } catch (error) {
        console.error("图片清理失败，下次重试。", id, error);
      }
    }
  }

  return {
    cleanup,
    urlIfAvailable,
    claim(id: string, timestamp: number) {
      if (!claim.run(id, timestamp).changes) throw new ApiFailure("IMAGE_NOT_FOUND");
    },
    release(id: string, timestamp: number) {
      release.run(timestamp, id);
    },
    async requireSquareIcon(id: string) {
      if (!available.get(id, now()) || !urlIfAvailable(id, "thumbnail")) throw new ApiFailure("IMAGE_NOT_FOUND");
      let size: { width?: number; height?: number };
      try {
        size = await sharp(filePath(id, "full")).metadata();
      } catch {
        throw new ApiFailure("IMAGE_NOT_FOUND");
      }
      if (!size.width || !size.height) throw new ApiFailure("IMAGE_NOT_FOUND");
      if (size.width !== size.height) {
        throw new ApiFailure("INVALID_REQUEST", { iconImageId: "请上传宽高相等的方形分类图标。" });
      }
    },
    async upload(file: File) {
      const { full, thumbnail } = await compress(file);
      const id = randomUUID();
      reserve.run(id);
      try {
        writeFileSync(filePath(id, "full"), full, { flag: "wx" });
        writeFileSync(filePath(id, "thumbnail"), thumbnail, { flag: "wx" });
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
