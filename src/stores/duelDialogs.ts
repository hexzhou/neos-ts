// 弹窗状态独立于场上数据，退出对局时需要一起清理。
const resets = new Map<() => void, boolean>();

export function registerDuelDialogReset(
  reset: () => void,
  preserveOnDisconnect = false,
) {
  resets.set(reset, preserveOnDisconnect);
  return () => {
    resets.delete(reset);
  };
}

export function resetDuelDialogs(preserveResult = false) {
  resets.forEach((preserve, reset) => {
    if (!preserveResult || !preserve) reset();
  });
}

export function createDuelDialog<T = void>(
  close: () => void,
  cancelledValue: T,
  preserveOnDisconnect = false,
) {
  let resolve: ((value: T) => void) | undefined;
  const finish = (value: T = cancelledValue) => {
    const pending = resolve;
    resolve = undefined;
    close();
    pending?.(value);
  };
  registerDuelDialogReset(() => finish(cancelledValue), preserveOnDisconnect);
  return {
    wait: () =>
      new Promise<T>((done) => {
        resolve?.(cancelledValue);
        resolve = done;
      }),
    finish,
  };
}
