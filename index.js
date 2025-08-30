'use strict';

import { FFT } from "./fft_js/fft.js";

const barWidth = 2;
const barSpacing = 0;
const yAxisX = 25;
const xAxisY = 20;
const yAxisDataMargin = 5;
const xAxisDataMargin = 2;
const tickLength = 4;
const labelMargin = 2;

const nemMinWindowSize = 10; // Arbitrary.

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
let bufferCanvasWaterfallEl;
let bufferCanvasWaterfallCtx;
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
let uiBg;
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
let maxDb = -30;
const MIN_DB = -100;
const MAX_DB = -10;
let cursorInfoEl;
let nemSamples;
let denemWindowEl;
let denemDeviationAvgMaxEl;
let denemAvgMinEl;
let denemNode;

let fft; // Instance of FFT().
let fftOut; // FFT complex outputs.
let fftAmpDb; // FFT outputs processed to only magnitude in dB.


function spectrumMouseMove(x, y) {
    const x0 = yAxisX + yAxisDataMargin; // Minimum X for a frequency bar.
    if (x >= x0) {
        const bin = Math.trunc((x - x0) / (barWidth+barSpacing));
        const bins = frequencyBinCount;
        const maxFreq = audioCtx.sampleRate / 2;
        const binBandwidth = maxFreq / bins;
        const freq = bin * binBandwidth;
        if (freq <= maxFreq)
            cursorInfoEl.value = Math.round(freq).toString() + "Hz";
        else
            cursorInfoEl.value = "";
    } else {
        cursorInfoEl.value = "";
    }
}

// Graphics update routine called frequently.
function processAudio(fftAmpDb, nemTriggered) {
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
        createSpectrumAxes();

    //analyserNode.getFloatFrequencyData(sampleArray);
    //analyserNode.getFloatTimeDomainData(sampleArray);
    const canvasWidth = canvasSpectrumEl.width;
    const canvasHeight = canvasSpectrumEl.height;
    const canvasWaterfallWidth = canvasWaterfallEl.width;
    const canvasWaterfallHeight = canvasWaterfallEl.height;
    const minDecibels = minDb;
    const maxDecibels = maxDb;
    const rangeDecibels = maxDecibels - minDecibels;


    // Display graphics when browswer is ready to draw.
    requestAnimationFrame(() => {
        canvasSpectrumCtx.fillStyle = uiBg;
        canvasSpectrumCtx.fillRect(yAxisX+1, 0, canvasWidth - (yAxisX+1), canvasHeight - (xAxisY + xAxisDataMargin)); // Clear canvas.

        const bins = frequencyBinCount;
        const blitWidth = Math.min(canvasWaterfallWidth, yAxisX + yAxisDataMargin + (bins-1)*(barWidth+barSpacing)); // Maximum X value needed.

        // Waterfall scroll step 1: blit on-screen minus oldest row to off-screen.
        // drawImage usage:
        //     drawImage(image, dx, dy)
        //     drawImage(image, dx, dy, dWidth, dHeight)
        //     drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        if (waterfallScrollUp)
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 1, blitWidth, canvasWaterfallHeight-1, 0, 0, blitWidth, canvasWaterfallHeight-1);
        else
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight-1, 0, 1, blitWidth, canvasWaterfallHeight-1);

// FIXME: clear nemBin/nemSamples upon #bins change.
        for (let i=0; i < bins; i++) {
            const sampleDb = Math.max(fftAmpDb[i], minDecibels);
            // === Spectrum analysis view ===
            // x,y is the upper left point of the rectangle.
            const x = yAxisX + yAxisDataMargin + i*(barWidth+barSpacing);
            const ratio = (sampleDb - minDecibels) / rangeDecibels;
            // const oneMinusRatio = 1.0 - ratio;
            const height = ratio * (canvasHeight - (xAxisY + xAxisDataMargin));
            const y = canvasSpectrumEl.height - (xAxisY + xAxisDataMargin + height);
            let fillStyle;
            let intensity = Math.round(ratio * 255);
            if (intensity > 255)
                intensity = 255;
            fillStyle = (nemTriggered[i]>0) ? colorMapNem[intensity] : colorMap[intensity];
            canvasSpectrumCtx.fillStyle = fillStyle;
            canvasSpectrumCtx.fillRect(x, y, barWidth, height);

            // === Watervall view ===
            // Waterfall scroll step 2: update latest row off-screen.
            bufferCanvasWaterfallCtx.fillStyle = fillStyle;
            if (waterfallScrollUp)
                bufferCanvasWaterfallCtx.fillRect(x, canvasWaterfallHeight-1, barWidth, 1);
            else
                bufferCanvasWaterfallCtx.fillRect(x, 0, barWidth, 1);
        }

        // Waterfall scroll step 3: blit off-screen to on-screen.
        canvasWaterfallCtx.drawImage(bufferCanvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight, 0, 0, blitWidth, canvasWaterfallHeight);
    });
}

