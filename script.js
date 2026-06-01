import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const flashBtn = document.getElementById("flashBtn");
const downloadBtn = document.getElementById("downloadBtn");

const statusText = document.getElementById("status");
const gestureText = document.getElementById("gestureText");
const countdownText = document.getElementById("countdown");
const flash = document.getElementById("flash");

const resultCanvas = document.getElementById("resultCanvas");
const resultCtx = resultCanvas.getContext("2d");

const filterControls = document.getElementById("filterControls");
const effectControls = document.getElementById("effectControls");
const frameControls = document.getElementById("frameControls");
const stickerControls = document.getElementById("stickerControls");
const clearStickerBtn = document.getElementById("clearStickerBtn");

let handLandmarker = null;
let isCameraOn = false;
let isDetecting = false;
let isCapturing = false;

let currentSlot = 1;
let photos = [];

let lastDetectTime = 0;
let lastFingerCount = 0;
let gestureStableStart = 0;

const detectInterval = 150;
const stableTime = 300;

let flashEnabled = true;

let selectedFilter = "original";
let selectedEffect = "none";
let selectedFrame = "pinkStrip";

let stickers = [];

const filterOptions = {
  original: { label: "原圖", value: "none" },
  japanese: { label: "日系清透", value: "brightness(120%) contrast(84%) saturate(78%)" },
  creamy: { label: "韓系奶油", value: "brightness(118%) contrast(94%) saturate(104%)" },
  vintage: { label: "復古底片", value: "sepia(72%) brightness(108%) contrast(112%) saturate(84%)" },
  vivid: { label: "高對比鮮豔", value: "contrast(150%) saturate(165%) brightness(104%)" },
  blackwhite: { label: "黑白拍貼", value: "grayscale(100%) contrast(150%) brightness(106%)" }
};

const effectOptions = {
  none: "無特效",
  blur: "影像模糊",
  mosaic: "馬賽克",
  convex: "凸透鏡"
};

const frameOptions = {
  pinkStrip: "粉紅直式韓拍框",
  silverMeta: "銀色金屬韓拍框"
};

const stickerOptions = [
  { key: "sparkle", label: "白閃星" },
  { key: "heartGlow", label: "粉光愛心" },
  { key: "swirl", label: "糖果旋渦" },
  { key: "wing", label: "天使翅膀" },
  { key: "pixelStar", label: "像素星鏈" },
  { key: "glow", label: "泡泡光斑" },
  { key: "butterfly", label: "蝴蝶" },
  { key: "ribbon", label: "粉緞帶" }
];

startBtn.addEventListener("click", async () => {
  try {
    statusText.textContent = "正在開啟相機...";
    gestureText.textContent = "準備啟動手勢偵測...";

    await setupCamera();

    statusText.textContent = "相機已開啟，正在載入手勢模型...";
    await setupHandLandmarker();

    statusText.textContent = "手勢模型已載入，請比 1 拍第 1 格";
    gestureText.textContent = "請把手放到鏡頭中央";

    if (!isDetecting) {
      isDetecting = true;
      requestAnimationFrame(detectLoop);
    }
  } catch (error) {
    console.error("啟動失敗：", error);
    statusText.textContent = `啟動失敗：${error.name || error.message}`;
    gestureText.textContent = "請確認相機權限、HTTPS 網址與網路連線";
  }
});

resetBtn.addEventListener("click", () => {
  currentSlot = 1;
  photos = [];
  stickers = [];
  isCapturing = false;
  lastFingerCount = 0;
  gestureStableStart = 0;

  clearResultCanvas();

  statusText.textContent = "已重新開始，請比 1 拍第 1 格";
  gestureText.textContent = "目前手勢：尚未偵測";
});

flashBtn.addEventListener("click", () => {
  flashEnabled = !flashEnabled;
  flashBtn.textContent = flashEnabled ? "閃光燈：開" : "閃光燈：關";
});

downloadBtn.addEventListener("click", () => {
  if (photos.length < 4) {
    alert("請先完成四格拍照！");
    return;
  }

  drawFinalPhoto();

  const link = document.createElement("a");
  link.download = "gesture-photobooth.png";
  link.href = resultCanvas.toDataURL("image/png");
  link.click();
});

clearStickerBtn.addEventListener("click", () => {
  stickers = [];
  drawFinalPhoto();
});

async function setupCamera() {
  if (isCameraOn) return;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 720 },
      height: { ideal: 960 }
    },
    audio: false
  });

  video.srcObject = stream;

  await new Promise((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });

  isCameraOn = true;
}

async function setupHandLandmarker() {
  if (handLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2
  });
}

