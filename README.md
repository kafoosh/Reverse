# Reverse — a magic trick web app

A spectator records themselves on camera saying a few "random" words. Played
forward it's gibberish — played **in reverse**, the recording names a playing card.

## How it works

Each card maps to words that, when the audio is reversed, sound like
"_value_ of _suit_". The full word list lives in [`words.js`](words.js) —
edit that file to tune or add word variants; no other code changes needed.

## Performer controls (secret)

- **Force a card:** long-press (~0.7s) on the words overlay to open a hidden
  card picker. The choice is remembered on that device until changed.
  "Random every time" returns to random mode.
- **URL force:** add `?card=QH` to the URL (value `A,2–10,J,Q,K` + suit
  `S,H,D,C`). Overrides the picker for that visit.
- **New words:** the 🎲 button re-rolls the word variants (same card if forced).

## Run locally

Browsers only allow camera access on `https://` or `localhost`:

```sh
python3 -m http.server 8123
# open http://localhost:8123
```

## Deploy to GitHub Pages

1. Create a repository on GitHub and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment**, set
   Source = "Deploy from a branch", Branch = `main`, folder = `/ (root)`.
3. Your app is live at `https://<username>.github.io/<repo>/` (HTTPS, so the
   camera works on phones).

## Tech notes

- No build step, no dependencies — plain HTML/CSS/JS.
- Audio is recorded with `MediaRecorder`, decoded with WebAudio, and reversed
  sample-by-sample for the backwards playback.
- Video frames are captured to JPEG during recording (~15 fps, ≤480px) so the
  picture can be played backwards smoothly in sync with the reversed audio.
- Recording is capped at 12 seconds.
