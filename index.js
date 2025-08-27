'use strict';

let audioCtx;
let analyserNode;
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
let audioSourceNode;
let javascriptNode;
let streamURL = "http://hakasays.com:8443/EPDAntennaField";
let streamURLEl;
let displayFreqMinEl;
let displayFreqMaxEl;
let displayFreqMin;
let displayFreqMax;
let colorMap;
let uiBg;
let fileLocalEl;
let paused = false;
let sourceSelectEl;
let mediaElementSrc;
const yAxisX = 25;
const xAxisY = 20;
const yAxisDataMargin = 5;
const xAxisDataMargin = 2;
const tickLength = 4;
const labelMargin = 2;
let audioSourceIsFile = false;
let fileDecodedBuffer;
let smoothingSelectEl;
let updateParameter = false;
let fftBinsSelectEl;
let frequencyBinCount;
const MaxFFTBins = 1024;


// Graphics update routine called frequently.
function processAudio() {
    if (paused)
        return;

    // HTML select may have requested a change in number of FFT bins.
    if (analyserNode.frequencyBinCount != frequencyBinCount) {
        analyserNode.fftSize = 2 * frequencyBinCount;

        // Clear waterfall.
        canvasWaterfallCtx.fillStyle = "black";
        canvasWaterfallCtx.fillRect(0, 0, canvasWaterfallEl.width, canvasWaterfallEl.height);

        // Recalculate axes and redraw.
        createSpectrumAxes();
        }

    analyserNode.getFloatFrequencyData(sampleArray);
    const canvasWidth = canvasSpectrumEl.width;
    const canvasHeight = canvasSpectrumEl.height;
    const canvasWaterfallWidth = canvasWaterfallEl.width;
    const canvasWaterfallHeight = canvasWaterfallEl.height;
    const minDecibels = analyserNode.minDecibels;
    const maxDecibels = analyserNode.maxDecibels;
    const rangeDecibels = maxDecibels - minDecibels;

    // Display graphics when browswer is ready to draw.
    requestAnimationFrame(() => {
        canvasSpectrumCtx.fillStyle = uiBg;
        canvasSpectrumCtx.fillRect(yAxisX+1, 0, canvasWidth - (yAxisX+1), canvasHeight - (xAxisY + xAxisDataMargin)); // Clear canvas.

        const bins = analyserNode.frequencyBinCount;
        const barWidth = 1;
        const blitWidth = Math.min(canvasWaterfallWidth, yAxisX + yAxisDataMargin + (bins-1)*(barWidth+1)); // Maximum X value needed.

        // Waterfall scroll step 1: blit on-screen minus oldest row to off-screen.
        // drawImage usage:
        //     drawImage(image, dx, dy)
        //     drawImage(image, dx, dy, dWidth, dHeight)
        //     drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        if (waterfallScrollUp)
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 1, blitWidth, canvasWaterfallHeight-1, 0, 0, blitWidth, canvasWaterfallHeight-1);
        else
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight-1, 0, 1, blitWidth, canvasWaterfallHeight-1);

        for (let i=0; i < bins; i++) {
            // === Spectrum analysis view ===
            // x,y is the upper left point of the rectangle.
            const v = (sampleArray[i] >= minDecibels) ? sampleArray[i] : minDecibels;
            const x = yAxisX + yAxisDataMargin + i*(barWidth+1);
            const ratio = (v - minDecibels) / rangeDecibels;
            // const oneMinusRatio = 1.0 - ratio;
            const height = ratio * (canvasHeight - (xAxisY + xAxisDataMargin));
            const y = canvasSpectrumEl.height - (xAxisY + xAxisDataMargin + height);
            let r = Math.round(ratio * 255);
            if (r > 255)
                r = 255;
            const fillStyle = colorMap[r];
            canvasSpectrumCtx.fillStyle = fillStyle;
            canvasSpectrumCtx.fillRect(x+0.5, y+0.5, barWidth, height);

            // === Watervall view ===
            // Waterfall scroll step 2: update latest row off-screen.
            bufferCanvasWaterfallCtx.fillStyle = fillStyle;
            if (waterfallScrollUp)
                bufferCanvasWaterfallCtx.fillRect(x + 0.5, canvasWaterfallHeight-1, barWidth, 1);
            else
                bufferCanvasWaterfallCtx.fillRect(x + 0.5, 0, barWidth, 1);
        }

        // Waterfall scroll step 3: blit off-screen to on-screen.
        canvasWaterfallCtx.drawImage(bufferCanvasWaterfallEl, 0, 0, blitWidth, canvasWaterfallHeight, 0, 0, blitWidth, canvasWaterfallHeight);
    });
}

