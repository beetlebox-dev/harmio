
// (c) 2022 Johnathan Pennington | All rights reserved.


// HTML elements
const bodyContainer = document.querySelector('#body-container');
const keyboard = document.querySelector('#keyboard');
const keyboardKeys = document.querySelectorAll('.black-key, .white-key, .non-key');
const keyboardActualKeysOnly = document.querySelectorAll('.black-key, .white-key');
const panel = document.querySelector('div#panel');
const harmDirectionButton = document.querySelector('#harmony-direction');
const brightButton = document.querySelector('#harmony-direction-bright');
const darkButton = document.querySelector('#harmony-direction-dark');
const chordSymbolContainer = document.querySelector('.chord-symbol');
const chordSymbolA = document.querySelector('.chord-symbol-a');
const chordSymbolB = document.querySelector('.chord-symbol-b');
const chordSymbolC = document.querySelector('.chord-symbol-c');
const rotateButton = document.querySelector('#rotate-button');

// Init orientation.
let lastWindowPreferFlip = window.innerWidth / window.innerHeight < 1;
let stateFlipped = lastWindowPreferFlip === false;  // Boolean flipped back to match lastWindowPreferFlip in rotateView() on init.
rotateView();

// Audio settings
const envAttackTime = 0.1;  // seconds
const envReleaseTime = 0.6;  // seconds
const melodyGain = 0.5;  // PCM
const harmonyGain = 0.2;  // PCM
const modulationCurve = 3;  // Any positive real number besides 1. See proportionalRandInt docstring for full explanation.

// Audio context
var audioCtx = new AudioContext();
const masterGain = audioCtx.createGain();
masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
masterGain.connect(audioCtx.destination);
var masterGainRampTimeoutId;

// Oscillators
var oscillators = [];
for (let i = 0; i < 4; i++) {

    const gainNode = audioCtx.createGain();
    gainNode.connect(masterGain);
    if (i === 0) { gainNode.gain.setValueAtTime(melodyGain, audioCtx.currentTime);
    } else { gainNode.gain.setValueAtTime(harmonyGain, audioCtx.currentTime); };

    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.connect(gainNode);
    oscillator.start();

    let oscillatorObject = {oscillator: oscillator, gainNode: gainNode};
    oscillators.push(oscillatorObject);
};

// Music variables
const intToNote = {0: 'C', 1: 'D\u266d', 2: 'D', 3: 'E\u266d', 4: 'E', 5: 'F', 6: 'G\u266d', 7: 'G', 8: 'A\u266d', 9: 'A', 10: 'B\u266d', 11: 'B'};
var harmonies;
fetch('/static/harmonies.json')
.then((response) => response.json())
.then((data) => harmonies = data);

// Initialize variables
var modulationDirection = -1;  // Brighter (add sharps) is -1. Darker (add flats) is 1.
var lastActiveKey = null;  // midi number
var mouseOrTouchOn = false;
var activeTouches = [];  // list of values for touch.identifier
var absLastTonalCenter = randInt(0, 11);  // Initialized randomly.
var lastHarmonyGroupKey;
var repeatTonalCenterCount = 0;
var repeatHarmonyGroupCount = 0;

// Color variables
const startHue = 150;
var firstTonalCenter = null;  // Used to associate first random tonal center with the initialized mainHue.
var mainHue;
var bodyBgColor;
var whiteKeyNonTriggerableOffColor;
var blackKeyNonTriggerableOffColor;
var whiteKeyTriggerableOffColor;
var blackKeyTriggerableOffColor;
var keyOnColor;

// Admin alerts
var userStartMsec = null;
var nextAlertMsec = null;


