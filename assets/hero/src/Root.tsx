import { Composition } from "remotion";
import { Hero, FPS, total } from "./Hero";

export const Root = () => (
  <Composition id="Hero" component={Hero} durationInFrames={total} fps={FPS} width={1440} height={810} />
);
