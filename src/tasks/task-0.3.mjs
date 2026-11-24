/**
 * Task 0.3: Ruffle Playback and Screenshot Capture (Determinism Test)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const PROJECT_ROOT = path.resolve('./');
const WORK_DIR = path.join(PROJECT_ROOT, 'work', 'ruffle-test');
const SAMPLES_DIR = path.join(PROJECT_ROOT, 'samples');
const SWF_PATH = path.join(SAMPLES_DIR, 'logo-anim.swf');
const RUFFLE_DIR = WORK_DIR;

const CAPTURE_TIMES = [1000, 2000, 3000];
const SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_HEIGHT = 720;

let server = null;

async function startServer() {
    return new Promise((resolve) => {
        server = http.createServer((req, res) => {
            // Special handling for samples/
            if (req.url.startsWith('/samples/')) {
                const sampleName = req.url.substring(9);
                const samplePath = path.join(SAMPLES_DIR, sampleName);
                const realPath = path.resolve(samplePath);
                
                if (!realPath.startsWith(SAMPLES_DIR)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }
                
                try {
                    if (fs.existsSync(samplePath)) {
                        const ext = path.extname(samplePath);
                        const mimeTypes = {
                            '.swf': 'application/x-shockwave-flash'
                        };
                        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                        res.end(fs.readFileSync(samplePath));
                    } else {
                        res.writeHead(404);
                        res.end('Sample not found');
                    }
                } catch (e) {
                    res.writeHead(500);
                    res.end('Error');
                }
                return;
            }
            
            // Ruffle files
            let filePath = path.join(RUFFLE_DIR, req.url === '/' ? 'index.html' : req.url);
            const realPath = path.resolve(filePath);
            
            if (!realPath.startsWith(RUFFLE_DIR)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            
            try {
                if (fs.existsSync(filePath)) {
                    const ext = path.extname(filePath);
                    const mimeTypes = {
                        '.html': 'text/html',
                        '.js': 'application/javascript',
                        '.wasm': 'application/wasm',
                        '.json': 'application/json',
                        '.swf': 'application/x-shockwave-flash',
                        '.map': 'application/json'
                    };
                    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
                    res.end(fs.readFileSync(filePath));
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            } catch (e) {
                res.writeHead(500);
                res.end('Error');
            }
        });
        
        server.listen(8765, 'localhost', () => {
            console.log('[Server] HTTP server running at http://localhost:8765');
            resolve();
        });
    });
}

function stopServer() {
    return new Promise((resolve) => {
        if (server) {
            server.close(resolve);
        } else {
            resolve();
        }
    });
}

async function runIteration(browser, iterationNum) {
    console.log(`\n[Run ${iterationNum}] Starting...`);
    
    const page = await browser.newPage();
    await page.setViewportSize({ width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT });
    
    try {
        console.log(`[Run ${iterationNum}] Navigating to Ruffle player...`);
        await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
        
        console.log(`[Run ${iterationNum}] Waiting for Ruffle to initialize...`);
        await page.evaluate(() => window.RuffleTest.initialize());
        
        console.log(`[Run ${iterationNum}] Loading logo-anim.swf...`);
        const swfUrl = 'http://localhost:8765/samples/logo-anim.swf';
        await page.evaluate((url) => window.RuffleTest.loadSWF(url), swfUrl);
        
        console.log(`[Run ${iterationNum}] SWF loaded, capturing frames...`);
        
        for (const time of CAPTURE_TIMES) {
            // Wait until the capture time
            await page.waitForTimeout(time);
            
            console.log(`[Run ${iterationNum}] Capturing at t=${time}ms`);
            await page.screenshot({ path: path.join(WORK_DIR, `run${iterationNum}_t${time}.png`) });
            console.log(`[Run ${iterationNum}] Screenshot saved: run${iterationNum}_t${time}.png`);
        }
        
    } finally {
        await page.close();
    }
}

function comparePNGs(png1Path, png2Path) {
    const img1 = PNG.sync.read(fs.readFileSync(png1Path));
    const img2 = PNG.sync.read(fs.readFileSync(png2Path));
    
    if (img1.width !== img2.width || img1.height !== img2.height) {
        throw new Error(`Image dimensions mismatch`);
    }
    
    const diff = new PNG({ width: img1.width, height: img1.height });
    const numDiffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        img1.width,
        img1.height,
        { threshold: 0.1 }
    );
    
    const totalPixels = img1.width * img1.height;
    const diffPercent = (numDiffPixels / totalPixels) * 100;
    
    return { numDiffPixels, diffPercent };
}

async function runDeterminismTest() {
    console.log('='.repeat(60));
    console.log('Ruffle Determinism Test - Task 0.3');
    console.log('='.repeat(60));
    
    console.log('\n[Setup] Verifying prerequisites...');
    
    if (!fs.existsSync(SWF_PATH)) {
        throw new Error(`SWF not found: ${SWF_PATH}`);
    }
    console.log(`✓ SWF found`);
    
    if (!fs.existsSync(path.join(RUFFLE_DIR, 'ruffle.js'))) {
        throw new Error(`Ruffle not found`);
    }
    console.log(`✓ Ruffle found`);
    
    let ruffleVersion = 'unknown';
    const packageJsonPath = path.join(RUFFLE_DIR, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        ruffleVersion = pkg.version || 'unknown';
    }
    console.log(`✓ Ruffle version: ${ruffleVersion}`);
    
    console.log('\n[Setup] Starting HTTP server...');
    await startServer();
    
    const results = {
        ruffle_version: ruffleVersion,
        swf: 'logo-anim.swf',
        screenshot_size: `${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}`,
        capture_times: CAPTURE_TIMES,
        comparisons: [],
        avg_diff_pct: 0,
        determinism_verdict: ''
    };
    
    try {
        console.log('\n[Browser] Launching Chromium...');
        const browser = await chromium.launch({ headless: true });
        
        try {
            console.log('\n[Test] Running iteration 1...');
            await runIteration(browser, 1);
            
            console.log('\n[Test] Running iteration 2...');
            await runIteration(browser, 2);
            
            console.log('\n[Analysis] Comparing screenshots...');
            const diffs = [];
            
            for (const time of CAPTURE_TIMES) {
                const file1 = path.join(WORK_DIR, `run1_t${time}.png`);
                const file2 = path.join(WORK_DIR, `run2_t${time}.png`);
                
                const comparison = comparePNGs(file1, file2);
                diffs.push(comparison.diffPercent);
                
                console.log(`  t=${time}ms: ${comparison.diffPercent.toFixed(2)}% different`);
                
                results.comparisons.push({
                    time_ms: time,
                    diff_pct: parseFloat(comparison.diffPercent.toFixed(2)),
                    num_diff_pixels: comparison.numDiffPixels
                });
            }
            
            const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            results.avg_diff_pct = parseFloat(avgDiff.toFixed(2));
            
            if (avgDiff < 1) {
                results.determinism_verdict = 'PASS';
                console.log(`\n✓ DETERMINISM VERDICT: PASS (avg diff: ${avgDiff.toFixed(2)}%)`);
            } else if (avgDiff < 5) {
                results.determinism_verdict = `PASS (minor variance: ${avgDiff.toFixed(2)}%)`;
                console.log(`\n✓ DETERMINISM VERDICT: PASS`);
            } else {
                results.determinism_verdict = `CONCERN: High variance (${avgDiff.toFixed(2)}%)`;
                console.log(`\n⚠ DETERMINISM VERDICT: CONCERN`);
            }
            
        } finally {
            await browser.close();
        }
        
    } finally {
        await stopServer();
    }
    
    console.log('\n[Output] Saving report...');
    const reportPath = path.join(WORK_DIR, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`✓ Report saved`);
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Ruffle Version: ${ruffleVersion}`);
    console.log(`Screenshot Size: ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}`);
    console.log(`Average Diff: ${results.avg_diff_pct}%`);
    console.log(`Verdict: ${results.determinism_verdict}`);
    console.log('='.repeat(60));
    
    return results;
}

runDeterminismTest().catch((error) => {
    console.error('\nFATAL ERROR:', error.message);
    process.exit(1);
});
