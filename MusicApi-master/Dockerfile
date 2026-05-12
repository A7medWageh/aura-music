# ─── Build stage ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore
COPY MusicApi/MusicApi.csproj MusicApi/
RUN dotnet restore MusicApi/MusicApi.csproj

# Copy everything and build
COPY . .
RUN dotnet publish MusicApi/MusicApi.csproj -c Release -o /app/publish

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# Railway injects PORT env var
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080

ENTRYPOINT ["dotnet", "MusicApi.dll"]