function constructAudioPipeline() {
    displayFreqMin = parseInt(displayFreqMinEl.value);
    displayFreqMax = parseInt(displayFreqMaxEl.value);

// FIXME: resize following on change of frequencyBinCount
    sampleArray = new Float32Array(frequencyBinCount*2);
    fft = new FFT(frequencyBinCount*2); // Instance.
    fftOut = fft.createComplexArray(); // Complex outputs [real, imag, real, imag, ...]
    fftAmpDb = Array(frequencyBinCount).fill(0); // Output bins processed into dB.

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
    createSpectrumAxes();

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

function createSpectrumAxes() {
    // Clear canvas (could have been drawn with different params prior).
    canvasSpectrumCtx.fillStyle = uiBg;
    canvasSpectrumCtx.fillRect(0, 0, canvasSpectrumEl.width, canvasSpectrumEl.height); // Clear canvas.

    canvasSpectrumCtx.lineWidth = 1;
    canvasSpectrumCtx.strokeStyle = "black";
    canvasSpectrumCtx.fillStyle = "black";
    const yAxisHeight = canvasSpectrumEl.height - xAxisY;
    const xAxisYCanvas = canvasSpectrumEl.height - xAxisY;

    // Y axis.
    canvasSpectrumCtx.beginPath();
    canvasSpectrumCtx.moveTo(yAxisX, 0);
    canvasSpectrumCtx.lineTo(yAxisX, xAxisYCanvas);
    canvasSpectrumCtx.stroke();

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
    canvasSpectrumCtx.font = "12px trebuchet ms";
    canvasSpectrumCtx.textAlign = "right";
    canvasSpectrumCtx.textBaseline = "middle";
    for (let interval = interval0; interval <= maxDb; interval += yAxisInterval) {
        const y = ((interval - minDb) / decibelRange) * yAxisHeight;
        const yCanvas = canvasSpectrumEl.height - (xAxisY + y);
        canvasSpectrumCtx.beginPath();
        canvasSpectrumCtx.moveTo(yAxisX, yCanvas);
        canvasSpectrumCtx.lineTo(yAxisX - tickLength, yCanvas);
        canvasSpectrumCtx.stroke();
        canvasSpectrumCtx.fillText(`${interval}`, yAxisX - (tickLength + labelMargin), yCanvas);
    }

    // X axis.
    canvasSpectrumCtx.beginPath();
    canvasSpectrumCtx.moveTo(yAxisX, xAxisYCanvas);
    canvasSpectrumCtx.lineTo(canvasSpectrumEl.width-1, xAxisYCanvas);
    canvasSpectrumCtx.stroke();

    // X axis ticks / labels.
    const bins = frequencyBinCount;
    const binBandwidth = (audioCtx.sampleRate / 2) / bins;
    //const displayBandwidth = displayFreqMax - displayFreqMin;

    const tickEveryNBins = 25;
    const barWidth = 1;
    canvasSpectrumCtx.font = "12px trebuchet ms";
    canvasSpectrumCtx.textAlign = "center";
    canvasSpectrumCtx.textBaseline = "top";
    for (let bin=0; bin<bins; bin+=tickEveryNBins) {
        const x = yAxisX + yAxisDataMargin + bin*(barWidth+1);
        const yCanvas = canvasSpectrumEl.height - xAxisY;
        const freq = bin * binBandwidth;
        canvasSpectrumCtx.beginPath();
        canvasSpectrumCtx.moveTo(x, yCanvas);
        canvasSpectrumCtx.lineTo(x, yCanvas + tickLength);
        canvasSpectrumCtx.stroke();
        canvasSpectrumCtx.fillText(`${Math.round(freq)}`, x, yCanvas + tickLength + labelMargin);
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

function main() {
    playButton = document.querySelector("#playButton");
    pauseButton = document.querySelector("#pauseButton");
    stopButton = document.querySelector("#stopButton");

    canvasSpectrumEl = document.querySelector("#spectrum");
    canvasSpectrumCtx = canvasSpectrumEl.getContext("2d");
    canvasWaterfallEl = document.querySelector("#waterfall");
    canvasWaterfallCtx = canvasWaterfallEl.getContext("2d");
    canvasSpectrumEl.width = window.innerWidth
    canvasWaterfallEl.width = window.innerWidth

    const bodyEl = document.querySelector("body");
    uiBg = window.getComputedStyle(bodyEl).getPropertyValue('--uiBg');

    canvasSpectrumCtx.fillStyle = uiBg;
    canvasSpectrumCtx.fillRect(0, 0, canvasSpectrumEl.width, canvasSpectrumEl.height);

    canvasWaterfallCtx.fillStyle = uiBg;
    canvasWaterfallCtx.fillRect(0, 0, canvasWaterfallEl.width, canvasWaterfallEl.height);

    // Create an off-screen buffer canvas for blitting regions to/from on-screen canvas (scrolling).
    bufferCanvasWaterfallEl = document.createElement('canvas');
    bufferCanvasWaterfallEl.width = canvasWaterfallEl.width;
    bufferCanvasWaterfallEl.height = canvasWaterfallEl.height;
    bufferCanvasWaterfallCtx = bufferCanvasWaterfallEl.getContext("2d");
    bufferCanvasWaterfallCtx.fillStyle = uiBg;
    bufferCanvasWaterfallCtx.fillRect(0, 0, bufferCanvasWaterfallEl.width, bufferCanvasWaterfallEl.height);

    createColorMap();

    streamURLEl = document.querySelector("#streamURL");
    streamURLEl.setAttribute("value", streamURL + ".ogg");
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
    denemDeviationAvgMaxEl.value = param.value.toString();

    denemAvgMinEl = document.querySelector("#denemAvgMin");
    param = denemNode.parameters.get("ampAvgMin");
    denemAvgMinEl.value = param.value.toString();

    displayFreqMaxEl.value = Math.round(audioCtx.sampleRate / 2).toString();

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

    frequencyBinCount = parseInt(fftBinsSelectEl.value); // Start with default value.
    fftBinsSelectEl.addEventListener('change', function(e) {
        frequencyBinCount = parseInt(fftBinsSelectEl.value);
    });

    const numRe = /^[+-]{0,1}\d+([.]\d+){0,1}$/; // Match integer or basic floating point.
    const posNumRe = /^[1-9][0-9]*([.]\d+){0,1}$/; // Match positive integer or basic floating point.
    const posIntRe = /^[1-9][0-9]*$/; // Match positive integer.
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
        if (posIntRe.test(val) && (val >= nemMinWindowSize)) {
            denemWindowSize = val;
            const param = denemNode.parameters.get("windowSize");
            param.value = denemWindowSize;
        } else {
            e.target.value = denemWindowSize.toString(); // Reset to last known good value.
        }
    });
    denemDeviationAvgMaxEl.addEventListener('change', function(e) {
        const valStr = e.target.value;
        const val = Number(valStr);
        if (posNumRe.test(val)) {
            denemAmpDeviationAvgMax = val;
            const param = denemNode.parameters.get("ampDeviationAvgMax");
            param.value = denemAmpDeviationAvgMax;
        } else {
            e.target.value = denemAmpDeviationAvgMax.toString(); // Reset to last known good value.
        }
    });
    denemAvgMinEl.addEventListener('change', function(e) {
        const valStr = e.target.value;
        const val = Number(valStr);
        if (numRe.test(val) && (val >= minDb) && (val <= maxDb)) {
            denemAmpAvgMin = val;
            const param = denemNode.parameters.get("ampAvgMin");
            param.value = denemAmpAvgMin;
        } else {
            e.target.value = denemAmpAvgMin.toString(); // Reset to last known good value.
        }
    });

    denemNode.port.onmessage = (e) => {
        //console.log("msg", e.data.spectrum);
        processAudio(e.data.fftAmpDb, e.data.nemTriggered);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    audioCtx = new AudioContext();
    audioCtx.audioWorklet.addModule("denem.js").then((x) => {
        denemNode = new AudioWorkletNode(audioCtx, "denem");
        main();
        });
    });
