//
//  AuraSoundEngine.m
//  Aura Music — Advanced Native Audio Enhancement Engine
//  High-Performance DSP Pipeline (iOS & iPhone 12 Pro Max Priority)
//

#import "AuraSoundEngine.h"
#import <math.h>
#import <os/lock.h>

#define AURA_EQ_BANDS 10
#define AURA_MAX_CHANNELS 2

typedef struct {
    double b0, b1, b2, a1, a2;
    double s1[AURA_MAX_CHANNELS];
    double s2[AURA_MAX_CHANNELS];
} AuraBiquad;

@implementation AuraSoundEngine {
    os_unfair_lock _engineLock;
    double _sampleRate;
    UInt32 _channelCount;
    
    // 10-Band Equalizer filters
    AuraBiquad _eqBands[AURA_EQ_BANDS];
    double _eqFrequencies[AURA_EQ_BANDS];
    double _eqGains[AURA_EQ_BANDS];      // in dB
    double _eqQFactors[AURA_EQ_BANDS];
    
    // Dedicated Vocal Presence Filter (2.4 kHz peaking)
    AuraBiquad _vocalFilter;
    
    // Subsonic Rumble Filter (Highpass)
    AuraBiquad _subsonicFilter;
    
    // 8D Rotation phase
    double _rotationPhase;
    double _rotationPhaseInc;
    
    // Smooth gain ramp for click-free parameter transitions
    float _currentAppliedGain;
}

+ (instancetype)sharedEngine {
    static AuraSoundEngine *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [[AuraSoundEngine alloc] init];
    });
    return sharedInstance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _engineLock = OS_UNFAIR_LOCK_INIT;
        _isEnabled = YES;
        _isBypassed = NO;
        _soundBoost = 1.0f;
        _vocalClarity = 0.5f;
        _bassDepth = 0.5f;
        _spatialWidth = 1.0f;
        _is8dActive = NO;
        _presetId = @"off";
        _profile = AuraAudioProfileAuto;
        _sampleRate = 44100.0;
        _channelCount = 2;
        _rotationPhase = 0.0;
        _rotationPhaseInc = 2.0 * M_PI / (44100.0 * 5.5); // ~5.5s per cycle
        _currentAppliedGain = 1.0f;
        
        // Default 10 ISO standard center frequencies
        _eqFrequencies[0] = 32.0;    // Sub-bass
        _eqFrequencies[1] = 64.0;    // Deep bass
        _eqFrequencies[2] = 125.0;   // Punch bass
        _eqFrequencies[3] = 250.0;   // Warmth
        _eqFrequencies[4] = 500.0;   // Low-mids
        _eqFrequencies[5] = 1000.0;  // Vocal core
        _eqFrequencies[6] = 2200.0;  // Vocal clarity / presence
        _eqFrequencies[7] = 4500.0;  // Articulation
        _eqFrequencies[8] = 9000.0;  // Brilliance / Air
        _eqFrequencies[9] = 16000.0; // Shimmer
        
        for (int i = 0; i < AURA_EQ_BANDS; i++) {
            _eqGains[i] = 0.0;
            _eqQFactors[i] = (i == 0 || i == 9) ? 0.707 : 1.2;
        }
        
        [self rebuildFilters];
    }
    return self;
}

- (void)prepareWithSampleRate:(double)sampleRate channelCount:(UInt32)channelCount {
    os_unfair_lock_lock(&_engineLock);
    _sampleRate = (sampleRate > 8000.0) ? sampleRate : 44100.0;
    _channelCount = (channelCount > 0 && channelCount <= AURA_MAX_CHANNELS) ? channelCount : 2;
    _rotationPhaseInc = 2.0 * M_PI / (_sampleRate * 5.5);
    [self rebuildFilters];
    os_unfair_lock_unlock(&_engineLock);
}

#pragma mark - Filter Coefficient Calculation (RBJ Cookbook)

static void computePeaking(AuraBiquad *filter, double freq, double gainDB, double Q, double Fs) {
    if (freq <= 0.0 || Fs <= 0.0) return;
    if (freq >= Fs * 0.49) freq = Fs * 0.49;
    
    double A = pow(10.0, gainDB / 40.0);
    double w0 = 2.0 * M_PI * freq / Fs;
    double alpha = sin(w0) / (2.0 * Q);
    double cosw0 = cos(w0);
    
    double b0 = 1.0 + alpha * A;
    double b1 = -2.0 * cosw0;
    double b2 = 1.0 - alpha * A;
    double a0 = 1.0 + alpha / A;
    double a1 = -2.0 * cosw0;
    double a2 = 1.0 - alpha / A;
    
    filter->b0 = b0 / a0;
    filter->b1 = b1 / a0;
    filter->b2 = b2 / a0;
    filter->a1 = a1 / a0;
    filter->a2 = a2 / a0;
}

