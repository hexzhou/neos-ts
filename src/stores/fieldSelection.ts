import { proxy } from "valtio";

import {
  sendSelectMultiResponse,
  sendSelectSingleResponse,
  ygopro,
} from "@/api";
import type { Container } from "@/container";
import type { SelectCardsModalProps } from "@/ui/Duel/Message/SelectCardsModal";

import type { CardType } from "./cardStore";
import { createDuelDialog } from "./duelDialogs";
import { canCompleteSelection, validSelection } from "./selectionRules";

export type FieldSelectionOptions = Pick<
  SelectCardsModalProps,
  | "min"
  | "max"
  | "totalLevels"
  | "overflow"
  | "single"
  | "selectionKind"
  | "cancelable"
  | "mustSelects"
  | "selectables"
>;

export const fieldSelection = proxy({
  active: false,
  selected: [] as number[],
  hint: "",
  valid: false,
});
let session:
  | {
      container: Container;
      options: FieldSelectionOptions;
      cards: CardType[];
      mandatory: CardType[];
    }
  | undefined;
const dialog = createDuelDialog(() => {
  if (session) {
    for (const card of [...session.cards, ...session.mandatory])
      card.selectInfo = { selectable: false, selected: false };
    session.container.context.matStore.hint.esHint = undefined;
    session.container.context.matStore.hint.esSelectHint = undefined;
  }
  session = undefined;
  fieldSelection.active = false;
  fieldSelection.selected = [];
  fieldSelection.valid = false;
}, undefined);

export function canSelectOnField(
  container: Container,
  options: FieldSelectionOptions,
) {
  const all = [...options.selectables, ...options.mustSelects];
  return (
    all.length > 0 &&
    all.every((option) => {
      const loc = option.location;
      return (
        loc &&
        !loc.is_overlay &&
        [ygopro.CardZone.MZONE, ygopro.CardZone.SZONE].includes(loc.zone) &&
        !!container.context.cardStore.find(loc)
      );
    })
  );
}

function refresh() {
  if (!session) return;
  const { options, cards, mandatory } = session;
  const selected = fieldSelection.selected.map((i) => options.selectables[i]);
  fieldSelection.valid = validSelection(selected, options.mustSelects, options);
  cards.forEach((card, index) => {
    const chosen = fieldSelection.selected.includes(index);
    const replacing = options.max === 1 && !options.overflow;
    const next = replacing
      ? [options.selectables[index]]
      : [...selected, options.selectables[index]];
    const remaining = options.selectables.filter(
      (_, i) =>
        i !== index && (replacing || !fieldSelection.selected.includes(i)),
    );
    card.selectInfo = {
      selected: chosen,
      selectable:
        chosen ||
        canCompleteSelection(next, remaining, options.mustSelects, options),
    };
  });
  for (const card of mandatory)
    card.selectInfo = { selected: true, selectable: false };
}

export function displayFieldSelection(
  container: Container,
  options: FieldSelectionOptions,
) {
  dialog.finish();
  container.context.cardStore.inner.forEach((card) => {
    card.idleInteractivities = [];
  });
  session = {
    container,
    options,
    cards: options.selectables.map(
      (option) => container.context.cardStore.find(option.location!)!,
    ),
    mandatory: options.mustSelects.map(
      (option) => container.context.cardStore.find(option.location!)!,
    ),
  };
  fieldSelection.active = true;
  fieldSelection.hint =
    container.context.matStore.hint.esSelectHint ||
    (options.selectionKind === "tribute" ? "请选择要解放的卡片" : "请选择卡片");
  refresh();
  return dialog.wait();
}

/** 返回 true 表示本次点击已由场上选择处理，不能再发送普通操作响应。 */
export function toggleFieldSelection(card: CardType) {
  if (!session) return false;
  const index = session.cards.findIndex((item) => item.uuid === card.uuid);
  if (index < 0 || !card.selectInfo.selectable) return true;
  if (fieldSelection.selected.includes(index))
    fieldSelection.selected = fieldSelection.selected.filter(
      (i) => i !== index,
    );
  else if (session.options.max === 1 && !session.options.overflow)
    fieldSelection.selected = [index];
  else fieldSelection.selected.push(index);
  refresh();
  return true;
}

export function submitFieldSelection() {
  if (!session || !fieldSelection.valid) return;
  const { container, options } = session;
  const values = [
    ...options.mustSelects,
    ...fieldSelection.selected.map((i) => options.selectables[i]),
  ].map((option) => option.response!);
  if (container.conn.isClosed()) {
    dialog.finish();
    return;
  }
  sendSelectMultiResponse(container.conn, values);
  dialog.finish();
}
export function cancelFieldSelection() {
  if (!session?.options.cancelable) return;
  if (!session.container.conn.isClosed())
    sendSelectSingleResponse(session.container.conn, -1);
  dialog.finish();
}
export function getFieldSelectionOptions() {
  return session?.options;
}
