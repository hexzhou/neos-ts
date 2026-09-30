import { ygopro } from "@/api";
import { isMe, matStore } from "@/stores";

import { matConfig } from "../../css";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const {
  BLOCK_WIDTH,
  BLOCK_HEIGHT_M,
  COL_GAP,
  ROW_GAP,
  DECK_OFFSET_X,
  DECK_OFFSET_Y,
  DECK_ROTATE_Z,
  DECK_CARD_HEIGHT,
} = matConfig;

const { DECK, EXTRA } = ygopro.CardZone;

export const moveToDeck: MoveFunc = async (props) => {
  const { card, api } = props;
  // report
  const { location } = card;
  const { controller, zone, sequence } = location;

  const rightX = DECK_OFFSET_X + 2 * (BLOCK_WIDTH + COL_GAP);
  const leftX = -rightX;
  const bottomY = DECK_OFFSET_Y + 2 * BLOCK_HEIGHT_M + 2 * ROW_GAP;
  const topY = -bottomY;
  let x = isMe(controller) ? rightX : leftX;
  let y = isMe(controller) ? bottomY : topY;
  if (zone === EXTRA) {
    x = isMe(controller) ? leftX : rightX;
  }
  let rz = zone === EXTRA ? DECK_ROTATE_Z : -DECK_ROTATE_Z;
  rz += isMe(controller) ? 0 : 180;
  const z = sequence;
  const faceup =
    (zone === DECK && matStore.deckReserved) ||
    [
      ygopro.CardPosition.FACEUP,
      ygopro.CardPosition.FACEUP_ATTACK,
      ygopro.CardPosition.FACEUP_DEFENSE,
    ].includes(location.position);

  await asyncStart(api)({
    x,
    y,
    z,
    rz,
    ry: faceup ? 0 : 180,
    zIndex: z,
    height: DECK_CARD_HEIGHT,

    config: {
      duration: getDuration(),
    },
  });
};
