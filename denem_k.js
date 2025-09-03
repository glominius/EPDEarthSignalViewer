const DenemK = Object.freeze({
    DefaultBinCount: 1024,
    DefaultWindowSize: 75,
    DefaultAmpDeviationAvgMax: 4.3,
    DefaultAmpAvgMin: -62,
    DefaultDwellTheshold: 0.4,
    FilterNone: 0,
    FilterBandPass: 1,
    FilterBandReject: 2,
    NeighborDbThreshold: 1.5,
    MinAvgNeighborCompare: -82.0, // dB.
    DisplayTypeSample: 0,
    DisplayTypeAverage: 1,
    DeviationScaling: 4 / 15, // Extra dB deviation allowed / dB above minimum average threshold.
});

export { DenemK };
