#!/bin/bash
# Ansagerstimme "Headshot!" aus der macOS-Stimme Daniel: tiefer gestimmt, verdichtet, kurzer Raum.
# Ergebnis public/sounds/headshot.m4a (nicht in Git, wie die anderen Töne).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
say -v Daniel -r 165 -o "$tmp/roh.aiff" "Headshot!"
ffmpeg -loglevel error -y -i "$tmp/roh.aiff" -af "asetrate=22050*0.84,aresample=44100,highpass=f=90,lowpass=f=7000,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=6dB,aecho=0.8:0.5:35:0.2,silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-14:TP=-1.5" -c:a aac -b:a 96k public/sounds/headshot.m4a
rm -r "$tmp"
