#!/bin/bash

# Cleanup Script for DSC Protect
# Cleans: NPM Cache, PM2 logs, temp files

echo "[$(date)] Starting cleanup..."

# 1. NPM Cache (Silent)
if command -v npm &> /dev/null; then
    npm cache clean --force > /dev/null 2>&1
    echo "✅ NPM Cache cleaned"
fi

# 2. PM2 Logs (Flush)
if command -v pm2 &> /dev/null; then
    pm2 flush > /dev/null 2>&1
    echo "✅ PM2 Logs flushed"
fi

# 3. System Cache (APT - harmless if no permission)
if [ -w /var/cache/apt ]; then
    apt-get clean > /dev/null 2>&1
    echo "✅ APT Cache cleaned"
fi

# 4. Temp Files (Safe cleanup)
# Deletes files only in specific temp or cache directories if they exist
rm -rf "$HOME/.npm/_cacache" 2>/dev/null
rm -rf /tmp/npm-* 2>/dev/null

# 5. Local Bot Temp Files (Generic cleanup)
# Removes temporary files that might accumulate in the project folder
find . -maxdepth 1 -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*.log" \) -delete 2>/dev/null
echo "✅ Local temp files (*.tmp, *.temp, *.log) cleaned"

echo "[$(date)] Cleanup finished."
