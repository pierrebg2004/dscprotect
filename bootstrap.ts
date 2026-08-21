
import fs from 'fs';
import path from 'path';
import { exec, execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Helper for ESM directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_VERSION = 'v25.2.1';
const NODE_DIST = 'linux-x64';
const INSTALL_DIR = path.resolve(process.cwd(), '.node_local');
const NODE_BIN = path.join(INSTALL_DIR, `node-${NODE_VERSION}-${NODE_DIST}`, 'bin', 'node');

async function bootstrap() {
    // 0. Delay cleanup script to run after the bot is ready
    const cleanupScript = path.join(process.cwd(), 'daily_cleanup.sh');
    if (fs.existsSync(cleanupScript)) {
        setTimeout(() => {
            console.log('🧹 [Bootstrap] Running delayed cleanup...');
            exec(`bash "${cleanupScript}"`, (err) => {
                if (err) console.error('❌ [Bootstrap] Cleanup failed:', err);
                else console.log('✅ [Bootstrap] Delayed cleanup finished.');
            });
        }, 15000); // 15s delay
    }


    // 1. Check if Node 25 exists locally
    if (!fs.existsSync(NODE_BIN)) {
        console.log(`⬇️ [Bootstrap] Downloading Node.js ${NODE_VERSION}...`);

        if (!fs.existsSync(INSTALL_DIR)) {
            fs.mkdirSync(INSTALL_DIR, { recursive: true });
        }

        try {
            // Download to a temporary file first for safety using HTTP/1.1
            const url = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${NODE_DIST}.tar.xz`;
            const downloadPath = path.join(INSTALL_DIR, 'node.tar.xz');

            console.log(`⬇️ [Bootstrap] Downloading to ${downloadPath}...`);
            // -L follows redirects, --http1.1 forces restartable/stable protocol
            execSync(`curl --http1.1 -L "${url}" -o "${downloadPath}"`, { stdio: 'inherit' });

            console.log('📦 [Bootstrap] Extracting...');
            execSync(`tar -xJf "${downloadPath}" -C "${INSTALL_DIR}"`, { stdio: 'inherit' });

            // Clean up archive
            fs.unlinkSync(downloadPath);

            console.log('✅ [Bootstrap] Node.js installed locally!');
        } catch (error) {
            console.error('❌ [Bootstrap] Failed to download Node.js:', error);
            process.exit(1);
        }
    }

    // 2. Launch the REAL bot with Auto-Restart
    function launchBot() {

        // Path to the tsx loader
        const tsxPath = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
        const entryPoint = path.join(process.cwd(), 'src', 'index.ts');

        const botProcess = spawn(NODE_BIN, [tsxPath, entryPoint], {
            stdio: 'inherit',
            env: { ...process.env, NODE_OPTIONS: '--no-deprecation --no-warnings --expose-gc' }
        });

        botProcess.on('close', (code) => {
            console.log(`⚠️ [Bootstrap] Bot process exited with code ${code}.`);
            console.log('🔄 [Bootstrap] Restarting in 1 second...');
            setTimeout(launchBot, 1000);
        });
    }

    launchBot();
}

bootstrap();
