'use strict';

import { DenemK } from "./denem_k.js";

let filterLowFrequency = 1022; // Hz.
let filterHighFrequency = 2250; // Hz.

const barWidth = 2;
const barSpacing = 0;
const yAxisX = 25;
const xAxisY = 20;
const yAxisDataMargin = 5;
const xAxisDataMargin = 2;
const tickLength = 4;
const labelMargin = 2;
const DisplayWaterfall = 0;

const nemMinWindowSize = 10; // Arbitrary.
const DisplayLower = Object.freeze({
    waterfall: 1,
    metrics: 2,
});

let audioCtx;
let splitterNode;
let audioSourceNode;
let playButton;
let pauseButton;
let stopButton;
let sampleArray;
let canvasSpectrumEl;
let canvasSpectrumCtx;
let canvasWaterfallEl;
let canvasWaterfallCtx;
let canvasMetricsEl;
let canvasMetricsCtx;
let bufferCanvasWaterfallEl;
let bufferCanvasWaterfallCtx;
let bufferCanvasMetricsEl;
let bufferCanvasMetricsCtx;
let waterfallScrollUp = false;
let audioStreamEl;
//let javascriptNode;
let streamURL = "https://hakasays.com:3448/EPDAntennaField";
let streamURLEl;
let displayFreqMinEl;
let displayFreqMaxEl;
let displayFreqMin;
let displayFreqMax;
let colorMap;
let colorMapNem;
let canvasBg;
let fileLocalEl;
let paused = false;
let stopped = true;
let sourceSelectEl;
let mediaElementSrc;
let audioSourceIsFile = false;
let fileDecodedBuffer;
let smoothingSelectEl;
let updateParameter = false;
let fftBinsSelectEl;
let frequencyBinCount;
const MaxFFTBins = 1024;
let minDbEl;
let maxDbEl;
let minDb = -100;
let maxDb = -20;
const MIN_DB = -100;
const MAX_DB = -10;
let cursorInfoEl;
let nemSamples;
let denemWindowEl;
let denemDeviationAvgMaxEl;
let denemAvgMinEl;
//let denemDwellThresholdEl;
let denemNode;
let displayLowerPanel = DisplayLower.waterfall;
let spectrumY = DenemK.DisplayTypeSample;
let metricsSamples = 0;


function getLowerPanelType(str) {
    if (str === "waterfall") {
        return(DisplayLower.waterfall);
    } else if (str === "metrics") {
        return(DisplayLower.metrics);
    } else {
        throw new Error(`panel type: ${str}`);
        return(DisplayLower.waterfall);
    }
}

function spectrumMouseMove(x, y) {
    const x0 = yAxisX + yAxisDataMargin; // Minimum X for a frequency bar.
    if (x >= x0) {
        const bin = Math.trunc((x - x0) / (barWidth+barSpacing));
        const maxFreq = audioCtx.sampleRate / 2;
        const freq = (bin / (frequencyBinCount-1)) * maxFreq;
        if (freq <= maxFreq)
            cursorInfoEl.value = Math.round(freq).toString() + "Hz";
        else
            cursorInfoEl.value = "";
    } else {
        cursorInfoEl.value = "";
    }
}

