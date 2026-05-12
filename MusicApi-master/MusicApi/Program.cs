using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Allow Railway to inject PORT
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ─── PostgreSQL via Neon ───────────────────────────────────────────────────
var connectionString = Environment.GetEnvironmentVariable("MUSICAPI_DB_CONNECTION")
    ?? builder.Configuration["ConnectionString:DefaultConnection"];

builder.Services.AddDbContext<ApplicationDbContext>(opt =>
    opt.UseNpgsql(connectionString));
// ─────────────────────────────────────────────────────────────────────────

builder.Services.AddSingleton<CloudinaryUtility>();
builder.Services.AddScoped<PaginationService>();
builder.Services.AddTransient<IConfigureOptions<SwaggerGenOptions>, ConfigureSwaggerOptions>();

builder.Services.AddScoped<ISongService, SongService>();
builder.Services.AddScoped<IAlbumService, AlbumService>();
builder.Services.AddScoped<IArtistService, ArtistService>();

// ─── CORS: allow Next.js frontend ────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var allowedOrigin = Environment.GetEnvironmentVariable("ALLOWED_ORIGIN") ?? "*";
        if (allowedOrigin == "*")
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        else
            policy.WithOrigins(allowedOrigin).AllowAnyHeader().AllowAnyMethod();
    });
});
// ─────────────────────────────────────────────────────────────────────────

#region JWT BEARER
var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>();

// Allow Railway env vars to override JWT settings
if (Environment.GetEnvironmentVariable("JWT_SECRET") is { } secret)
    jwtSettings!.SecretKey = secret;
if (Environment.GetEnvironmentVariable("JWT_ISSUER") is { } issuer)
    jwtSettings!.Issuer = issuer;
if (Environment.GetEnvironmentVariable("JWT_AUDIENCE") is { } audience)
    jwtSettings!.Audience = audience;

builder.Services.AddSingleton(jwtSettings);

builder.Services.AddAuthentication().AddJwtBearer(opt =>
{
    opt.RequireHttpsMetadata = false;
    opt.SaveToken = true;
    opt.TokenValidationParameters = new()
    {
        ValidateIssuer = true,
        ValidIssuer = jwtSettings?.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtSettings?.Audience,
        ValidateLifetime = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings!.SecretKey))
    };
});
#endregion

builder.Services.AddScoped<JwtService>();

var app = builder.Build();

// Always show Swagger in production too (read-only API)
app.UseSwagger();
app.UseSwaggerUI();

// Auto-create database schema on startup (skip migrations — they were SQL Server specific)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors();

app.UseAuthorization();

app.MapControllers();

app.Run();
