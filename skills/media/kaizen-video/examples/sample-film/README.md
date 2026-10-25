# Sample film (fictional product, no media needed)
Runs with the free voice and synthesized sound effects. Run from a project folder:
```bash
S=<skill>/scripts
mkdir -p videos/sample-film && cp <skill>/examples/sample-film/{film.json,lines.json} videos/sample-film/
python3 $S/vo.py videos/sample-film            # needs: pip install edge-tts
python3 $S/make_film.py videos/sample-film --render
```
Music comes from `"music": "investigations"` (bundled). Switch shape with `"format": "16x9"` or `"9x16"`.
The statistic is a placeholder: real films only show sourced numbers.