// Graphics update routine called frequently.
function processAudio(data) {
    let spectrumAmpDb;
    if (spectrumY === DenemK.DisplayTypeSample)
        spectrumAmpDb = data.fftAmpDb;
    else
        spectrumAmpDb = data.fftAmpAvgDb;
    const metricsAmpDb = data.fftAmpDb;
    const nemTriggered = data.nemTriggered;

    if (paused || stopped)
        return;

    let updateAxes = false;
    // HTML select may have requested a change in number of FFT bins.
// FIXME: update fft
if (false && analyserNode.frequencyBinCount != frequencyBinCount) {
        analyserNode.fftSize = 2 * frequencyBinCount;

        // Clear waterfall.
        canvasWaterfallCtx.fillStyle = "black";
        canvasWaterfallCtx.fillRect(0, 0, canvasWaterfallEl.width, canvasWaterfallEl.height);

        // Recalculate axes and redraw.
        updateAxes = true;
    }

    //if (minDb != analyserNode.minDecibels) {
    //    analyserNode.minDecibels = minDb;
    //    updateAxes = true;
    //}
    //if (maxDb != analyserNode.maxDecibels) {
    //    analyserNode.maxDecibels = maxDb;
    //    updateAxes = true;
    //}

    if (updateAxes)
        initUpperPanel();

    const canvasWidth = canvasSpectrumEl.width;
    const canvasHeight = canvasSpectrumEl.height;
    const canvasWaterfallWidth = canvasWaterfallEl.width;
    const canvasWaterfallHeight = canvasWaterfallEl.height;
    const minDecibels = minDb;
    const maxDecibels = maxDb;
    const rangeDecibels = maxDecibels - minDecibels;


    // Display graphics when browswer is ready to draw.
    requestAnimationFrame(() => {
        canvasSpectrumCtx.fillStyle = canvasBg;
        canvasSpectrumCtx.fillRect(yAxisX+1, 0, canvasWidth - (yAxisX+1), canvasHeight - (xAxisY + xAxisDataMargin)); // Clear canvas.

        const bins = frequencyBinCount;
        const blitWidth = Math.min(canvasWaterfallWidth, yAxisX + yAxisDataMargin + (bins-1)*(barWidth+barSpacing)); // Maximum X value needed.

        // Scroll step 1: blit on-screen minus oldest row to off-screen.
        // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        if (waterfallScrollUp)
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 1, blitWidth, canvasWaterfallHeight-1, 0, 0, blitWidth, canvasWaterfallHeight-1);
        else
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight-1, 0, 1, blitWidth, canvasWaterfallHeight-1);

// FIXME: clear nemBin/nemSamples upon #bins change.
        const showWaterfall = (displayLowerPanel === DisplayLower.waterfall);
        let sumDb = 0;
        for (let bin=1; bin < bins; bin++) {
            const sampleDb = Math.max(spectrumAmpDb[bin], minDecibels);
            // === Spectrum analysis view ===
            // x,y is the upper left point of the rectangle.
            const x = yAxisX + yAxisDataMargin + bin*(barWidth+barSpacing);
            const ratio = (sampleDb - minDecibels) / rangeDecibels;
            // const oneMinusRatio = 1.0 - ratio;
            const height = ratio * (canvasHeight - (xAxisY + xAxisDataMargin));
            const y = canvasSpectrumEl.height - (xAxisY + xAxisDataMargin + height);
            let fillStyle;
            let intensity = Math.min(Math.round(ratio * 255), 255);
            fillStyle = (nemTriggered[bin]>0) ? colorMapNem[intensity] : colorMap[intensity];
            canvasSpectrumCtx.fillStyle = fillStyle;
            canvasSpectrumCtx.fillRect(x, y, barWidth, height);

            if (showWaterfall) {
                // === Watervall view ===
                // Scroll step 2: update latest row off-screen.
                bufferCanvasWaterfallCtx.fillStyle = fillStyle;
                const width = (barSpacing > 0) && (barWidth == 1) ? barWidth + 1 : barWidth;
                if (waterfallScrollUp)
                    bufferCanvasWaterfallCtx.fillRect(x, canvasWaterfallHeight-1, width, 1);
                else
                    bufferCanvasWaterfallCtx.fillRect(x, 0, width, 1);
            } else {
                sumDb += metricsAmpDb[bin];
            }
        }

        if (showWaterfall) {
            // Scroll step 3: blit off-screen to on-screen.
            canvasWaterfallCtx.drawImage(bufferCanvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight, 0, 0, blitWidth, canvasWaterfallHeight);
        } else { // Metrics panel.
            const ctx = canvasMetricsCtx;
            const ctx2 = bufferCanvasMetricsCtx;
            const el = canvasMetricsEl;
            const el2 = bufferCanvasMetricsEl;
            const canvasHeight = el.height;
            function canvasY(y) { return((el.height-1) - y); }

            const avgDb = sumDb / (frequencyBinCount - 1); // Skip DC bin.
            const ratio = (avgDb - minDecibels) / rangeDecibels;
            const height = ratio * (canvasHeight - (xAxisY + xAxisDataMargin));
            const y = xAxisY + xAxisDataMargin + height;
            let intensity = Math.min(Math.round(ratio * 255), 255);

            const nonDataWidth = 1 + yAxisX + yAxisDataMargin;
            const nonDataHeight = 1 + xAxisY + xAxisDataMargin;
            const dataWidth = el.width - nonDataWidth;
            const dataHeight = el.height - nonDataHeight;

            if (metricsSamples < dataWidth) {
                // Have not filled entire data area yet.  Draw on main canvas (no scrolling).
                ctx.strokeStyle = colorMap[intensity];
                ctx.beginPath();
                // 0.5 added because otherwise canvas drawing creates wider & grayer lines.
                ctx.moveTo(0.5 + nonDataWidth + metricsSamples, canvasY(xAxisY + xAxisDataMargin));
                ctx.lineTo(0.5 + nonDataWidth + metricsSamples, canvasY(y));
                ctx.stroke();
            } else {
                // Scroll step1: blit on-screen minus oldest column to off-screen.
                const sx = nonDataWidth;
                const sy = 0;
                const dx = sx;
                const dy = sy;
                // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
                ctx2.drawImage(el, sx+1, sy, dataWidth-1, dataHeight, dx, dy, dataWidth-1, dataHeight);

                // Scroll step2: update latest column off-screen.
                ctx2.strokeStyle = colorMap[intensity];
                ctx2.beginPath();
                ctx2.moveTo(el.width-1, canvasY(xAxisY + xAxisDataMargin));
                ctx2.lineTo(el.width-1, canvasY(y));
                ctx2.stroke();

                ctx2.strokeStyle = canvasBg; // Clear pixels above line.
                ctx2.beginPath();
                ctx2.moveTo(el.width-1, canvasY(y+1));
                ctx2.lineTo(el.width-1, 0);
                ctx2.stroke();

                // Scroll step 3: blit off-screen to on-screen.
                ctx.drawImage(el2, sx, sy, dataWidth, dataHeight, dx, dy, dataWidth, dataHeight);
            }
            metricsSamples++;
        }
    });
}

