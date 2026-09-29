import { ygopro } from "@/api";
import { Container } from "@/container";

export default function handleJoinGame(
  container: Container,
  pb: ygopro.YgoStocMsg,
) {
  const seconds = pb.stoc_join_game.time_limit;
  container.context.roomStore.timeLimit = seconds >= 0 ? seconds : null;
  container.context.roomStore.joined = true;
}
