// 熟客联系信息：下单成功后保存在本设备，下次提交时自动填好。只存在客户自己的手机浏览器里，不上传。
export type SavedContact = {
  contactName: string;
  phone: string;
  deliveryMethod: "delivery" | "pickup";
  address: string;
};

const KEY = "contact.v1";

export function loadContact(): SavedContact | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedContact>;
    return {
      contactName: typeof value.contactName === "string" ? value.contactName : "",
      phone: typeof value.phone === "string" ? value.phone : "",
      deliveryMethod: value.deliveryMethod === "pickup" ? "pickup" : "delivery",
      address: typeof value.address === "string" ? value.address : "",
    };
  } catch {
    return null;
  }
}

export function saveContact(contact: SavedContact) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(contact));
  } catch {
    // 存不进去时下次需要重新填写，不影响本次下单。
  }
}

/**
 * 生成 UUID v4，用作防重复提交键。
 * crypto.randomUUID 在较旧的 iOS 和微信内置浏览器上不可用，退回到 getRandomValues。
 */
export function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
