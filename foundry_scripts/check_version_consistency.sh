#!/bin/bash

set -e

# Change to git root directory
cd "$(git rev-parse --show-toplevel)"

if ! command -v jq &> /dev/null; then
    echo "jq is not installed. Installing..."
    sudo apt-get install -y jq
fi

RELEASE_NOTES_PATH=release_notes
RELEASE_NOTES_FILES=$(ls $RELEASE_NOTES_PATH)
SEMANTIC_VERSION_FILES=$(echo "$RELEASE_NOTES_FILES" | grep -P '^\d+\.\d+\.\d+\.md$')
SORTED_RELEASE_NOTES=$(echo "$SEMANTIC_VERSION_FILES" | sort -Vr)
LATEST_RELEASE_NOTE=$(echo "$SORTED_RELEASE_NOTES" | head -n 1)
LATEST_VERSION=${LATEST_RELEASE_NOTE%.*}

MODULE_VERSION=$(jq -r .version src/module.json)
if [ "$MODULE_VERSION" != "$LATEST_VERSION" ]; then
    echo "Version inconsistency detected!"
    echo "The latest version in the release notes is $LATEST_VERSION."
    echo "Module version: $MODULE_VERSION"
    exit 1
fi

if [ -f package.json ]; then
    PACKAGE_VERSION=$(jq -r .version package.json)
    if [ "$PACKAGE_VERSION" != "$LATEST_VERSION" ]; then
        echo "Version inconsistency detected!"
        echo "The latest version in the release notes is $LATEST_VERSION."
        echo "Package version: $PACKAGE_VERSION"
        exit 1
    fi
fi

if ! grep -q "manifest.*/v$LATEST_VERSION/" src/module.json; then
    echo "The manifest link in module.json is not up to date yet."
    exit 1
fi

if ! grep -q "download.*/v$LATEST_VERSION.zip" src/module.json; then
    echo "The download link in module.json is not up to date yet."
    exit 1
fi

if ! grep -q "readme.*/v$LATEST_VERSION/" src/module.json; then
    echo "The readme link in module.json is not up to date yet."
    exit 1
fi