function constructAudioPipeline() {
    displayFreqMin = parseInt(displayFreqMinEl.value);
    displayFreqMax = parseInt(displayFreqMaxEl.value);

// FIXME: resize following on change of frequencyBinCount
    sampleArray = new Float32Array(frequencyBinCount*2);

    // Disconnect previously created nodes.
    //if (javascriptNode)
    //    javascriptNode.disconnect();
    if (audioSourceNode)
        audioSourceNode.disconnect();
    if (splitterNode)
        splitterNode.disconnect();
    if (denemNode)
        denemNode.disconnect();

    if (audioSourceIsFile) { // File.
        // Create a buffer source node from previously decoded file.
        audioSourceNode = new AudioBufferSourceNode(audioCtx, {
          buffer: fileDecodedBuffer,
          loop: false,
        });
        audioSourceNode.addEventListener("ended", () => {
            playbackStopped();
            });
    } else { // Web stream.
        if (!mediaElementSrc) // Only createMediaElementSource() once as it stays attached to the element (bug).
            mediaElementSrc = audioSourceNode = audioCtx.createMediaElementSource(audioStreamEl);
        else
            audioSourceNode = mediaElementSrc;
    }

    // Check if context is in suspended state (autoplay policy)
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }

    splitterNode = audioCtx.createChannelSplitter(1);

    audioSourceNode.connect(splitterNode);
    splitterNode.connect(denemNode);
    denemNode.connect(audioCtx.destination);

    if (audioSourceIsFile)
        audioSourceNode.start(0); // Play the sound file.
}

function createColorMap() {
    colorMap = Array.from(Array(256), (_, i) => `rgb(${i} 0 0)`);
    colorMapNem = Array.from(Array(256), (_, i) => `rgb(0 ${i} 0)`);
}

