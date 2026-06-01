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
const layoutControls = document.getElementById("layoutControls");
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
let selectedLayout = "square";
let selectedFrame = "redRetro";

let stickers = [];

const filterOptions = {
  original: {
    label: "原圖",
    value: "none"
  },
  japanese: {
    label: "日系清透",
    value: "brightness(120%) contrast(82%) saturate(75%)"
  },
  korean: {
    label: "韓系奶油",
    value: "brightness(118%) contrast(92%) saturate(105%)"
  },
  vintage: {
    label: "復古底片",
    value: "sepia(75%) brightness(108%) contrast(115%) saturate(85%)"
  },
  vivid: {
    label: "高對比鮮豔",
    value: "contrast(155%) saturate(170%) brightness(105%)"
  },
  blackWhite: {
    label: "黑白拍貼",
    value: "grayscale(100%) contrast(150%) brightness(105%)"
  }
};

const effectOptions = {
  none: "無特效",
  blur: "影像模糊",
  mosaic: "馬賽克",
  convex: "凸透鏡"
};

const layoutOptions = {
  square: "2×2 四格",
  strip: "直式四連拍",
  card: "橫式拍貼卡"
};

const frameOptions = {
  redRetro: "紅色復古",
  whiteKorean: "白色韓式",
  creamCute: "奶油可愛",
  blackFilm: "黑色底片",
  silverY2K: "Y2K 銀色",
  pinkHeart: "粉色愛心",
  blueStar: "藍色星星",
  doodle: "塗鴉貼紙"
};

const stickerOptions = [
  "⭐",
  "💖",
  "⚡",
  "🦋",
  "💿",
  "✨",
  "🕶️",
  "🎧"
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
      width: { ideal: 640 },
      height: { ideal: 480 }
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

  console.log("HandLandmarker 已載入");
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
    statusText.textContent = "四格拍照完成，可以選濾鏡、特效、相框與貼紙！";
  }

  await wait(1000);
  isCapturing = false;
}

async function flashScreen() {
  if (!flashEnabled) {
    await wait(300);
    return;
  }

  flash.classList.add("active");
  await wait(120);
  flash.classList.remove("active");
  await wait(180);
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
  const r = Math.min(width, height) / 2.2;

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

  drawFrameBackground(layout.canvasW, layout.canvasH);

  photos.forEach((photo, index) => {
    const box = layout.photoBoxes[index];
    if (!box) return;

    const processed = createProcessedPhoto(photo);

    drawImageCover(
      resultCtx,
      processed,
      box.x,
      box.y,
      box.w,
      box.h
    );

    drawPhotoBorder(box.x, box.y, box.w, box.h, index);
  });

  drawFrameText(layout.canvasW, layout.canvasH);
  drawStickers();
}

function getLayoutSettings() {
  if (selectedLayout === "strip") {
    const canvasW = 650;
    const canvasH = 1900;
    const photoW = 520;
    const photoH = 330;
    const gap = 30;
    const startX = 65;
    const startY = 120;

    return {
      canvasW,
      canvasH,
      photoBoxes: [0, 1, 2, 3].map((i) => ({
        x: startX,
        y: startY + i * (photoH + gap),
        w: photoW,
        h: photoH
      }))
    };
  }

  if (selectedLayout === "card") {
    const canvasW = 1200;
    const canvasH = 800;
    const photoW = 430;
    const photoH = 260;
    const gap = 26;
    const startX = 170;
    const startY = 110;

    return {
      canvasW,
      canvasH,
      photoBoxes: [
        { x: startX, y: startY, w: photoW, h: photoH },
        { x: startX + photoW + gap, y: startY, w: photoW, h: photoH },
        { x: startX, y: startY + photoH + gap, w: photoW, h: photoH },
        { x: startX + photoW + gap, y: startY + photoH + gap, w: photoW, h: photoH }
      ]
    };
  }

  const canvasW = 900;
  const canvasH = 1250;
  const photoW = 390;
  const photoH = 460;
  const gap = 25;
  const startX = 42;
  const startY = 150;

  return {
    canvasW,
    canvasH,
    photoBoxes: [
      { x: startX, y: startY, w: photoW, h: photoH },
      { x: startX + photoW + gap, y: startY, w: photoW, h: photoH },
      { x: startX, y: startY + photoH + gap, w: photoW, h: photoH },
      { x: startX + photoW + gap, y: startY + photoH + gap, w: photoW, h: photoH }
    ]
  };
}