// Add event listeners
rotateButton.addEventListener('click', rotateView);
window.addEventListener('resize', windowResizeEvent);
window.addEventListener('mouseup', () => {
    mouseOrTouchOn = false;
    oscillatorUntrigger();
});
keyboard.addEventListener('mouseleave', oscillatorUntrigger);
keyboard.addEventListener('mousedown', event => {
    if (event.ctrlKey === false && event.button === 0) {
        mouseOrTouchOn = true;
        harmonizeLastActiveKey();
    };
});
keyboard.addEventListener('touchstart', event => {
    event.preventDefault();
    touchUpdateControls(event);
});
keyboard.addEventListener('touchmove', event => {
    event.preventDefault();
    touchUpdateControls(event);
});
keyboard.addEventListener('touchend', event => touchUpdateControls(event));
keyboard.addEventListener('touchcancel', event => touchUpdateControls(event));
harmDirectionButton.addEventListener('mousedown', () => {
    modulationDirection *= -1;
    updateHarmButtonColoring();
});
harmDirectionButton.addEventListener('mousemove', () => {
    if (modulationDirection === 1) {
        brightButton.style.backgroundColor = whiteKeyTriggerableOffColor;
    } else {
        darkButton.style.backgroundColor = whiteKeyTriggerableOffColor;
    };
});
harmDirectionButton.addEventListener('mouseleave', () => {
    if (modulationDirection === 1) {
        brightButton.style.backgroundColor = whiteKeyNonTriggerableOffColor;
    } else {
        darkButton.style.backgroundColor = whiteKeyNonTriggerableOffColor;
    };
});


// For each HTML key element, assign element ids, add event listeners, and insert grid column settings.
var midiNumber = 32;  // Midi note number of lowest key (F#1)
var blackColumnNumber = 1;
var whiteColumnNumber = 2;
for (let key of keyboardKeys) {

    if (key.classList.contains('triggerable')) {
        key.addEventListener('mouseenter', mouseEnterTriggerableKey);
    } else {
        key.addEventListener('mouseenter', mouseEnterNonTriggerableKey);
    };

    if (key.classList.contains('non-key')) {
        key.style.gridColumn = `${blackColumnNumber} / span 2`;
        blackColumnNumber += 2;

    } else {

        if (key.classList.contains('black-key')) {
            key.style.gridColumn = `${blackColumnNumber} / span 2`;
            blackColumnNumber += 2;
        } else if (key.classList.contains('white-key')) {
            key.style.gridColumn = `${whiteColumnNumber} / span 2`;
            whiteColumnNumber += 2;
        };

        key.id = `key-${midiNumber}`;
        midiNumber += 1;
    };
};


// Init CSS.
updateColoring(startHue);
allKeysOff();  // Init key colors.
document.body.style.backgroundColor = bodyBgColor;
chordSymbolContainer.style.color = blackKeyTriggerableOffColor;
darkButton.style.color = 'black';
brightButton.style.color = 'white';


function windowResizeEvent() {

    const aspectRatio = window.innerWidth / window.innerHeight;
    const stickyAspRatioAmount = 0.1;

    if (lastWindowPreferFlip) {
        if (aspectRatio > 1 + stickyAspRatioAmount) {
            // This window does not prefer flip.
            lastWindowPreferFlip = false;
            if (stateFlipped) {
                rotateView();
            };
        };

    } else if (aspectRatio < 1 - stickyAspRatioAmount) {
        // This window does prefer flip.
        // lastWindowPreferFlip === false
        lastWindowPreferFlip = true;
        if (stateFlipped === false) {
            rotateView();
        };
    };
};

function rotateView() {

    stateFlipped = stateFlipped === false;  // Flip boolean.

    if (stateFlipped) {
        document.getElementById('body-container').style.transform = 'rotate(90deg)';
        document.getElementById('rotate-button').style.transform = 'scaleY(-1)';

    } else {
        document.getElementById('body-container').style.transform = 'none';
        document.getElementById('rotate-button').style.transform = 'none';
    };

    bodyContainer.style.padding = flipDependentLength(3);
    bodyContainer.style.width = flipDependentLength(100);

    keyboard.style.height = flipDependentLength(18);

    for (const key of keyboardKeys) {
        key.style.borderWidth = flipDependentLength(0.2);
        key.style.borderRadius = flipDependentLength(1);
    };

    panel.style.marginTop = flipDependentLength(2);

    harmDirectionButton.style.width = flipDependentLength(14);
    brightButton.style.fontSize = darkButton.style.fontSize = flipDependentLength(1.8);
    brightButton.style.padding = darkButton.style.padding = `${flipDependentLength(1)} 0`;
    brightButton.style.borderRadius = `${flipDependentLength(2)} 0 0 0`;
    darkButton.style.borderRadius = `0 0 ${flipDependentLength(2)} 0`;

    chordSymbolA.style.fontSize = flipDependentLength(6);
    chordSymbolB.style.fontSize = flipDependentLength(4.5);
    chordSymbolC.style.fontSize = flipDependentLength(3);

    rotateButton.style.height = flipDependentLength(5);
};

function flipDependentLength(percentNum) {
    if (stateFlipped) {
        return `${percentNum}dvh`;
    } else {
        return `${percentNum}vw`;
    };
};

