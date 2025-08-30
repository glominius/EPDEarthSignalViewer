# EPDEarthSignalViewer
Spectrum analyzer &amp; waterfall view for EPD Earth signal project (fan contrib).

## Usage

### Option1: web browser via github.io server

Point your browser at [https://glominius.github.io/EPDEarthSignalViewer/](https://glominius.github.io/EPDEarthSignalViewer/).

### Option2: web browser via source code download

Download the source code from [https://github.com/glominius/EPDEarthSignalViewer](https://github.com/glominius/EPDEarthSignalViewer).

Use either of 2 methods by pulling down on the green `Code` lozenge:
- `Download ZIP` and extract the zip file
- Use `git clone` (for the real techies)

You will need a lightweight web server (due to restrictions imposed by the browser).  Any should do, but if you have python:
- `cd <directory you extracted to>`
- `python3 -m http.server`
- Point your browser at index.html in the directory you extracted.

## TBD

This is a very primitive early release.  Feel free to send feature requests.  Some planned features:
- UI knob for varying number of FFT bins
- Enable existing UI knob to specify min/max frequency range to be displayed
- UI knob for varying width of per-frequency bars
- Handle window resizing (currently you need to resize your window, then reload the page)
- Add gain node and UI knob for signal amplitude adjustment
- Add biquad and IIR filter features to UI
