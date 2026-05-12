namespace MusicApi.Data
{
    public static class DataSeeder
    {
        public static void SeedArtists(this ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Artist>().HasData(
                new Artist { Id = 1, Name = "محمد منير", Gender = "Male", ImageUrl = "https://ui-avatars.com/api/?name=Mohamed+Mounir&background=random" },
                new Artist { Id = 2, Name = "نانسي عجرم", Gender = "Female", ImageUrl = "https://ui-avatars.com/api/?name=Nancy+Ajram&background=random" },
                new Artist { Id = 3, Name = "عمرو دياب", Gender = "Male", ImageUrl = "https://ui-avatars.com/api/?name=Amr+Diab&background=random" },
                new Artist { Id = 4, Name = "تامر حسني", Gender = "Male", ImageUrl = "https://ui-avatars.com/api/?name=Tamer+Hosny&background=random" },
                new Artist { Id = 5, Name = "إليسا", Gender = "Female", ImageUrl = "https://ui-avatars.com/api/?name=Elissa&background=random" },
                new Artist { Id = 6, Name = "بهاء سلطان", Gender = "Male", ImageUrl = "https://ui-avatars.com/api/?name=Bahaa+Sultan&background=random" },
                new Artist { Id = 7, Name = "شيرين", Gender = "Female", ImageUrl = "https://ui-avatars.com/api/?name=Sherine&background=random" },
                new Artist { Id = 8, Name = "محمد حماقي", Gender = "Male", ImageUrl = "https://ui-avatars.com/api/?name=Hamaki&background=random" }
            );
        }

        public static void SeedAlbums(this ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Album>().HasData(
                new Album { Id = 1, Name = "شبابيك", ArtistId = 1, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 2, Name = "يا سلام", ArtistId = 2, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 3, Name = "تملي معاك", ArtistId = 3, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 4, Name = "عيش بشوقك", ArtistId = 4, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 5, Name = "حالة حب", ArtistId = 5, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 6, Name = "سيجارة", ArtistId = 6, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 7, Name = "نسّاي", ArtistId = 7, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" },
                new Album { Id = 8, Name = "كل يوم من ده", ArtistId = 8, ImageUrl = "https://ui-avatars.com/api/?name=Album&background=random" }
            );
        }

        public static void SeedSongs(this ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Song>().HasData(
                new Song { Id = 1, Name = "شبابيك", Language = "Arabic", Duration = "5:12", IsFeatured = true, ArtistId = 1, AlbumId = 1, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 2, Name = "إزاي", Language = "Arabic", Duration = "4:50", IsFeatured = false, ArtistId = 1, AlbumId = 1, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 3, Name = "أخاصمك آه", Language = "Arabic", Duration = "3:40", IsFeatured = true, ArtistId = 2, AlbumId = 2, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 4, Name = "يا سلام", Language = "Arabic", Duration = "3:20", IsFeatured = false, ArtistId = 2, AlbumId = 2, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 5, Name = "تملي معاك", Language = "Arabic", Duration = "4:30", IsFeatured = true, ArtistId = 3, AlbumId = 3, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 6, Name = "نور العين", Language = "Arabic", Duration = "5:00", IsFeatured = false, ArtistId = 3, AlbumId = 3, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 7, Name = "بحبك انت", Language = "Arabic", Duration = "3:50", IsFeatured = true, ArtistId = 4, AlbumId = 4, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 8, Name = "كل مرة", Language = "Arabic", Duration = "4:10", IsFeatured = false, ArtistId = 4, AlbumId = 4, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 9, Name = "بستناك", Language = "Arabic", Duration = "4:45", IsFeatured = true, ArtistId = 5, AlbumId = 5, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 10, Name = "حالة حب", Language = "Arabic", Duration = "5:30", IsFeatured = false, ArtistId = 5, AlbumId = 5, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 11, Name = "تعالى أدلعك", Language = "Arabic", Duration = "3:53", IsFeatured = true, ArtistId = 6, AlbumId = 6, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 12, Name = "يا ترى", Language = "Arabic", Duration = "4:23", IsFeatured = false, ArtistId = 6, AlbumId = 6, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 13, Name = "كدابين", Language = "Arabic", Duration = "3:36", IsFeatured = true, ArtistId = 7, AlbumId = 7, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 14, Name = "حبة جنة", Language = "Arabic", Duration = "3:11", IsFeatured = false, ArtistId = 7, AlbumId = 7, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 15, Name = "ما بلاش", Language = "Arabic", Duration = "3:20", IsFeatured = true, ArtistId = 8, AlbumId = 8, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" },
                new Song { Id = 16, Name = "يا ستار", Language = "Arabic", Duration = "3:35", IsFeatured = false, ArtistId = 8, AlbumId = 8, ImageUrl = "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff" }
            );
        }
    }
}


