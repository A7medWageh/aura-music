using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MusicApi.Migrations
{
    /// <inheritdoc />
    public partial class UpdateSeedData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 17);

            migrationBuilder.DeleteData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 18);

            migrationBuilder.DeleteData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 19);

            migrationBuilder.DeleteData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 20);

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8306), "https://ui-avatars.com/api/?name=Album&background=random", "شبابيك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8306) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8308), "https://ui-avatars.com/api/?name=Album&background=random", "يا سلام", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8308) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8309), "https://ui-avatars.com/api/?name=Album&background=random", "تملي معاك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8309) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8310), "https://ui-avatars.com/api/?name=Album&background=random", "عيش بشوقك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8310) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8311), "https://ui-avatars.com/api/?name=Album&background=random", "حالة حب", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8311) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8153), "https://ui-avatars.com/api/?name=Mohamed+Mounir&background=random", "محمد منير", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8153) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8157), "https://ui-avatars.com/api/?name=Nancy+Ajram&background=random", "نانسي عجرم", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8157) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8158), "https://ui-avatars.com/api/?name=Amr+Diab&background=random", "عمرو دياب", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8158) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8183), "https://ui-avatars.com/api/?name=Tamer+Hosny&background=random", "تامر حسني", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8183) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8184), "https://ui-avatars.com/api/?name=Elissa&background=random", "إليسا", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8184) });

            migrationBuilder.InsertData(
                table: "Artists",
                columns: new[] { "Id", "CreatedAt", "Gender", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[,]
                {
                    { 6, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8185), "Male", "https://ui-avatars.com/api/?name=Bahaa+Sultan&background=random", "بهاء سلطان", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8185) },
                    { 7, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8186), "Female", "https://ui-avatars.com/api/?name=Sherine&background=random", "شيرين", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8186) },
                    { 8, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8187), "Male", "https://ui-avatars.com/api/?name=Hamaki&background=random", "محمد حماقي", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8187) }
                });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8335), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "شبابيك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8335) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8337), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "إزاي", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8337) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8339), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "أخاصمك آه", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8339) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8340), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "يا سلام", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8340) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8342), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "تملي معاك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8342) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8343), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "نور العين", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8343) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 7,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8344), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "بحبك انت", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8344) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8346), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "كل مرة", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8346) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8347), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "بستناك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8347) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8349), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "حالة حب", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8349) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 6, 6, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8350), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "تعالى أدلعك", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8350) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 12,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 6, 6, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8351), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "يا ترى", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8351) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 13,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 7, 7, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8353), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "كدابين", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8353) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 14,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 7, 7, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8354), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "حبة جنة", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8354) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 15,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 8, 8, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8355), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "ما بلاش", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8355) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 16,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 8, 8, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8357), "https://ui-avatars.com/api/?name=Song&background=1d9bf0&color=fff", "Arabic", "يا ستار", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8357) });

            migrationBuilder.InsertData(
                table: "Albums",
                columns: new[] { "Id", "ArtistId", "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[,]
                {
                    { 6, 6, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8312), "https://ui-avatars.com/api/?name=Album&background=random", "سيجارة", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8312) },
                    { 7, 7, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8313), "https://ui-avatars.com/api/?name=Album&background=random", "نسّاي", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8313) },
                    { 8, 8, new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8314), "https://ui-avatars.com/api/?name=Album&background=random", "كل يوم من ده", new DateTime(2026, 4, 29, 21, 22, 18, 766, DateTimeKind.Utc).AddTicks(8314) }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2850), "https://example.com/album1.jpg", "The King", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2850) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2851), "https://example.com/album2.jpg", "Super Nancy", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2851) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2852), "https://example.com/album3.jpg", "Sahar El Layali", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2852) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2854), "https://example.com/album4.jpg", "3esh Besho2ak", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2854) });

            migrationBuilder.UpdateData(
                table: "Albums",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2855), "https://example.com/album5.jpg", "Aghla El Ehsas", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2855) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2712), "https://example.com/mounir.jpg", "Mohamed Mounir", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2712) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2715), "https://example.com/nancy.jpg", "Nancy Ajram", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2715) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2717), "https://example.com/amr.jpg", "Amr Diab", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2717) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2718), "https://example.com/tamer.jpg", "Tamer Hosny", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2718) });

            migrationBuilder.UpdateData(
                table: "Artists",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2719), "https://example.com/elissa.jpg", "Elissa", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2719) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2878), "https://example.com/song1.jpg", "Shababeek", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2878) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2881), "https://example.com/song2.jpg", "Ezay", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2881) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 3,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2883), "https://example.com/song3.jpg", "Akhasmak Ah", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2883) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 4,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2885), "https://example.com/song4.jpg", "Ya Salam", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2885) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 5,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2887), "https://example.com/song5.jpg", "Tamally Maak", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2887) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 6,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2889), "https://example.com/song6.jpg", "Nour El Ein", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2889) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 7,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2891), "https://example.com/song7.jpg", "Bahebbak Enta", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2891) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 8,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2921), "https://example.com/song8.jpg", "Koll Marra", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2921) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 9,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2922), "https://example.com/song9.jpg", "Bastanak", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2922) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 10,
                columns: new[] { "CreatedAt", "ImageUrl", "Name", "UpdatedAt" },
                values: new object[] { new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2924), "https://example.com/song10.jpg", "Halet Hob", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2924) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 11,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 1, 1, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2925), "https://example.com/song11.jpg", "English", "Shape of You", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2925) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 12,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 1, 1, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2927), "https://example.com/song12.jpg", "English", "Perfect", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2927) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 13,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 2, 2, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2928), "https://example.com/song13.jpg", "English", "Havana", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2928) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 14,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 2, 2, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2930), "https://example.com/song14.jpg", "English", "Senorita", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2930) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 15,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 3, 3, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2932), "https://example.com/song15.jpg", "English", "Blinding Lights", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2932) });

            migrationBuilder.UpdateData(
                table: "Songs",
                keyColumn: "Id",
                keyValue: 16,
                columns: new[] { "AlbumId", "ArtistId", "CreatedAt", "ImageUrl", "Language", "Name", "UpdatedAt" },
                values: new object[] { 3, 3, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2933), "https://example.com/song16.jpg", "English", "Save Your Tears", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2933) });

            migrationBuilder.InsertData(
                table: "Songs",
                columns: new[] { "Id", "AlbumId", "ArtistId", "CreatedAt", "Duration", "ImageUrl", "IsFeatured", "Language", "Name", "UpdatedAt" },
                values: new object[,]
                {
                    { 17, 4, 4, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2935), "4:45", "https://example.com/song17.jpg", true, "English", "Someone Like You", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2935) },
                    { 18, 4, 4, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2936), "3:48", "https://example.com/song18.jpg", false, "English", "Rolling in the Deep", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2936) },
                    { 19, 5, 5, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2938), "3:36", "https://example.com/song19.jpg", true, "English", "Shallow", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2938) },
                    { 20, 5, 5, new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2939), "3:30", "https://example.com/song20.jpg", false, "English", "Always Remember Us This Way", new DateTime(2024, 7, 15, 19, 50, 12, 893, DateTimeKind.Utc).AddTicks(2939) }
                });
        }
    }
}
