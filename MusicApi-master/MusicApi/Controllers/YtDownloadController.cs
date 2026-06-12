using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Net.Http;
using System.Threading.Tasks;

namespace MusicApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class YtDownloadController : ControllerBase
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<YtDownloadController> _logger;

        public YtDownloadController(IHttpClientFactory httpClientFactory, ILogger<YtDownloadController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> DownloadAudio([FromQuery] string videoId)
        {
            if (string.IsNullOrWhiteSpace(videoId))
            {
                return BadRequest(new { error = "Missing videoId" });
            }

            try
            {
                // 1. Get the direct stream URL using yt-dlp
                var ytDlpPath = Environment.GetEnvironmentVariable("YT_DLP_PATH") ?? "yt-dlp";
                var processInfo = new ProcessStartInfo
                {
                    FileName = ytDlpPath,
                    Arguments = $"-f bestaudio -g https://www.youtube.com/watch?v={videoId}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(processInfo);
                if (process == null)
                {
                    return StatusCode(500, new { error = "Failed to start yt-dlp" });
                }

                // Read output with a timeout
                var cts = new CancellationTokenSource(15000);
                string directUrl = null;

                try 
                {
                    while (!process.StandardOutput.EndOfStream)
                    {
                        var line = await process.StandardOutput.ReadLineAsync(cts.Token);
                        if (!string.IsNullOrWhiteSpace(line) && line.StartsWith("http"))
                        {
                            directUrl = line;
                            break;
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    process.Kill();
                    return StatusCode(504, new { error = "yt-dlp timed out" });
                }

                if (string.IsNullOrWhiteSpace(directUrl))
                {
                    var errorOutput = await process.StandardError.ReadToEndAsync();
                    _logger.LogError("yt-dlp failed: {Error}", errorOutput);
                    return StatusCode(500, new { error = "Failed to resolve stream URL", details = errorOutput });
                }

                // 2. Stream the audio from the direct URL to the client
                var client = _httpClientFactory.CreateClient();
                // We use ResponseHeadersRead to avoid buffering the whole file into memory
                var request = new HttpRequestMessage(HttpMethod.Get, directUrl);
                
                // Pretend to be a normal browser to avoid blocks
                request.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
                
                var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, new { error = $"Upstream returned {response.StatusCode}" });
                }

                var stream = await response.Content.ReadAsStreamAsync();
                var contentType = response.Content.Headers.ContentType?.ToString() ?? "audio/webm";

                // Add CORS and explicit length so the frontend progress bar works
                Response.Headers.Append("Access-Control-Allow-Origin", "*");
                Response.Headers.Append("Access-Control-Expose-Headers", "Content-Length, Accept-Ranges");

                var fileResult = new FileStreamResult(stream, contentType)
                {
                    EnableRangeProcessing = true
                };

                return fileResult;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception in YtDownloadController");
                return StatusCode(500, new { error = "Internal Server Error", details = ex.Message });
            }
        }
    }
}
