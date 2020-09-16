# FPL Ruffle Extension

A Flashpoint Launcher extension that provides support for the Ruffle Flash emulator. (https://github.com/ruffle-rs/ruffle)

## Usage

`:ruffle:` (Standalone) and `:ruffle-web:` (Web) application paths are provided to use. Use App Path Override on the Config page to override the Flash player paths if using with Bluemaxima's Flashpoint.

Ruffle files will be auto-downloaded from the GitHub releases page is missing on launch.

Ruffle can also be updated manually via the 2 buttons on the Developer page. (Tick 'Advanced' in config to view)

## Building

1) Clone into `\Data\Extensions` in the Flashpoint folder.

2) `npm install`

3) `npm run build`

4) Start Flashpoint Launcher

