import { type SpringConfig, type SpringRef } from "@react-spring/web";

import { settingStore } from "@/stores/settingStore";

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return (p: Partial<T> & { config?: SpringConfig }) => {
    const { config: _config, ...values } = p;
    if (
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      api.set(values as Partial<T>);
      return Promise.resolve();
    }
    const finishWhenHidden = () => {
      if (document.hidden) {
        api.stop();
        api.set(values as Partial<T>);
      }
    };
    document.addEventListener("visibilitychange", finishWhenHidden);
    return Promise.all(api.start(p))
      .then(() => undefined)
      .finally(() => {
        document.removeEventListener("visibilitychange", finishWhenHidden);
      });
  };
};

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
