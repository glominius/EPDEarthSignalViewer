'use strict';

let audioCtx;
let analyserNode;
let playButton;
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
let streamSampleRateEl;
let streamSampleRate;
let streamURLEl;
let displayFreqMinEl;
let displayFreqMaxEl;
let displayFreqMin;
let displayFreqMax;
let colorMap;
let uiBg;
const yAxisX = 25;
const xAxisY = 20;
const yAxisDataMargin = 5;
const xAxisDataMargin = 2;
const tickLength = 4;
const labelMargin = 2;


function fetchAudioFile(audioFile) {
    let rval;
    fetch(audioFile)
        .then((response) => response.arrayBuffer())
        .then((downloadedBuffer) => audioCtx.decodeAudioData(downloadedBuffer))
        .then((decodedBuffer) => {
            const audioSourceNode = new AudioBufferSourceNode(audioCtx, {
              buffer: decodedBuffer,
              loop: true,
            });

            main2();
        })
        .catch((e) => {
            console.error(`Error: ${e}`);
      });
}

function processAudio() {
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

        // Waterfall scroll step 1: blit on-screen minus oldest row to off-screen.
        // drawImage usage:
        //     drawImage(image, dx, dy)
        //     drawImage(image, dx, dy, dWidth, dHeight)
        //     drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        if (waterfallScrollUp)
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 1, canvasWaterfallWidth, canvasWaterfallHeight-1, 0, 0, canvasWaterfallWidth, canvasWaterfallHeight-1);
        else
            bufferCanvasWaterfallCtx.drawImage(canvasWaterfallEl, 0, 0, canvasWaterfallWidth, canvasWaterfallHeight-1, 0, 1, canvasWaterfallWidth, canvasWaterfallHeight-1);

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
        canvasWaterfallCtx.drawImage(bufferCanvasWaterfallEl, 0, 0, canvasWaterfallWidth, canvasWaterfallHeight, 0, 0, canvasWaterfallWidth, canvasWaterfallHeight);
    });
}

function constructAudioPipeline() {
    streamSampleRate = parseInt(streamSampleRateEl.value);
    displayFreqMin = parseInt(displayFreqMinEl.value);
    displayFreqMax = parseInt(displayFreqMaxEl.value);

    // Check if context is in suspended state (autoplay policy)
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }

    analyserNode = new AnalyserNode(audioCtx);
    analyserNode.fftSize = 2048;
    sampleArray = new Float32Array(analyserNode.frequencyBinCount); // Half the size of fftSize.
    //analyserNode.smoothingTimeConstant = 0.85;
    createSpectrumAxes();
    const numInputChannels = 1;
    const numOutputChannels = 1;
    javascriptNode = audioCtx.createScriptProcessor(analyserNode.frequencyBinCount, numInputChannels, numOutputChannels);

    //const gainNode = audioCtx.createGain();
    //gainNode.gain.value = 1;

    audioSourceNode.connect(audioCtx.destination);
    audioSourceNode.connect(analyserNode);
    analyserNode.connect(javascriptNode);
    analyserNode.connect(audioCtx.destination);
    javascriptNode.connect(audioCtx.destination);
}

function main2() {
    playButton.addEventListener("click", (e) => {
        // For local mp3
        // audioSourceNode.start(0); // Play the sound now

        if (playButton.getAttribute("value") === "play") {
            const url = streamURLEl.value;
            playButton.setAttribute("value", "pause");
            playButton.innerHTML = "&#x23F8; Pause";
            audioStreamEl.setAttribute("src", url);
            audioStreamEl.play();
            constructAudioPipeline();
            javascriptNode.onaudioprocess = () => { processAudio() };
        } else if (playButton.getAttribute("value") === "pause") {
            playButton.setAttribute("value", "play");
            playButton.innerHTML = "&#x23F5; Play";
            audioStreamEl.pause();
            audioStreamEl.currentTime = 0; // Effectively a stop instead of pause.
            javascriptNode.onaudioprocess = () => { };
        }
    });

    audioStreamEl.addEventListener("ended", () => {
        playButton.setAttribute("value", "play");
        playButton.innerHTML = "&#x23F5; Play";
        javascriptNode.onaudioprocess = () => { };
    });
}

function createColorMap() {
    colorMap = Array.from(Array(256), (_, i) => `rgb(${i} 0 0)`);
}

function createSpectrumAxes() {
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
    const binBandwidth = streamSampleRate / bins;
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

function main() {
    playButton = document.querySelector("#playButton");
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
    streamSampleRateEl = document.querySelector("#streamSampleRate");
    streamSampleRateEl.value = "44100";

    displayFreqMinEl = document.querySelector("#displayFreqMin");
    displayFreqMinEl.value = "0";
    displayFreqMinEl.disabled = true;
    displayFreqMaxEl = document.querySelector("#displayFreqMax");
    displayFreqMaxEl.value = "44100";
    displayFreqMaxEl.disabled = true;

    // let audioFile = "haka.mp3";
    // fetchAudioFile(audioFile);

    audioCtx = new AudioContext();
    audioSourceNode = audioCtx.createMediaElementSource(audioStreamEl);

    main2();
}


document.addEventListener('DOMContentLoaded', () => main());