function initUpperPanel() {
    // Clear canvas (could have been drawn with different params prior).
    const ctx = canvasSpectrumCtx;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvasSpectrumEl.width, canvasSpectrumEl.height); // Clear canvas.

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.fillStyle = "black";
    const yAxisHeight = canvasSpectrumEl.height - xAxisY;
    const xAxisYCanvas = canvasSpectrumEl.height - xAxisY;

    // === Y axis ===
    ctx.beginPath();
    ctx.moveTo(yAxisX, 0);
    ctx.lineTo(yAxisX, xAxisYCanvas);
    ctx.stroke();
    const canvasHeight = canvasSpectrumEl.height;
    function canvasY(y) { return((canvasHeight-1) - y); }

    // Y axis ticks / labels.
    const decibelRange = maxDb - minDb;
    let yAxisInterval;
    if (decibelRange <= 10)
        yAxisInterval = 1;
    else if (decibelRange <= 20)
        yAxisInterval = 2;
    else if (decibelRange <= 40)
        yAxisInterval = 4;
    else if (decibelRange <= 80)
        yAxisInterval = 8;
    else
        yAxisInterval = 10;
    const interval0 = Math.ceil(minDb / yAxisInterval) * yAxisInterval;
    ctx.font = "12px trebuchet ms";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let interval = interval0; interval <= maxDb; interval += yAxisInterval) {
        const y = ((interval - minDb) / decibelRange) * yAxisHeight;
        const yCanvas = canvasY(xAxisY + y);
        ctx.beginPath();
        ctx.moveTo(yAxisX, yCanvas);
        ctx.lineTo(yAxisX - tickLength, yCanvas);
        ctx.stroke();
        ctx.fillText(`${interval}`, yAxisX - (tickLength + labelMargin), yCanvas);
    }

    // Units label.
    ctx.save();
    ctx.translate(yAxisX - (tickLength + labelMargin), canvasY(xAxisY + 4));
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("dB", 0, 0);
    ctx.restore(); // Undo translation etc.

    // === X axis ===
    ctx.beginPath();
    ctx.moveTo(yAxisX, xAxisYCanvas);
    ctx.lineTo(canvasSpectrumEl.width-1, xAxisYCanvas);
    ctx.stroke();

    // X axis ticks / labels.
    const bins = frequencyBinCount;
    const maxFreq = audioCtx.sampleRate / 2;
    //const displayBandwidth = displayFreqMax - displayFreqMin;

    const pixelsPerTick = 36; // Label a tick every this many pixels.
    const pixelsAllTicks = (frequencyBinCount-1) * (barWidth + barSpacing);
    const pixelsPerBin = pixelsAllTicks / (bins - 1);
    let tickEveryNBins = Math.ceil(pixelsPerTick / pixelsPerBin);
    ctx.font = "12px trebuchet ms";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let bin=0; bin<bins; bin+=tickEveryNBins) {
        const x = yAxisX + yAxisDataMargin + bin*(barWidth+barSpacing);
        const yCanvas = canvasSpectrumEl.height - xAxisY;
        const freq = (bin / (frequencyBinCount-1)) * maxFreq;
        ctx.beginPath();
        ctx.moveTo(x, yCanvas);
        ctx.lineTo(x, yCanvas + tickLength);
        ctx.stroke();
        ctx.fillText(`${Math.round(freq)}`, x, yCanvas + tickLength + labelMargin);
    }

    // Units label.
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("Hz", yAxisX - tickLength, canvasY(xAxisY - (tickLength + labelMargin)));
}

