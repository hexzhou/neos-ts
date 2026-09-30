# 动画速度与处理节奏对照

核查日期：2026-09-29。依据本地 Neos 工作区、MDPRO3（`72fb92ad0`）、YGOMobile-cn-ko-en（`9ea596c2`）源码。这里比较代码配置和消息等待，不是三个客户端运行录像的实测；用户浏览器保存的速度可能覆盖默认值。

## 结论

Neos 明显偏快有两类原因：默认移卡比 MDPRO3 短，以及缺少连锁建立、逐段结算等展示等待。YGOMobile 的普通移卡本身并不更慢，主要通过发动展示、连锁闪烁和逐张抽卡形成清晰的处理节奏。单纯把全局速度调慢不能补上这些缺失步骤。

## 时间对照

YGOMobile 按约 60 FPS 换算；实际帧率和跳过动画配置会影响时间。表中动画时长和消息等待不一定串行相加。

| 动作 | Neos 当前默认 | MDPRO3 | YGOMobile |
| --- | --- | --- | --- |
| 普通移卡 | 入手/回卡组/场外约 190ms；落场另加 100ms，合计约 290ms | `Move` 通常 400ms，我方入手 500ms；其他默认 300ms | 常见移动 10 帧，约 167ms；消息常等待 5 帧，某些分支另有等待 |
| 抽卡 | 同一批新卡及已有手牌并行移动，约 190ms，无逐张间隔 | 我方移动 500ms，对方 250ms，并有复合演出；该版本同批抽卡并行启动 | 每张移动 10 帧，每抽一张等待 5 帧（约 83ms），形成错开效果 |
| 表示形式变更 | 复用落场动画，约 290ms | 移动部分 200ms | 常见 10 帧移动，结合相应消息等待 |
| 效果发动 | 有聚焦/闪光动画并等待完成，但未明确统一 duration，也没有单独阅读停留 | 常见 `AnimationActivate` 为 200 + 700 + 200 = 1100ms | `CHAINING` 等待 30 帧，约 500ms |
| 连锁建立 | 没有 `CHAINED` 对应演出 | 等待连锁堆叠 Timeline | 二连锁及以上等待 20 帧，约 333ms |
| 连锁逐段结算 | 没有 `CHAIN_SOLVING` 对应演出；`CHAIN_SOLVED` 直接更新标记 | 等待结算 Timeline，再等待卡片效果演出 | 满足显示条件时闪烁 30 帧，约 500ms；首段可能另等 11 帧，约 183ms |
| 阶段切换 | 横幅 650ms，等待结束；已去掉顶部重复提示 | 等待阶段 Timeline，时长由资源决定 | 40 帧，约 667ms |

MDPRO3 的移动时间不是整个演出的总时长，连锁 Timeline 还受设置及单连锁分支影响；不能从上述数字推断固定总时长。Neos 的发动与攻击使用多步 react-spring 调用，部分步骤没有指定 duration，也未统一通过速度函数，不能把它们都计为 190ms。

## Neos 的具体原因

1. 默认 `speed = 0.7`，移动时间为 `400 - speed × 300`，得到 190ms。界面可调范围对应 100–400ms，但不是所有演出都使用该函数。
2. 抽卡使用 `Promise.all` 同时移动整手卡片；增加抽卡张数不会自然增加逐张展示时间。MDPRO3 本地版本也并行启动抽卡，不能把它描述成逐张抽卡；YGOMobile 才有明确的逐张间隔。
3. 协议适配已有 70（发动）、73（处理完毕），缺少 71（连锁建立）、72（开始处理）对应演出。直接调慢移卡不会给这些步骤增加可辨认的过程。
4. 普通召唤开始/结束主要更新提示和记录，没有独立召唤展示等待。
5. 页面隐藏或用户在设置 → 动画中关闭动画时，卡片动画直接跳到终点；这能避免后台停住消息队列，也会缩短观感时间。
6. 当前安装的 react-spring 会合并已有动画配置；未指定 duration 的步骤可能沿用该属性先前的配置，或使用弹簧模型。发动、攻击没有为各步骤显式设定时长，因此其节奏还可能受此前动作影响。后续应给这些动作独立配置，而不是只修改 `getDuration()`。

## 调整建议

先补连锁建立与逐段处理的展示，再按动作配置时间。以接近 MDPRO3 的观感为目标，可将普通移卡设为约 350–400ms、我方抽卡约 450–500ms，给发动保留独立展示停留，并参考 YGOMobile 给多张抽卡增加约 80–100ms 的间隔。以上是建议值，本轮没有统一减速或重做连锁动画。

展示停留与发动机会必须独立：动画结束才能处理下一条展示消息，但不能靠延迟制造发动时点。只有服务器发来合法选择消息后，客户端的询问策略才能保留玩家的选择机会。后续调整应继续支持断线取消、后台快速完成、应用内动画开关及录像跳过。

## 源码依据

- Neos：[默认速度](../src/stores/settingStore/animation.ts)、[时长和后台跳过](../src/ui/Duel/PlayMat/Card/springs/utils.ts)、[落场动画](../src/ui/Duel/PlayMat/Card/springs/moveToGround.ts)、[抽卡](../src/service/duel/draw.ts)、[发动聚焦](../src/ui/Duel/PlayMat/Card/springs/focus.ts)、[协议消息映射](../src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/penetrate.json)、[处理完毕](../src/service/duel/chainSolved.ts)。
- MDPRO3：[动作移动时间](/Users/hexzhou/Workplace/MDPro3/Assets/Scripts/MDPro3/Duel/GameCard.cs:1194)、[发动动画](/Users/hexzhou/Workplace/MDPro3/Assets/Scripts/MDPro3/Duel/GameCard.cs:2424)、[连锁等待](/Users/hexzhou/Workplace/MDPro3/Assets/Scripts/MDPro3/Duel/Message/DuelMessage.cs:1095)、[并行抽卡](/Users/hexzhou/Workplace/MDPro3/Assets/Scripts/MDPro3/Duel/Message/DuelMessage.cs:1764)、[Timeline 实现](/Users/hexzhou/Workplace/MDPro3/Assets/Scripts/MDPro3/Duel/BG/DuelBGManager.cs:2406)。
- YGOMobile：[阶段等待](/Users/hexzhou/Workplace/YGOMobile-cn-ko-en/Classes/gframe/duelclient.cpp:2898)、[发动和连锁等待](/Users/hexzhou/Workplace/YGOMobile-cn-ko-en/Classes/gframe/duelclient.cpp:3334)、[逐张抽卡](/Users/hexzhou/Workplace/YGOMobile-cn-ko-en/Classes/gframe/duelclient.cpp:3528)、[帧率控制](/Users/hexzhou/Workplace/YGOMobile-cn-ko-en/Classes/gframe/game.cpp:1638)。
