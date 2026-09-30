export interface AnimationConfig {
  enabled: boolean;
  // custom speed set by player
  speed: number;
}

export const defaultAnimationConfig: AnimationConfig = {
  enabled: true,
  speed: 0.7,
};
