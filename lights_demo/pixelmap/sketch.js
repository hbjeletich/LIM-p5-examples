let colors = [];
let xspeed = 0;
let yspeed = 0;

let speedModifier = 0.1;
let maxSpeed = 1;

let pushColorsFlag = false;
let pushColorsInterval = 150;
let currentPushInterval = 150;
let lastPushTime = 0;
let holdTime = 0;

let lastMouseX = 0;
let lastMouseY = 0;
let mouseDelay = 100;
let lastMouseTime = 0;

let cpSize = 40;
let lifetime = 1000;

let grid = [];

// next step -- array of color points, only hold like 10 color points at a time?

class ColorPoint {
    constructor(x, y, col, size, life) {
        this.x = x;
        this.y = y;
        this.col = col;
        this.size = size;
        this.life = life
        this.lastX = x;
        this.lastY = y;
        this.lastCol = col;
        this.initialLife = life;
    }

    update() {
        this.updatePos();
        this.updateColor();
        this.updateLifetime();
    }

    draw() {
        this.drawPoint();
    }

    updatePos() {
        this.lastX = this.x;
        this.lastY = this.y;
        this.x += xspeed;
        this.y += yspeed;
    }

    updateColor() {
        let newCol = this.newColor();
        this.lastCol = this.col;
        this.col = lerpColor(this.col, newCol, 0.1);
        this.col.setAlpha(map(this.life, 0, this.initialLife, 0, 255));
        let ratio = this.life / this.initialLife;
        let alpha = map(ratio, 0, 1, 0, 255);
        this.col.setAlpha(alpha);
    }

    drawPoint() {
        fill(this.col);
        rect(this.x, this.y, this.size, this.size);
    }

    updateLifetime(){
        // grow more transparent over time
        this.life--;
        if (this.life <= 0) {
            this.life = 0;
        }
    }

    newColor() {
        // color changes based on distance to last mouse position
        // we lerp between last mouse position and current position based on time since last mouse move
        // the color will follow the mouse smoothly, lerping using this.lastCol and the new color based on distance to last mouse position
        let timeRatio = constrain((millis() - lastMouseTime) / mouseDelay, 0, 1);
        
        let newX = lerp(this.x, lastMouseX, timeRatio);
        let newY = lerp(this.y, lastMouseY, timeRatio);

        // as you get further from mouse while in same color, lerp to next color
        let maxDist = dist(0, 0, width, height);
        let d = dist(this.x, this.y, newX, newY);
        let t = map(d, 0, maxDist, 0, colors.length);
        let index1 = floor(t) % colors.length;
        let index2 = (index1 + 1) % colors.length;
        let lerpAmt = t - floor(t);
        let newColor = lerpColor(colors[index1], colors[index2], lerpAmt);
        return newColor;
    }
}

function setup() {
    createCanvas(windowWidth, windowHeight);
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
    for (x = spacing / 2; x < width + spacing/2; x += spacing) {
        for (y = spacing / 2; y < height + spacing/2; y += spacing) {
            let col = color(255);
            let cp = new ColorPoint(x-spacing/2, y-spacing/2, col, cpSize, lifetime);
            grid.push(cp);
        }
    }

    
}

function draw() {
    //background(0);

    xspeed += speedModifier;
    yspeed += speedModifier;

    grid.forEach(element => {
        element.update();
        element.draw();
    });

    // let spacing = 50;
    // // make a grid
    // for (let x = spacing / 2; x < width +50; x += spacing) {
    //     for (let y = spacing / 2; y < height +50; y += spacing) {
    //         let col = getColor(x-spacing/2, y-spacing/2);
    //         fill(col);
    //         rect(x-spacing/2 + xspeed, y-spacing/2 + yspeed, spacing * 0.8, spacing * 0.8);
    //     }
    // }



    if (xspeed >= maxSpeed || xspeed <= -maxSpeed) {
        speedModifier *= -1;
    }

    // console.log("xspeed:", xspeed, "yspeed:", yspeed);

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
                currentPushInterval *=1 - (holdTime / 10000);
            }
        }
    } else {
        pushColorsFlag = false; 
        currentPushInterval = pushColorsInterval;
    }

    // // keep track of last mouse position that was delay seconds ago
    // if (millis() - lastMouseTime >= mouseDelay) {
    //     lastMouseX = mouseX;
    //     lastMouseY = mouseY;
    //     lastMouseTime = millis();
    // }

    lastMouseTime = millis();
    lastMouseX = mouseX;
    lastMouseY = mouseY;

}

// let lastColorTime = 0;
// let colorChangeInterval = 1000;

// function getColor(cp) {
//     // color changes based on distance to last mouse position
//     let timeRatio = constrain((millis() - lastMouseTime) / mouseDelay, 1, 0);

//     let newX = lerp(cp.x, lastMouseX, timeRatio);
//     let newY = lerp(cp.y, lastMouseY, timeRatio);

//     // as you get further from mouse while in same color, lerp to next color
//     let maxDist = dist(0, 0, width, height);
//     let d = dist(cp.x, cp.y, newX, newY);
//     let t = map(d, 0, maxDist, 0, colors.length);
//     let index1 = floor(t) % colors.length;
//     let index2 = (index1 + 1) % colors.length;
//     let lerpAmt = t - floor(t);
//     let newColor = lerpColor(colors[index1], colors[index2], lerpAmt);
//     return newColor;
// }


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