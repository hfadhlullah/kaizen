# Sample film (fictional product, no media needed)
Runs with the free voice and synthesized sound effects — no accounts required:
```bash
S=<skill>/scripts
$S/setup.sh sample-film
cp <skill>/examples/sample-film/{film.json,lines.json} ~/.kaizen/videos/sample-film/
$S/music.sh ~/.kaizen/videos/sample-film "Wholesome"
python3 $S/vo.py ~/.kaizen/videos/sample-film        # needs: pip install edge-tts
$S/still.sh ~/.kaizen/videos/sample-film 16x9 30 200
$S/master.sh ~/.kaizen/videos/sample-film 16x9 sample-film-16x9 -16 4
```
The statistic is a placeholder: real films only show sourced numbers.
