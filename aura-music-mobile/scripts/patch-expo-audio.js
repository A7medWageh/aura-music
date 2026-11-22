/**
 * Patch expo-audio for iOS Lock Screen, Background Playback, and AURA SOUND ENGINE:
 * 1. Enables lock-screen seek / scrub bar by adding track duration to AudioMetadata.
 * 2. Prevents AVPlayer from incorrectly tagging on-demand HTTP audio streams as "LIVE".
 * 3. Keeps changePlaybackPositionCommand enabled for smooth lock-screen scrubbing.
 * 4. Integrates AURA SOUND ENGINE Native DSP pipeline via CoreMedia MTAudioProcessingTap.
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
    const normalizedContent = content.replace(/\r\n/g, "\n");
    const normalizedReplacement = replacement.replace(/\r\n/g, "\n");
    const normalizedTarget = target.replace(/\r\n/g, "\n");

    if (normalizedContent.includes(normalizedReplacement) || (description.includes("setAuraEngineConfig") && normalizedContent.includes("setAuraEngineConfig"))) {
      // Already patched
      continue;
    }
    if (normalizedContent.includes(normalizedTarget)) {
      // Replace with preserving original line endings if CRLF
      const useCRLF = content.includes("\r\n");
      const finalReplacement = useCRLF ? replacement.replace(/\r?\n/g, "\r\n") : replacement.replace(/\r\n/g, "\n");
      const finalTarget = useCRLF ? target.replace(/\r?\n/g, "\r\n") : target.replace(/\r\n/g, "\n");
      content = content.replace(finalTarget, finalReplacement);
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
const nativePatchesDir = path.join(baseDir, "native-patches");

// 0. Copy AuraSoundEngine files if present in native-patches
if (fs.existsSync(nativePatchesDir) && fs.existsSync(iosDir)) {
  const engineFiles = ["AuraSoundEngine.h", "AuraSoundEngine.m", "AudioTapProcessor.h", "AudioTapProcessor.m"];
  for (const file of engineFiles) {
    const src = path.join(nativePatchesDir, file);
    const dest = path.join(iosDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`[patch-expo-audio] Copied ${file} to expo-audio/ios/`);
    }
  }
}

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

// 2. Patch AudioPlayer.swift: Use metadata.duration and unmark live streams + AURA SOUND ENGINE
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
  {
    target: `  func setActiveForLockScreen(_ active: Bool = true, metadata: Metadata? = nil, options: LockScreenOptions?) {
    self.metadata = metadata
    self.isActiveForLockScreen = active
    self.lockScreenOptions = active ? options : nil
    if active {
      MediaController.shared.setActivePlayable(self, options: options)
    } else {
      MediaController.shared.setActivePlayable(nil)
    }
  }

  func updateStatus(with dict: [String: Any]) {`,
    replacement: `  func setActiveForLockScreen(_ active: Bool = true, metadata: Metadata? = nil, options: LockScreenOptions?) {
    self.metadata = metadata
    self.isActiveForLockScreen = active
    self.lockScreenOptions = active ? options : nil
    if active {
      MediaController.shared.setActivePlayable(self, options: options)
    } else {
      MediaController.shared.setActivePlayable(nil)
    }
  }

  func setAuraEngineConfig(_ config: [String: Any]) {
    audioProcessor?.updateAuraEngineConfig(config)
  }

  func updateStatus(with dict: [String: Any]) {`,
    description: "Add setAuraEngineConfig method to AudioPlayer",
  },
  {
    target: `        if status == .readyToPlay {
          self.updateStatus(with: [
            "isLoaded": true
          ])
          if self.isLooping {
            self.enqueueNextLoopItem()
          }
          if self.samplingEnabled && self.isLoaded {
            installTap()
            shouldInstallAudioTap = false
          }
        }`,
    replacement: `        if status == .readyToPlay {
          self.updateStatus(with: [
            "isLoaded": true
          ])
          if self.isLooping {
            self.enqueueNextLoopItem()
          }
          // Always install audio tap so AURA SOUND ENGINE operates on all playback tracks
          installTap()
          shouldInstallAudioTap = false
        }`,
    description: "Always install audio tap for AURA SOUND ENGINE on readyToPlay",
  },
  {
    target: `  func seekTo(seconds: Double, toleranceMillisBefore: Double? = nil, toleranceMillisAfter: Double? = nil) async {
    let time = CMTime(seconds: seconds, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    let toleranceBefore = toleranceMillisBefore.map {
      CMTime(seconds: $0 / 1000.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    } ?? CMTime.positiveInfinity
    let toleranceAfter = toleranceMillisAfter.map {
      CMTime(seconds: $0 / 1000.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    } ?? CMTime.positiveInfinity`,
    replacement: `  func seekTo(seconds: Double, toleranceMillisBefore: Double? = nil, toleranceMillisAfter: Double? = nil) async {
    let time = CMTime(seconds: seconds, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    // Exact sample-accurate seeking so audio scrubbers land on the exact millisecond requested
    let toleranceBefore = toleranceMillisBefore.map {
      CMTime(seconds: $0 / 1000.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    } ?? CMTime.zero
    let toleranceAfter = toleranceMillisAfter.map {
      CMTime(seconds: $0 / 1000.0, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
    } ?? CMTime.zero`,
    description: "Sample-accurate seeking in AudioPlayer with CMTime.zero tolerance",
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

// 4. Patch AudioTapProcessor.h: Expose updateAuraEngineConfig
patchFile(path.join(iosDir, "AudioTapProcessor.h"), [
  {
    target: `- (void)invalidate;

@end`,
    replacement: `- (void)invalidate;
- (void)updateAuraEngineConfig:(NSDictionary *)config;

@end`,
    description: "Declare updateAuraEngineConfig in AudioTapProcessor.h",
  },
]);

// 5. Patch AudioTapProcessor.m: Hook AuraSoundEngine
patchFile(path.join(iosDir, "AudioTapProcessor.m"), [
  {
    target: `#import "AudioTapProcessor.h"
#import <AudioToolbox/AudioToolbox.h>`,
    replacement: `#import "AudioTapProcessor.h"
#import "AuraSoundEngine.h"
#import <AudioToolbox/AudioToolbox.h>`,
    description: "Import AuraSoundEngine in AudioTapProcessor.m",
  },
  {
    target: `  if (processingFormat->mFormatFlags & kAudioFormatFlagIsNonInterleaved) {
    context->isNonInterleaved = true;
  }
}`,
    replacement: `  if (processingFormat->mFormatFlags & kAudioFormatFlagIsNonInterleaved) {
    context->isNonInterleaved = true;
  }
  
  [[AuraSoundEngine sharedEngine] prepareWithSampleRate:processingFormat->mSampleRate channelCount:processingFormat->mChannelsPerFrame];
}`,
    description: "Prepare AuraSoundEngine with sample rate in tapPrepare",
  },
  {
    target: `  AudioTapProcessor *processor = (__bridge AudioTapProcessor *)context->self;
  
  if (!context->isValid) {
    return;
  }
  
  SampleBufferCallback callback = processor.sampleBufferCallback;`,
    replacement: `  AudioTapProcessor *processor = (__bridge AudioTapProcessor *)context->self;
  
  if (!context->isValid) {
    return;
  }
  
  // Real-time audio DSP processing via AURA SOUND ENGINE
  [[AuraSoundEngine sharedEngine] processBufferList:bufferListInOut numberFrames:(UInt32)numberFrames isNonInterleaved:context->isNonInterleaved];
  
  SampleBufferCallback callback = processor.sampleBufferCallback;`,
    description: "Call AuraSoundEngine processBufferList in tapProcess",
  },
  {
    target: `@end`,
    replacement: `- (void)updateAuraEngineConfig:(NSDictionary *)config {
  [[AuraSoundEngine sharedEngine] updateConfig:config];
}

@end`,
    description: "Implement updateAuraEngineConfig in AudioTapProcessor.m",
  },
]);

// 6. Patch AudioModule.swift: expose setAuraEngineConfig and instant audio route switching to JS.
// Done by hand (not patchFile) because earlier builds inserted a duplicate function and would
// otherwise never receive the new route functions.
(function patchAudioModule() {
  const filePath = path.join(iosDir, "AudioModule.swift");
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-audio] File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, "utf8");
  const useCRLF = content.includes("\r\n");
  content = content.replace(/\r\n/g, "\n");

  const setBlock = `      Function("setAuraEngineConfig") { (player: AudioPlayer, config: [String: Any]) in
        player.setAuraEngineConfig(config)
      }`;
  const routeBlock = `      Function("toggleAudioOutputRoute") { () -> String in
        do {
          let session = AVAudioSession.sharedInstance()
          let isSpeaker = session.currentRoute.outputs.contains(where: { $0.portType == .builtInSpeaker })
          if isSpeaker {
            try session.overrideOutputAudioPort(.none)
          } else {
            try session.overrideOutputAudioPort(.speaker)
          }
          let after = session.currentRoute.outputs.contains(where: { $0.portType == .builtInSpeaker })
          return after ? "speaker" : "headphones"
        } catch {
          return "error"
        }
      }

      Function("getAudioOutputRoute") { () -> String in
        let session = AVAudioSession.sharedInstance()
        let isSpeaker = session.currentRoute.outputs.contains(where: { $0.portType == .builtInSpeaker })
        return isSpeaker ? "speaker" : "headphones"
      }`;

  let modified = false;

  // Drop accidental duplicate registrations left by older patch runs.
  while (content.split(setBlock).length - 1 > 1) {
    content = content.replace(`${setBlock}\n`, "");
    modified = true;
  }

  if (!content.includes(setBlock)) {
    const pauseTarget = `      Function("pause") { player in
        player.ref.pause()
        if !player.keepAudioSessionActive {
          self.deactivateSession()
        }
      }`;
    if (!content.includes(pauseTarget)) {
      console.warn("[patch-expo-audio] Target not found for: add setAuraEngineConfig to AudioModule.swift");
      return;
    }
    content = content.replace(pauseTarget, `${pauseTarget}\n\n${setBlock}`);
    modified = true;
  }

  if (!content.includes("toggleAudioOutputRoute")) {
    content = content.replace(setBlock, `${setBlock}\n\n${routeBlock}`);
    modified = true;
  } else {
    // Older installs reported the requested route instead of the actual route after the switch.
    const oldToggleBlock = `      Function("toggleAudioOutputRoute") { () -> String in
        do {
          let session = AVAudioSession.sharedInstance()
          let isSpeaker = session.currentRoute.outputs.contains(where: { $0.portType == .builtInSpeaker })
          if isSpeaker {
            try session.overrideOutputAudioPort(.none)
            return "headphones"
          } else {
            try session.overrideOutputAudioPort(.speaker)
            return "speaker"
          }
        } catch {
          return "error"
        }
      }`;
    if (content.includes(oldToggleBlock)) {
      const newToggleBlock = routeBlock.split("\n\n      Function(\"getAudioOutputRoute\")")[0];
      content = content.replace(oldToggleBlock, newToggleBlock);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, useCRLF ? content.replace(/\n/g, "\r\n") : content, "utf8");
    console.log("[patch-expo-audio] Applied: audio route switching in AudioModule.swift");
  }
})();

// 7. Patch TypeScript definitions
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

patchFile(path.join(buildDir, "AudioModule.types.d.ts"), [
  {
    target: `    pause(): void;\n    play(): void;`,
    replacement: `    pause(): void;\n    play(): void;\n    setAuraEngineConfig?(config: Record<string, any>): void;`,
    description: "Add setAuraEngineConfig method to AudioModule.types.d.ts",
  },
]);

console.log("[patch-expo-audio] All expo-audio patches verified.");
