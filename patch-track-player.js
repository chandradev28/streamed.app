const fs = require('fs');
const path = require('path');

const filePath = path.join(
    __dirname,
    'node_modules',
    '.pnpm_patches',
    'react-native-track-player@4.1.2',
    'android',
    'src',
    'main',
    'java',
    'com',
    'doublesymmetry',
    'trackplayer',
    'module',
    'MusicModule.kt'
);

console.log('Reading file:', filePath);
let content = fs.readFileSync(filePath, 'utf8');

// Fix line 548
content = content.replace(
    'callback.resolve(Arguments.fromBundle(musicService.tracks[index].originalItem))',
    'callback.resolve(musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) })'
);

// Fix lines 586-589
content = content.replace(
    `else Arguments.fromBundle(
                musicService.tracks[musicService.getCurrentTrackIndex()].originalItem
            )`,
    `else musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let {
                Arguments.fromBundle(it)
            }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched successfully!');
