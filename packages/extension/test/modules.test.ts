import { describe, it, expect } from 'vitest';
import { identifyProvider, getModuleById } from '../src/modules/registry.js';
import { plexContentId } from '../src/modules/plex.js';

const GREY = 'https://watch.plex.tv/watch/movie/the-grey-2011?uri=provider%3A%2F%2Ftv.plex.provider.vod%2Flibrary%2Fmetadata%2F5d7768b8594b2b001e693c52';

describe('provider registry', () => {
  it('sends watch.plex.tv to the Plex module', () => {
    expect(identifyProvider(GREY).manifest.id).toBe('plex');
    expect(identifyProvider('https://watch.plex.tv/movie/the-grey-2011').manifest.id).toBe('plex');
  });

  it('claims no other Plex host (app.plex.tv is a different player, untested)', () => {
    expect(identifyProvider('https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F1').manifest.id).toBe('generic');
    expect(identifyProvider('https://www.plex.tv/').manifest.id).toBe('generic');
  });

  it('keeps the other modules where they were', () => {
    expect(identifyProvider('https://tv.youtube.com/watch/abc').manifest.id).toBe('youtube');
    expect(identifyProvider('https://stream.directv.com/player').manifest.id).toBe('directv');
    expect(getModuleById('plex')?.manifest.name).toBe('Plex');
  });
});

describe('Plex content id', () => {
  it("is the title's metadata id from the uri parameter", () => {
    expect(plexContentId(GREY)).toBe('5d7768b8594b2b001e693c52');
  });

  it('falls back to the player path when there is no uri', () => {
    expect(plexContentId('https://watch.plex.tv/watch/movie/the-grey-2011')).toBe('/watch/movie/the-grey-2011');
  });

  it('is null off a player page', () => {
    expect(plexContentId('https://watch.plex.tv/movie/the-grey-2011')).toBeNull();
    expect(plexContentId('not a url')).toBeNull();
  });

  it('reads captions from the video, not the page: no selector', () => {
    expect(getModuleById('plex')?.getSubtitleSelector?.()).toBeNull();
  });
});