static void computeLowShelf(AuraBiquad *filter, double freq, double gainDB, double S, double Fs) {
    if (freq <= 0.0 || Fs <= 0.0) return;
    if (freq >= Fs * 0.49) freq = Fs * 0.49;
    
    double A = pow(10.0, gainDB / 40.0);
    double w0 = 2.0 * M_PI * freq / Fs;
    double cosw0 = cos(w0);
    double sinw0 = sin(w0);
    double alpha = sinw0 / 2.0 * sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);
    double temp2SqrtA = 2.0 * sqrt(A) * alpha;
    
    double b0 = A * ((A + 1.0) - (A - 1.0) * cosw0 + temp2SqrtA);
    double b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosw0);
    double b2 = A * ((A + 1.0) - (A - 1.0) * cosw0 - temp2SqrtA);
    double a0 = (A + 1.0) + (A - 1.0) * cosw0 + temp2SqrtA;
    double a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosw0);
    double a2 = (A + 1.0) + (A - 1.0) * cosw0 - temp2SqrtA;
    
    filter->b0 = b0 / a0;
    filter->b1 = b1 / a0;
    filter->b2 = b2 / a0;
    filter->a1 = a1 / a0;
    filter->a2 = a2 / a0;
}

static void computeHighShelf(AuraBiquad *filter, double freq, double gainDB, double S, double Fs) {
    if (freq <= 0.0 || Fs <= 0.0) return;
    if (freq >= Fs * 0.49) freq = Fs * 0.49;
    
    double A = pow(10.0, gainDB / 40.0);
    double w0 = 2.0 * M_PI * freq / Fs;
    double cosw0 = cos(w0);
    double sinw0 = sin(w0);
    double alpha = sinw0 / 2.0 * sqrt((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);
    double temp2SqrtA = 2.0 * sqrt(A) * alpha;
    
    double b0 = A * ((A + 1.0) + (A - 1.0) * cosw0 + temp2SqrtA);
    double b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosw0);
    double b2 = A * ((A + 1.0) + (A - 1.0) * cosw0 - temp2SqrtA);
    double a0 = (A + 1.0) - (A - 1.0) * cosw0 + temp2SqrtA;
    double a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosw0);
    double a2 = (A + 1.0) - (A - 1.0) * cosw0 - temp2SqrtA;
    
    filter->b0 = b0 / a0;
    filter->b1 = b1 / a0;
    filter->b2 = b2 / a0;
    filter->a1 = a1 / a0;
    filter->a2 = a2 / a0;
}

static void computeHighPass(AuraBiquad *filter, double freq, double Q, double Fs) {
    if (freq <= 0.0 || Fs <= 0.0) return;
    if (freq >= Fs * 0.49) freq = Fs * 0.49;
    
    double w0 = 2.0 * M_PI * freq / Fs;
    double cosw0 = cos(w0);
    double alpha = sin(w0) / (2.0 * Q);
    
    double b0 = (1.0 + cosw0) / 2.0;
    double b1 = -(1.0 + cosw0);
    double b2 = (1.0 + cosw0) / 2.0;
    double a0 = 1.0 + alpha;
    double a1 = -2.0 * cosw0;
    double a2 = 1.0 - alpha;
    
    filter->b0 = b0 / a0;
    filter->b1 = b1 / a0;
    filter->b2 = b2 / a0;
    filter->a1 = a1 / a0;
    filter->a2 = a2 / a0;
}

static inline float processSample(AuraBiquad *filter, float inSample, int ch) {
    double x = (double)inSample;
    double y = filter->b0 * x + filter->s1[ch];
    filter->s1[ch] = filter->b1 * x - filter->a1 * y + filter->s2[ch];
    filter->s2[ch] = filter->b2 * x - filter->a2 * y;
    return (float)y;
}

