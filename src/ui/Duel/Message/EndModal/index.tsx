import { App } from "antd";
import React, { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { proxy, useSnapshot } from "valtio";

import { fetchStrings, Region } from "@/api";
import { getUIContainer } from "@/container/compat";
import { replayStore, resetDuel } from "@/stores";
import { createDuelDialog } from "@/stores/duelDialogs";

import { NeosModal } from "../NeosModal";
import styles from "./index.module.scss";

interface EndProps {
  isOpen: boolean;
  isWin: boolean;
  reason?: string;
}

const defaultProps: EndProps = {
  isOpen: false,
  isWin: false,
};

export const endModalStore = proxy({ ...defaultProps });

export const EndModal: React.FC = () => {
  const container = getUIContainer();
  const { message } = App.useApp();
  const { isOpen, isWin, reason } = useSnapshot(endModalStore);
  const { isReplay } = useSnapshot(replayStore);
  const navigate = useNavigate();

  const onReturn = () => {
    resetDuel();
    rs();

    if (container.conn.isClosed()) {
      message.info("服务器关闭了连接，返回匹配页。");

      navigate("/match");
    }
  };

  return (
    <NeosModal
      title={fetchStrings(Region.System, 1500)}
      open={isOpen}
      zIndex={3100}
      okText={isReplay ? "返回" : "保存录像"}
      cancelText="不保存"
      onOk={() => {
        if (!isReplay) {
          replayStore.download();
        }
        onReturn();
      }}
      onCancel={onReturn}
    >
      <div
        className={styles["end-container"]}
        data-testid="duel-end-modal"
        data-duel-result={isWin ? "win" : "defeated"}
      >
        <p
          className={styles.result}
          data-testid="duel-end-result"
          style={{ "--text-color": isWin ? "blue" : "red" } as CSSProperties}
        >
          {isWin ? "Win" : "Defeated"}
        </p>
        <p className={styles.reason}>{reason}</p>
        {isReplay ? <></> : <p>{fetchStrings(Region.System, 1340)}</p>}
      </div>
    </NeosModal>
  );
};

const dialog = createDuelDialog(
  () => {
    endModalStore.isOpen = false;
    endModalStore.isWin = false;
    endModalStore.reason = undefined;
  },
  undefined,
  true,
);
const rs = dialog.finish;

export const displayEndModal = async (isWin: boolean, reason?: string) => {
  endModalStore.isWin = isWin;
  endModalStore.reason = reason;
  endModalStore.isOpen = true;
  await dialog.wait();
};
