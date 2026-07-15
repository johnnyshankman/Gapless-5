const xhrMockClass = () => ({
  open            : jest.fn(),
  send            : jest.fn(),
  setRequestHeader: jest.fn(),
  abort           : jest.fn(),
});
XMLHttpRequest = jest.fn().mockImplementation(xhrMockClass);

const audioMockClass = () => ({
  addEventListener: jest.fn(),
  load: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(() => Promise.resolve(jest.fn())),
  setSinkId: jest.fn(() => Promise.resolve()),
});
Audio = jest.fn().mockImplementation(audioMockClass);

const audioContextMockClass = () => ({
  createGain: () => ({
    gain: { value: 1 },
    connect: jest.fn(),
  }),
  setSinkId: jest.fn(() => Promise.resolve()),
  destination: {},
});

window = {
  clearTimeout     : jest.fn(),
  setTimeout       : jest.fn(),
  AudioContext     : jest.fn().mockImplementation(audioContextMockClass),
};

const { Gapless5, LogLevel } = require('./gapless5.js');

/** test data **/

const TRACKS = [ '0.mp3', '1.mp3', '2.mp3', '3.mp3', '4.mp3' ];
const INIT_OPTIONS = {
  logLevel: LogLevel.None,
  useWebAudio: false,
  useHTML5Audio: false,
};

/** test suite **/

describe('Gapless-5 object', () => {
  let player = null;

  beforeEach(() => {
    player = new Gapless5(INIT_OPTIONS);
  });

  it('has correct initial state', () => {
    expect(player.getTracks()).toStrictEqual([]);
    expect(player.totalTracks()).toBe(0);
    expect(player.getIndex()).toBe(-1);
    expect(player.getPosition()).toBe(0);
    expect(player.canShuffle()).toBe(false);
    expect(player.initialized).toBe(true);
    expect(player.hasGUI).toBe(false);
  });

  it('can manipulate tracklist and position', () => {
    player.addTrack(TRACKS[1]);
    expect(player.getIndex()).toBe(0);
    player.insertTrack(0, TRACKS[0]);
    expect(player.getTracks()).toStrictEqual([ TRACKS[0], TRACKS[1] ]);
    expect(player.findTrack(TRACKS[1])).toBe(1);
    player.setPlaybackRate(0.1);
    player.setPosition(10);
    expect(player.getPosition()).toBe(10);

    player.removeTrack(0);
    expect(player.getTracks()).toStrictEqual([ TRACKS[1] ]);
    player.removeAllTracks();
    expect(player.getTracks()).toStrictEqual([]);
    player.setPosition(10);
    expect(player.getPosition()).toBe(0); // setPosition should do nothing without a track
  });
});