- (void)rebuildFilters {
    // 1. Bands: Band 0 is low shelf, Band 9 is high shelf, 1-8 are peaking
    computeLowShelf(&_eqBands[0], _eqFrequencies[0], _eqGains[0], 0.9, _sampleRate);
    for (int i = 1; i < AURA_EQ_BANDS - 1; i++) {
        computePeaking(&_eqBands[i], _eqFrequencies[i], _eqGains[i], _eqQFactors[i], _sampleRate);
    }
    computeHighShelf(&_eqBands[9], _eqFrequencies[9], _eqGains[9], 0.9, _sampleRate);
    
    // 2. Vocal clarity filter (peak around 2.4kHz, gain scaled by vocalClarity 0..1 => 0..+7.5 dB)
    double vocalGain = (_vocalClarity > 0.0f) ? (_vocalClarity * 7.5) : 0.0;
    computePeaking(&_vocalFilter, 2400.0, vocalGain, 1.25, _sampleRate);
    
    // 3. Subsonic filter based on active profile
    double hpCutoff = 28.0;
    if (_profile == AuraAudioProfileSpeaker) {
        // iPhone 12 Pro Max speaker cutoff: 55Hz high-pass prevents driver distortion
        hpCutoff = 55.0;
    }
    computeHighPass(&_subsonicFilter, hpCutoff, 0.707, _sampleRate);
}

- (void)resetFilterStates {
    os_unfair_lock_lock(&_engineLock);
    for (int b = 0; b < AURA_EQ_BANDS; b++) {
        for (int c = 0; c < AURA_MAX_CHANNELS; c++) {
            _eqBands[b].s1[c] = 0.0;
            _eqBands[b].s2[c] = 0.0;
        }
    }
    for (int c = 0; c < AURA_MAX_CHANNELS; c++) {
        _vocalFilter.s1[c] = 0.0;
        _vocalFilter.s2[c] = 0.0;
        _subsonicFilter.s1[c] = 0.0;
        _subsonicFilter.s2[c] = 0.0;
    }
    os_unfair_lock_unlock(&_engineLock);
}

#pragma mark - Configuration & Presets

- (void)applyPresetGains:(NSString *)presetId {
    _presetId = [presetId copy];
    
    // Reset all to zero initially
    for (int i = 0; i < AURA_EQ_BANDS; i++) {
        _eqGains[i] = 0.0;
    }
    
    if ([presetId isEqualToString:@"crystal"]) {
        // Ultra-high clarity, crystal shimmer, mid muffle dip
        _eqGains[0] = 3.5;   // 32Hz
        _eqGains[1] = 4.0;   // 64Hz
        _eqGains[2] = 1.0;   // 125Hz
        _eqGains[3] = -4.5;  // 250Hz (clean mud)
        _eqGains[4] = -2.0;  // 500Hz
        _eqGains[5] = 2.0;   // 1kHz
        _eqGains[6] = 5.5;   // 2.2kHz (clarity)
        _eqGains[7] = 6.0;   // 4.5kHz (definition)
        _eqGains[8] = 9.5;   // 9kHz (air)
        _eqGains[9] = 12.0;  // 16kHz (shimmer)
    } else if ([presetId isEqualToString:@"bass"]) {
        // Deep sub-bass, strong kick, warm low-end
        _eqGains[0] = 12.0;  // 32Hz
        _eqGains[1] = 10.5;  // 64Hz
        _eqGains[2] = 6.5;   // 125Hz
        _eqGains[3] = 2.0;   // 250Hz
        _eqGains[4] = -3.5;  // 500Hz
        _eqGains[5] = 0.0;   // 1kHz
        _eqGains[6] = 2.0;   // 2.2kHz
        _eqGains[7] = 1.5;   // 4.5kHz
        _eqGains[8] = 3.0;   // 9kHz
        _eqGains[9] = 4.0;   // 16kHz
    } else if ([presetId isEqualToString:@"vocal"]) {
        // Vocal presence in your face, instrument separation
        _eqGains[0] = -4.0;  // 32Hz
        _eqGains[1] = -2.5;  // 64Hz
        _eqGains[2] = -1.5;  // 125Hz
        _eqGains[3] = -2.0;  // 250Hz
        _eqGains[4] = 2.0;   // 500Hz
        _eqGains[5] = 6.5;   // 1kHz (singer core)
        _eqGains[6] = 9.0;   // 2.2kHz (vocal presence)
        _eqGains[7] = 5.0;   // 4.5kHz (consonants)
        _eqGains[8] = 4.0;   // 9kHz
        _eqGains[9] = 3.0;   // 16kHz
    } else if ([presetId isEqualToString:@"spatial"]) {
        // Wide 3D soundstage & ambient expansion
        _eqGains[0] = 5.0;
        _eqGains[1] = 4.0;
        _eqGains[2] = 1.0;
        _eqGains[3] = -3.0;
        _eqGains[4] = 0.0;
        _eqGains[5] = 3.0;
        _eqGains[6] = 4.5;
        _eqGains[7] = 6.0;
        _eqGains[8] = 7.5;
        _eqGains[9] = 9.0;
    } else if ([presetId isEqualToString:@"concert"]) {
        // Live stadium hall acoustics
        _eqGains[0] = 7.0;
        _eqGains[1] = 6.0;
        _eqGains[2] = 4.0;
        _eqGains[3] = 1.0;
        _eqGains[4] = -2.0;
        _eqGains[5] = 2.0;
        _eqGains[6] = 5.0;
        _eqGains[7] = 7.0;
        _eqGains[8] = 8.5;
        _eqGains[9] = 10.0;
    } else if ([presetId isEqualToString:@"noise_cancel"]) {
        // Commute / noise isolation (boost speech clarity, cut street rumble)
        _eqGains[0] = -8.0;
        _eqGains[1] = -6.0;
        _eqGains[2] = -2.0;
        _eqGains[3] = 0.0;
        _eqGains[4] = 3.0;
        _eqGains[5] = 7.0;
        _eqGains[6] = 8.5;
        _eqGains[7] = 5.0;
        _eqGains[8] = 2.0;
        _eqGains[9] = 0.0;
    }
}