function initLowerPanel() {
    if (displayLowerPanel === DisplayLower.waterfall) {
        canvasMetricsEl.style.display = "none"; // Invisible.
        canvasWaterfallEl.style.display = "block"; // Enable.
        canvasWaterfallCtx.fillStyle = canvasBg;
        canvasWaterfallCtx.fillRect(0, 0, canvasWaterfallEl.width, canvasWaterfallEl.height);

        // Create an off-screen buffer canvas for blitting regions to/from on-screen canvas (scrolling).
        if (!bufferCanvasWaterfallEl) {
            bufferCanvasWaterfallEl = document.createElement('canvas');
            bufferCanvasWaterfallCtx = bufferCanvasWaterfallEl.getContext("2d");
        }
        bufferCanvasWaterfallEl.width = canvasWaterfallEl.width;
        bufferCanvasWaterfallEl.height = canvasWaterfallEl.height;
        bufferCanvasWaterfallCtx.fillStyle = canvasBg;
        bufferCanvasWaterfallCtx.fillRect(0, 0, bufferCanvasWaterfallEl.width, bufferCanvasWaterfallEl.height);
    } else {
        canvasWaterfallEl.style.display = "none"; // Invisible.
        const el = canvasMetricsEl;
        const ctx = canvasMetricsCtx = el.getContext("2d");
        const canvasHeight = el.height;
        const canvasWidth = el.width;
        el.style.display = "block"; // Enable.
        ctx.fillStyle = canvasBg;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        metricsSamples = 0; // Reset.

        if (!bufferCanvasMetricsEl) {
            bufferCanvasMetricsEl = document.createElement('canvas');
            bufferCanvasMetricsCtx = bufferCanvasMetricsEl.getContext("2d");
        }
        bufferCanvasMetricsEl.width = canvasWidth;
        bufferCanvasMetricsEl.height = canvasHeight;
        bufferCanvasMetricsCtx.fillStyle = canvasBg;
        bufferCanvasMetricsCtx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.strokeStyle = "black";
        function canvasY(y) { return((canvasHeight-1) - y); }

        // === Y axis ===
        ctx.lineWidth = 2;
        ctx.fillStyle = "black";
        ctx.font = "12px trebuchet ms";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const yAxisHeight = canvasHeight - xAxisY;
        ctx.beginPath();
        ctx.moveTo(yAxisX, 0);
        ctx.lineTo(yAxisX, yAxisHeight);
        ctx.stroke();

        const yInterval = 8; // dB.
        const decibelRange = maxDb - minDb;
        for (let tickDb=minDb + yInterval/2; tickDb <= maxDb; tickDb += yInterval) {
            const y = ((tickDb - minDb) / decibelRange) * yAxisHeight;
            const yCanvas = canvasHeight - (xAxisY + y);
            ctx.beginPath();
            ctx.moveTo(yAxisX, yCanvas);
            ctx.lineTo(yAxisX - tickLength, yCanvas);
            ctx.stroke();
            ctx.fillText(`${tickDb}`, yAxisX - (tickLength + labelMargin), yCanvas);
        }

        // Units label.
        ctx.save();
        ctx.translate(yAxisX - (tickLength + labelMargin), canvasY(xAxisY + 4));
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("dB", 0, 0);
        ctx.restore(); // Undo translation etc.

        // === X axis ===
        ctx.beginPath();
        ctx.moveTo(yAxisX, yAxisHeight);
        ctx.lineTo(canvasWidth-1, yAxisHeight);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("time", canvasWidth/2, canvasY(xAxisY - labelMargin*2));
        ctx.lineWidth = 1;

        // Units label.
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText("Hz", yAxisX - tickLength, canvasY(xAxisY - (tickLength + labelMargin)));
    }
}

function setupLocalFileListener() {
    // Local file select box.
    fileLocalEl.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file.type.startsWith("audio")) {
            // Error:  FIXME
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            audioCtx.decodeAudioData(reader.result).then((decodedBuffer) => {
                fileDecodedBuffer = decodedBuffer;
                playButton.disabled = false; // Play button now active.
            });
        };
        reader.onerror = () => {
            // Error: FIXME
        };

        reader.readAsArrayBuffer(file);
    });
}

// Housekeeping for when playback stops.
function playbackStopped() {
    stopped = true;
    pauseButton.disabled = true;
    stopButton.disabled = true;
    sourceSelectEl.disabled = false; // Enable source selects.

    if (audioSourceIsFile) {
        playButton.disabled = true; // Play button disabled until new file loaded.
        fileLocalEl.disabled = false; // Enable another file select.
    } else {
        playButton.disabled = false; // Play button enabled.
        fileLocalEl.disabled = true; // Disable file select.
    }
    fileLocalEl.value = ""; // Prevent caching in case it's reloaded.
}

