/** 仅处理已知卡名，避免将区域名、效果描述误当作卡名。 */
export function quoteCardName(name?: string): string {
  return `『${name || "?"}』`;
}

/** 支持卡名或模板占位符，已有成对引号时统一替换，重复调用不会嵌套。 */
export function formatCardName(
  text: string,
  name: string,
  placeholder = name,
): string {
  if (!name || !placeholder) return text;
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `『${escaped}』|「${escaped}」|“${escaped}”|"${escaped}"|${escaped}`,
    placeholder === name ? "g" : "",
  );
  return text.replace(pattern, () => quoteCardName(name));
}