- (void)updateConfig:(NSDictionary *)config {
    os_unfair_lock_lock(&_engineLock);
    
    if (config[@"isEnabled"] != nil) {
        _isEnabled = [config[@"isEnabled"] boolValue];
    }
    if (config[@"isBypassed"] != nil) {
        _isBypassed = [config[@"isBypassed"] boolValue];
    }
    if (config[@"boost"] != nil) {
        float b = [config[@"boost"] floatValue];
        _soundBoost = fmaxf(1.0f, fminf(2.0f, b));
    }
    if (config[@"vocalClarity"] != nil) {
        float v = [config[@"vocalClarity"] floatValue];
        _vocalClarity = fmaxf(0.0f, fminf(1.0f, v));
    }
    if (config[@"bassDepth"] != nil) {
        float bd = [config[@"bassDepth"] floatValue];
        _bassDepth = fmaxf(0.0f, fminf(1.0f, bd));
    }
    if (config[@"spatialWidth"] != nil) {
        float sw = [config[@"spatialWidth"] floatValue];
        _spatialWidth = fmaxf(0.0f, fminf(2.0f, sw));
    }
    if (config[@"is8dActive"] != nil) {
        _is8dActive = [config[@"is8dActive"] boolValue];
    }
    if (config[@"preset"] != nil) {
        [self applyPresetGains:config[@"preset"]];
    }
    if (config[@"profile"] != nil) {
        NSString *profStr = config[@"profile"];
        if ([profStr isEqualToString:@"speaker"]) {
            _profile = AuraAudioProfileSpeaker;
        } else if ([profStr isEqualToString:@"headphones"]) {
            _profile = AuraAudioProfileHeadphones;
        } else if ([profStr isEqualToString:@"airpods"]) {
            _profile = AuraAudioProfileAirPods;
        } else {
            _profile = AuraAudioProfileAuto;
        }
    }
    
    // Additional bass depth offset to the lower 3 bands
    double bassOffset = (_bassDepth - 0.5) * 6.0; // -3dB to +3dB fine tune
    _eqGains[0] += bassOffset;
    _eqGains[1] += bassOffset;
    _eqGains[2] += (bassOffset * 0.6);
    
    [self rebuildFilters];
    os_unfair_lock_unlock(&_engineLock);
}

#pragma mark - True-Peak Soft Saturation / Limiter Curve

static inline float softSaturate(float x) {
    // Lookahead-free smooth polynomial/tanh soft-clipper
    // Linear below 0.65, soft knee saturation up to 0.98 (-0.17 dBFS ceiling)
    float absX = fabsf(x);
    if (absX <= 0.65f) {
        return x;
    }
    float sign = (x > 0.0f) ? 1.0f : -1.0f;
    float over = absX - 0.65f;
    float saturated = 0.65f + 0.33f * tanhf(over / 0.33f);
    if (saturated > 0.985f) saturated = 0.985f;
    return sign * saturated;
}

#pragma mark - Core Audio In-Place Processing

