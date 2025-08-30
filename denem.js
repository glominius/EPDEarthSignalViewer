import { FFT } from "./fft_js/fft.js";

const DefaultBinCount = 1024;
const DefaultWindowSize = 30;
const DefaultAmpDeviationAvgMax = 4;
const DefaultAmpAvgMin = -74;

class DenemProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.binCount = DefaultBinCount;
        this.sampleSize = this.binCount * 2;
        this.fft = new FFT(this.sampleSize); // Instance.
        this.fftOut = this.fft.createComplexArray(); // Complex outputs [real, imag, real, imag, ...]
        this.fftInverse = this.fft.createComplexArray(); // Complex outputs [real, imag, real, imag, ...]
        this.fftAmpDb = new Float32Array(this.binCount); // Output bins processed into dB.
        this.inputBuffer = new Float32Array(this.sampleSize); // For accumulating 256-byte chunks.
        this.outputBuffer = new Float32Array(this.sampleSize); // FFT output
        this.bufferOff = 0;
        this.nemTriggered = new Uint8Array(this.binCount);
        this.nemSamples = 0;
        this.windowSizePrev = DefaultWindowSize;
        this.nemHisto = Array.from({ length: this.binCount }, (_, i) => ({
            ampSum: 0,
            ampDeviationSum: 0,
            }));
        this.portObj = {
            fftAmpDb: this.fftAmpDb,
            nemTriggered: this.nemTriggered,
        };
    }

    clearNemHisto() {
        for (const entry of this.nemHisto) {
            entry.ampSum = 0;
            entry.ampDeviationSum = 0;
        }
        this.nemSamples = 0;
    }

    static get parameterDescriptors() {
        return [
          {
              name: "windowSize",
              defaultValue: DefaultWindowSize,
          },
          {
              name: "ampDeviationAvgMax",
              defaultValue: DefaultAmpDeviationAvgMax,
          },
          {
              name: "ampAvgMin",
              defaultValue: DefaultAmpAvgMin,
          },
        ];
    }

    process(inputList, outputList, parameters) {
        const windowSize         = parameters.windowSize[0];
        const ampDeviationAvgMax = parameters.ampDeviationAvgMax[0];
        const ampAvgMin          = parameters.ampAvgMin[0];
        if (windowSize != this.windowSizePrev) {
            this.clearNemHisto();
            this.windowSizePrev = windowSize;
        }
    
        let channelInputs = inputList[0]; // Float32Array
        let channelOutputs = outputList[0]; // Float32Array
  
        if (channelInputs.length == 0) { // No data (feed stopped).
            return true; // Ready to process more.
            }

        const channelInput0 = channelInputs[0]; // Only 1 channel incoming.
        const channelOutput0 = channelOutputs[0]; // Only 1 channel outgoing.
        let sampleCount = channelInput0.length;

        // Output chunk from previous buffering.
        for (let i=0; i < sampleCount; i++) {
            channelOutput0[i] = this.outputBuffer[this.bufferOff + i];
        }

        // Queue incoming chunk.
        for (let i=0; i < sampleCount; i++) {
            this.inputBuffer[this.bufferOff + i] = channelInput0[i];
        }
        this.bufferOff += sampleCount;

        // If sample size is fulfilled, run FFT on sample, modify and populate output buffer.
        const binScalar = (1 / this.fft.size);
        if (this.bufferOff >= this.sampleSize) {
            this.fft.realTransform(this.fftOut, this.inputBuffer);
            this.fft.completeSpectrum(this.fftOut);

            this.nemSamples++;
            for (let bin=1; bin < (this.fft.size>>1); bin++) {
                const real = this.fftOut[bin*2];
                const imag = this.fftOut[bin*2+1];
                const amp = Math.sqrt(real*real + imag*imag);
                let sampleDb = this.fftAmpDb[bin] = 20.0 * Math.log10(amp * binScalar);
                sampleDb = Math.max(sampleDb, -100);

                // === Nem detection ===
                const nemBin = this.nemHisto[bin];
                nemBin.ampSum += sampleDb;
                const ampAvg = nemBin.ampSum / Math.min(windowSize, this.nemSamples);
                const ampDeviation = Math.abs(ampAvg - sampleDb);
                nemBin.ampDeviationSum += ampDeviation;
                this.nemTriggered[bin] = 0; // False.

                if (this.nemSamples >= windowSize) {
                    const ampDeviationAvg = nemBin.ampDeviationSum / windowSize;
                    if ((ampAvg >= ampAvgMin) && (ampDeviationAvg <= ampDeviationAvgMax)) {
                        // This bin has nem characteristics.
                        this.nemTriggered[bin] = 1; // True.
                        // Remove this frequency band.
                        this.fftOut[bin*2] = 0;
                        this.fftOut[bin*2+1] = 0;
                        this.fftOut[(this.sampleSize - bin)*2] = 0;
                        this.fftOut[(this.sampleSize - bin)*2 + 1] = 0;
                    }
                    // Sliding window: effectively drop leading sample value for next iteration.
                    nemBin.ampSum = ampAvg * (windowSize - 1);
                    nemBin.ampDeviationSum = ampDeviationAvg * (windowSize - 1);
                }
            }
            this.fftAmpDb[0] = -100; // Zero DC component.
            this.port.postMessage(this.portObj);

            this.fft.inverseTransform(this.fftInverse, this.fftOut);
            this.fft.fromComplexArray(this.fftInverse, this.outputBuffer);
            //this.outputBuffer.set(this.inputBuffer);
            this.bufferOff = 0; // Clear buffer.
        }
  
        return true; // Ready to process more.
    }
}

registerProcessor("denem", DenemProcessor);
