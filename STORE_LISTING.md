# Chrome Web Store listing: Blast Phemur* 0.2.0

Every claim here is true of the 0.2.0 build. Update this file in the same change as any feature that alters a claim.

## Name
Blast Phemur* (from `packages/extension/public/_locales/en/messages.json`, `appName`)

## Short description (132 characters max; this is 125)
Mutes blasphemy and swearing on streaming video and masks them in the captions. Free to use, with no account and no tracking.

## Detailed description

Blast Phemur mutes blasphemy and swearing as they are spoken on streaming video, and masks the same words in the captions.

HOW IT WORKS

Blast Phemur finds the words in the show's own captions and lowers the volume for the moment each one is spoken.

- On YouTube TV and YouTube it reads the player's own caption track, so each word is muted as it is spoken, even in a background tab. Word timing comes from the captions, so it can be slightly early or late.
- On DIRECTV Stream it reads the captions the video carries, so turn captions (CC) on. Adding the episode's subtitle file gives word-by-word timing there too.
- The toolbar button always says which of these is happening on the tab you are watching.

WHAT YOU CHOOSE

- Blasphemy: Off, Worst, Most or All. "Most" mutes "oh my G*d"; "All" also mutes mild exclamations such as "oh G*d" and "je**".
- Swearing: Off, Worst, Most or All. "Most" lets mild words such as "da**" play; "All" mutes them too.
- Fine-tune any kind of word, or a single word, and keep your own Always mute and Never mute lists.

WHEN IT GETS ONE WRONG

A false alarm is one moment, so that is what you fix. Tap "That was fine here" in the toolbar button, or press [ on the player, and that moment plays from now on while the word stays muted everywhere else. A prayer caught by the blasphemy filter is passed the same way; a sacred name is never allowed everywhere. If a word gets through, press ]. Press \ to undo.

PRIVACY

No account, no analytics, no telemetry, and no server of ours. Your settings stay in your browser. The only network request is the caption file the YouTube player already uses, fetched from YouTube the way the player fetches it.

SUPPORTED SERVICES

Runs on YouTube TV (tested on real playback), YouTube and DIRECTV Stream (built for and checked against their caption formats). More services will be added as each is tested.

(Store policy: name at most five services or brands in the description; a longer list goes on a linked page or in a screenshot. This text names three.)

## Category
Accessibility

## Language
English

## Open source (NOT CLAIMED in 0.2.0)
The repository has no licence file and no public remote, so neither the listing, the privacy page nor the popup says "open source". To claim it: add a LICENSE at the repo root, publish the repository, then restore "open source" in `messages.json` `appDescription`, the popup footer (`App.tsx`), a privacy-page section and this listing, in one change.

## URLs (`pnpm publish:check` fetches each one; all must resolve before submitting)
- Privacy policy: https://mediatrixlibre.github.io/blast-phemur/privacy-policy.html (source: `privacy-policy.html` at the repo root; the same page ships inside the extension as `privacy.html`)
- Website: https://github.com/MediatrixLibre/blast-phemur
- Support: https://github.com/MediatrixLibre/blast-phemur/issues

## Contact email (shown publicly on the listing)
mediatrixdev@proton.me

## Screenshots (1280x800), to be rendered from real states
1. "Protected, word by word" on YouTube TV, with Just muted
2. The two level controls (Blasphemy, Swearing)
3. "That was fine here" on a muted moment
4. The welcome tab's level choice
5. The in-player notice at the start of a title

## Notes for review
- Permissions: storage, unlimitedStorage (subtitle files can be large), scripting (connect tabs already open at install or update). Host access only on the listed streaming sites.
- No remote code. No network requests to any server of ours.
- Family Movie Act (2005): filtering happens at the viewer's direction, on the viewer's own playback; no copy is made. A notice in the player says the showing is altered from the original, at the start of each title, as soon as it plays in a visible tab; no setting turns it off.
- Does not circumvent DRM: it changes only `video.volume` / `video.muted` and the caption text drawn on the page.
