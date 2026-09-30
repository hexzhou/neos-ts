import { Button } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { sendSelectEffectYnResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";
import { createDuelDialog } from "@/stores/duelDialogs";

import { NeosModal } from "../NeosModal";

interface YesNoModalProps {
  isOpen: boolean;
  msg: string;
  confirmOnly: boolean;
}
const defaultProps = { isOpen: false, msg: "", confirmOnly: false };

const localStore = proxy<YesNoModalProps>({ ...defaultProps });

export const YesNoModal: React.FC = () => {
  const container = getUIContainer();
  const { isOpen, msg, confirmOnly } = useSnapshot(localStore);
  const hint = useSnapshot(matStore.hint);

  const preHintMsg = hint?.esHint || "";
  const submit = (yes: boolean) => {
    if (!localStore.isOpen) return;
    if (!localStore.confirmOnly)
      sendSelectEffectYnResponse(container.conn, yes);
    rs(yes);
  };

  return (
    <NeosModal
      movable
      title={[preHintMsg, msg].filter(Boolean).join(" ")}
      open={isOpen}
      width={"25rem"}
      afterClose={() => {
        if (localStore.isOpen) return;
        localStore.msg = "";
        matStore.hint.esHint = undefined;
      }}
      footer={
        <>
          {!confirmOnly && (
            <Button data-testid="duel-yesno-no" onClick={() => submit(false)}>
              取消
            </Button>
          )}
          <Button
            data-testid="duel-yesno-yes"
            type="primary"
            onClick={() => submit(true)}
          >
            确认
          </Button>
        </>
      }
    >
      <div data-testid="duel-yesno-modal" />
    </NeosModal>
  );
};

const dialog = createDuelDialog<boolean>(() => {
  localStore.isOpen = false;
  // 退出动画期间保留标题，动画结束后再清理消息。
}, false);
const rs = dialog.finish;

export const displayYesNoModal = async (msg: string, confirmOnly = false) => {
  localStore.msg = msg;
  localStore.confirmOnly = confirmOnly;
  localStore.isOpen = true;
  return dialog.wait();
};
