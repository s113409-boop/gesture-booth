import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const flashBtn = document.getElementById("flashBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearStickerBtn = document.getElementById("clearStickerBtn");
const randomStickerBtn = document.getElementById("randomStickerBtn");

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

let handLandmarker = null;
let isCameraOn = false;
let isDetecting = false;
let isCapturing = false;

let currentSlot = 1;
let photos = [];
let stickers = [];

let lastDetectTime = 0;
let lastFingerCount = 0;
let gestureStableStart = 0;

const detectInterval = 150;
const stableTime = 300;

let flashEnabled = true;
let selectedFilter = "original";
let selectedEffect = "none";
let selectedFrame = "pinkMusic";

let draggingStickerIndex = -1;
let dragOffset = { x: 0, y: 0 };

const filterOptions = {
  original: { label: "原圖", value: "none" },
  japanese: { label: "日系清透", value: "brightness(122%) contrast(84%) saturate(76%)" },
  creamy: { label: "韓系奶油", value: "brightness(118%) contrast(93%) saturate(105%)" },
  vintage: { label: "復古底片", value: "sepia(72%) brightness(108%) contrast(112%) saturate(86%)" },
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
  pinkMusic: "1 粉紅 Music",
  silverMeta: "2 銀色 Meta",
  seoulWhite: "3 白色 Seoul",
  blackDigital: "4 黑灰 Digital",
  angelSoft: "5 Angel Wing",
  pixelStar: "6 Pixel Star",
  pinkGlow: "7 Pink Glow",
  ribbonIdol: "8 Ribbon Idol",
  flashNight: "9 Flash Night",
  candyChrome: "10 Candy Chrome",
  fullBlack: "11 全黑 Y2K"
};

const stickerOptions = [
  { key: "sparkle", label: "白閃星" },
  { key: "heartGlow", label: "粉光愛心" },
  { key: "softHeart", label: "霧面愛心" },
  { key: "swirl", label: "粉旋渦" },
  { key: "wing", label: "天使翅膀" },
  { key: "pixelStar", label: "像素星鏈" },
  { key: "glow", label: "泡泡光" },
  { key: "butterfly", label: "透明蝴蝶" },
  { key: "ribbon", label: "粉緞帶" },
  { key: "chrome", label: "銀色星光" }
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

randomStickerBtn.addEventListener("click", () => {
  for (let i = 0; i < 8; i++) addSticker(randomChoice(stickerOptions).key, false);
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
  if (!isCameraOn || !handLandmarker) return;
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    gestureText.textContent = "相機畫面載入中...";
    return;
  }

  const now = performance.now();
  if (now - lastDetectTime < detectInterval) return;
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
    gestureText.textContent = `偵測到手：${fingerCount} 根手指，目前要拍第 ${currentSlot} 格`;
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
  if (fingerCount === currentSlot && isStable && !isCapturing && currentSlot <= 4) {
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
    const tipDistance = distance(landmarks[finger.tip], wrist);
    const pipDistance = distance(landmarks[finger.pip], wrist);
    if (tipDistance > pipDistance * 1.15) count++;
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
  photos.push(capturePhoto());
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

  if (selectedEffect === "blur") applyBlurEffect(temp);
  if (selectedEffect === "mosaic") applyMosaicEffect(temp, 14);
  if (selectedEffect === "convex") applyConvexEffect(temp);

  return temp;
}

function applyBlurEffect(canvas) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d").drawImage(canvas, 0, 0);
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
      const i = (y * width + x) * 4;
      ctx.fillStyle = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
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
      sx = clamp(sx, 0, width - 1);
      sy = clamp(sy, 0, height - 1);
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  ctx.putImageData(output, 0, 0);
}

function drawFinalPhoto() {
  if (photos.length === 0) {
    clearResultCanvas();
    return;
  }
  const layout = getLayoutSettings(selectedFrame);
  resultCanvas.width = layout.canvasW;
  resultCanvas.height = layout.canvasH;
  drawFrameBackground(layout);

  photos.forEach((photo, index) => {
    const box = layout.photoBoxes[index];
    if (!box) return;
    const processed = createProcessedPhoto(photo);
    if (["silverMeta", "candyChrome"].includes(selectedFrame)) drawChromePanel(processed, box, index);
    else if (selectedFrame === "angelSoft") drawSoftPanel(processed, box, index);
    else drawBasicPanel(processed, box, index);
  });

  drawFrameDecorations(layout);
  drawStickers();
}

function getLayoutSettings(frame) {
  if (["pinkMusic", "seoulWhite", "angelSoft", "pinkGlow"].includes(frame)) {
    return {
      canvasW: 560,
      canvasH: 1780,
      photoBoxes: [0, 1, 2, 3].map((i) => ({ x: 90, y: 120 + i * 375, w: 380, h: 315 }))
    };
  }
  return {
    canvasW: 980,
    canvasH: 1180,
    photoBoxes: [
      { x: 135, y: 170, w: 320, h: 320 },
      { x: 525, y: 170, w: 320, h: 320 },
      { x: 135, y: 555, w: 320, h: 320 },
      { x: 525, y: 555, w: 320, h: 320 }
    ]
  };
}

function drawFrameBackground(layout) {
  const { canvasW: w, canvasH: h } = layout;
  const ctx = resultCtx;
  ctx.clearRect(0, 0, w, h);

  const bg = {
    pinkMusic: ["#ff4f93", "#ff91bd", "#fff5f9"],
    silverMeta: ["#f2f2f5", "#b7bdcf", "#f9fbff"],
    seoulWhite: ["#ffffff", "#f7f7f7", "#ffffff"],
    blackDigital: ["#121212", "#2b2b2f", "#070707"],
    angelSoft: ["#fffefe", "#f6edf5", "#ffffff"],
    pixelStar: ["#bfc9ff", "#e6e5ff", "#f7f8ff"],
    pinkGlow: ["#ffb5cf", "#ffd9e8", "#fff3f8"],
    ribbonIdol: ["#111111", "#3a3438", "#121212"],
    flashNight: ["#030303", "#222222", "#050505"],
    candyChrome: ["#f8d9ff", "#cdeaff", "#fff2ff"],
    fullBlack: ["#000000", "#101010", "#000000"]
  }[selectedFrame];

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, bg[0]);
  grad.addColorStop(0.5, bg[1]);
  grad.addColorStop(1, bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (["silverMeta", "candyChrome"].includes(selectedFrame)) drawMetalStripes(w, h);
  if (["blackDigital", "flashNight", "fullBlack"].includes(selectedFrame)) drawDarkGrid(w, h);
  if (selectedFrame === "pixelStar") drawPixelGrid(w, h);

  ctx.lineWidth = 6;
  ctx.strokeStyle = darkFrame() ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)";
  ctx.strokeRect(28, 28, w - 56, h - 56);
}

function drawBasicPanel(photo, box, index) {
  const ctx = resultCtx;
  const outerPad = 12;
  ctx.fillStyle = darkFrame() ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.86)";
  roundRect(ctx, box.x - outerPad, box.y - outerPad, box.w + outerPad * 2, box.h + outerPad * 2, 10, true, false);
  drawImageCover(ctx, photo, box.x, box.y, box.w, box.h);
  ctx.strokeStyle = darkFrame() ? "rgba(255,255,255,0.85)" : "#ffffff";
  ctx.lineWidth = 5;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  drawNoLabel(box, index);
}

