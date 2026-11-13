/**
 * 复制文字到剪贴板。成功返回 true。
 * 新浏览器用 navigator.clipboard；旧版微信和安卓浏览器退回到 execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续尝试旧方法。
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // 放在屏幕外，并保持 16px 字号，避免 iOS 聚焦时放大页面。
    area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length); // iOS 需要显式设置选区
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
