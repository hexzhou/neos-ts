import { fetchStrings, Region, ygopro } from "@/api";
import { resetDuelDialogs } from "@/stores/duelDialogs";
import { displayEndModal } from "@/ui/Duel/Message";
import MsgWin = ygopro.StocGameMessage.MsgWin;
import { Container } from "@/container";
import { AudioActionType, changeScene } from "@/infra/audio";

export default async (container: Container, win: MsgWin) => {
  const context = container.context;
  context.matStore.deckReserved = false;
  context.matStore.stopClock();
  const { win_player, reason } = win;

  const isWin = context.matStore.isMe(win_player);
  changeScene(isWin ? AudioActionType.BGM_WIN : AudioActionType.BGM_LOSE);
  resetDuelDialogs();
  await displayEndModal(
    isWin,
    fetchStrings(Region.Victory, `0x${reason.toString(16)}`),
  );
};
