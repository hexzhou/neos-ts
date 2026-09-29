/** 下载完整资源并报告进度；超时覆盖响应体读取。 */
export async function pfetch(
  input: RequestInfo,
  options?: {
    init?: RequestInit;
    progressCallback?: (progress: number) => void;
    timeoutMs?: number;
  },
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options?.init?.signal;
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) abort();
  const timeout = setTimeout(abort, options?.timeoutMs ?? 30_000);
  try {
    const response = await fetch(input, {
      ...options?.init,
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`资源请求失败（HTTP ${response.status}）`);
    const total = Number(response.headers.get("content-length")) || 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("资源内容为空，请重试");
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (total > 0) options?.progressCallback?.(Math.min(loaded / total, 1));
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    options?.progressCallback?.(1);
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error("资源加载超时或已取消，请检查网络后重试");
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}
