import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { FilmView, FPS, timeline, type Film, type Words } from './engine/Film';

// One film per render: scripts/master.sh passes { film, words } as props and the film folder as public dir.
const SIZE = { '16x9': [1920, 1080], '9x16': [1080, 1920] } as const;
type Props = { film: Film; words: Words };
const props = getInputProps() as Partial<Props>;

export const Root: React.FC = () => (
  <>
    {(Object.keys(SIZE) as (keyof typeof SIZE)[]).map((fmt) => (
      <Composition
        key={fmt} id={`Film-${fmt}`} component={FilmView as unknown as React.FC<Record<string, unknown>>}
        fps={FPS} width={SIZE[fmt][0]} height={SIZE[fmt][1]} durationInFrames={1}
        defaultProps={props as Record<string, unknown>}
        calculateMetadata={({ props: pr }) => {
          const { film, words } = pr as unknown as Props;
          return { durationInFrames: film && words ? timeline(film, words).total : 1 };
        }}
      />
    ))}
  </>
);
