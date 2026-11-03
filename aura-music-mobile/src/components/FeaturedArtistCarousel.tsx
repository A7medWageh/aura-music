import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Play,
  Heart,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  User,
} from "lucide-react-native";
import { Color, Gradient, Radius, Size, Space } from "@/theme";
import {
  AuraArtwork,
  AuraBadge,
  AuraText,
  AuraTouch,
} from "@/ui";
import { Song } from "@/types/music";
import { FeaturedArtistSlide } from "@/store/useHomeStore";
import { resolveArtworkUri } from "@/utils/media";

const SLIDE_MS = 6500;

const SlideTimer: React.FC = () => {
  const filled = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    filled.setValue(0);
    const run = Animated.timing(filled, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [filled]);

  return (
    <View pointerEvents="none" style={styles.slideTimerTrack}>
      <Animated.View
        style={[
          styles.slideTimerFill,
          {
            width: "100%",
            transformOrigin: "left",
            transform: [{ scaleX: filled }],
          } as any,
        ]}
      />
    </View>
  );
};

interface FeaturedArtistCarouselProps {
  slides: FeaturedArtistSlide[];
  onPlaySong: (song: Song, queue: Song[]) => void;
  onOpenArtist: (id: string, name: string, imageUrl?: string) => void;
  onToggleFavorite?: (song: Song) => void;
  isFavorite?: (songId: string) => boolean;
}

