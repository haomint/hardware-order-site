// 上传前在手机上先把照片缩小并转成 JPEG：
// 一是手机原图常有 5MB 以上，直接传又慢又费流量；
// 二是统一成后端接受的格式（苹果手机的 HEIC 照片在这一步被转换）。

const MAX_EDGE = 1600; // 与后端压缩图的长边上限一致
const QUALITY = 0.86;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 契约规定的单张上限

export class ImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError("这张图片打不开，请换一张试试。"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
}

const ICON_EDGE = 480; // 契约建议的分类图标尺寸

/**
 * 分类图标：从图片中间裁出最大的正方形，缩成 480 × 480 的 JPEG。
 * 契约要求图标是方图，前端裁好再传，店主随手拍的长方形照片也能用。
 */
export async function prepareSquareImage(file: File): Promise<File> {
  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = Math.round((image.naturalWidth - side) / 2);
  const sy = Math.round((image.naturalHeight - side) / 2);
  const edge = Math.min(ICON_EDGE, side);

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("当前浏览器无法处理图片，请换个浏览器再试。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, edge, edge);
  context.drawImage(image, sx, sy, side, side, 0, 0, edge, edge);

  const blob = await toBlob(canvas);
  if (!blob) throw new ImageError("图片处理失败，请换一张试试。");
  const name = file.name.replace(/\.[^.]*$/, "") || "icon";
  return new File([blob], `${name}-icon.jpg`, { type: "image/jpeg" });
}

/** 返回可直接上传的 JPEG 文件。图片无法读取时抛出 ImageError，提示语可直接展示。 */
export async function prepareImage(file: File): Promise<File> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImageError("当前浏览器无法处理图片，请换个浏览器再试。");

  // 透明背景的 PNG 转 JPEG 会变黑，先铺一层白底。
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await toBlob(canvas);
  if (!blob) throw new ImageError("图片处理失败，请换一张试试。");
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageError("图片太大了，请换一张小一些的。");

  const name = file.name.replace(/\.[^.]*$/, "") || "image";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
