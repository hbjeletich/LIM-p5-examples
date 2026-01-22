class ColorPoint {
    constructor(x, y, col, size) {
        this.x = x;
        this.y = y;
        this.col = col;
        this.size = size;
    }

    update() {
        this.updatePos();
        this.updateColor();
    }

    draw() {
        fill(this.col);
        rect(this.x, this.y, this.size, this.size);
    }

    updatePos() {
        this.x += xspeed;
        this.y += yspeed;
    }

    updateColor() {
        let newCol = this.newColor();
        this.col = lerpColor(this.col, newCol, 0.1);
    }

    newColor() {
        let timeRatio = constrain((millis() - lastMouseTime) / mouseDelay, 0, 1);
        let newX = lerp(this.x, lastMouseX, timeRatio);
        let newY = lerp(this.y, lastMouseY, timeRatio);
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