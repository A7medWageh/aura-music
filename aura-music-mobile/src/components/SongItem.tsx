import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Song } from "@/types/music";
import { Color, Radius, Space } from "@/theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { resolveArtworkUri } from "@/utils/media";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";
import { Play, Heart, DownloadCloud, CheckCircle2, MoreVertical } from "lucide-react-native";
import { AuraArtwork, AuraPlayPulse, AuraText, AuraTouch } from "@/ui";

interface SongItemProps {
  song: Song;
  queue?: Song[];
  index?: number;
  rank?: number;
  showArtwork?: boolean;
  onOptionsPress?: (song: Song) => void;
}

function formatDuration(seconds?: number) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export const SongItem: React.FC<SongItemProps> = ({
  song,
  queue,
  index,
  rank,
  showArtwork = true,
  onOptionsPress,
}) => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playSong = usePlayerStore((s) => s.playSong);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const isFav = useLibraryStore((s) => s.isFavorite(song.id));
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const downloadSong = useDownloadStore((s) => s.downloadSong);
  const getProgress = useDownloadStore((s) => s.getProgress);

  const isCurrent = currentSong?.id === song.id;
  const progressInfo = getProgress(song.id);
  const isDownloading = progressInfo?.status === "downloading";
  const isDownloaded = !!song.isDownloaded || progressInfo?.status === "completed";
  const duration = formatDuration(song.duration);

  const handlePress = () => {
    if (isCurrent) togglePlay();
    else playSong(song, queue, index);
  };

  return (
    <View style={[styles.row, isCurrent && styles.rowCurrent]}>
      {rank !== undefined && (
        <AuraText
          role="numeric"
          color={isCurrent ? Color.gold500 : Color.text_muted}
          style={styles.rank}
        >
          {rank}
        </AuraText>
      )}

      <AuraTouch
        feedback="selection"
        pressedScale={1}
        onPress={handlePress}
        style={styles.main}
      >
        {showArtwork && (
          <AuraArtwork
            uri={resolveArtworkUri(
              song.localArtworkPath,
              song.thumbnailUrl,
              song.youtubeVideoId,
              "song",
              song.artist
            )}
            title={song.title}
            artist={song.artist}
            placeholder={PLACEHOLDER_SONG}
            size={46}
            shape="tile"
            ring={isCurrent ? "gold" : "hairline"}
          >
            {isCurrent && (
              <View style={styles.currentOverlay}>
                {isPlaying ? (
                  <AuraPlayPulse playing size={14} />
                ) : (
                  <Play size={16} color={Color.gold100} fill={Color.gold100} />
                )}
              </View>
            )}
          </AuraArtwork>
        )}

        <View style={styles.info}>
          <AuraText role="label" lines={1} color={isCurrent ? Color.gold300 : Color.text_primary}>
            {song.title}
          </AuraText>
          <View style={styles.metaRow}>
            <AuraText role="caption" lines={1} style={styles.artist}>
              {song.artist || "فنان"}
            </AuraText>
            {isDownloaded && (
              <AuraText role="tiny" color={Color.state_success}>
                محفوظة
              </AuraText>
            )}
          </View>
        </View>

        {!!duration && !isCurrent && (
          <AuraText role="numeric" style={styles.duration}>
            {duration}
          </AuraText>
        )}
      </AuraTouch>

      <AuraTouch
        feedback="impact"
        pressedScale={0.88}
        onPress={() => toggleFavorite(song)}
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        style={styles.action}
      >
        <Heart
          size={17}
          color={isFav ? Color.gold500 : Color.text_muted}
          fill={isFav ? Color.gold500 : "transparent"}
        />
      </AuraTouch>

      <View style={styles.action}>
        {isDownloading ? (
          <ActivityIndicator size="small" color={Color.gold500} />
        ) : isDownloaded ? (
          <CheckCircle2 size={17} color={Color.state_success} />
        ) : (
          <AuraTouch
            feedback="selection"
            pressedScale={0.88}
            onPress={() => downloadSong(song)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <DownloadCloud size={17} color={Color.text_muted} />
          </AuraTouch>
        )}
      </View>

      {!!onOptionsPress && (
        <AuraTouch
          feedback="selection"
          pressedScale={0.88}
          onPress={() => onOptionsPress(song)}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={styles.action}
        >
          <MoreVertical size={17} color={Color.text_muted} />
        </AuraTouch>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Space.s2,
    paddingStart: Space.s2,
    paddingEnd: Space.s1,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairlineSoft,
  },
  rowCurrent: {
    backgroundColor: Color.veil_goldTint,
    borderBottomColor: Color.veil_goldHairline,
    borderRadius: Radius.md,
  },
  rank: { width: 24, textAlign: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: Space.s3, minWidth: 0 },
  info: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Space.s2, marginTop: 1 },
  artist: { flexShrink: 1 },
  duration: { marginStart: Space.s2 },
  currentOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_scrim,
  },
  action: { padding: Space.s2 },
});
