import { DownloadOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useSnapshot } from "valtio";

import { replayStore } from "@/stores";

export const SaveReplayButton = ({
  previous = false,
}: {
  previous?: boolean;
}) => {
  const { recordedCount, lastReplay, isReplay } = useSnapshot(replayStore);
  if ((!recordedCount || isReplay) && !lastReplay) return null;
  return (
    <Button
      data-testid="save-replay"
      icon={<DownloadOutlined />}
      onClick={() => replayStore.download()}
    >
      {previous ? "保存上一局录像" : "保存录像"}
    </Button>
  );
};
