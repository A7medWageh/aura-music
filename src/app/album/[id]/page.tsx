import { getAlbumDetails } from "@/../apis/youtubei.js";
import Link from "next/link";
import DownloadAlbumButton from "@/components/DownloadAlbumButton";
import AlbumTrackList from "@/components/AlbumTrackList";
import AlbumHeroClient from "@/components/AlbumHeroClient";

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let albumData;

  try {
    albumData = await getAlbumDetails(id);
  } catch {
    return <div className="p-10 text-center text-gray-400">حدث خطأ أثناء جلب تفاصيل الألبوم</div>;
  }

  if (!albumData || !albumData.title) {
    return <div className="p-10 text-center text-gray-400">الألبوم غير موجود</div>;
  }

  const { title, artist, coverUrl, year, songs } = albumData as any;

  return (
    <div className="-mx-4 md:mx-0 pb-4 md:pb-20">
      {/* ── Unified Hero (Mobile & Desktop) ── */}
      <AlbumHeroClient
        albumId={id}
        albumTitle={title}
        artistName={artist}
        coverUrl={coverUrl}
        year={year}
        songs={songs}
      />

      {/* ── Tracklist ── */}
      <div className="px-0 md:px-0">
        <AlbumTrackList songs={songs} albumArtist={artist} />
      </div>
    </div>
  );
}