function detectLoop() {
  requestAnimationFrame(detectLoop);

  if (!isCameraOn || !handLandmarker) {
    gestureText.textContent = "相機或模型尚未準備好";
    return;
  }

  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    gestureText.textContent = "相機畫面載入中...";
    return;
  }

  const now = performance.now();

  if (now - lastDetectTime < detectInterval) {
    return;
  }

  lastDetectTime = now;

  let results;

  try {
    results = handLandmarker.detectForVideo(video, now);
  } catch (error) {
    console.error("detectForVideo 錯誤：", error);
    gestureText.textContent = "手勢偵測錯誤，請重新整理網頁";
    return;
  }

  if (results.landmarks && results.landmarks.length > 0) {
    const fingerCount = countFingers(results.landmarks[0]);

    gestureText.textContent =
      `偵測到手：${fingerCount} 根手指，目前要拍第 ${currentSlot} 格`;

    checkGestureAndCapture(fingerCount);
  } else {
    gestureText.textContent = "模型已啟動，但目前沒有偵測到手";
  }
}

function checkGestureAndCapture(fingerCount) {
  const now = performance.now();

  if (fingerCount !== lastFingerCount) {
    lastFingerCount = fingerCount;
    gestureStableStart = now;
  }

  const isStable = now - gestureStableStart >= stableTime;

  if (
    fingerCount === currentSlot &&
    isStable &&
    !isCapturing &&
    currentSlot <= 4
  ) {
    captureWithCountdown(currentSlot);
  }
}

function countFingers(landmarks) {
  let count = 0;
  const wrist = landmarks[0];

  const fingers = [
    { tip: 8, pip: 6 },
    { tip: 12, pip: 10 },
    { tip: 16, pip: 14 },
    { tip: 20, pip: 18 }
  ];

  fingers.forEach((finger) => {
    const tip = landmarks[finger.tip];
    const pip = landmarks[finger.pip];

    const tipDistance = distance(tip, wrist);
    const pipDistance = distance(pip, wrist);

    if (tipDistance > pipDistance * 1.15) {
      count++;
    }
  });

  return count;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function captureWithCountdown(slot) {
  isCapturing = true;
  statusText.textContent = `偵測到 ${slot} 根手指，準備拍第 ${slot} 格`;

  for (let i = 3; i > 0; i--) {
    countdownText.textContent = i;
    await wait(700);
  }

  countdownText.textContent = "拍！";
  await flashScreen();

  const photo = capturePhoto();
  photos.push(photo);

  drawFinalPhoto();

  countdownText.textContent = "";

  if (currentSlot < 4) {
    currentSlot++;
    statusText.textContent = `第 ${slot} 格完成，請比 ${currentSlot} 拍第 ${currentSlot} 格`;
  } else {
    statusText.textContent = "四格拍照完成，可以開始編輯照片！";
  }

  await wait(1000);
  isCapturing = false;
}

async function flashScreen() {
  if (!flashEnabled) {
    await wait(250);
    return;
  }

  flash.classList.add("active");
  await wait(120);
  flash.classList.remove("active");
  await wait(160);
}

function capturePhoto() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  return canvas;
}

function createProcessedPhoto(sourceCanvas) {
  const temp = document.createElement("canvas");
  const tempCtx = temp.getContext("2d");

  temp.width = sourceCanvas.width;
  temp.height = sourceCanvas.height;

  tempCtx.filter = filterOptions[selectedFilter].value;
  tempCtx.drawImage(sourceCanvas, 0, 0);
  tempCtx.filter = "none";

  if (selectedEffect === "blur") {
    applyBlurEffect(temp);
  } else if (selectedEffect === "mosaic") {
    applyMosaicEffect(temp, 14);
  } else if (selectedEffect === "convex") {
    applyConvexEffect(temp);
  }

  return temp;
}

function applyBlurEffect(canvas) {
  const copy = document.createElement("canvas");
  const copyCtx = copy.getContext("2d");

  copy.width = canvas.width;
  copy.height = canvas.height;
  copyCtx.drawImage(canvas, 0, 0);

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = "blur(5px)";
  ctx.drawImage(copy, 0, 0);
  ctx.filter = "none";
}

function applyMosaicEffect(canvas, blockSize) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, blockSize, blockSize);
    }
  }
}

