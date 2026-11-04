//
//  AuraSoundEngine.h
//  Aura Music — Advanced Native Audio Enhancement Engine
//  High-Performance DSP Pipeline (iOS & iPhone 12 Pro Max Priority)
//

#import <Foundation/Foundation.h>
#import <AudioToolbox/AudioToolbox.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, AuraAudioProfile) {
    AuraAudioProfileAuto = 0,
    AuraAudioProfileSpeaker = 1,      // iPhone 12 Pro Max tuned
    AuraAudioProfileHeadphones = 2,
    AuraAudioProfileAirPods = 3
};

@interface AuraSoundEngine : NSObject

@property (nonatomic, assign) BOOL isEnabled;
@property (nonatomic, assign) BOOL isBypassed;
@property (nonatomic, assign) float soundBoost;          // 1.0 to 2.0 (100% - 200%)
@property (nonatomic, assign) float vocalClarity;        // 0.0 to 1.0 (0% - 100%)
@property (nonatomic, assign) float bassDepth;           // 0.0 to 1.0 (0% - 100%)
@property (nonatomic, assign) float spatialWidth;        // 0.0 to 2.0 (1.0 = normal, 1.6 = wide)
@property (nonatomic, assign) BOOL is8dActive;
@property (nonatomic, copy) NSString *presetId;
@property (nonatomic, assign) AuraAudioProfile profile;

+ (instancetype)sharedEngine;

/**
 * Configure sample rate and channel format (usually 44100 / 48000 Hz, 2 channels Float32)
 */
- (void)prepareWithSampleRate:(double)sampleRate channelCount:(UInt32)channelCount;

/**
 * Process audio in-place for either interleaved or non-interleaved PCM Float32 buffer
 */
- (void)processBufferList:(AudioBufferList *)bufferList numberFrames:(UInt32)numberFrames isNonInterleaved:(BOOL)isNonInterleaved;

/**
 * Update engine configuration from dictionary (called from React Native bridge)
 */
- (void)updateConfig:(NSDictionary *)config;

/**
 * Reset internal filter states (called on song transition or seek to prevent clicks)
 */
- (void)resetFilterStates;

@end

NS_ASSUME_NONNULL_END
