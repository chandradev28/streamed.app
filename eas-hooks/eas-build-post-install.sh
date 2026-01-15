#!/bin/bash
# EAS Build pre-install hook to patch react-native-track-player for Kotlin 2.x compatibility

echo "Patching react-native-track-player for Kotlin 2.x Bundle nullability fix..."

FILE="node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt"

if [ -f "$FILE" ]; then
    # Fix line ~548: Arguments.fromBundle(originalItem) -> add null coalescing
    sed -i 's/track = Arguments.fromBundle(originalItem)/track = Arguments.fromBundle(originalItem) ?: Bundle()/g' "$FILE"
    
    # Fix line ~588: Arguments.fromBundle(bundle) -> add null coalescing
    sed -i 's/emit(MusicEvents.PLAYER_ERROR, Arguments.fromBundle(bundle))/emit(MusicEvents.PLAYER_ERROR, Arguments.fromBundle(bundle) ?: Bundle())/g' "$FILE"
    
    echo "Successfully patched MusicModule.kt"
else
    echo "Warning: MusicModule.kt not found, skipping patch"
fi
