import classNames from "classnames";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";

import { matStore, replayStore, roomStore } from "@/stores";
import { remainingTime } from "@/stores/matStore/clock";

import styles from "./index.module.scss";

const LIFE_ANIMATION_DURATION = 500;

export const LifeBar: React.FC = () => {
  const snapInitInfo = useSnapshot(matStore.initInfo);
  const snapPlayer = useSnapshot(roomStore);
  const { isReplay } = useSnapshot(replayStore);
  const { currentPlayer } = useSnapshot(matStore);

  const [meLife, setMeLife] = React.useState(0);
  const [opLife, setOpLife] = React.useState(0);

  useEffect(() => {
    setMeLife(snapInitInfo.me.life);
  }, [snapInitInfo.me.life]);

  useEffect(() => {
    setOpLife(snapInitInfo.op.life);
  }, [snapInitInfo.op.life]);

  const clock = useSnapshot(matStore.timeLimits);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  const myClockActive =
    clock.activePlayer !== null && matStore.isMe(clock.activePlayer);
  const opClockActive =
    clock.activePlayer !== null && !matStore.isMe(clock.activePlayer);
  const myTimeLimit = myClockActive
    ? remainingTime(clock.me, clock.receivedAt, now)
    : clock.me >= 0
    ? clock.me
    : snapPlayer.timeLimit ?? -1;
  const opTimeLimit = opClockActive
    ? remainingTime(clock.op, clock.receivedAt, now)
    : clock.op >= 0
    ? clock.op
    : snapPlayer.timeLimit ?? -1;

  return createPortal(
    <div className={styles.container}>
      <LifeBarItem
        active={!matStore.isMe(currentPlayer)}
        name={snapPlayer.getOpPlayer()?.name ?? "?"}
        life={opLife}
        timeLimit={opTimeLimit}
        clockActive={opClockActive}
        totalTime={Math.max(clock.limit, snapPlayer.timeLimit ?? 0)}
        unlimited={snapPlayer.timeLimit === 0 && clock.limit === 0}
        isReplay={isReplay}
        isMe={false}
      />
      <LifeBarItem
        active={matStore.isMe(currentPlayer)}
        name={snapPlayer.getMePlayer()?.name ?? "?"}
        life={meLife}
        timeLimit={myTimeLimit}
        clockActive={myClockActive}
        totalTime={Math.max(clock.limit, snapPlayer.timeLimit ?? 0)}
        unlimited={snapPlayer.timeLimit === 0 && clock.limit === 0}
        isReplay={isReplay}
        isMe={true}
      />
    </div>,
    document.body,
  );
};

const LifeBarItem: React.FC<{
  active: boolean;
  name: string;
  life: number;
  timeLimit: number;
  clockActive: boolean;
  totalTime: number;
  isMe: boolean;
  unlimited: boolean;
  isReplay: boolean;
}> = ({
  active,
  name,
  life,
  timeLimit,
  clockActive,
  totalTime,
  isMe,
  unlimited,
  isReplay,
}) => {
  const animatedLife = useAnimatedLifeNumber(life);
  const mm = Math.floor(timeLimit / 60);
  const ss = timeLimit % 60;
  const timeText =
    timeLimit < 0
      ? "--:--"
      : `${mm < 10 ? "0" + mm : mm}:${ss < 10 ? "0" + ss : ss}`;
  return (
    <div
      data-testid="duel-player-life"
      data-player={isMe ? "me" : "op"}
      data-life={life}
      style={{
        flexDirection: isMe ? "column-reverse" : "column",
        overflow: "hidden",
        display: "flex",
        gap: "0.5rem",
        position: "relative",
      }}
    >
      <div
        className={classNames(styles["life-bar"], {
          "life-bar-activated": active,
        })}
      >
        <div className={styles.name}>{name}</div>
        <div
          className={styles.life}
          data-testid="duel-player-life-value"
          data-player={isMe ? "me" : "op"}
          data-target-life={life}
        >
          {animatedLife}
        </div>
      </div>
      <div
        className={styles["timer-container"]}
        data-testid="duel-player-timer"
        data-player={isMe ? "me" : "op"}
        data-active={clockActive}
      >
        <div className={styles["timer-text"]}>
          <span>剩余时间</span>
          <strong>{isReplay ? "回放" : unlimited ? "不限时" : timeText}</strong>
        </div>
        <div
          className={styles["timer-track"]}
          role="progressbar"
          aria-label={`${isMe ? "我方" : "对方"}剩余时间`}
          aria-valuemin={0}
          aria-valuemax={totalTime || undefined}
          aria-valuenow={
            !isReplay && !unlimited && timeLimit >= 0 ? timeLimit : undefined
          }
          aria-valuetext={
            isReplay
              ? "回放不计时"
              : unlimited
              ? "不限时"
              : timeLimit < 0
              ? "未同步"
              : timeText
          }
        >
          <div
            style={{
              width: `${
                !isReplay && !unlimited && totalTime > 0 && timeLimit >= 0
                  ? Math.min(100, Math.max(0, (timeLimit / totalTime) * 100))
                  : 0
              }%`,
            }}
          />
        </div>
        <span className={styles["timer-status"]}>
          {isReplay
            ? "回放不计时"
            : unlimited
            ? "本局不限时"
            : timeLimit < 0
            ? "未同步"
            : clockActive
            ? "操作中"
            : "等待"}
        </span>
      </div>
    </div>
  );
};

const useAnimatedLifeNumber = (life: number) => {
  const [displayLife, setDisplayLife] = useState(life);
  const displayLifeRef = React.useRef(life);

  useEffect(() => {
    const from = displayLifeRef.current;
    const to = life;

    if (from === to) return;
    if (
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      displayLifeRef.current = to;
      setDisplayLife(to);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / LIFE_ANIMATION_DURATION);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * easedProgress);

      displayLifeRef.current = next;
      setDisplayLife(next);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [life]);

  return displayLife;
};