export const FeaturedArtistCarousel: React.FC<FeaturedArtistCarouselProps> = ({
  slides,
  onPlaySong,
  onOpenArtist,
  onToggleFavorite,
  isFavorite,
}) => {
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.min(width, 620);
  const heroWidth = Math.min(contentWidth - Space.s4 * 2, 560);
  const heroHeight = Math.max(250, Math.min(heroWidth / 1.28, height * 0.44));
  const heroTitleSize = Math.max(23, Math.min(31, Math.round(heroWidth * 0.084)));

  const [activeIndex, setActiveIndex] = useState(0);
  const isPaused = useRef(false);
  const touchStartX = useRef(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const thumbScrollRef = useRef<any>(null);

  const total = slides.length;
  const currentSlide = slides[activeIndex] || slides[0];
  const allFeaturedSongs = slides.map((s) => s.featuredSong);

  const triggerSlideTransition = useCallback((nextIndex: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.82,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    setActiveIndex(nextIndex);

    // Scroll mini thumbnail strip to center active thumbnail
    if (thumbScrollRef.current) {
      thumbScrollRef.current.scrollTo({
        x: Math.max(0, nextIndex * 46 - heroWidth / 2 + 23),
        animated: true,
      });
    }
  }, [fadeAnim, heroWidth]);

  const nextSlide = useCallback(() => {
    if (total <= 1) return;
    triggerSlideTransition((activeIndex + 1) % total);
  }, [activeIndex, total, triggerSlideTransition]);

  const prevSlide = useCallback(() => {
    if (total <= 1) return;
    triggerSlideTransition((activeIndex - 1 + total) % total);
  }, [activeIndex, total, triggerSlideTransition]);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < total && index !== activeIndex) {
      triggerSlideTransition(index);
    }
  };

  // Auto rotation every 6.5 seconds
  useEffect(() => {
    if (total <= 1) return;

    const timer = setInterval(() => {
      if (!isPaused.current) {
        nextSlide();
      }
    }, SLIDE_MS);

    return () => clearInterval(timer);
  }, [nextSlide, total]);

  if (!slides || slides.length === 0 || !currentSlide) return null;

  const song = currentSlide.featuredSong;
  const isFav = isFavorite ? isFavorite(song.id) : false;

  return (
    <View style={styles.container}>
      {/* Active Hero Slide Container with Swipe Gesture Handling */}
      <View
        onTouchStart={(e) => {
          isPaused.current = true;
          touchStartX.current = e.nativeEvent.pageX;
        }}
        onTouchEnd={(e) => {
          isPaused.current = false;
          const diff = touchStartX.current - e.nativeEvent.pageX;
          // Swipe threshold of 45px
          if (Math.abs(diff) > 45) {
            // In RTL: swipe left (diff > 0) goes next, swipe right goes prev
            if (diff > 0) {
              nextSlide();
            } else {
              prevSlide();
            }
          }
        }}
        style={[styles.heroCard, { width: heroWidth, height: heroHeight }]}
      >
        <Animated.View style={[{ width: "100%", height: "100%", opacity: fadeAnim }]}>
          {/* Artist Artwork with cinematic gradient overlay */}
          <AuraArtwork
            uri={resolveArtworkUri(null, currentSlide.imageUrl, song.youtubeVideoId, "artist")}
            size={heroWidth}
            ratio={heroHeight / heroWidth}
            shape="slab"
            ring="hairline"
          >
            <LinearGradient
              colors={[
                "rgba(10,9,8,0.12)",
                "rgba(10,9,8,0.50)",
                "rgba(10,9,8,0.97)",
              ]}
              locations={[0.0, 0.48, 1.0]}
              style={StyleSheet.absoluteFill}
            />

            {/* How long until the next slide */}
            {total > 1 && <SlideTimer key={activeIndex} />}

            {/* Top Control Bar */}
            <View style={styles.topRow}>
              <View style={styles.badgeRow}>
                <AuraBadge label={currentSlide.tag} tone="gold" />
                <View style={styles.verifiedChip}>
                  <CheckCircle2 size={12} color={Color.gold500} />
                  <AuraText role="tiny" color={Color.gold100} style={{ fontWeight: "700" }}>
                    فنان موثّق
                  </AuraText>
                </View>
              </View>

              {/* Counter Pill with Next / Prev buttons */}
              <View style={styles.counterPill}>
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.88}
                  onPress={prevSlide}
                  style={styles.navArrow}
                >
                  <ChevronRight size={16} color={Color.gold300} />
                </AuraTouch>

                <AuraText role="tiny" color={Color.gold300} style={styles.counterText}>
                  {String(activeIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </AuraText>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.88}
                  onPress={nextSlide}
                  style={styles.navArrow}
                >
                  <ChevronLeft size={16} color={Color.gold300} />
                </AuraTouch>
              </View>
            </View>

            {/* Center / Bottom Info Layer */}
            <View style={styles.bottomContent}>
              <AuraText
                role="display"
                align="right"
                style={[
                  styles.artistName,
                  {
                    fontSize: heroTitleSize,
                    lineHeight: Math.round(heroTitleSize * 1.24),
                  },
                ]}
                lines={1}
              >
                {currentSlide.name}
              </AuraText>

              {/* Franco Song Title placed strictly directly under artist name */}
              <AuraText
                role="bodyStrong"
                align="right"
                color={Color.gold300}
                lines={1}
                style={styles.francoSong}
              >
                {currentSlide.francoSongTitle || currentSlide.latestTitle}
              </AuraText>

              <AuraText
                role="caption"
                align="right"
                color={Color.text_muted}
                lines={1}
                style={styles.songMeta}
              >
                {currentSlide.monthlyListeners}
              </AuraText>

              {/* Action Buttons Row - directly under the singer's name and text */}
              <View style={styles.actionRow}>
                {/* Primary Play Button */}
                <AuraTouch
                  feedback="impact"
                  pressedScale={0.94}
                  onPress={() => onPlaySong(song, allFeaturedSongs)}
                  style={styles.playButton}
                >
                  <LinearGradient
                    colors={[Gradient.ember[0], Gradient.signature[1]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.playGradient}
                  >
                    <Play size={16} color={Color.ink0} fill={Color.ink0} style={{ marginEnd: 6 }} />
                    <AuraText role="bodyStrong" color={Color.ink0}>
                      استمع الآن
                    </AuraText>
                  </LinearGradient>
                </AuraTouch>

                {/* Favorite Heart Button */}
                {onToggleFavorite && (
                  <AuraTouch
                    feedback="impact"
                    pressedScale={0.92}
                    onPress={() => onToggleFavorite(song)}
                    style={styles.iconButton}
                  >
                    <Heart
                      size={18}
                      color={isFav ? Color.gold500 : Color.text_primary}
                      fill={isFav ? Color.gold500 : "transparent"}
                    />
                  </AuraTouch>
                )}

                {/* View Artist Profile Button */}
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.94}
                  onPress={() => onOpenArtist(currentSlide.artistId, currentSlide.name, currentSlide.imageUrl)}
                  style={styles.profileChip}
                >
                  <User size={14} color={Color.gold100} style={{ marginEnd: 6 }} />
                  <AuraText role="caption" color={Color.gold100} style={{ fontWeight: "600" }}>
                    ملف الفنان
                  </AuraText>
                </AuraTouch>
              </View>
            </View>
          </AuraArtwork>
        </Animated.View>
      </View>

      {/* Mini Thumbnail Strip for Quick Navigation across All 15 Artists */}
      <ScrollView
        ref={thumbScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbStrip}
      >
        {slides.map((s, idx) => {
          const isActive = idx === activeIndex;
          return (
            <AuraTouch
              key={`thumb-${s.artistId}-${idx}`}
              feedback="selection"
              pressedScale={0.9}
              onPress={() => goToSlide(idx)}
              style={[
                styles.thumbItem,
                isActive && styles.thumbItemActive,
              ]}
            >
              <AuraArtwork
                uri={resolveArtworkUri(null, s.imageUrl, undefined, "artist")}
                size={36}
                shape="coin"
                ring={isActive ? "gold" : "none"}
              />
            </AuraTouch>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: Space.s5,
  },
  heroCard: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  slideTimerTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Color.veil_hairline,
  },
  slideTimerFill: {
    height: "100%",
    backgroundColor: Color.gold500,
  },
  topRow: {
    position: "absolute",
    top: Space.s3,
    left: Space.s3,
    right: Space.s3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(10,9,8,0.72)",
    paddingHorizontal: Space.s2,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  counterPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,9,8,0.78)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    gap: 3,
  },
  navArrow: {
    padding: 3,
  },
  counterText: {
    fontWeight: "700",
    fontSize: 11,
    paddingHorizontal: 3,
  },
  bottomContent: {
    position: "absolute",
    left: Space.s4,
    right: Space.s4,
    bottom: Space.s4,
    alignItems: "flex-start",
  },
  artistName: {
    fontWeight: "bold",
    marginBottom: 2,
    textAlign: "right",
    alignSelf: "stretch",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  francoSong: {
    marginBottom: 2,
    fontWeight: "700",
    fontSize: 14,
    textAlign: "right",
    alignSelf: "stretch",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  songMeta: {
    marginBottom: Space.s3,
    fontSize: 12,
    textAlign: "right",
    alignSelf: "stretch",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    gap: Space.s2,
  },
  playButton: {
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  playGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    height: 42,
    paddingHorizontal: Space.s4,
    borderRadius: Radius.pill,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    backgroundColor: Color.veil_scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  profileChip: {
    height: 42,
    paddingHorizontal: Space.s3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Space.s4,
    paddingTop: Space.s3,
  },
  thumbItem: {
    padding: 2,
    borderRadius: Radius.pill,
    opacity: 0.55,
  },
  thumbItemActive: {
    opacity: 1.0,
    borderWidth: 1.5,
    borderColor: Color.gold500,
    transform: [{ scale: 1.15 }],
  },
});