function drawSoftPanel(photo, box, index) {
  const ctx = resultCtx;
  ctx.shadowColor = "rgba(255,255,255,0.95)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  roundRect(ctx, box.x - 14, box.y - 14, box.w + 28, box.h + 28, 20, true, false);
  ctx.shadowBlur = 0;
  drawImageCover(ctx, photo, box.x, box.y, box.w, box.h);
  drawNoLabel(box, index);
}

function drawChromePanel(photo, box, index) {
  const ctx = resultCtx;
  const pad = 34;
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.w + pad * 2;
  const h = box.h + pad * 2;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.25, "#8992ad");
  g.addColorStop(0.5, "#eef3ff");
  g.addColorStop(0.75, "#aeb7d0");
  g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 20, true, false);
  ctx.strokeStyle = "rgba(45,52,80,0.42)";
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, 20, false, true);

  if (selectedFrame === "silverMeta") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const r = box.w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawImageCover(ctx, photo, box.x, box.y, box.w, box.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.84)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawImageCover(ctx, photo, box.x, box.y, box.w, box.h);
  }
  drawNoLabel(box, index);
}

function drawNoLabel(box, index) {
  const ctx = resultCtx;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(box.x + 10, box.y + 10, 70, 28);
  ctx.fillStyle = "#111";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`No.${index + 1}`, box.x + 18, box.y + 31);
}

