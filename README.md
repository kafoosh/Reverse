# Reverse — a magic trick web app

A spectator records themselves on camera saying a few "random" words. Played
forward it's gibberish — played **in reverse**, the recording names a playing card.

## How it works

Each card maps to words that, when the audio is reversed, sound like
"_value_ of _suit_". The full word list lives in [`words.js`](words.js) —
edit that file to tune or add word variants; no other code changes needed.
Fours ("Oar Off") and sevens ("Button Vest") use fixed word pairs.

**The layered routine:** the first recording of a visit shows genuinely
random dictionary words (the spectator can test-reverse it — gibberish).
The **second** recording shows the trick words. Every recording after that
is random dictionary words again. Reloading the page starts the sequence over.

## Performer controls (secret)

- **Force the card:** add `?card=QH` to the URL (value `A,2–10,J,Q,K` + suit
  `S,H,D,C`, case-insensitive). This sets the card revealed by the *second*
  recording. Works the same on any domain, including custom domains.
  Without it, the card is random for that visit.
- **Read the card:** the start screen shows a faint fake build id like
  `id:fvwe9gw78gw9d56o9D` — the characters after the final `o` are the card
  (`9D` = nine of diamonds).
- **New words:** the 🎲 button re-rolls words within the current stage —
  new dictionary words, or new variants of the same card on the trick take.
- **Save:** in review, ⤓ renders forward + reverse into a single video
  (random filename), then opens the share sheet on phones (→ camera roll)
  or downloads on desktop.

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
