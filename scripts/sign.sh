#!/bin/bash
# 用法：KEYSTORE=~/keys/release.p12 KEYSTORE_PASS=... ./scripts/sign.sh out.apk
set -e
BT=$(ls -d $ANDROID_HOME/build-tools/* | sort -V | tail -1)
$BT/zipalign -f 4 android/app/build/outputs/apk/release/app-release-unsigned.apk /tmp/aligned.apk
$BT/apksigner sign --ks "$KEYSTORE" --ks-type PKCS12 --ks-pass env:KEYSTORE_PASS --out "$1" /tmp/aligned.apk
$BT/apksigner verify "$1"
