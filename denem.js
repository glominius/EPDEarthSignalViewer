import { FFT } from "./fft_js/fft.js";
import { DenemK } from "./denem_k.js";

class DenemProcessor extends AudioWorkletProcessor {
    constructor(context) {
        super(context, "denem");
        this.binCount = DenemK.DefaultBinCount;
        this.sampleSize = this.binCount * 2;
        this.fft = new FFT(this.sampleSize); // Instance.
        this.fftOut = this.fft.createComplexArray(); // Complex outputs [real, imag, real, imag, ...]
        this.fftInverse = this.fft.createComplexArray(); // Complex outputs [real, imag, real, imag, ...]
        this.fftAmpDb = new Float32Array(this.binCount); // Output bins processed into dB.
        this.fftAmpAvgDb = new Float32Array(this.binCount); // Like above but for average within window.
        this.inputBuffer = new Float32Array(this.sampleSize); // For accumulating 256-byte chunks.
        this.outputBuffer = new Float32Array(this.sampleSize); // FFT output
        this.bufferOff = 0;
        this.nemTriggered = new Uint8Array(this.binCount);
        this.nemSamples = 0;
        this.windowSizePrev = DenemK.DefaultWindowSize;
        this.nemHisto = Array.from({ length: this.binCount }, (_, i) => ({
            ampSum: 0,
            ampDeviationSum: 0,
            }));
        this.portObj = {
            fftAmpDb: this.fftAmpDb,
            fftAmpAvgDb: this.fftAmpAvgDb,
            nemTriggered: this.nemTriggered,
        };
        this.port.onmessage = (e) => {
            const obj = e.data;
            //if (obj.param === "displayType") {
            //    this.displayType = obj.value;
            //} else {
            //    console.log("message unrecognized", obj);
            //}
        };
    }

    clearNemHisto() {
        for (const entry of this.nemHisto) {
            entry.ampSum = 0;
            entry.ampDeviationSum = 0;
            //entry.triggerDwell = 0; // Increment each sample triggered, decrement otherwise.
        }
        this.nemSamples = 0;
    }

    zeroBin(bin) {
        this.nemTriggered[bin] = 1; // True.

        // Remove this frequency band.
        this.fftOut[bin*2] = 0;
        this.fftOut[bin*2+1] = 0;
        this.fftOut[(this.sampleSize - bin)*2] = 0;
        this.fftOut[(this.sampleSize - bin)*2 + 1] = 0;
    }

    static get parameterDescriptors() {
        return [
          {
              name: "windowSize",
              defaultValue: DenemK.DefaultWindowSize,
          },
          {
              name: "ampDeviationAvgMax",
              defaultValue: DenemK.DefaultAmpDeviationAvgMax,
          },
          {
              name: "ampAvgMin",
              defaultValue: DenemK.DefaultAmpAvgMin,
          },
          {
              name: "filterType",
              defaultValue: DenemK.FilterNone,
              minValue: DenemK.FilterNone,
              maxValue: DenemK.FilterBandReject,
          },
          {
              name: "filterLowBin",
              defaultValue: 0,
          },
          {
              name: "filterHighBin",
              defaultValue: 0,
          },
          //{
          //    name: "dwellThreshold",
          //    defaultValue: DenemK.DefaultDwellTheshold,
          //},
        ];
    }

    // Samples come in short chunks from web audio.  Need to queue them up into a sample big enough for specified FFT input size.
    process(inputList, outputList, parameters) {
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
        if (this.bufferOff >= this.sampleSize) {
            this.processSample(parameters);
            //this.outputBuffer.set(this.inputBuffer); // Pass-through.
            this.bufferOff = 0; // Clear buffer.
        }
  
        return true; // Ready to process more.
    }

    // Process 1 sample of the specified FFT input size.
    processSample(parameters) {
        const windowSize         = parameters.windowSize[0];
        const ampDeviationAvgMax = parameters.ampDeviationAvgMax[0];
        const ampAvgMin          = parameters.ampAvgMin[0];
        const filterType         = parameters.filterType[0];
        const filterLowBin       = parameters.filterLowBin[0];
        const filterHighBin      = parameters.filterHighBin[0];
        //const dwellThreshold     = parameters.dwellThreshold[0];

        const binScalar = (1 / this.binCount); // Half of fft.size.
        const binsDiv2 = this.binCount >> 2;

        if (windowSize != this.windowSizePrev) {
            this.clearNemHisto();
            this.windowSizePrev = windowSize;
        }
        const longWindowSize = windowSize * 8;
        this.fft.realTransform(this.fftOut, this.inputBuffer);
        this.fft.completeSpectrum(this.fftOut);

        this.nemSamples++;
        for (let bin=1; bin < (this.fft.size>>1); bin++) {
            const real = this.fftOut[bin*2];
            const imag = this.fftOut[bin*2+1];
            const amp = Math.sqrt(real*real + imag*imag);
            let sampleDb = 20.0 * Math.log10(amp * binScalar);
            sampleDb = Math.max(sampleDb, -100);

            // === Nem detection ===
            const nemBin = this.nemHisto[bin];
            nemBin.ampSum += sampleDb;
            const denom = Math.min(windowSize, this.nemSamples);
            const ampAvg = nemBin.ampSum / denom;
            const ampDeviation = Math.abs(ampAvg - sampleDb);
            nemBin.ampDeviationSum += ampDeviation;
            this.nemTriggered[bin] = 0; // False.

            // Values passed back to main UI.
            this.fftAmpDb[bin] = sampleDb;
            this.fftAmpAvgDb[bin] = ampAvg;

            if (this.nemSamples >= windowSize) {
                const ampDeviationAvg = nemBin.ampDeviationSum / windowSize;
                let triggerAvgMin = ampAvgMin;

                let triggerDeviation = ampDeviationAvgMax;

                let windowTrigger = (ampAvg >= triggerAvgMin) && (ampDeviationAvg <= triggerDeviation);

                if (windowTrigger) {
                    this.zeroBin(bin); // This bin has nem characteristics; zero out real/imag components.
                }
                // Sliding window: effectively drop leading sample value for next iteration.
                nemBin.ampSum = ampAvg * (windowSize - 1);
                nemBin.ampDeviationSum = ampDeviationAvg * (windowSize - 1);
            }
            if ((filterType == DenemK.FilterBandPass) && ((bin < filterLowBin) || (bin > filterHighBin))) {
                this.zeroBin(bin);
            }
            else if ((filterType == DenemK.FilterBandReject) && ((bin >= filterLowBin) && (bin <= filterHighBin))) {
                this.zeroBin(bin);
            }
        }

        this.fftAmpDb[0] = -100; // Zero DC component.
        this.port.postMessage(this.portObj);

        this.fft.inverseTransform(this.fftInverse, this.fftOut); // Invert FFT components back to time-domain sample.
        this.fft.fromComplexArray(this.fftInverse, this.outputBuffer); // Collect data into consecutive array.
    }
}

registerProcessor("denem", DenemProcessor);