function mouseEnterTriggerableKey (event) {
    lastActiveKey = event.target.id.slice(4);
    harmonizeLastActiveKey();
};

function mouseEnterNonTriggerableKey () {
    lastActiveKey = null;
    oscillatorUntrigger();
};

function updateHarmButtonColoring () {
    if (modulationDirection === 1) {
        darkButton.style.backgroundColor = blackKeyNonTriggerableOffColor;
        brightButton.style.backgroundColor = whiteKeyNonTriggerableOffColor;
        darkButton.style.color = 'white';
        brightButton.style.color = 'black';
    } else {
        darkButton.style.backgroundColor = whiteKeyNonTriggerableOffColor;
        brightButton.style.backgroundColor = blackKeyNonTriggerableOffColor;
        darkButton.style.color = 'black';
        brightButton.style.color = 'white';
    };
};

function updateColoring (newMainHue) {

    mainHue = newMainHue;

    bodyBgColor = `hsl(${mainHue}, 100%, 95%)`;
    whiteKeyNonTriggerableOffColor = `hsl(${mainHue}, 50%, 85%)`;
    whiteKeyTriggerableOffColor = `hsl(${mainHue}, 100%, 45%)`;
    blackKeyNonTriggerableOffColor = `hsl(${mainHue}, 20%, 50%)`;
    blackKeyTriggerableOffColor = `hsl(${mainHue}, 100%, 15%)`;
    keyOnColor = `hsl(${(mainHue + 180) % 360}, 100%, 40%)`;
    
    document.body.style.backgroundColor = bodyBgColor;
    chordSymbolContainer.style.color = blackKeyTriggerableOffColor;

    updateHarmButtonColoring();

    for (key of keyboardKeys) {
        key.style.borderColor = bodyBgColor;
    };
};

function keyOn (keyNumber) {
    document.querySelector(`#key-${keyNumber}`).style.backgroundColor = keyOnColor;
};

function allKeysOff () {
    for (let key of keyboardActualKeysOnly) {
        if (key.classList.contains('black-key')) {
            if (key.classList.contains('triggerable')) {
                key.style.backgroundColor = blackKeyTriggerableOffColor;
            } else {  // Not a triggerable key.
                key.style.backgroundColor = blackKeyNonTriggerableOffColor;
            };
        } else {  // Has white-key class.
            if (key.classList.contains('triggerable')) {
                key.style.backgroundColor = whiteKeyTriggerableOffColor;
            } else {  // Not a triggerable key.
                key.style.backgroundColor = whiteKeyNonTriggerableOffColor;
            };
        };
    };
};

function hardRamp (targetValue, slope) { // Slope = seconds to traverse PCM values from 0 to 1.
    // Hard ramp waits 1 msec to begin ramp, and waits 1 msec after ramp ends to resolve promise.
    // So total time is duration + 2 msecs.

    if (audioCtx.state === 'suspended') { return; };

    let currentGain = masterGain.gain.value;
    let duration = Math.abs(currentGain - targetValue) * slope;

    clearTimeout(masterGainRampTimeoutId);

    if (typeof masterGain.gain.cancelAndHoldAtTime === 'function') { 
        masterGain.gain.cancelAndHoldAtTime(audioCtx.currentTime);
    } else {
        masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    };

    masterGain.gain.setValueAtTime(currentGain, audioCtx.currentTime + 0.001); // Needed to prevent click at ramp start.
    masterGain.gain.linearRampToValueAtTime(targetValue, audioCtx.currentTime + duration + 0.001);

    return new Promise((resolve, reject) => {
        masterGainRampTimeoutId = setTimeout(function() { resolve(); }, duration * 1000 + 2);
    });
};

function midiToHz (midiNoteNumber) {
    let inOctaves = (midiNoteNumber - 69) / 12;
    let hz = Math.pow(2, inOctaves) * 440;
    return hz;
};

function oscillatorTrigger (oscA, oscB, oscC, oscD) {
    // Each argument is a midi note number to assign to an oscillator.
    oscillators[0].oscillator.frequency.setValueAtTime(midiToHz(oscA), audioCtx.currentTime);
    oscillators[1].oscillator.frequency.setValueAtTime(midiToHz(oscB), audioCtx.currentTime);
    oscillators[2].oscillator.frequency.setValueAtTime(midiToHz(oscC), audioCtx.currentTime);
    oscillators[3].oscillator.frequency.setValueAtTime(midiToHz(oscD), audioCtx.currentTime);
    hardRamp(1, envAttackTime);
};

