/**
 * Playback Service
 * Required by react-native-track-player for handling remote control events
 */

import TrackPlayer, { Event, State } from 'react-native-track-player';

export async function PlaybackService() {
    console.log('[PlaybackService] Registering event listeners...');

    // Remote control events from notification/lock screen
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
        console.log('[PlaybackService] RemotePlay');
        TrackPlayer.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
        console.log('[PlaybackService] RemotePause');
        TrackPlayer.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
        console.log('[PlaybackService] RemoteStop');
        TrackPlayer.stop();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
        console.log('[PlaybackService] RemoteNext');
        TrackPlayer.skipToNext();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        console.log('[PlaybackService] RemotePrevious');
        TrackPlayer.skipToPrevious();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
        console.log('[PlaybackService] RemoteSeek to:', event.position);
        TrackPlayer.seekTo(event.position);
    });

    TrackPlayer.addEventListener(Event.RemoteJumpForward, async (event) => {
        console.log('[PlaybackService] RemoteJumpForward by:', event.interval);
        const position = await TrackPlayer.getProgress();
        await TrackPlayer.seekTo(position.position + event.interval);
    });

    TrackPlayer.addEventListener(Event.RemoteJumpBackward, async (event) => {
        console.log('[PlaybackService] RemoteJumpBackward by:', event.interval);
        const position = await TrackPlayer.getProgress();
        await TrackPlayer.seekTo(Math.max(0, position.position - event.interval));
    });

    // Handle audio focus - when other apps play audio
    TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
        console.log('[PlaybackService] RemoteDuck - paused:', event.paused, 'permanent:', event.permanent);
        if (event.permanent) {
            // Another app has taken over audio permanently
            await TrackPlayer.pause();
        } else if (event.paused) {
            // Temporarily reduce volume (duck)
            await TrackPlayer.setVolume(0.3);
        } else {
            // Restore volume
            await TrackPlayer.setVolume(1.0);
        }
    });

    // Handle playback ending
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async (event) => {
        console.log('[PlaybackService] Queue ended, track:', event.track);
    });

    // Handle playback state changes
    TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
        console.log('[PlaybackService] State changed to:', event.state);
    });

    // Handle errors
    TrackPlayer.addEventListener(Event.PlaybackError, async (event) => {
        console.error('[PlaybackService] Playback error:', event.message, event.code);
    });

    console.log('[PlaybackService] All event listeners registered');
}