function frequencyToBin(freq) {
    const maxFreq = audioCtx.sampleRate / 2;
    const bin = Math.round((freq / maxFreq) * (frequencyBinCount-1));
    return(bin);
}

function setFilter(filterTypeEl, filterLowEl, filterHighEl, posNumRe) {
    const lowStr = filterLowEl.value;
    const low = Number(lowStr);
    const highStr = filterHighEl.value;
    const high = Number(highStr);
    const maxFreq = audioCtx.sampleRate / 2;

    const filterTypeParam = denemNode.parameters.get("filterType");
    const filterLowBinParam = denemNode.parameters.get("filterLowBin");
    const filterHighBinParam = denemNode.parameters.get("filterHighBin");

    if (!posNumRe.test(lowStr) ||
            !posNumRe.test(highStr) ||
            (low > high) ||
            (high > maxFreq)) {
        // Bad inputs; reset frequencies to last known good value.
        filterLowEl.value = filterLowFrequency.toString();
        filterHighEl.value = filterHighFrequency.toString();
        return;
        }

    if (filterTypeEl.value == "none") {
        filterTypeParam.value = DenemK.FilterNone;
    } else if (filterTypeEl.value == "bandPass") {
        filterTypeParam.value = DenemK.FilterBandPass;
    } else if (filterTypeEl.value == "bandReject") {
        filterTypeParam.value = DenemK.FilterBandReject;
    }

    // Remember actual frequency values from HTML.
    filterLowFrequency = low;
    filterHighFrequency = high;

    // Set values in denemNode.
    filterLowBinParam.value = frequencyToBin(low);
    filterHighBinParam.value = frequencyToBin(high);
}

