let selectDevice;
let video;

function setup() {
  createCanvas(640, 480);

  navigator.mediaDevices.enumerateDevices().then(gotDevices);

  video = createCapture();
  video.hide();

  selectDevice = createSelect();
  selectDevice.option("Default", "default");
  selectDevice.changed(changeCamera);
}

function gotDevices(devices) {
  for (const device of devices) {
    if (device.kind == "videoinput") {
      selectDevice.option(device.label, device.deviceId);
    }
  }
}

function changeCamera(e) {
  video.elt.srcObject.getTracks().map((track) => track.stop());
  video.remove();
  video = createCapture({
    video: {
      deviceId: e.target.value,
    },
  });
  video.hide();
}

function draw() {
  background(0);

  image(video, 0, 0, width, height);
}