function constructAudioPipeline() {
    displayFreqMin = parseInt(displayFreqMinEl.value);
    displayFreqMax = parseInt(displayFreqMaxEl.value);

    // Disconnect previously created nodes.
    if (analyserNode)
        analyserNode.disconnect();
    if (javascriptNode)
        javascriptNode.disconnect();
    if (audioSourceNode)
        audioSourceNode.disconnect();

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

    analyserNode = new AnalyserNode(audioCtx);
    analyserNode.fftSize = 2 * parseInt(fftBinsSelectEl.value);
    analyserNode.smoothingTimeConstant = Number(smoothingSelectEl.value);
    createSpectrumAxes();
    const numInputChannels = 1;
    const numOutputChannels = 1;
    javascriptNode = audioCtx.createScriptProcessor(Math.max(analyserNode.fftSize, 256), numInputChannels, numOutputChannels);

    //const gainNode = audioCtx.createGain();
    //gainNode.gain.value = 1;

    audioSourceNode.connect(audioCtx.destination);
    audioSourceNode.connect(analyserNode);
    analyserNode.connect(javascriptNode);
    analyserNode.connect(audioCtx.destination);
    javascriptNode.connect(audioCtx.destination);
    javascriptNode.onaudioprocess = () => { processAudio() };
    if (audioSourceIsFile)
        audioSourceNode.start(0); // Play the sound file.
}

function createColorMap() {
    colorMap = Array.from(Array(256), (_, i) => `rgb(${i} 0 0)`);
}

function createSpectrumAxes() {
    // Clear canvas (could have been drawn with different params prior).
    canvasSpectrumCtx.fillStyle = uiBg;
    canvasSpectrumCtx.fillRect(0, 0, canvasSpectrumEl.width, canvasSpectrumEl.height); // Clear canvas.

    //const minDecibels = analyserNode.minDecibels;
    //const maxDecibels = analyserNode.maxDecibels;
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
    const decibelRange = analyserNode.maxDecibels - analyserNode.minDecibels;
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
    const interval0 = Math.ceil(analyserNode.minDecibels / yAxisInterval) * yAxisInterval;
    canvasSpectrumCtx.font = "12px trebuchet ms";
    canvasSpectrumCtx.textAlign = "right";
    canvasSpectrumCtx.textBaseline = "middle";
    for (let interval = interval0; interval <= analyserNode.maxDecibels; interval += yAxisInterval) {
        const y = ((interval - analyserNode.minDecibels) / decibelRange) * yAxisHeight;
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
    const bins = analyserNode.frequencyBinCount;
    const binBandwidth = audioCtx.sampleRate / bins;
    const displayBandwidth = displayFreqMax - displayFreqMin;
    let xAxisInterval;
    if (displayBandwidth >= 44100)
        xAxisInterval = 1000;
    else if (displayBandwidth >= 22050)
        xAxisInterval = 500;
    else if (displayBandwidth >= 11025)
        xAxisInterval = 250;
    else if (displayBandwidth >= 5500)
        xAxisInterval = 125;
    else if (displayBandwidth >= 2750)
        xAxisInterval = 50;
    else if (displayBandwidth >= 1375)
        xAxisInterval = 25;
    else if (displayBandwidth >= 700)
        xAxisInterval = 10;
    else if (displayBandwidth >= 350)
        xAxisInterval = 5;
    else
        xAxisInterval = 2;

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
    javascriptNode.onaudioprocess = () => { };
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
    displayFreqMaxEl.value = "44100";
    displayFreqMaxEl.disabled = true;

    sourceSelectEl = document.querySelector("#sourceSelect");
    let feedStreamDiv = document.querySelector("#feedStream");
    let feedFileLocalDiv = document.querySelector("#feedFileLocal");
    fileLocalEl = document.querySelector("#fileLocal");
    let feed = "stream";

    smoothingSelectEl = document.querySelector("#smoothingSelect");
    fftBinsSelectEl = document.querySelector("#fftBinsSelect");

    audioCtx = new AudioContext();

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

    smoothingSelectEl.addEventListener('change', function(e) {
        if (analyserNode)
            analyserNode.smoothingTimeConstant = Number(smoothingSelectEl.value);
    });

    frequencyBinCount = parseInt(fftBinsSelectEl.value); // Start with default value.
    sampleArray = new Float32Array(MaxFFTBins); // Preallocate for maximum sample size.
    fftBinsSelectEl.addEventListener('change', function(e) {
        frequencyBinCount = parseInt(fftBinsSelectEl.value);
    });
}

document.addEventListener('DOMContentLoaded', () => main());