function main() {
    const numRe = /^[+-]{0,1}\d+([.]\d+){0,1}$/; // Match integer or basic floating point.
    const posNumRe = /^[0-9][0-9]*([.]\d+){0,1}$/; // Match positive integer or basic floating point.
    const posIntRe = /^[1-9][0-9]*$/; // Match positive integer.

    playButton = document.querySelector("#playButton");
    pauseButton = document.querySelector("#pauseButton");
    stopButton = document.querySelector("#stopButton");

    canvasSpectrumEl = document.querySelector("#spectrum");
    canvasSpectrumCtx = canvasSpectrumEl.getContext("2d");
    canvasWaterfallEl = document.querySelector("#waterfall");
    canvasWaterfallCtx = canvasWaterfallEl.getContext("2d");
    canvasMetricsEl = document.querySelector("#metrics");

    const bodyEl = document.querySelector("body");
    canvasBg = window.getComputedStyle(bodyEl).getPropertyValue('--canvasBg');

    createColorMap();

    streamURLEl = document.querySelector("#streamURL");
    streamURLEl.setAttribute("value", streamURL + ".mp3"); // Or ".ogg"
    audioStreamEl = document.querySelector("#audioStream");

    displayFreqMinEl = document.querySelector("#displayFreqMin");
    displayFreqMinEl.value = "0";
    displayFreqMinEl.disabled = true;
    displayFreqMaxEl = document.querySelector("#displayFreqMax");
    displayFreqMaxEl.value = "0";
    displayFreqMaxEl.disabled = true;

    sourceSelectEl = document.querySelector("#sourceSelect");
    let feedStreamDiv = document.querySelector("#feedStream");
    let feedFileLocalDiv = document.querySelector("#feedFileLocal");
    fileLocalEl = document.querySelector("#fileLocal");
    let feed = "stream";

    smoothingSelectEl = document.querySelector("#smoothingSelect");
    fftBinsSelectEl = document.querySelector("#fftBinsSelect");
    frequencyBinCount = parseInt(fftBinsSelectEl.value); // Start with default value.
    minDbEl = document.querySelector("#minDb");
    maxDbEl = document.querySelector("#maxDb");
    minDbEl.value = minDb.toString();
    maxDbEl.value = maxDb.toString();

    cursorInfoEl = document.querySelector("#cursorInfo");

    denemWindowEl = document.querySelector("#denemWindow");
    let param = denemNode.parameters.get("windowSize");
    denemWindowEl.value = param.value.toString();

    denemDeviationAvgMaxEl = document.querySelector("#denemDeviationAvgMax");
    param = denemNode.parameters.get("ampDeviationAvgMax");
    denemDeviationAvgMaxEl.value = param.value.toFixed(2);

    denemAvgMinEl = document.querySelector("#denemAvgMin");
    param = denemNode.parameters.get("ampAvgMin");
    denemAvgMinEl.value = param.value.toString();

    const filterTypeEl = document.querySelector("#filterType");
    const filterLowEl = document.querySelector("#filterLow");
    const filterHighEl =  document.querySelector("#filterHigh");
    filterLowEl.value = filterLowFrequency.toString();
    filterHighEl.value = filterHighFrequency.toString();
    setFilter(filterTypeEl, filterLowEl, filterHighEl, posNumRe);

    const displayTypeEl = document.querySelector("#displayType");
    const displayLowerPanelEl = document.querySelector("#lowerPanel");
    displayLowerPanel = getLowerPanelType(displayLowerPanelEl.value);

    //denemDwellThresholdEl = document.querySelector("#dwellThreshold");
    //param = denemNode.parameters.get("dwellThreshold");
    //denemDwellThresholdEl.value = param.value.toFixed(2);

    displayFreqMaxEl.value = Math.round(audioCtx.sampleRate / 2).toString();

    initUpperPanel();
    initLowerPanel();

    sourceSelectEl.addEventListener('change', function (e) {
        const val = e.target.value;
        if (val == "local") {
            feedStreamDiv.style.display = "none";
            feedFileLocalDiv.style.display = "inline-block";
            feed = val;
            // Media control buttons disabled until file loads.
            playButton.disabled = true;
            pauseButton.disabled = true;
            stopButton.disabled = true;
            setupLocalFileListener();
            audioSourceIsFile = true;
            fileLocalEl.disabled = false; // Enable file select.
        } else if (val == "stream") {
            feedFileLocalDiv.style.display = "none";
            feedStreamDiv.style.display = "inline-block";
            feed = val;
            playButton.disabled = false; // Play button active.
            pauseButton.disabled = true;
            stopButton.disabled = true;
            audioSourceIsFile = false;
            fileLocalEl.disabled = true; // Disable file select.
        } else {
            // Error: FIXME:
        }
    });

    // Play button.
    playButton.addEventListener("click", (e) => {
        sourceSelectEl.disabled = true; // Disable source selects.
        fileLocalEl.disabled = true; // Disable file selects.
        playButton.disabled = true;
        stopButton.disabled = false; // Stop button active.
        if (audioSourceIsFile) {
            pauseButton.disabled = false; // Audio files enable pause/stop buttons.
        } else {
            pauseButton.disabled = true;
            const url = streamURLEl.value;
            audioStreamEl.src = url;
            audioStreamEl.play();
        }
        stopped = false;
        constructAudioPipeline();
    });

    // Stop button.
    stopButton.addEventListener("click", (e) => {
        paused = false;
        if (audioSourceIsFile) {
            audioSourceNode.stop(0);
        } else {
            audioStreamEl.pause();
            audioStreamEl.currentTime = 0; // Effectively a stop instead of pause.
        }
        playbackStopped();
    });

    // Pause button (for audio files only).
    pauseButton.addEventListener("click", (e) => {
        if (paused) {
            audioSourceNode.playbackRate.value = 1; // Resume.
            paused = false;
        } else {
            audioSourceNode.playbackRate.value = 0; // Pause.
            paused = true;
        }
    });

    // Web audio stream ended event.
    audioStreamEl.addEventListener("ended", () => {
        playbackStopped();
    });

    //smoothingSelectEl.addEventListener('change', function(e) {
    //    if (analyserNode)
    //        analyserNode.smoothingTimeConstant = Number(smoothingSelectEl.value);
    //});

    fftBinsSelectEl.addEventListener('change', function(e) {
        frequencyBinCount = parseInt(fftBinsSelectEl.value);
    });

    minDbEl.addEventListener('change', function(e) {
        const val = minDbEl.value;
        const dB = Number(minDbEl.value);
        if (numRe.test(val) && (dB < maxDb) && (dB >= MIN_DB)) {
            minDb = dB;
        } else {
            minDbEl.value = minDb.toString(); // Reset to last known good value.
        }
    });
    maxDbEl.addEventListener('change', function(e) {
        const val = maxDbEl.value;
        const dB = Number(val);
        if (numRe.test(val) && (dB > minDb) && (dB <= MAX_DB)) {
            maxDb = dB;
        } else {
            maxDbEl.value = maxDb.toString(); // Reset to last known good value.
        }
    });

    canvasSpectrumEl.addEventListener('mousemove', event => {
        spectrumMouseMove(event.offsetX, event.offsetY);
    });
    canvasSpectrumEl.addEventListener('mouseleave', event => {
      cursorInfoEl.value = "";
    });

    denemWindowEl.addEventListener('change', function(e) {
        const valStr = e.target.value;
        const val = Number(valStr);
        const param = denemNode.parameters.get("windowSize");
        if (posIntRe.test(valStr) && (val >= nemMinWindowSize)) {
            param.value = Number(e.target.value);
        } else {
            e.target.value = param.value.toString(); // Reset to last known good value.
        }
    });
    denemDeviationAvgMaxEl.addEventListener('change', function(e) {
        const valStr = e.target.value;
        const val = Number(valStr);
        const param = denemNode.parameters.get("ampDeviationAvgMax");
        if (posNumRe.test(valStr)) {
            param.value = Number(e.target.value);
        } else {
            e.target.value = param.value.toFixed(2); // Reset to last known good value.
        }
    });
    denemAvgMinEl.addEventListener('change', function(e) {
        const valStr = e.target.value;
        const val = Number(valStr);
        const param = denemNode.parameters.get("ampAvgMin");
        if (numRe.test(valStr) && (val >= minDb)) {
            param.value = Number(e.target.value);
        } else {
            e.target.value = param.value.toString(); // Reset to last known good value.
        }
    });
    //denemDwellThresholdEl.addEventListener('change', function(e) {
    //    const valStr = e.target.value;
    //    const val = Number(valStr);
    //    const param = denemNode.parameters.get("dwellThreshold");
    //    if (posNumRe.test(valStr) && (val >= 0.05) && (val <= 1)) {
    //        param.value = Number(e.target.value);
    //    } else {
    //        e.target.value = param.value.toFixed(2); // Reset to last known good value.
    //    }
    //});

    filterTypeEl.addEventListener('change', function(e) {
        setFilter(filterTypeEl, filterLowEl, filterHighEl, posNumRe);
    });
    filterLowEl.addEventListener('change', function(e) {
        setFilter(filterTypeEl, filterLowEl, filterHighEl, posNumRe);
    });
    filterHighEl.addEventListener('change', function(e) {
        setFilter(filterTypeEl, filterLowEl, filterHighEl, posNumRe);
    });

    displayTypeEl.addEventListener('change', function(e) {
        let val = displayTypeEl.value;
        let obj;
        if (val === "sample") {
            obj = { param: "displayType", value: DenemK.DisplayTypeSample };
            spectrumY = DenemK.DisplayTypeSample;
        } else if (val === "average") {
            obj = { param: "displayType", value: DenemK.DisplayTypeAverage };
            spectrumY = DenemK.DisplayTypeAverage;
        } else {
            throw new Error(`displayType of ${val}`);
            spectrumY = DenemK.DisplayTypeSample;
        }
        // denemNode.port.postMessage(obj);
    });

    displayLowerPanelEl.addEventListener("change", function(e) {
        displayLowerPanel = getLowerPanelType(displayLowerPanelEl.value);
        initLowerPanel();
    });

    denemNode.port.onmessage = (e) => {
        //console.log("msg", e.data.spectrum);
        processAudio(e.data);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    audioCtx = new AudioContext();
    audioCtx.audioWorklet.addModule("denem.js").then((x) => {
        denemNode = new AudioWorkletNode(audioCtx, "denem");
        main();
        });
    });
