import { ygopro } from "@/api";
import { Container } from "@/container";

import { fetchCheckCardMeta } from "../utils";
import { selectCards } from "./cardSelection";
type MsgSelectTribute = ygopro.StocGameMessage.MsgSelectTribute;

export default async (
  container: Container,
  selectTribute: MsgSelectTribute,
) => {
  const { mustSelects, selectables } = await fetchCheckCardMeta(
    container.context,
    selectTribute.selectable_cards.map((card) => ({
      code: card.code,
      response: card.response,
      location: card.location,
      tributeValue: card.level,
    })),
  );
  // TODO: 当玩家选择卡数大于`max`时，是否也合法？
  if (container.conn.cancelled) return;
  await selectCards(container, {
    selectionKind: "tribute",
    single: false,
    cancelable: selectTribute.cancelable,
    overflow: false,
    totalLevels: 0,
    min: selectTribute.min,
    max: selectTribute.max,
    mustSelects,
    selectables,
  });
};