function applyConvexEffect(canvas) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;

  const output = ctx.createImageData(width, height);
  const dst = output.data;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2.3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      let sx = x;
      let sy = y;

      if (d <= r) {
        sx = Math.floor((dx * d) / r + cx);
        sy = Math.floor((dy * d) / r + cy);
      }

      sx = Math.max(0, Math.min(width - 1, sx));
      sy = Math.max(0, Math.min(height - 1, sy));

      const srcIndex = (sy * width + sx) * 4;
      const dstIndex = (y * width + x) * 4;

      dst[dstIndex] = src[srcIndex];
      dst[dstIndex + 1] = src[srcIndex + 1];
      dst[dstIndex + 2] = src[srcIndex + 2];
      dst[dstIndex + 3] = src[srcIndex + 3];
    }
  }

  ctx.putImageData(output, 0, 0);
}

function drawFinalPhoto() {
  if (photos.length === 0) {
    clearResultCanvas();
    return;
  }

  const layout = getLayoutSettings();
  resultCanvas.width = layout.canvasW;
  resultCanvas.height = layout.canvasH;

  drawFrameBackground(layout);

  photos.forEach((photo, index) => {
    const box = layout.photoBoxes[index];
    if (!box) return;

    const processed = createProcessedPhoto(photo);

    if (selectedFrame === "silverMeta") {
      drawSilverPhotoPanel(processed, box);
    } else {
      drawPinkStripPhoto(processed, box, index);
    }
  });

  drawFrameTitle(layout);
  drawStickers();
}

function getLayoutSettings() {
  if (selectedFrame === "silverMeta") {
    return {
      canvasW: 980,
      canvasH: 1180,
      photoBoxes: [
        { x: 155, y: 165, w: 280, h: 280 },
        { x: 545, y: 165, w: 280, h: 280 },
        { x: 155, y: 525, w: 280, h: 280 },
        { x: 545, y: 525, w: 280, h: 280 }
      ]
    };
  }

  return {
    canvasW: 520,
    canvasH: 1680,
    photoBoxes: [
      { x: 85, y: 110, w: 350, h: 300 },
      { x: 85, y: 460, w: 350, h: 300 },
      { x: 85, y: 810, w: 350, h: 300 },
      { x: 85, y: 1160, w: 350, h: 300 }
    ]
  };
}

function drawFrameBackground(layout) {
  const w = layout.canvasW;
  const h = layout.canvasH;
  const ctx = resultCtx;

  if (selectedFrame === "pinkStrip") {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ff4d8f");
    grad.addColorStop(0.45, "#ff86b2");
    grad.addColorStop(1, "#fff8fb");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(50, 40, w - 100, h - 80);

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "left";
    ctx.save();
    ctx.translate(24, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("SEOUL MOOD", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(w - 8, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText("SEOUL MOOD", 0, 0);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(70, h - 150);
    ctx.lineTo(w - 70, h - 150);
    ctx.stroke();

    return;
  }

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#f1f1f4");
  bg.addColorStop(0.5, "#d7d9e2");
  bg.addColorStop(1, "#f5f6fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < w; i += 32) {
    ctx.fillStyle = i % 64 === 0 ? "rgba(255,255,255,0.35)" : "rgba(120,130,150,0.08)";
    ctx.fillRect(i, 0, 16, h);
  }

  drawBolt(40, 40);
  drawBolt(w - 40, 40);
  drawBolt(40, h - 40);
  drawBolt(w - 40, h - 40);

  for (let i = 0; i < 6; i++) {
    drawMiniTopIcon(330 + i * 55, 50);
  }

  ctx.fillStyle = "#0e2955";
  roundRect(ctx, w / 2 - 150, h - 110, 300, 70, 12, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.fillText("META FRAME", w / 2, h - 66);
}

function drawPinkStripPhoto(photo, box, index) {
  resultCtx.fillStyle = "#ffffff";
  resultCtx.fillRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);

  drawImageCover(resultCtx, photo, box.x, box.y, box.w, box.h);

  resultCtx.strokeStyle = "#fff";
  resultCtx.lineWidth = 4;
  resultCtx.strokeRect(box.x, box.y, box.w, box.h);

  resultCtx.fillStyle = "rgba(255,255,255,0.92)";
  resultCtx.fillRect(box.x + 10, box.y + 10, 70, 28);

  resultCtx.fillStyle = "#ff4d8f";
  resultCtx.font = "bold 18px Arial";
  resultCtx.textAlign = "left";
  resultCtx.fillText(`No.${index + 1}`, box.x + 18, box.y + 30);
}

function drawSilverPhotoPanel(photo, box) {
  const ctx = resultCtx;

  const pad = 30;
  const panelX = box.x - pad;
  const panelY = box.y - pad;
  const panelW = box.w + pad * 2;
  const panelH = box.h + pad * 2;

  const grad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
  grad.addColorStop(0, "#edf1ff");
  grad.addColorStop(0.5, "#bcc5df");
  grad.addColorStop(1, "#f6f8ff");
  ctx.fillStyle = grad;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18, true, false);

  ctx.strokeStyle = "rgba(116,126,170,0.5)";
  ctx.lineWidth = 5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 18, false, true);

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = box.w / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  drawImageCover(ctx, photo, box.x, box.y, box.w, box.h);
  ctx.restore();

  const ringGrad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r + 24);
  ringGrad.addColorStop(0, "rgba(255,255,255,0)");
  ringGrad.addColorStop(0.7, "#ecf0ff");
  ringGrad.addColorStop(1, "#7f86ad");

  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFrameTitle(layout) {
  const ctx = resultCtx;
  const w = layout.canvasW;
  const h = layout.canvasH;

  ctx.textAlign = "center";

  if (selectedFrame === "pinkStrip") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.fillText("Pink Seoul Photo", w / 2, 72);

    ctx.fillStyle = "#ff4d8f";
    ctx.font = "bold 32px Arial";
    ctx.fillText("mood cut", w / 2, h - 90);
    return;
  }

  ctx.fillStyle = "#23335f";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Silver Studio", w / 2, 95);
}

