"""
GuardianStream Kodi Service Addon

Background service that monitors playback and generates EDL files
from GuardianStream filter data. Kodi natively reads EDL files for
skip/mute actions during playback.

Pipeline:
  1. On playback start: get IMDB ID from Kodi library metadata
  2. Query GuardianStream API for filter data
  3. Write EDL file alongside the video
  4. Kodi reads EDL and applies skip/mute automatically

EDL format: start_seconds  end_seconds  action
  Action 0 = cut (skip)
  Action 1 = mute
  Action 2 = scene marker
  Action 3 = commercial break

Extends: jacob-willden/script.movie.content.filter (4 stars, active March 2026)
"""

import hashlib
import json
import os
import urllib.request

import xbmc
import xbmcaddon

ADDON = xbmcaddon.Addon()
API_URL = ADDON.getSetting("api_url") or "http://localhost:3100"
MONITOR_INTERVAL_MS = 1000  # Check every second


class GuardianStreamMonitor(xbmc.Monitor):
    """Monitor for Kodi events."""

    def __init__(self):
        super().__init__()
        self.player = GuardianStreamPlayer()

    def onNotification(self, sender, method, data):
        if method == "Player.OnPlay":
            self.player.on_play_start()


class GuardianStreamPlayer(xbmc.Player):
    """Player that generates EDL files from GuardianStream data."""

    def __init__(self):
        super().__init__()
        self._edl_path = None

    def on_play_start(self):
        """Called when playback starts."""
        try:
            if not self.isPlayingVideo():
                return

            # Get file path
            file_path = self.getPlayingFile()
            if not file_path:
                return

            # Get IMDB ID from video info
            info_tag = self.getVideoInfoTag()
            imdb_id = info_tag.getIMDBNumber() if info_tag else ""

            if not imdb_id:
                xbmc.log("[GuardianStream] No IMDB ID found, skipping", xbmc.LOGINFO)
                return

            # Fetch filters from API
            gsf = self._fetch_filters("kodi", imdb_id)
            if not gsf or not gsf.get("segments"):
                xbmc.log(f"[GuardianStream] No filters for {imdb_id}", xbmc.LOGINFO)
                return

            # Write EDL file
            edl_path = self._get_edl_path(file_path)
            edl_content = self._gsf_to_edl(gsf)
            with open(edl_path, "w") as f:
                f.write(edl_content)

            self._edl_path = edl_path
            seg_count = len(gsf["segments"])
            xbmc.log(f"[GuardianStream] EDL written: {seg_count} segments for {imdb_id}", xbmc.LOGINFO)

            # Kodi reads EDL on playback start -- may need to restart playback
            # for the EDL to take effect if it was written after play started
            xbmc.executebuiltin("Notification(GuardianStream, Filtering %d segments, 3000)" % seg_count)

        except Exception as e:
            xbmc.log(f"[GuardianStream] Error: {e}", xbmc.LOGERROR)

    def _fetch_filters(self, provider: str, content_id: str) -> dict | None:
        """Fetch GSF data from API with hash-prefix privacy."""
        full_id = hashlib.sha256(f"{provider}:{content_id}".encode()).hexdigest()
        prefix = full_id[:4]

        try:
            url = f"{API_URL}/api/v1/filters/{prefix}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read())

            for filter_set in data:
                if filter_set.get("contentId") == full_id:
                    return filter_set
        except Exception as e:
            xbmc.log(f"[GuardianStream] API error: {e}", xbmc.LOGWARNING)

        return None

    @staticmethod
    def _gsf_to_edl(gsf: dict) -> str:
        """Convert GSF to EDL format."""
        lines = []
        for seg in gsf.get("segments", []):
            action = seg.get("action", "mute")
            # EDL: 0=cut(skip), 1=mute
            edl_action = 0 if action in ("skip", "black") else 1
            lines.append(f"{seg['start']:.3f}\t{seg['end']:.3f}\t{edl_action}")
        return "\n".join(lines)

    @staticmethod
    def _get_edl_path(video_path: str) -> str:
        """Get EDL file path (same name as video, .edl extension)."""
        base = os.path.splitext(video_path)[0]
        return base + ".edl"


def main():
    """Service entry point -- runs as background service in Kodi."""
    monitor = GuardianStreamMonitor()
    xbmc.log("[GuardianStream] Kodi addon started", xbmc.LOGINFO)

    while not monitor.abortRequested():
        if monitor.waitForAbort(MONITOR_INTERVAL_MS / 1000):
            break

    xbmc.log("[GuardianStream] Kodi addon stopped", xbmc.LOGINFO)


if __name__ == "__main__":
    main()