function drawFrameDecorations(layout) {
  const { canvasW: w, canvasH: h } = layout;
  const ctx = resultCtx;
  ctx.textAlign = "center";

  const titles = {
    pinkMusic: "PINK MUSIC",
    silverMeta: "PLANB STUDIO META-X",
    seoulWhite: "OH!04 SEOUL PHOTO",
    blackDigital: "DIGITAL MOOD",
    angelSoft: "ANGEL SOFT",
    pixelStar: "PIXEL STAR",
    pinkGlow: "PINK GLOW",
    ribbonIdol: "RIBBON IDOL",
    flashNight: "FLASH NIGHT",
    candyChrome: "CANDY CHROME",
    fullBlack: "BLACK Y2K"
  };

  ctx.fillStyle = darkFrame() ? "#fff" : "#111";
  ctx.font = selectedFrame === "silverMeta" ? "bold 30px Arial" : "bold 34px Arial";
  ctx.fillText(titles[selectedFrame], w / 2, selectedFrame === "silverMeta" ? h - 62 : h - 74);

  if (selectedFrame === "pinkMusic") drawSideText(w, h, "MUSIC");
  if (selectedFrame === "seoulWhite") drawMinimalLabels(w, h);
  if (selectedFrame === "angelSoft") drawAngelWings(w, h);
  if (selectedFrame === "pixelStar") drawPixelStars(w, h);
  if (selectedFrame === "pinkGlow") drawFloatingHearts(w, h);
  if (selectedFrame === "ribbonIdol") drawRibbonCorners(w, h);
  if (selectedFrame === "flashNight") drawFlashStars(w, h, 18);
  if (selectedFrame === "fullBlack") drawFlashStars(w, h, 26);
  if (selectedFrame === "candyChrome") drawCandyBubbles(w, h);
  if (selectedFrame === "silverMeta") drawMetaBolts(w, h);
}

