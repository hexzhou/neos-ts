import { Button } from "antd";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";

import {
  cancelFieldSelection,
  fieldSelection,
  getFieldSelectionOptions,
  submitFieldSelection,
} from "@/stores/fieldSelection";

import styles from "./index.module.scss";

export const FieldSelection = () => {
  const state = useSnapshot(fieldSelection);
  const options = getFieldSelectionOptions();
  if (!state.active || !options) return null;
  const progress =
    options.selectionKind === "tribute"
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
      <span>{state.hint}</span>
      <span data-testid="field-selection-progress">{progress}</span>
      {options.cancelable && (
        <Button
          data-testid="field-selection-cancel"
          onClick={cancelFieldSelection}
        >
          取消
        </Button>
      )}
      <Button
        data-testid="field-selection-submit"
        type="primary"
        disabled={!state.valid}
        onClick={submitFieldSelection}
      >
        确认
      </Button>
    </div>,
    document.body,
  );
};