describe('Gapless-5 object with tracklist', () => {
  let player = null;

  beforeEach(() => {
    player = new Gapless5({
      ...INIT_OPTIONS,
      tracks: TRACKS,
    });
  });

  it('has correct initial state', () => {
    expect(player.getTracks()).toStrictEqual(TRACKS);
    expect(player.getIndex()).toBe(0);
    expect(player.getPosition()).toBe(0);
    expect(player.initialized).toBe(true);
    expect(player.hasGUI).toBe(false);
  });

  it('can shuffle and un-shuffle tracklist', () => {
    expect(player.canShuffle()).toBe(true);
    expect(player.isShuffled()).toBe(false);
    player.shuffle();
    expect(player.isShuffled()).toBe(true);

    // shouldn't actually shuffle until we change tracks
    expect(player.getTracks()).toStrictEqual(TRACKS);
    player.next();
    expect(player.getTracks()).not.toStrictEqual(TRACKS);
    expect(player.totalTracks()).toBe(TRACKS.length);

    // shouldn't actually unshuffle until we change tracks
    player.toggleShuffle();
    expect(player.isShuffled()).toBe(false);
    expect(player.getTracks()).not.toStrictEqual(TRACKS);
    player.next();
    expect(player.getTracks()).toStrictEqual(TRACKS);
  });

  it('can navigate the tracklist', () => {
    expect(player.getIndex()).toBe(0);
    player.next();
    expect(player.getIndex()).toBe(1);
    player.prev();
    expect(player.getIndex()).toBe(0);
    player.gotoTrack(2);
    expect(player.getIndex()).toBe(2);

    // should loop around
    player.loop = true;
    TRACKS.forEach(() => player.next());
    expect(player.getIndex()).toBe(2);

    // should not loop around
    player.loop = false;
    TRACKS.forEach(() => player.next());
    expect(player.getIndex()).toBe(TRACKS.length - 1);
  });

  it('triggers navigation callbacks', () => {
    player.onprev = jest.fn();
    player.onnext = jest.fn();
    player.onplayrequest = jest.fn();
    player.onpause = jest.fn();
    player.onstop = jest.fn();

    player.next();
    expect(player.onnext).toHaveBeenCalledWith(TRACKS[0], TRACKS[1]);
    player.prev();
    expect(player.onprev).toHaveBeenCalledWith(TRACKS[1], TRACKS[0]);
    player.play();
    expect(player.onplayrequest).toHaveBeenCalledWith(TRACKS[0]);
    player.pause();
    expect(player.onpause).toHaveBeenCalledWith(TRACKS[0]);
    player.stop();
    expect(player.onstop).toHaveBeenCalledWith(TRACKS[0]);
  });

  it('regression: maintains correct index when removing tracks that come after the currently playing track', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
    });

    // Verify initial state
    expect(testPlayer.getIndex()).toBe(0);
    expect(testPlayer.getTracks()).toStrictEqual(testTracks);

    // Move to track 1
    testPlayer.gotoTrack(1);
    expect(testPlayer.getIndex()).toBe(1);

    // Remove track at index 2
    testPlayer.removeTrack(2);

    // Check index is still 1 and track list is updated
    expect(testPlayer.getIndex()).toBe(1);
    expect(testPlayer.getTracks()).toStrictEqual([ 'track1.mp3', 'track2.mp3' ]);
  });

  it('regression: maintains correct index when removing the currently playing track', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
    });

    // Verify initial state
    expect(testPlayer.getIndex()).toBe(0);
    expect(testPlayer.getTracks()).toStrictEqual(testTracks);

    // Move to track 1
    testPlayer.gotoTrack(1);
    expect(testPlayer.getIndex()).toBe(1);
    testPlayer.play();

    // Remove the currently playing track
    testPlayer.removeTrack(1);

    // Check index is still 1 and track list is updated, therefore we move to the next available track
    expect(testPlayer.getIndex()).toBe(1);
    expect(testPlayer.getTracks()).toStrictEqual([ 'track1.mp3', 'track3.mp3' ]);

    testPlayer.play();

    // Remove the currently playing track
    testPlayer.removeTrack(1);

    // Check index is still 0 and track list is updated, therefore we move to the next available track
    expect(testPlayer.getIndex()).toBe(0);
    expect(testPlayer.getTracks()).toStrictEqual([ 'track1.mp3' ]);

    testPlayer.play();

    // Remove the only remaining track — list is empty, index resets to -1
    testPlayer.removeTrack(0);
    expect(testPlayer.getIndex()).toBe(-1);
    expect(testPlayer.getTracks()).toStrictEqual([]);
  });

  it('regression: removing a track does not wipe shuffledIndices', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3', 'track4.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
    });

    testPlayer.shuffle();
    testPlayer.next(); // commit the shuffle
    expect(testPlayer.isShuffled()).toBe(true);
    expect(testPlayer.playlist.shuffledIndices.length).toBe(testTracks.length);

    testPlayer.removeTrack(0);

    // Shuffle order should still be intact (one fewer entry, still shuffled)
    expect(testPlayer.isShuffled()).toBe(true);
    expect(testPlayer.playlist.shuffledIndices.length).toBe(testTracks.length - 1);
    expect(testPlayer.getTracks().length).toBe(testTracks.length - 1);
  });

  it('regression: removing currently-playing track repeatedly until empty does not crash', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
    });

    // Walk the list down to zero by always removing the current track
    // This reproduces a crash in the pre-PR code where updateLoading()
    // would dereference an undefined source after the list went empty.
    while (testPlayer.getTracks().length > 0) {
      testPlayer.removeTrack(testPlayer.getIndex());
    }
    expect(testPlayer.getTracks()).toStrictEqual([]);
    expect(testPlayer.getIndex()).toBe(-1);
  });

  it('regression: removing current-at-tail with loop=true wraps to start and resumes', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
      loop: true,
    });

    testPlayer.gotoTrack(2);
    expect(testPlayer.getIndex()).toBe(2);

    // Force the tail source to report as playing so removeTrack takes the
    // wasPlaying branch (the mock audio env never transitions real state).
    testPlayer.playlist.sources[2].inPlayState = () => true;

    testPlayer.onnext = jest.fn();
    testPlayer.onplayrequest = jest.fn();

    testPlayer.removeTrack(2);

    expect(testPlayer.getIndex()).toBe(0);
    expect(testPlayer.getTracks()).toStrictEqual([ 'track1.mp3', 'track2.mp3' ]);
    expect(testPlayer.onnext).toHaveBeenCalledWith('track3.mp3', 'track1.mp3');
    expect(testPlayer.onplayrequest).toHaveBeenCalledTimes(1);
    expect(testPlayer.onplayrequest).toHaveBeenCalledWith('track1.mp3');
  });

  it('regression: removing current-at-tail with loop=false clamps and always pauses', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
      loop: false,
    });

    testPlayer.gotoTrack(2);
    expect(testPlayer.getIndex()).toBe(2);

    // Force the tail source to report as playing so removeTrack takes the
    // wasPlaying branch — this is the scenario where the old code would
    // have auto-resumed on the clamped-to-last track.
    testPlayer.playlist.sources[2].inPlayState = () => true;

    testPlayer.onnext = jest.fn();
    testPlayer.onplayrequest = jest.fn();

    testPlayer.removeTrack(2);

    expect(testPlayer.getIndex()).toBe(1);
    expect(testPlayer.getTracks()).toStrictEqual([ 'track1.mp3', 'track2.mp3' ]);
    expect(testPlayer.onnext).toHaveBeenCalledWith('track3.mp3', 'track2.mp3');
    expect(testPlayer.onplayrequest).not.toHaveBeenCalled();
  });

  it('regression: removing a track does not spuriously disable shuffle when never shuffled', () => {
    const testTracks = [ 'track1.mp3', 'track2.mp3', 'track3.mp3' ];
    const testPlayer = new Gapless5({
      ...INIT_OPTIONS,
      tracks: testTracks,
    });

    expect(testPlayer.isShuffled()).toBe(false);
    const setShuffleSpy = jest.spyOn(testPlayer.playlist, 'setShuffle');

    // Drop to 2 tracks — previously tripped the shuffle-disable path
    // because `this.isShuffled` (a function reference) was always truthy.
    testPlayer.removeTrack(0);

    expect(testPlayer.isShuffled()).toBe(false);
    expect(setShuffleSpy).not.toHaveBeenCalled();
    setShuffleSpy.mockRestore();
  });
});

