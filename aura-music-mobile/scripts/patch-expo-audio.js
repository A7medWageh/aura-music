/**
 * Patch expo-audio for iOS Lock Screen & Background Playback:
 * 1. Enables lock-screen seek / scrub bar by adding track duration to AudioMetadata.
 * 2. Prevents AVPlayer from incorrectly tagging on-demand HTTP audio streams as "LIVE".
 * 3. Keeps changePlaybackPositionCommand enabled for smooth lock-screen scrubbing.
 */

const fs = require("fs");
const path = require("path");

function patchFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-audio] File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  for (const { target, replacement, description } of transforms) {
    if (content.includes(replacement)) {
      // Already patched
      continue;
    }
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      modified = true;
      console.log(`[patch-expo-audio] Applied: ${description} in ${path.basename(filePath)}`);
    } else {
      console.warn(`[patch-expo-audio] Target not found for: ${description}`);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

const baseDir = path.resolve(__dirname, "..");
const iosDir = path.join(baseDir, "node_modules", "expo-audio", "ios");
const buildDir = path.join(baseDir, "node_modules", "expo-audio", "build");

// 1. Patch AudioRecords.swift: Add duration to Metadata
patchFile(path.join(iosDir, "AudioRecords.swift"), [
  {
    target: `@Field var artworkUrl: URL?
}`,
    replacement: `@Field var artworkUrl: URL?
  @Field var duration: Double?
}`,
    description: "Add duration field to Metadata record",
  },
]);

// 2. Patch AudioPlayer.swift: Use metadata.duration and unmark live streams
patchFile(path.join(iosDir, "AudioPlayer.swift"), [
  {
    target: `  var duration: Double {
    let seconds = ref.currentItem?.duration.seconds ?? 0.0
    return seconds.isNaN ? 0.0 : seconds
  }

  var currentTime: Double {
    let seconds = ref.currentItem?.currentTime().seconds ?? 0.0
    return seconds.isNaN ? 0.0 : seconds
  }

  var isLive: Bool {
    ref.currentItem?.duration.isIndefinite ?? false
  }`,
    replacement: `  var duration: Double {
    if let metaDur = metadata?.duration, metaDur > 0 {
      return metaDur
    }
    let seconds = ref.currentItem?.duration.seconds ?? 0.0
    return seconds.isNaN ? 0.0 : seconds
  }

  var currentTime: Double {
    let seconds = ref.currentItem?.currentTime().seconds ?? 0.0
    return seconds.isNaN ? 0.0 : seconds
  }

  var isLive: Bool {
    if (metadata?.duration ?? 0) > 0 {
      return false
    }
    return ref.currentItem?.duration.isIndefinite ?? false
  }`,
    description: "Support custom duration & unmark live streams in AudioPlayer",
  },
]);

// 3. Patch MediaController.swift: Fix lock screen scrubbing and LIVE badge
patchFile(path.join(iosDir, "MediaController.swift"), [
  {
    target: `    activePlayable = playable
    playable?.isActiveForLockScreen = true
    isLiveStream = options?.isLiveStream ?? playable?.isLive ?? false`,
    replacement: `    activePlayable = playable
    playable?.isActiveForLockScreen = true
    let hasKnownDuration = (playable?.metadata?.duration ?? 0) > 0 || (playable?.duration ?? 0) > 0
    if let explicitLive = options?.isLiveStream {
      isLiveStream = explicitLive
    } else if hasKnownDuration {
      isLiveStream = false
    } else {
      isLiveStream = playable?.isLive ?? false
    }`,
    description: "Prevent lock-screen isLiveStream when duration is known",
  },
  {
    target: `  private func applyPlaybackInfo(_ info: inout [String: Any], for playable: any LockScreenPlayable) {
    if isLiveStream {
      info[MPNowPlayingInfoPropertyIsLiveStream] = true
      info.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
      info.removeValue(forKey: MPNowPlayingInfoPropertyElapsedPlaybackTime)
    } else {
      info[MPMediaItemPropertyPlaybackDuration] = playable.duration
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = playable.currentTime
    }`,
    replacement: `  private func applyPlaybackInfo(_ info: inout [String: Any], for playable: any LockScreenPlayable) {
    let trackDuration = (playable.metadata?.duration ?? 0) > 0 ? (playable.metadata!.duration!) : playable.duration

    if isLiveStream && trackDuration <= 0 {
      info[MPNowPlayingInfoPropertyIsLiveStream] = true
      info.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
      info.removeValue(forKey: MPNowPlayingInfoPropertyElapsedPlaybackTime)
    } else {
      info.removeValue(forKey: MPNowPlayingInfoPropertyIsLiveStream)
      if trackDuration > 0 {
        info[MPMediaItemPropertyPlaybackDuration] = trackDuration
      }
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = playable.currentTime
    }`,
    description: "Write true duration to MPMediaItemPropertyPlaybackDuration",
  },
  {
    target: `    remoteCommandCenter.playCommand.isEnabled = true
    remoteCommandCenter.pauseCommand.isEnabled = true
    remoteCommandCenter.togglePlayPauseCommand.isEnabled = true
    remoteCommandCenter.changePlaybackPositionCommand.isEnabled = !isLiveStream`,
    replacement: `    remoteCommandCenter.playCommand.isEnabled = true
    remoteCommandCenter.pauseCommand.isEnabled = true
    remoteCommandCenter.togglePlayPauseCommand.isEnabled = true
    remoteCommandCenter.changePlaybackPositionCommand.isEnabled = true`,
    description: "Always enable changePlaybackPositionCommand for lock screen scrubbing",
  },
]);

// 4. Patch TypeScript definitions
patchFile(path.join(buildDir, "Audio.types.d.ts"), [
  {
    target: `export type AudioMetadata = {
    title?: string;
    artist?: string;
    albumTitle?: string;
    artworkUrl?: string;
};`,
    replacement: `export type AudioMetadata = {
    title?: string;
    artist?: string;
    albumTitle?: string;
    artworkUrl?: string;
    duration?: number;
};`,
    description: "Add duration?: number to AudioMetadata in Audio.types.d.ts",
  },
]);

console.log("[patch-expo-audio] All expo-audio patches verified.");
