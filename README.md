# GuardianStream

A browser extension that mutes blasphemy and swearing as they are spoken on streaming video, and masks the same words in the captions. No account, no analytics, no server: everything happens in your browser.

Version 0.2.0. Built for Chrome; tested in Brave, which runs Chrome extensions as they are.

## How it works

GuardianStream finds the words in the show's own captions and lowers the volume for the moment each one is spoken.

- On YouTube TV and YouTube it reads the player's own caption track, so each word is muted as it is spoken, even in a background tab. Timing comes from the captions, so it is close, not exact.
- On other services it reads the captions as they appear on screen, so turn captions (CC) on. A filtered line goes quiet; a word can slip out before the mute. Adding the episode's subtitle file gives word-by-word timing there too.
- The toolbar button always says which of these is happening on the tab you are watching.

A false alarm is one moment, so that is what you fix: "That was fine here" in the toolbar button, or `[` on the player, lets that moment play from then on while the word stays muted everywhere else. `]` mutes something that got through; `\` undoes.

## Where it runs

| Service | Status |
|---|---|
| YouTube TV | Tested on real playback |
| YouTube, DIRECTV Stream | Built for and checked against their caption formats |
| Netflix, Prime Video, Disney+, Hulu, Max, Apple TV+, Peacock, Paramount+, Crunchyroll, Tubi, Pluto TV | Runs wherever captions are on; not yet tested on each |

## Privacy

GuardianStream collects nothing and sends nothing. Settings, your word lists, passed moments and any subtitle files you add stay in your browser, and removing the extension removes them. The full policy is [privacy-policy.html](privacy-policy.html); the same page ships inside the extension.

## Building and testing

Needs Node 20 or later and pnpm.

```sh
pnpm install
pnpm build        # packages/extension/dist is the unpacked extension
pnpm typecheck
pnpm test
pnpm --filter @guardianstream/extension package   # the store zip
```

The end-to-end checks in `packages/extension/e2e/` drive a real Brave browser against a stand-in streaming page. They need Brave installed and ffmpeg (to make a test clip the first time):

```sh
cd packages/extension && node e2e/brave-e2e.cjs
```

`background-e2e.cjs` (filtering in a hidden tab) also needs a clip from Sintel (Blender Foundation, CC BY 3.0) at `packages/ai-pipeline/test-data/sintel-clip.mp4`; without it, it exits 2 (could not check) rather than pass or fail on a clip that does not hold up in a hidden tab.

## Filtering and the law

Filtering happens at the viewer's direction, on the viewer's own playback of an authorized stream; no copy is made and no protection is circumvented. A notice at the start of each title says the showing is altered from the original.

## Licence

No licence has been chosen yet, so all rights are reserved for now.

## Contact

[mediatrixdev@proton.me](mailto:mediatrixdev@proton.me), or open an issue.