function drawSideText(w, h, text) {
  const ctx = resultCtx;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Arial";
  ctx.save();
  ctx.translate(28, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(w - 10, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawMinimalLabels(w, h) {
  const ctx = resultCtx;
  ctx.fillStyle = "#111";
  ctx.font = "12px Arial";
  ctx.save();
  ctx.translate(52, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("seoul photo studio", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(w - 52, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("gesture booth", 0, 0);
  ctx.restore();
}

function drawMetalStripes(w, h) {
  const ctx = resultCtx;
  for (let x = 0; x < w; x += 28) {
    ctx.fillStyle = x % 56 === 0 ? "rgba(255,255,255,0.34)" : "rgba(80,90,120,0.08)";
    ctx.fillRect(x, 0, 14, h);
  }
}

function drawDarkGrid(w, h) {
  const ctx = resultCtx;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let x = 40; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 40; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
}

function drawPixelGrid(w, h) {
  const ctx = resultCtx;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.setLineDash([8, 8]);
  for (let x = 70; x < w; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 45); ctx.lineTo(x, h - 45); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawMetaBolts(w, h) {
  [[45,45],[w-45,45],[45,h-45],[w-45,h-45]].forEach(([x,y]) => drawBolt(x,y));
  for (let i = 0; i < 6; i++) drawMiniTopIcon(w / 2 - 140 + i * 55, 58);
}

function drawBolt(x, y) {
  const ctx = resultCtx;
  ctx.fillStyle = "#cfd4e2";
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8f96ad";
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
}

function drawMiniTopIcon(x, y) {
  const ctx = resultCtx;
  ctx.strokeStyle = "#6f7899";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, y - 10, 20, 20);
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y + 10);
  ctx.moveTo(x + 10, y - 10); ctx.lineTo(x - 10, y + 10);
  ctx.stroke();
}

function drawAngelWings(w, h) {
  resultCtx.save();
  resultCtx.translate(70, 160); drawWingShape(resultCtx, 90, -1); resultCtx.restore();
  resultCtx.save();
  resultCtx.translate(w - 70, h - 180); drawWingShape(resultCtx, 90, 1); resultCtx.restore();
}

function drawPixelStars(w, h) {
  for (let i = 0; i < 24; i++) {
    drawPixelStar(resultCtx, Math.random() * w, Math.random() * h, 18 + Math.random() * 18, i % 2 ? "#ffffff" : "#d6eaff");
  }
}

function drawFloatingHearts(w, h) {
  for (let i = 0; i < 18; i++) {
    resultCtx.save();
    resultCtx.translate(Math.random() * w, Math.random() * h);
    resultCtx.rotate((Math.random() - 0.5) * 0.8);
    resultCtx.shadowColor = "rgba(255,170,220,0.9)";
    resultCtx.shadowBlur = 18;
    drawHeartPath(resultCtx, 20 + Math.random() * 16);
    resultCtx.fillStyle = "rgba(255,235,248,0.78)";
    resultCtx.fill();
    resultCtx.restore();
  }
}

function drawRibbonCorners(w, h) {
  [[60,60],[w-60,60],[60,h-60],[w-60,h-60]].forEach(([x,y]) => {
    resultCtx.save(); resultCtx.translate(x,y); drawRibbonSticker(resultCtx, 78); resultCtx.restore();
  });
}

function drawFlashStars(w, h, n) {
  for (let i = 0; i < n; i++) {
    resultCtx.save();
    resultCtx.translate(Math.random() * w, Math.random() * h);
    drawSparkleSticker(resultCtx, 42 + Math.random() * 52);
    resultCtx.restore();
  }
}

function drawCandyBubbles(w, h) {
  for (let i = 0; i < 18; i++) {
    resultCtx.save();
    resultCtx.translate(Math.random() * w, Math.random() * h);
    drawGlowSticker(resultCtx, 55 + Math.random() * 45);
    resultCtx.restore();
  }
}

function darkFrame() {
  return ["blackDigital", "ribbonIdol", "flashNight", "fullBlack"].includes(selectedFrame);
}

function drawStickers() {
  stickers.forEach((sticker) => drawSticker(sticker));
}

function drawSticker(sticker) {
  const ctx = resultCtx;
  const x = sticker.x * resultCanvas.width;
  const y = sticker.y * resultCanvas.height;
  const s = sticker.size * Math.min(resultCanvas.width, resultCanvas.height);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sticker.rotation);
  const map = {
    sparkle: drawSparkleSticker,
    heartGlow: drawHeartGlowSticker,
    softHeart: drawSoftHeartSticker,
    swirl: drawSwirlSticker,
    wing: (c, size) => drawWingShape(c, size, -1),
    pixelStar: drawPixelStarSticker,
    glow: drawGlowSticker,
    butterfly: drawButterflySticker,
    ribbon: drawRibbonSticker,
    chrome: drawChromeStarSticker
  };
  map[sticker.type]?.(ctx, s);
  ctx.restore();
}

function addSticker(type, redraw = true) {
  stickers.push({
    type,
    x: 0.18 + Math.random() * 0.64,
    y: 0.14 + Math.random() * 0.72,
    size: 0.055 + Math.random() * 0.04,
    rotation: (Math.random() - 0.5) * 0.7
  });
  if (redraw) drawFinalPhoto();
}

function drawSparkleSticker(ctx, s) {
  ctx.shadowColor = "rgba(255,255,255,0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(2, s * 0.055);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55); ctx.lineTo(0, s * 0.55);
  ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0);
  ctx.moveTo(-s * 0.35, -s * 0.35); ctx.lineTo(s * 0.35, s * 0.35);
  ctx.moveTo(s * 0.35, -s * 0.35); ctx.lineTo(-s * 0.35, s * 0.35);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawHeartGlowSticker(ctx, s) {
  ctx.shadowColor = "rgba(255,160,220,0.95)";
  ctx.shadowBlur = 20;
  drawHeartPath(ctx, s * 0.42);
  ctx.fillStyle = "rgba(255,230,248,0.96)";
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawSoftHeartSticker(ctx, s) {
  ctx.strokeStyle = "rgba(255,165,220,0.85)";
  ctx.lineWidth = Math.max(3, s * 0.07);
  drawHeartPath(ctx, s * 0.42);
  ctx.stroke();
}

function drawSwirlSticker(ctx, s) {
  ctx.strokeStyle = "#ffb7dc";
  ctx.lineWidth = Math.max(3, s * 0.075);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s * 0.1);
  ctx.bezierCurveTo(-s * 0.2, -s * 0.42, s * 0.28, -s * 0.35, s * 0.1, -s * 0.02);
  ctx.bezierCurveTo(0, s * 0.18, -s * 0.18, s * 0.18, -s * 0.12, 0);
  ctx.stroke();
}

function drawWingShape(ctx, s, dir = -1) {
  ctx.scale(dir, 1);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.strokeStyle = "rgba(210,210,210,0.82)";
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-s * (0.22 + i * 0.055), -s * (0.12 + i * 0.045), -s * (0.55 + i * 0.055), -s * (0.02 - i * 0.032));
    ctx.quadraticCurveTo(-s * (0.4 + i * 0.04), s * (0.02 + i * 0.018), -s * (0.08 + i * 0.02), s * (0.06 + i * 0.025));
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

function drawPixelStarSticker(ctx, s) {
  drawPixelStar(ctx, 0, 0, s * 0.7, "#eaf7ff");
  ctx.fillStyle = "#ffffff";
  const p = s * 0.055;
  for (let i = 0; i < 5; i++) ctx.fillRect((i + 2) * p, (-3 + i * 0.45) * p, p, p);
}

function drawPixelStar(ctx, x, y, s, color) {
  const p = s / 7;
  const coords = [[0,-3],[0,-2],[-1,-1],[0,-1],[1,-1],[-3,0],[-2,0],[-1,0],[0,0],[1,0],[2,0],[3,0],[-1,1],[0,1],[1,1],[0,2],[0,3]];
  resultCtx.save();
  resultCtx.translate(x, y);
  resultCtx.fillStyle = color;
  coords.forEach(([cx,cy]) => resultCtx.fillRect(cx*p, cy*p, p, p));
  resultCtx.restore();
}

function drawGlowSticker(ctx, s) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.65);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,235,255,0.7)");
  g.addColorStop(0.7, "rgba(190,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2); ctx.fill();
}

function drawButterflySticker(ctx, s) {
  ctx.fillStyle = "rgba(255,220,245,0.9)";
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.ellipse(dir * s * 0.22, -s * 0.1, s * 0.25, s * 0.18, dir * 0.55, 0, Math.PI * 2);
    ctx.ellipse(dir * s * 0.2, s * 0.16, s * 0.2, s * 0.15, -dir * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  });
  ctx.strokeStyle = "#f4a8d0";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -s*0.28); ctx.lineTo(0, s*0.28); ctx.stroke();
}

