import { sendSelectMultiResponse, ygopro } from "@/api";
import MsgSelectCard = ygopro.StocGameMessage.MsgSelectCard;

import { Container } from "@/container";

import { fetchCheckCardMeta } from "../utils";
import { selectCards } from "./cardSelection";

export default async (container: Container, selectCard: MsgSelectCard) => {
  const { cancelable, min, max, cards } = selectCard;
  const conn = container.conn;
  const context = container.context;

  // TODO: handle release_param

  if (!cancelable && min === 1 && max === 1 && cards.length === 1) {
    // auto send
    sendSelectMultiResponse(conn, [cards[0].response]);
    return;
  }

  const { mustSelects, selectables } = await fetchCheckCardMeta(context, cards);
  if (container.conn.cancelled) return;
  await selectCards(container, {
    selectionKind: "count",
    totalLevels: 0,
    overflow: false,
    single: false,
    cancelable,
    min,
    max,
    mustSelects,
    selectables,
  });
};
