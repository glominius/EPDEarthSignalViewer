# EPDEarthSignalViewer
Spectrum analyzer &amp; waterfall view for EPD Earth signal project (fan contrib).

## Usage

### Option1: web browser via github.io server

Point your browser at [https://glominius.github.io/EPDEarthSignalViewer/](https://glominius.github.io/EPDEarthSignalViewer/).

**NOTE**: the current audio stream feed source URL is http (not https).  This causes "mixed content" security warnings/errors on chrome (and probably other browsers).  To bypass this:

- Use a non-private browser window for this session (private windows may work on some versions)
- Allow mixed content or disable automatic https upgrades for this site.  On chrome:
  - Click on the symbol left of the URL bar.
  - `Site settings` -> `Insecure content` -> `allow` (may be named something else like "mixed content".

### Option2: web browser via source code download

Download the source code from [https://github.com/glominius/EPDEarthSignalViewer](https://github.com/glominius/EPDEarthSignalViewer).

Use either of 2 methods by pulling down on the green `Code` lozenge:
- `Download ZIP` and extract the zip file.
- Use `git clone` (for the real techies).

In either case, point your web browser at the main directory (should have a file index.html in it).

## TBD

This is a very primitive early release.  Feel free to send feature requests.  Some planned features:
- UI knob for varying number of FFT bins.
- Enable existing UI knob to specify min/max frequency range to be displayed.
- UI knob for varying width of per-frequency bars.
- Handle window resizing (currently you need to resize your window, then reload the page).
- Add gain node and UI knob for signal amplitude adjustment.
- Add biquad and IIR filter features to UI.