function drawRibbonSticker(ctx, s) {
  ctx.fillStyle = "#ffc7e5";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, 0, s * 0.22, s * 0.16, -0.45, 0, Math.PI * 2);
  ctx.ellipse(s * 0.22, 0, s * 0.22, s * 0.16, 0.45, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffe6f3";
  ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2); ctx.fill();
}

function drawChromeStarSticker(ctx, s) {
  const g = ctx.createLinearGradient(-s/2, -s/2, s/2, s/2);
  g.addColorStop(0, "#fff"); g.addColorStop(0.45, "#9aa3bd"); g.addColorStop(1, "#fff");
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(3, s * 0.075);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.15, -s * 0.15); ctx.lineTo(s * 0.55, 0);
  ctx.lineTo(s * 0.15, s * 0.15); ctx.lineTo(0, s * 0.55); ctx.lineTo(-s * 0.15, s * 0.15);
  ctx.lineTo(-s * 0.55, 0); ctx.lineTo(-s * 0.15, -s * 0.15); ctx.closePath();
  ctx.stroke();
}

function drawHeartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(r * 1.4, 0, r * 1.1, -r * 1.1, 0, -r * 0.45);
  ctx.bezierCurveTo(-r * 1.1, -r * 1.1, -r * 1.4, 0, 0, r * 0.9);
}

function drawImageCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx, sy, sw, sh;
  if (imgRatio > boxRatio) {
    sh = img.height; sw = sh * boxRatio; sx = (img.width - sw) / 2; sy = 0;
  } else {
    sw = img.width; sh = sw / boxRatio; sx = 0; sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
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

function renderControls() {
  renderButtonGroup(filterControls, filterOptions, selectedFilter, (key) => {
    selectedFilter = key; drawFinalPhoto();
  });
  renderButtonGroup(effectControls, effectOptions, selectedEffect, (key) => {
    selectedEffect = key; drawFinalPhoto();
  });
  renderButtonGroup(frameControls, frameOptions, selectedFrame, (key) => {
    selectedFrame = key; drawFinalPhoto();
  });

  stickerControls.innerHTML = "";
  stickerOptions.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.addEventListener("click", () => addSticker(item.key));
    stickerControls.appendChild(btn);
  });
}

function renderButtonGroup(container, options, selectedKey, onClick) {
  container.innerHTML = "";
  Object.entries(options).forEach(([key, value]) => {
    const btn = document.createElement("button");
    btn.textContent = typeof value === "string" ? value : value.label;
    if (key === selectedKey) btn.classList.add("active");
    btn.addEventListener("click", () => { onClick(key); renderControls(); });
    container.appendChild(btn);
  });
}

resultCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    const sx = s.x * resultCanvas.width;
    const sy = s.y * resultCanvas.height;
    const size = s.size * Math.min(resultCanvas.width, resultCanvas.height) * 0.9;
    if (Math.hypot(point.x - sx, point.y - sy) <= size) {
      draggingStickerIndex = i;
      dragOffset.x = point.x - sx;
      dragOffset.y = point.y - sy;
      resultCanvas.setPointerCapture(event.pointerId);
      break;
    }
  }
});

resultCanvas.addEventListener("pointermove", (event) => {
  if (draggingStickerIndex < 0) return;
  const point = canvasPoint(event);
  const s = stickers[draggingStickerIndex];
  s.x = clamp((point.x - dragOffset.x) / resultCanvas.width, 0.02, 0.98);
  s.y = clamp((point.y - dragOffset.y) / resultCanvas.height, 0.02, 0.98);
  drawFinalPhoto();
});

resultCanvas.addEventListener("pointerup", () => { draggingStickerIndex = -1; });
resultCanvas.addEventListener("pointercancel", () => { draggingStickerIndex = -1; });

function canvasPoint(event) {
  const rect = resultCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (resultCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (resultCanvas.height / rect.height)
  };
}

function clearResultCanvas() {
  resultCanvas.width = 900;
  resultCanvas.height = 1250;
  resultCtx.fillStyle = "#ffffff";
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
  resultCtx.fillStyle = "#999";
  resultCtx.font = "28px Arial";
  resultCtx.textAlign = "center";
  resultCtx.fillText("四格照片會顯示在這裡", resultCanvas.width / 2, resultCanvas.height / 2);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

renderControls();
clearResultCanvas();