function oscillatorUntrigger () {
    hardRamp(0, envReleaseTime);
    allKeysOff();
};

function harmonizeLastActiveKey () {

    if (mouseOrTouchOn === false) {
        allKeysOff();
        return;
    };

    if (lastActiveKey === null) {
        oscillatorUntrigger();
        allKeysOff();
        return;
    };

    adminAlert();

    resumeAudioCtx();

    let modulationDistance = proportionalRandInt(0, 6, modulationCurve);
    let forceModulation = false;
    if (repeatHarmonyGroupCount >= 2 || repeatTonalCenterCount >= 5) {
        modulationDistance = Math.min(modulationDistance + 1, 6);
        forceModulation = true;
    };

    let relLastTonalCenter = mod(absLastTonalCenter - lastActiveKey, 12);
    let relDecidedTonalCenter;

    // Find tonal center nearest to target which contains harmonies.
    for (let modulationDistanceOffset = 0; modulationDistanceOffset <= 6; modulationDistanceOffset++) {
        let modulationOptions = [];
        if (modulationDistance + modulationDistanceOffset <= 6) {
            let fartherTestTonalCenter = mod(relLastTonalCenter + (modulationDistance + modulationDistanceOffset) * modulationDirection * 5, 12);
            if (Object.keys(harmonies[fartherTestTonalCenter]).length > 0) {
                modulationOptions.push(fartherTestTonalCenter);
            };
        };
        if (modulationDistanceOffset > 0 && modulationDistance - modulationDistanceOffset >= 0) {
            if (forceModulation === false || modulationDistance - modulationDistanceOffset >= 1) {
                let nearerTestTonalCenter = mod(relLastTonalCenter + (modulationDistance - modulationDistanceOffset) * modulationDirection * 5, 12);
                if (Object.keys(harmonies[nearerTestTonalCenter]).length > 0) {
                    modulationOptions.push(nearerTestTonalCenter);
                };
            };
        };
        if (modulationOptions.length > 0) {
            relDecidedTonalCenter = randChoiceArray(modulationOptions);
            break;
        };
    };
    
    let thisHarmonyGroupKey = randObjectKey(harmonies[relDecidedTonalCenter]);
    let harmonyGroup = harmonies[relDecidedTonalCenter][thisHarmonyGroupKey];
    let harmony = randChoiceArray(harmonyGroup);
    let absThisTonalCenter = (relDecidedTonalCenter + lastActiveKey % 12) % 12;

    if (firstTonalCenter === null) {
        firstTonalCenter = absThisTonalCenter;
    };

    if (absLastTonalCenter === absThisTonalCenter) {
        repeatTonalCenterCount += 1;
        if (lastHarmonyGroupKey === thisHarmonyGroupKey) {
            repeatHarmonyGroupCount += 1;
        } else {
            repeatHarmonyGroupCount = 1;
            lastHarmonyGroupKey = thisHarmonyGroupKey;
        };
    } else {
        repeatTonalCenterCount = 1;
        repeatHarmonyGroupCount = 1;
        absLastTonalCenter = absThisTonalCenter;
    };

    // Change chord symbol.
    let chordRoot = intToNote[(absLastTonalCenter + harmony[0]) % 12];
    chordSymbolA.innerText = chordRoot;
    chordSymbolB.innerText = harmony[1];
    chordSymbolC.innerText = harmony[2];

    // Change coloring
    updateColoring(((absThisTonalCenter - firstTonalCenter) * 5 % 12 * 30 + startHue) % 360);
    allKeysOff();
    keyOn(lastActiveKey);
    keyOn(lastActiveKey - harmony[3]);
    keyOn(lastActiveKey - harmony[4]);
    keyOn(lastActiveKey - harmony[5]);

    // Trigger oscillator
    oscillatorTrigger(lastActiveKey, lastActiveKey - harmony[3], lastActiveKey - harmony[4], lastActiveKey - harmony[5]);
};

function resumeAudioCtx () {
    if (audioCtx.state === 'suspended') { audioCtx.resume(); };
};

