import { subscribe } from "valtio";

import { getUIContainer, initUIContainer } from "@/container/compat";
import { WebSocketStream } from "@/infra";
import { initReplaySocket, initSocket } from "@/middleware/socket";
import { pollSocketLooper } from "@/service/executor";
import { matStore, replayStore, roomStore } from "@/stores";
import { connectionStore } from "@/stores/connectionStore";
import { resetDuelDialogs } from "@/stores/duelDialogs";

import { initializeApp } from "../Layout/utils";

let attempt = 0;
let activeConnection: WebSocketStream | undefined;

export function disconnectSession() {
  attempt += 1;
  replayStore.archive();
  activeConnection?.close();
  activeConnection = undefined;
  resetDuelDialogs();
  matStore.stopClock();
  connectionStore.set("idle");
}

export function checkSessionConnection() {
  connectionStore.offline = !navigator.onLine;
  if (activeConnection?.isClosed() && connectionStore.phase === "connected") {
    replayStore.archive();
    resetDuelDialogs(true);
    matStore.stopClock();
    connectionStore.set("disconnected", "连接已断开，请返回大厅重新进入");
  }
}

function waitForRoom(conn: WebSocketStream, token: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stopRoom();
      stopConnection();
      error ? reject(new Error(error)) : resolve();
    };
    const inspect = () => {
      if (token !== attempt) return finish("已取消连接");
      if (roomStore.errorMsg) return finish(roomStore.errorMsg);
      if (["error", "disconnected", "idle"].includes(connectionStore.phase)) {
        return finish(connectionStore.message || "连接已关闭");
      }
      if (roomStore.joined) finish();
    };
    const stopRoom = subscribe(roomStore, inspect, true);
    const stopConnection = subscribe(connectionStore, inspect, true);
    const timer = setTimeout(() => {
      conn.close();
      finish("服务器尚未确认加入房间，请检查房间信息后重试");
    }, 20_000);
    inspect();
  });
}

export const connectSrvpro = async (params: {
  ip: string;
  player: string;
  passWd: string;
  replay?: boolean;
  replayData?: ArrayBuffer;
  customOnConnected?: (conn: WebSocketStream) => void;
}) => {
  disconnectSession();
  const token = attempt;
  roomStore.joined = false;
  roomStore.timeLimit = null;
  roomStore.errorMsg = undefined;
  connectionStore.set("initializing");
  try {
    await initializeApp();
    if (token !== attempt) return;
    if (!params.replay && !navigator.onLine)
      throw new Error("当前网络不可用，请联网后重试");
    const conn =
      params.replay && params.replayData
        ? initReplaySocket({ data: params.replayData })
        : initSocket({
            ...params,
            onState: (state, message) => {
              if (token !== attempt) return;
              if (state === "open") connectionStore.set("joining");
              else {
                replayStore.archive();
                if (state !== "closed") activeConnection?.close();
                resetDuelDialogs(true);
                matStore.stopClock();
                connectionStore.set(
                  state === "closed" ? "disconnected" : "error",
                  message,
                );
              }
            },
          });
    activeConnection = conn;
    initUIContainer(conn);
    connectionStore.set(params.replay ? "idle" : "connecting");
    void pollSocketLooper(getUIContainer()).catch((error) => {
      if (token !== attempt) return;
      conn.close();
      replayStore.archive();
      resetDuelDialogs(true);
      matStore.stopClock();
      connectionStore.set(
        "error",
        error instanceof Error ? error.message : "对局数据处理失败，请返回大厅",
      );
    });
    if (!params.replay) {
      await conn.opened;
      if (token !== attempt) return;
      await waitForRoom(conn, token);
      if (token === attempt) connectionStore.set("connected");
    }
  } catch (error) {
    if (token !== attempt) return;
    activeConnection?.close();
    matStore.stopClock();
    connectionStore.set(
      "error",
      error instanceof Error ? error.message : "连接失败，请重试",
    );
    throw error;
  }
};
