let colors = [];
let xspeed = 0;
let yspeed = 0;

let xSpeedModifier = 0.05;
let ySpeedModifier = 0.01;
let xMaxSpeed = 1;
let yMaxSpeed = .1;

let pushColorsFlag = false;
let pushColorsInterval = 150;
let currentPushInterval = 150;
let lastPushTime = 0;
let holdTime = 0;
let holdTimeModifier = 0.0001;

let lastMouseX = 0;
let lastMouseY = 0;
let mouseDelay = 100;
let lastMouseTime = 0;

let grid = [];

function setup() {
    createCanvas(windowWidth, windowHeight);
    background(0);
    rectMode(CENTER);
    noStroke();

    if (colors.length === 0) {
        randomizeColors();
    }

    // make a grid of ColorPoints
    let spacing = 50;
    let x = spacing / 2;
    let y = spacing / 2;

    grid = [];
    for (x = spacing / 2; x < width + spacing * 1.5; x += spacing) {
        for (y = spacing / 2; y < height + spacing * 1.5; y += spacing) {
            let col = color(255);
            let cp = new ColorPoint(x - spacing/2, y - spacing/2, col, spacing +1);
            grid.push(cp);
        }
    }

    
}

function draw() {
    background(0);

    xspeed += xSpeedModifier;
    yspeed += ySpeedModifier;

    grid.forEach(element => {
        element.update();
        element.draw();
    });



    if (xspeed >= xMaxSpeed || xspeed <= -xMaxSpeed) {
        xSpeedModifier *= -1;
    }

    if (yspeed >= yMaxSpeed || yspeed <= -yMaxSpeed) {
        ySpeedModifier *= -1;
    }

    if (mouseIsPressed) {
        if (!pushColorsFlag) {
            pushColorsFlag = true;
            lastPushTime = millis();
            pushColors();
        } else {
            holdTime = millis() - lastPushTime;
            if (holdTime >= currentPushInterval) {
                lastPushTime = millis();
                pushColors();
                currentPushInterval *=1 - (holdTime * holdTimeModifier);
            }
        }
    } else {
        pushColorsFlag = false; 
        currentPushInterval = pushColorsInterval;
    }

    lastMouseTime = millis();
    lastMouseX = mouseX;
    lastMouseY = mouseY;

}

function pushColors() {
    // move last color to front
    if (colors.length > 1) {
        let lastColor = colors.pop();
        colors.unshift(lastColor);
    }
}

function keyPressed() {
    // randomize colors
    randomizeColors();
}

function randomizeColors() {
    colors = [];
    for (let i = 0; i < random(10, 50); i++) {
        colors.push(color(random(255), random(255), random(255)));
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}