function touchUpdateControls (event) {

    // Check for new touches to add to activeTouches.
    let touchIds = []; // Touch.identifier array
    for (let touch of event.touches) {
        touchIds.push(touch.identifier);
        let oldTouch = activeTouches.includes(touch.identifier); // Boolean
        if (oldTouch === false) { activeTouches.unshift(touch.identifier); };
    };

    // Check for ended touches to delete from activeTouches.
    for (let touchIndex = activeTouches.length - 1; touchIndex >= 0; touchIndex--) {
        let activeTouch = touchIds.includes(activeTouches[touchIndex]); // Boolean
        if (activeTouch === false) { activeTouches.splice(touchIndex, 1); };
    };

    if (activeTouches.length > 0) {

        mouseOrTouchOn = true;

        let latestTouchCoords = [0, 0];
        // Find latest touch in event.touches by identifier, and calculate latestTouchCoords.
        for (let touch of event.touches) {
            if (activeTouches[0] === touch.identifier) {
                latestTouchCoords = [touch.clientX, touch.clientY];
                break;
            };
        };

        let activeElement = document.elementFromPoint(latestTouchCoords[0], latestTouchCoords[1]);
        if (activeElement.classList.contains('triggerable')) {
            let activeKeyNumber = activeElement.id.slice(4);
            if (lastActiveKey !== activeKeyNumber) {
                lastActiveKey = activeKeyNumber;
                harmonizeLastActiveKey();
            };
            return;
        };

    } else { mouseOrTouchOn = false; };

    lastActiveKey = null;
    oscillatorUntrigger();
};

function adminAlert() {
    // // Requires initialized global variables below:
    // var userStartMsec = null;
    // var nextAlertMsec = null;

    const appName = 'HARMio';
    const firstAlertSecs = 15;  // Send first alert after X seconds.
    const alertSpacingFactor = 3;  // Exponential proportion for consecutive alert times.
    const maxSpacingMins = 5;  // A next alert will not be scheduled to be allowed greater than this duration in minutes.
    const idleMinsBeforeTimerReset = 5;  // If no alert activity happens this many minutes after the next alert is scheduled, userStartMsec is reset.

    if (userStartMsec === null) {
        // Set time for first alert.
        userStartMsec = Date.now();
        nextAlertMsec = Date.now() + firstAlertSecs * 1000;
        return;
    };

    if (Date.now() < nextAlertMsec) return;  // Not time for alert yet.

    if (nextAlertMsec + idleMinsBeforeTimerReset * 60000 < Date.now()) {
        // User idle beyond threshold. Reset alert timing.
        userStartMsec = Date.now();
        nextAlertMsec = Date.now() + firstAlertSecs * 1000;
    } else {
        const msecsSinceStart = Date.now() - userStartMsec;
        const msecsTillNextAlert = Math.min(msecsSinceStart * alertSpacingFactor, maxSpacingMins * 60000);
        nextAlertMsec = Date.now() + msecsTillNextAlert;
    };

    const request = new XMLHttpRequest();
    request.open("POST", '/serverterminal', true);
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    const userSecs = Math.floor((Date.now() - userStartMsec) / 1000);
    const requestContent = `appname=${appName}&userstartmsec=${userStartMsec}&usersecs=${userSecs}`;
    request.send(requestContent);
};


// Utility functions

function randInt (min, max, exponCurve=1) {
    // min <= randInt <= max // exponCurve is any positive real number. >1 curves toward min. <1 curves toward max.
    return Math.floor(Math.pow(Math.random(), exponCurve) * (max - min + 1) + min);
};

function proportionalRandInt (min, max, exponCurve=2) {
    // min <= proportionalRandInt <= max
    // exponCurve is any positive real number excluding 1 (in which case, just use a flat distribution).
    // exponCurve is the probability ratio between successive integers.
    // i.e., if exponCurve is 3, then integer i is 3 times more likely than i+1, which is 3 times more likely than i+2, and so on.
    let steps = max - min + 1;
    let term_a = Math.pow(exponCurve, steps);
    let flatRandFloat = Math.random();
    let term_b = flatRandFloat * (term_a - 1) / term_a;
    let term_c = Math.log(1 / (1 - term_b));
    let term_d = Math.floor(term_c / Math.log(exponCurve));
    return term_d;
};

function randChoiceArray (array) {
    let index = Math.floor(Math.random() * array.length);
    return array[index];
};

function randObjectKey (object) {
    let allKeys = Object.keys(object);
    let randKey = randChoiceArray(allKeys);
    return randKey;
};

function mod (a, n) { return ((a % n) + n) % n; }; // Always returns positive result.
