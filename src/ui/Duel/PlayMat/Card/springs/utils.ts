import { type SpringConfig, type SpringRef } from "@react-spring/web";
import { subscribe } from "valtio";

import { settingStore } from "@/stores/settingStore";

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return (p: Partial<T> & { config?: SpringConfig }) => {
    const { config: _config, ...values } = p;
    if (document.hidden) {
      api.set(values as Partial<T>);
      return Promise.resolve();
    }
    if (!settingStore.animation.enabled) {
      return Promise.all(api.start({ ...p, immediate: true })).then(
        () => undefined,
      );
    }
    const finishWhenSkipped = () => {
      if (document.hidden || !settingStore.animation.enabled) {
        api.stop();
        api.set(values as Partial<T>);
      }
    };
    document.addEventListener("visibilitychange", finishWhenSkipped);
    const unsubscribe = subscribe(
      settingStore.animation,
      finishWhenSkipped,
      true,
    );
    return Promise.all(api.start({ ...p, immediate: false }))
      .then(() => undefined)
      .finally(() => {
        document.removeEventListener("visibilitychange", finishWhenSkipped);
        unsubscribe();
      });
  };
};

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