function drawStickers() {
  stickers.forEach((sticker) => {
    drawSticker(sticker);
  });
}

function drawSticker(sticker) {
  const ctx = resultCtx;
  const x = sticker.x * resultCanvas.width;
  const y = sticker.y * resultCanvas.height;
  const s = sticker.size * Math.min(resultCanvas.width, resultCanvas.height);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sticker.rotation);

  switch (sticker.type) {
    case "sparkle":
      drawSparkleSticker(ctx, s);
      break;
    case "heartGlow":
      drawHeartGlowSticker(ctx, s);
      break;
    case "swirl":
      drawSwirlSticker(ctx, s);
      break;
    case "wing":
      drawWingSticker(ctx, s);
      break;
    case "pixelStar":
      drawPixelStarSticker(ctx, s);
      break;
    case "glow":
      drawGlowSticker(ctx, s);
      break;
    case "butterfly":
      drawButterflySticker(ctx, s);
      break;
    case "ribbon":
      drawRibbonSticker(ctx, s);
      break;
  }

  ctx.restore();
}

function drawSparkleSticker(ctx, s) {
  ctx.shadowColor = "rgba(255,255,255,0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(0, s * 0.55);
  ctx.moveTo(-s * 0.55, 0);
  ctx.lineTo(s * 0.55, 0);
  ctx.moveTo(-s * 0.35, -s * 0.35);
  ctx.lineTo(s * 0.35, s * 0.35);
  ctx.moveTo(s * 0.35, -s * 0.35);
  ctx.lineTo(-s * 0.35, s * 0.35);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawHeartGlowSticker(ctx, s) {
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate((i - 1) * s * 0.45, i === 1 ? -s * 0.15 : s * 0.08);
    ctx.scale(0.9 - i * 0.12, 0.9 - i * 0.12);
    ctx.shadowColor = "rgba(255,160,220,0.95)";
    ctx.shadowBlur = 18;
    drawHeartPath(ctx, s * 0.45);
    ctx.fillStyle = "rgba(255,220,245,0.96)";
    ctx.fill();
    ctx.restore();
  }
}

function drawSwirlSticker(ctx, s) {
  ctx.strokeStyle = "#ffb7dc";
  ctx.lineWidth = Math.max(3, s * 0.08);
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s * 0.1);
  ctx.bezierCurveTo(-s * 0.2, -s * 0.4, s * 0.2, -s * 0.35, s * 0.1, -s * 0.02);
  ctx.bezierCurveTo(0, s * 0.18, -s * 0.18, s * 0.18, -s * 0.12, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.05, s * 0.28);
  ctx.bezierCurveTo(s * 0.35, s * 0.48, s * 0.56, s * 0.12, s * 0.34, -s * 0.04);
  ctx.stroke();
}

function drawWingSticker(ctx, s) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "rgba(210,210,210,0.9)";
  ctx.lineWidth = 1.8;

  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-s * (0.3 + i * 0.06), -s * (0.15 + i * 0.05), -s * (0.65 + i * 0.06), -s * (0.05 - i * 0.04));
    ctx.quadraticCurveTo(-s * (0.44 + i * 0.05), s * (0.02 + i * 0.02), -s * (0.08 + i * 0.02), s * (0.08 + i * 0.03));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawPixelStarSticker(ctx, s) {
  const color1 = "#d7f0ff";
  const color2 = "#ffffff";

  const pixels = [
    [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
    [0, -2], [0, -1], [0, 1], [0, 2],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];

  const size = s * 0.12;

  pixels.forEach(([px, py], idx) => {
    ctx.fillStyle = idx % 2 === 0 ? color1 : color2;
    ctx.fillRect(px * size, py * size, size, size);
  });

  ctx.fillStyle = "#eaf7ff";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect((2.8 + i * 1.1) * size, (-2 + i * 0.2) * size, size * 0.8, size * 0.8);
  }
}