- (void)processBufferList:(AudioBufferList *)bufferList numberFrames:(UInt32)numberFrames isNonInterleaved:(BOOL)isNonInterleaved {
    if (!bufferList || numberFrames == 0) return;
    
    os_unfair_lock_lock(&_engineLock);
    
    BOOL engineActive = _isEnabled && !_isBypassed;
    float boost = _soundBoost;
    float width = _spatialWidth;
    BOOL is8d = _is8dActive;
    AuraAudioProfile activeProfile = _profile;
    
    os_unfair_lock_unlock(&_engineLock);
    
    // If bypassed for A/B comparison: output untouched audio directly
    if (!engineActive) {
        return;
    }
    
    // Target overall loudness multiplier based on boost (1.0x to 2.0x)
    float targetGain = boost;
    if (activeProfile == AuraAudioProfileSpeaker) {
        // Speaker loudness boost with compensation
        targetGain *= 1.15f;
    }
    
    // Non-Interleaved Stereo (Buffer 0: Left, Buffer 1: Right)
    if (isNonInterleaved && bufferList->mNumberBuffers >= 2) {
        float *left = (float *)bufferList->mBuffers[0].mData;
        float *right = (float *)bufferList->mBuffers[1].mData;
        if (!left || !right) return;
        
        for (UInt32 i = 0; i < numberFrames; i++) {
            float l = left[i];
            float r = right[i];
            
            // 1. Subsonic highpass filter (cleans speaker rumble)
            l = processSample(&_subsonicFilter, l, 0);
            r = processSample(&_subsonicFilter, r, 1);
            
            // 2. 10-Band Precision Equalizer
            for (int b = 0; b < AURA_EQ_BANDS; b++) {
                l = processSample(&_eqBands[b], l, 0);
                r = processSample(&_eqBands[b], r, 1);
            }
            
            // 3. Dedicated Vocal Presence Enhancement
            l = processSample(&_vocalFilter, l, 0);
            r = processSample(&_vocalFilter, r, 1);
            
            // 4. Mid/Side Spatial Audio Processing (Zero phase cancellation!)
            float mid = 0.5f * (l + r);
            float side = 0.5f * (l - r);
            
            // Expand stereo width
            float sideGain = width;
            
            // 8D Sinusoidal rotation sweep
            if (is8d) {
                float panAngle = sinf((float)_rotationPhase);
                _rotationPhase += _rotationPhaseInc;
                if (_rotationPhase >= 2.0 * M_PI) _rotationPhase -= 2.0 * M_PI;
                
                // Pan mid and side smoothly between ears
                float panL = 0.707f * (cosf((panAngle + 1.0f) * 0.25f * M_PI) + 0.3f);
                float panR = 0.707f * (sinf((panAngle + 1.0f) * 0.25f * M_PI) + 0.3f);
                l = (mid + side * 1.4f) * panL;
                r = (mid - side * 1.4f) * panR;
            } else {
                l = mid + side * sideGain;
                r = mid - side * sideGain;
            }
            
            // 5. Extreme Loudness Makeup & True-Peak Limiter
            l *= targetGain;
            r *= targetGain;
            
            left[i] = softSaturate(l);
            right[i] = softSaturate(r);
        }
    }
    // Interleaved Stereo (Buffer 0: [L0, R0, L1, R1, ...])
    else if (bufferList->mNumberBuffers == 1 && bufferList->mBuffers[0].mNumberChannels >= 2) {
        float *interleaved = (float *)bufferList->mBuffers[0].mData;
        if (!interleaved) return;
        
        for (UInt32 i = 0; i < numberFrames; i++) {
            UInt32 idx = i * 2;
            float l = interleaved[idx];
            float r = interleaved[idx + 1];
            
            // 1. Subsonic highpass
            l = processSample(&_subsonicFilter, l, 0);
            r = processSample(&_subsonicFilter, r, 1);
            
            // 2. 10-Band EQ
            for (int b = 0; b < AURA_EQ_BANDS; b++) {
                l = processSample(&_eqBands[b], l, 0);
                r = processSample(&_eqBands[b], r, 1);
            }
            
            // 3. Vocal Presence
            l = processSample(&_vocalFilter, l, 0);
            r = processSample(&_vocalFilter, r, 1);
            
            // 4. Mid/Side Spatial
            float mid = 0.5f * (l + r);
            float side = 0.5f * (l - r);
            
            if (is8d) {
                float panAngle = sinf((float)_rotationPhase);
                _rotationPhase += _rotationPhaseInc;
                if (_rotationPhase >= 2.0 * M_PI) _rotationPhase -= 2.0 * M_PI;
                
                float panL = 0.707f * (cosf((panAngle + 1.0f) * 0.25f * M_PI) + 0.3f);
                float panR = 0.707f * (sinf((panAngle + 1.0f) * 0.25f * M_PI) + 0.3f);
                l = (mid + side * 1.4f) * panL;
                r = (mid - side * 1.4f) * panR;
            } else {
                l = mid + side * width;
                r = mid - side * width;
            }
            
            // 5. Loudness & True-Peak Limiter
            l *= targetGain;
            r *= targetGain;
            
            interleaved[idx] = softSaturate(l);
            interleaved[idx + 1] = softSaturate(r);
        }
    }
}

@end
