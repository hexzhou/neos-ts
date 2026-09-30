import { Button } from "antd";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { sendSelectSingleResponse } from "@/api";
import { getUIContainer } from "@/container/compat";
import { matStore } from "@/stores";
import {
  cancelFieldSelection,
  fieldSelection,
  getFieldSelectionOptions,
  submitFieldSelection,
} from "@/stores/fieldSelection";

import { clearSelectInfo } from "../../utils";
import styles from "./index.module.scss";

export const FieldSelection = () => {
  const state = useSnapshot(fieldSelection);
  const incremental = useSnapshot(matStore.selectUnselectInfo);
  const hint = useSnapshot(matStore.hint);
  const { t: i18n } = useTranslation("Menu");
  const options = state.active ? getFieldSelectionOptions() : undefined;
  if (
    !options &&
    !incremental.selectableList.length &&
    !incremental.selectedList.length &&
    !incremental.cancelable &&
    !incremental.finishable
  )
    return null;
  const finishIncrementalSelection = () => {
    const { conn } = getUIContainer();
    if (!conn.isClosed()) sendSelectSingleResponse(conn, -1);
    clearSelectInfo();
  };
  const cancelable = options
    ? options.cancelable
    : incremental.cancelable && !incremental.finishable;
  const progress = !options
    ? `${incremental.selectedList.length} 张`
    : options.selectionKind === "tribute"
    ? `${state.selected.reduce(
        (sum, i) => sum + (options.selectables[i].tributeValue ?? 1),
        0,
      )} / ${options.min}`
    : options.selectionKind === "sum"
    ? `${state.selected.length + options.mustSelects.length} 张 · ${
        options.totalLevels
      }${options.overflow ? "+" : ""}`
    : `${state.selected.length} / ${
        options.min === options.max
          ? options.max
          : `${options.min}–${options.max}`
      }`;
  return createPortal(
    <div
      className={styles.bar}
      data-testid="field-selection"
      role="region"
      aria-label="场上选卡"
    >
      <span>{options ? state.hint : hint.esSelectHint || "请选择卡片"}</span>
      <span data-testid="field-selection-progress">{progress}</span>
      {cancelable && (
        <Button
          data-testid="field-selection-cancel"
          onClick={options ? cancelFieldSelection : finishIncrementalSelection}
        >
          取消
        </Button>
      )}
      {(options || incremental.finishable) && (
        <Button
          data-testid="field-selection-submit"
          type="primary"
          disabled={options ? !state.valid : false}
          onClick={options ? submitFieldSelection : finishIncrementalSelection}
        >
          {options ? "确认" : i18n("SelectionComplete")}
        </Button>
      )}
    </div>,
    document.body,
  );
};
