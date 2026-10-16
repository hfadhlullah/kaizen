#!/bin/sh
# out/hero.mp4 to ../hero.gif: 900 wide, 12 fps, one palette for the whole clip.
set -e
ffmpeg -y -loglevel error -i out/hero.mp4 -vf "fps=12,scale=900:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" out/palette.png
ffmpeg -y -loglevel error -i out/hero.mp4 -i out/palette.png -lavfi "fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" ../hero.gif
ls -la ../hero.gif
