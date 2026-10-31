/**
 * GuardianStream Jellyfin Plugin
 *
 * Extends Jellyfin with real-time content filtering using
 * GuardianStream GSF filter data. Fetches filters from the
 * community API and applies skip/mute during playback.
 *
 * Based on: jacob-willden/jellyfin-plugin-moviecontentfilter (15 stars)
 * Extended with: API integration, open taxonomy, user profiles
 *
 * Build: dotnet build
 * Install: Copy DLL to Jellyfin plugins directory
 */

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;

namespace GuardianStream.Jellyfin
{
    /// <summary>
    /// Main plugin entry point. Monitors playback and applies filters.
    /// </summary>
    public class GuardianStreamPlugin : IServerEntryPoint
    {
        private readonly ISessionManager _sessionManager;
        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, FilterSet> _filterCache;
        private string _apiUrl = "http://localhost:3100";

        public GuardianStreamPlugin(ISessionManager sessionManager)
        {
            _sessionManager = sessionManager;
            _httpClient = new HttpClient();
            _filterCache = new Dictionary<string, FilterSet>();
        }

        public Task RunAsync()
        {
            _sessionManager.PlaybackProgress += OnPlaybackProgress;
            _sessionManager.PlaybackStart += OnPlaybackStart;
            Console.WriteLine("[GuardianStream] Jellyfin plugin initialized");
            return Task.CompletedTask;
        }

        private async void OnPlaybackStart(object sender, PlaybackProgressEventArgs e)
        {
            var item = e.MediaInfo;
            if (item == null) return;

            // Compute content ID from provider info
            var imdbId = item.ProviderIds?.GetValueOrDefault("Imdb") ?? "";
            var tmdbId = item.ProviderIds?.GetValueOrDefault("Tmdb") ?? "";
            var contentKey = $"jellyfin:{imdbId ?? tmdbId}";
            var contentId = ComputeContentId(contentKey);

            // Fetch filters if not cached
            if (!_filterCache.ContainsKey(contentId))
            {
                var filters = await FetchFilters(contentId);
                if (filters != null)
                {
                    _filterCache[contentId] = filters;
                    Console.WriteLine($"[GuardianStream] Loaded {filters.Segments.Count} segments for {item.Name}");
                }
            }
        }

        private void OnPlaybackProgress(object sender, PlaybackProgressEventArgs e)
        {
            var item = e.MediaInfo;
            if (item == null || e.PlaybackPositionTicks == null) return;

            var imdbId = item.ProviderIds?.GetValueOrDefault("Imdb") ?? "";
            var tmdbId = item.ProviderIds?.GetValueOrDefault("Tmdb") ?? "";
            var contentKey = $"jellyfin:{imdbId ?? tmdbId}";
            var contentId = ComputeContentId(contentKey);

            if (!_filterCache.TryGetValue(contentId, out var filterSet)) return;

            var currentSeconds = e.PlaybackPositionTicks.Value / TimeSpan.TicksPerSecond;

            foreach (var segment in filterSet.Segments)
            {
                if (currentSeconds >= segment.Start && currentSeconds < segment.End)
                {
                    if (segment.Action == "skip")
                    {
                        // Seek past the segment
                        var seekTicks = (long)(segment.End * TimeSpan.TicksPerSecond);
                        _sessionManager.SendPlaystateCommand(
                            e.Session.Id, e.Session.Id,
                            new PlaystateRequest
                            {
                                Command = PlaystateCommand.Seek,
                                SeekPositionTicks = seekTicks
                            },
                            default
                        );
                    }
                    // Mute/blur require client-side support (web UI plugin)
                    break;
                }
            }
        }

        private async Task<FilterSet> FetchFilters(string contentId)
        {
            try
            {
                var prefix = contentId.Substring(0, 4);
                var response = await _httpClient.GetStringAsync($"{_apiUrl}/api/v1/filters/{prefix}");
                var sets = JsonSerializer.Deserialize<List<FilterSet>>(response);

                return sets?.Find(s => s.ContentId == contentId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[GuardianStream] API error: {ex.Message}");
                return null;
            }
        }

        private static string ComputeContentId(string input)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(bytes).Replace("-", "").ToLower();
        }

        public void Dispose() { }
    }

    public class FilterSet
    {
        public string ContentId { get; set; }
        public string Title { get; set; }
        public List<FilterSegment> Segments { get; set; } = new();
    }

    public class FilterSegment
    {
        public string Id { get; set; }
        public double Start { get; set; }
        public double End { get; set; }
        public string Category { get; set; }
        public int Severity { get; set; }
        public string Action { get; set; }
        public double Confidence { get; set; }
    }
}