function drawFrameBackground(w, h) {
  const ctx = resultCtx;

  const colors = {
    redRetro: "#a93824",
    whiteKorean: "#ffffff",
    creamCute: "#f2dfbd",
    blackFilm: "#111111",
    silverY2K: "#d9d9e3",
    pinkHeart: "#f7b6c8",
    blueStar: "#bcd7ff",
    doodle: "#fff3d8"
  };

  ctx.fillStyle = colors[selectedFrame] || "#ffffff";
  ctx.fillRect(0, 0, w, h);

  if (selectedFrame === "redRetro") {
    drawWaveLine(70, 70, 260, "#fff");
    drawWaveLine(w - 310, 70, 260, "#fff");
    drawWaveLine(70, h - 80, 260, "#fff");
  }

  if (selectedFrame === "whiteKorean") {
    ctx.fillStyle = "#111";
    ctx.font = "bold 52px serif";
    ctx.textAlign = "center";
    ctx.fillText("OH! PHOTO", w / 2, h - 65);
  }

  if (selectedFrame === "creamCute") {
    drawSidePattern(w, h, ["🐼", "🐰", "🧸"]);
  }

  if (selectedFrame === "blackFilm") {
    ctx.fillStyle = "#fff";
    for (let y = 40; y < h; y += 70) {
      ctx.fillRect(20, y, 35, 28);
      ctx.fillRect(w - 55, y, 35, 28);
    }
  }

  if (selectedFrame === "silverY2K") {
    drawRandomStars(w, h, "#ffffff", "#7b61ff");
  }

  if (selectedFrame === "pinkHeart") {
    drawRepeatingEmoji(w, h, "💖", 60);
  }

  if (selectedFrame === "blueStar") {
    drawRepeatingEmoji(w, h, "⭐", 70);
  }

  if (selectedFrame === "doodle") {
    drawRepeatingEmoji(w, h, "✨", 65);
    drawRepeatingEmoji(w, h, "⚡", 100);
  }
}

function drawPhotoBorder(x, y, w, h, index) {
  resultCtx.strokeStyle =
    selectedFrame === "blackFilm" ? "#ffffff" : "rgba(255,255,255,0.9)";
  resultCtx.lineWidth = 8;
  resultCtx.strokeRect(x, y, w, h);

  resultCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
  resultCtx.fillRect(x + 12, y + 12, 78, 34);

  resultCtx.fillStyle = "#111";
  resultCtx.font = "bold 20px Arial";
  resultCtx.textAlign = "left";
  resultCtx.fillText(`No.${index + 1}`, x + 24, y + 36);
}

function drawFrameText(w, h) {
  resultCtx.textAlign = "center";

  if (selectedFrame === "redRetro") {
    resultCtx.fillStyle = "#fff";
    resultCtx.font = "bold 54px Arial";
    resultCtx.fillText("SMILE", w / 2, 95);

    resultCtx.font = "bold 28px Arial";
    resultCtx.strokeStyle = "#fff";
    resultCtx.lineWidth = 5;
    resultCtx.strokeText("SNAPPP", w / 2, h - 50);
    resultCtx.fillText("SNAPPP", w / 2, h - 50);
    return;
  }

  if (selectedFrame === "blackFilm") {
    resultCtx.fillStyle = "#fff";
  } else {
    resultCtx.fillStyle = "#111";
  }

  resultCtx.font = "bold 32px Arial";
  resultCtx.fillText("AI Gesture Booth", w / 2, h - 35);
}

function drawStickers() {
  const ctx = resultCtx;

  stickers.forEach((sticker) => {
    const x = sticker.x * resultCanvas.width;
    const y = sticker.y * resultCanvas.height;
    const size = sticker.size * Math.min(resultCanvas.width, resultCanvas.height);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sticker.rotation);
    ctx.font = `${size}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sticker.text, 0, 0);
    ctx.restore();
  });
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

function drawWaveLine(x, y, length, color) {
  const ctx = resultCtx;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();

  for (let i = 0; i <= length; i += 12) {
    const yy = y + Math.sin(i / 12) * 6;
    if (i === 0) ctx.moveTo(x + i, yy);
    else ctx.lineTo(x + i, yy);
  }

  ctx.stroke();
}

function drawSidePattern(w, h, emojis) {
  const ctx = resultCtx;
  ctx.font = "42px Arial";
  ctx.textAlign = "center";

  for (let y = 120; y < h - 120; y += 120) {
    ctx.fillText(emojis[(y / 120) % emojis.length], 55, y);
    ctx.fillText(emojis[(y / 120 + 1) % emojis.length], w - 55, y + 40);
  }
}

function drawRepeatingEmoji(w, h, emoji, gap) {
  const ctx = resultCtx;
  ctx.font = "34px Arial";
  ctx.textAlign = "center";

  for (let y = 60; y < h; y += gap) {
    for (let x = 45; x < w; x += gap * 1.4) {
      if (Math.random() > 0.72) {
        ctx.fillText(emoji, x, y);
      }
    }
  }
}

function drawRandomStars(w, h, color1, color2) {
  const ctx = resultCtx;

  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 8 + 3;

    ctx.fillStyle = i % 2 === 0 ? color1 : color2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
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

  renderButtonGroup(layoutControls, layoutOptions, selectedLayout, (key) => {
    selectedLayout = key;
    drawFinalPhoto();
  });

  renderButtonGroup(frameControls, frameOptions, selectedFrame, (key) => {
    selectedFrame = key;
    drawFinalPhoto();
  });

  stickerControls.innerHTML = "";

  stickerOptions.forEach((sticker) => {
    const btn = document.createElement("button");
    btn.textContent = sticker;

    btn.addEventListener("click", () => {
      stickers.push({
        text: sticker,
        x: 0.2 + Math.random() * 0.6,
        y: 0.2 + Math.random() * 0.6,
        size: 0.07 + Math.random() * 0.04,
        rotation: (Math.random() - 0.5) * 0.7
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