function drawGlowSticker(ctx, s) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.6);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,235,255,0.75)");
  g.addColorStop(0.65, "rgba(190,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(-s * 0.35, s * 0.2, s * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(s * 0.3, -s * 0.28, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function drawButterflySticker(ctx, s) {
  ctx.fillStyle = "rgba(255,220,245,0.96)";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(-s * 0.24, -s * 0.1, s * 0.26, s * 0.18, -0.6, 0, Math.PI * 2);
  ctx.ellipse(-s * 0.22, s * 0.15, s * 0.22, s * 0.16, 0.5, 0, Math.PI * 2);
  ctx.ellipse(s * 0.24, -s * 0.1, s * 0.26, s * 0.18, 0.6, 0, Math.PI * 2);
  ctx.ellipse(s * 0.22, s * 0.15, s * 0.22, s * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#f4a8d0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.28);
  ctx.lineTo(0, s * 0.28);
  ctx.stroke();
}

function drawRibbonSticker(ctx, s) {
  ctx.fillStyle = "#ffc7e5";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.3;

  ctx.beginPath();
  ctx.ellipse(-s * 0.22, 0, s * 0.22, s * 0.16, -0.45, 0, Math.PI * 2);
  ctx.ellipse(s * 0.22, 0, s * 0.22, s * 0.16, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-s * 0.06, s * 0.05);
  ctx.lineTo(-s * 0.22, s * 0.34);
  ctx.lineTo(0, s * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.06, s * 0.05);
  ctx.lineTo(s * 0.22, s * 0.34);
  ctx.lineTo(0, s * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffe6f3";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(r * 1.4, 0, r * 1.1, -r * 1.1, 0, -r * 0.45);
  ctx.bezierCurveTo(-r * 1.1, -r * 1.1, -r * 1.4, 0, 0, r * 0.9);
}

function drawBolt(x, y) {
  const ctx = resultCtx;
  ctx.fillStyle = "#bfc7dc";
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8e96b3";
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawMiniTopIcon(x, y) {
  const ctx = resultCtx;
  ctx.strokeStyle = "#7882a4";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, y - 10, 20, 20);
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 10);
  ctx.lineTo(x + 10, y + 10);
  ctx.moveTo(x + 10, y - 10);
  ctx.lineTo(x - 10, y + 10);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;

  let sx;
  let sy;
  let sw;
  let sh;

  if (imgRatio > boxRatio) {
    sh = img.height;
    sw = sh * boxRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / boxRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function renderControls() {
  renderButtonGroup(filterControls, filterOptions, selectedFilter, (key) => {
    selectedFilter = key;
    drawFinalPhoto();
  });

  renderButtonGroup(effectControls, effectOptions, selectedEffect, (key) => {
    selectedEffect = key;
    drawFinalPhoto();
  });

  renderButtonGroup(frameControls, frameOptions, selectedFrame, (key) => {
    selectedFrame = key;
    drawFinalPhoto();
  });

  stickerControls.innerHTML = "";

  stickerOptions.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = item.label;

    btn.addEventListener("click", () => {
      stickers.push({
        type: item.key,
        x: 0.18 + Math.random() * 0.64,
        y: 0.14 + Math.random() * 0.72,
        size: 0.06 + Math.random() * 0.035,
        rotation: (Math.random() - 0.5) * 0.6
      });

      drawFinalPhoto();
    });

    stickerControls.appendChild(btn);
  });
}

function renderButtonGroup(container, options, selectedKey, onClick) {
  container.innerHTML = "";

  Object.entries(options).forEach(([key, value]) => {
    const btn = document.createElement("button");
    btn.textContent = typeof value === "string" ? value : value.label;

    if (key === selectedKey) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => {
      onClick(key);
      renderControls();
    });

    container.appendChild(btn);
  });
}

function clearResultCanvas() {
  resultCanvas.width = 900;
  resultCanvas.height = 1250;

  resultCtx.fillStyle = "#ffffff";
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

  resultCtx.fillStyle = "#999";
  resultCtx.font = "28px Arial";
  resultCtx.textAlign = "center";
  resultCtx.fillText(
    "四格照片會顯示在這裡",
    resultCanvas.width / 2,
    resultCanvas.height / 2
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

renderControls();
clearResultCanvas();