describe('Gapless-5 object with load limit', () => {
  it('obeys load limit', () => {
    const player = new Gapless5({
      ...INIT_OPTIONS,
      loadLimit: 2,
    });
    const loadedTracks = new Set([]);
    player.onloadstart = (audioPath) => {
      loadedTracks.add(audioPath);
    };
    player.onunload = (audioPath) => {
      loadedTracks.delete(audioPath);
    };

    TRACKS.forEach((track) => player.addTrack(track));
    expect(player.totalTracks()).toBe(TRACKS.length);
    expect(loadedTracks.size).toBe(2);
    player.next();
    expect(loadedTracks.size).toBe(2);
    player.next();
    expect(loadedTracks.size).toBe(2);
    player.removeAllTracks();
    expect(loadedTracks.size).toBe(0);
  });
});

// Options that enable the HTML5 Audio path so Audio mock is exercised.
// WebAudio path stays off so XHR/decode plumbing isn't required.
const SINK_OPTIONS = {
  logLevel: LogLevel.None,
  useWebAudio: false,
  useHTML5Audio: true,
};

describe('Gapless-5 setSinkId', () => {
  beforeEach(() => {
    Audio.mockClear();
    if (window.gapless5AudioContext && window.gapless5AudioContext.setSinkId) {
      window.gapless5AudioContext.setSinkId.mockClear();
    }
  });

  it('defaults sinkId to empty string', () => {
    const player = new Gapless5(SINK_OPTIONS);
    expect(player.sinkId).toBe('');
  });

  it('accepts sinkId via constructor option', () => {
    const player = new Gapless5({ ...SINK_OPTIONS, sinkId: 'device-abc' });
    expect(player.sinkId).toBe('device-abc');
  });

  it('setSinkId updates player.sinkId and resolves', async () => {
    const player = new Gapless5(SINK_OPTIONS);
    await expect(player.setSinkId('device-xyz')).resolves.toBeUndefined();
    expect(player.sinkId).toBe('device-xyz');
  });

  it('setSinkId propagates to HTML5 Audio elements of loaded tracks', async () => {
    const player = new Gapless5(SINK_OPTIONS);
    player.addTrack(TRACKS[0]);
    await player.setSinkId('device-xyz');
    const instance = Audio.mock.results[Audio.mock.results.length - 1].value;
    expect(instance.setSinkId).toHaveBeenCalledWith('device-xyz');
  });

  it('new Audio elements created after setSinkId pick up current sinkId', async () => {
    const player = new Gapless5(SINK_OPTIONS);
    await player.setSinkId('device-xyz');
    Audio.mockClear();
    player.addTrack(TRACKS[0]);
    const instance = Audio.mock.results[Audio.mock.results.length - 1].value;
    expect(instance.setSinkId).toHaveBeenCalledWith('device-xyz');
  });

  it('constructor sinkId applies to tracks added later', () => {
    const player = new Gapless5({ ...SINK_OPTIONS, sinkId: 'device-init' });
    Audio.mockClear();
    player.addTrack(TRACKS[0]);
    const instance = Audio.mock.results[Audio.mock.results.length - 1].value;
    expect(instance.setSinkId).toHaveBeenCalledWith('device-init');
  });

  it('warns and resolves when Audio.setSinkId is missing', async () => {
    Audio.mockImplementationOnce(() => ({
      addEventListener: jest.fn(),
      load: jest.fn(),
      pause: jest.fn(),
      play: jest.fn(() => Promise.resolve(jest.fn())),
    }));
    const player = new Gapless5(SINK_OPTIONS);
    player.addTrack(TRACKS[0]);
    await expect(player.setSinkId('device-xyz')).resolves.toBeUndefined();
    expect(player.sinkId).toBe('device-xyz');
  });

  it('setSinkId calls AudioContext.setSinkId when WebAudio is enabled', async () => {
    const player = new Gapless5({
      logLevel: LogLevel.None,
      useWebAudio: true,
      useHTML5Audio: false,
    });
    await player.setSinkId('device-xyz');
    expect(window.gapless5AudioContext.setSinkId).toHaveBeenCalledWith('device-xyz');
  });

  it('setSinkId rejects when HTMLMediaElement.setSinkId rejects', async () => {
    const notFound = new Error('NotFoundError');
    // Persistent override: mockImplementationOnce would be consumed by the
    // stubAudio created inside the Gapless5 constructor, missing the track Audio.
    const originalImpl = Audio.getMockImplementation();
    Audio.mockImplementation(() => ({
      addEventListener: jest.fn(),
      load: jest.fn(),
      pause: jest.fn(),
      play: jest.fn(() => Promise.resolve(jest.fn())),
      setSinkId: jest.fn(() => Promise.reject(notFound)),
    }));
    try {
      const player = new Gapless5(SINK_OPTIONS);
      player.addTrack(TRACKS[0]);
      let caught;
      try {
        await player.setSinkId('bad-device');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/setSinkId failed/);
      expect(caught.errors).toEqual([ notFound ]);
      // state still reflects the requested sinkId even on failure
      expect(player.sinkId).toBe('bad-device');
    } finally {
      Audio.mockImplementation(originalImpl);
    }
  });

  it('setSinkId rejects when AudioContext.setSinkId rejects', async () => {
    const notFound = new Error('NotFoundError');
    const originalImpl = window.gapless5AudioContext.setSinkId.getMockImplementation();
    window.gapless5AudioContext.setSinkId.mockImplementation(() => Promise.reject(notFound));
    try {
      const player = new Gapless5({
        logLevel: LogLevel.None,
        useWebAudio: true,
        useHTML5Audio: false,
      });
      let caught;
      try {
        await player.setSinkId('bad-device');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(caught.message).toMatch(/setSinkId failed/);
      expect(caught.errors).toEqual([ notFound ]);
    } finally {
      window.gapless5AudioContext.setSinkId.mockImplementation(originalImpl);
    }
  });

  // Documents the known shared-AudioContext limitation: every Gapless5 on a
  // page reuses `window.gapless5AudioContext`, so setSinkId on one player
  // silently reroutes the WebAudio output of every other player. If a future
  // change gives each player its own AudioContext, update this test.
  it('multiple players share AudioContext — setSinkId on one affects the shared context', async () => {
    const p1 = new Gapless5({
      logLevel: LogLevel.None,
      useWebAudio: true,
      useHTML5Audio: false,
    });
    const p2 = new Gapless5({
      logLevel: LogLevel.None,
      useWebAudio: true,
      useHTML5Audio: false,
    });
    expect(p1.context).toBe(p2.context);
    await p2.setSinkId('device-2');
    expect(window.gapless5AudioContext.setSinkId).toHaveBeenLastCalledWith('device-2');
    // p1's declared sinkId state is untouched, but the shared context it
    // points at now routes to device-2 — this is the leak the comment warns
    // about. Fixing it requires a per-player AudioContext.
    expect(p1.sinkId).toBe('');
    expect(p2.sinkId).toBe('device-2');
  });

  it('canSetSinkId is true when AudioContext.setSinkId is available', () => {
    const player = new Gapless5(SINK_OPTIONS);
    expect(player.canSetSinkId).toBe(true);
  });

  it('setSinkId leaves the shared AudioContext alone when useWebAudio is false', async () => {
    // HTML5-only player: routing goes to the Audio elements, never the shared
    // context (which other WebAudio players may depend on).
    const player = new Gapless5(SINK_OPTIONS);
    player.addTrack(TRACKS[0]);
    await player.setSinkId('device-xyz');
    expect(window.gapless5AudioContext.setSinkId).not.toHaveBeenCalled();
    const instance = Audio.mock.results[Audio.mock.results.length - 1].value;
    expect(instance.setSinkId).toHaveBeenCalledWith('device-xyz');
  });

  it('setSinkId warns and no-ops when AudioContext.setSinkId is unavailable (Firefox/Safari/mobile)', async () => {
    // Simulate a non-Chromium browser by removing setSinkId from the shared context.
    const ctx = window.gapless5AudioContext;
    const savedSetSinkId = ctx.setSinkId;
    delete ctx.setSinkId;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const player = new Gapless5({
        logLevel: LogLevel.Warning,
        useWebAudio: false,
        useHTML5Audio: true,
      });
      expect(player.canSetSinkId).toBe(false);
      player.addTrack(TRACKS[0]);
      const instance = Audio.mock.results[Audio.mock.results.length - 1].value;

      await expect(player.setSinkId('device-xyz')).resolves.toBeUndefined();

      // Warned clearly, and did not attempt to route anything.
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/only available in Chromium/));
      expect(instance.setSinkId).not.toHaveBeenCalled();
      // player.sinkId still records the requested value for consumer introspection.
      expect(player.sinkId).toBe('device-xyz');
    } finally {
      warnSpy.mockRestore();
      ctx.setSinkId = savedSetSinkId;
    }
  });

  it('empty sinkId on an unsupported browser resolves silently without warning', async () => {
    const ctx = window.gapless5AudioContext;
    const savedSetSinkId = ctx.setSinkId;
    delete ctx.setSinkId;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const player = new Gapless5({
        logLevel: LogLevel.Warning,
        useWebAudio: false,
        useHTML5Audio: true,
      });
      await expect(player.setSinkId('')).resolves.toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      ctx.setSinkId = savedSetSinkId;
    }
  });
});

