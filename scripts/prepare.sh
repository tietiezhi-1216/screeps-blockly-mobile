#!/bin/sh
set -e
mkdir -p www/vendor
cp node_modules/blockly/blockly_compressed.js node_modules/blockly/blocks_compressed.js node_modules/blockly/javascript_compressed.js www/vendor/
cp node_modules/blockly/msg/zh-hans.js www/vendor/msg-zh.js
cp node_modules/pixi.js/dist/pixi.min.js www/vendor/
echo "window.APP_VERSION='${APP_VERSION:-0.0.0}';" > www/version.js
