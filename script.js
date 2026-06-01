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

let handLandmarker = null;
let isCameraOn = false;
let isDetecting = false;
let isCapturing = false;

let currentSlot = 1;
let photos = [];

let lastDetectTime = 0;
let lastFingerCount = 0;
let gestureStableStart = 0;

const detectInterval = 140;
const stableTime = 350;

let flashEnabled = true;

let selectedFilter = "original";
let selectedEffect = "none";
let selectedFrame = "flashNight";

const frameImageCache = {};

const filterOptions = {
  original: {
    label: "原圖",
    value: "none"
  },
  japanese: {
    label: "日系清透",
    value: "brightness(120%) contrast(84%) saturate(78%)"
  },
  creamy: {
    label: "韓系奶油",
    value: "brightness(118%) contrast(94%) saturate(104%)"
  },
  vintage: {
    label: "復古底片",
    value: "sepia(72%) brightness(108%) contrast(112%) saturate(84%)"
  },
  vivid: {
    label: "高對比鮮豔",
    value: "contrast(150%) saturate(165%) brightness(104%)"
  },
  blackwhite: {
    label: "黑白拍貼",
    value: "grayscale(100%) contrast(150%) brightness(106%)"
  }
};

const effectOptions = {
  none: "無特效",
  blur: "模糊",
  mosaic: "馬賽克",
  convex: "凸透鏡"
};

const frameOptions = {
  pinkMusic: {
    label: "粉紅 Music",
    src: "/frames/pink-music.png",
    boxes: [
      { x: 0.145, y: 0.060, w: 0.710, h: 0.165 },
      { x: 0.145, y: 0.280, w: 0.710, h: 0.165 },
      { x: 0.145, y: 0.500, w: 0.710, h: 0.165 },
      { x: 0.145, y: 0.720, w: 0.710, h: 0.165 }
    ]
  },

  whiteSeoul: {
    label: "白色 Seoul",
    src: "/frames/white-seoul.png",
    boxes: [
      { x: 0.170, y: 0.058, w: 0.660, h: 0.165 },
      { x: 0.170, y: 0.282, w: 0.660, h: 0.165 },
      { x: 0.170, y: 0.506, w: 0.660, h: 0.165 },
      { x: 0.170, y: 0.730, w: 0.660, h: 0.165 }
    ]
  },

  angelWing: {
    label: "天使羽翼",
    src: "/frames/angel-wing.png",
    boxes: [
      { x: 0.180, y: 0.052, w: 0.640, h: 0.165 },
      { x: 0.180, y: 0.277, w: 0.640, h: 0.165 },
      { x: 0.180, y: 0.502, w: 0.640, h: 0.165 },
      { x: 0.180, y: 0.727, w: 0.640, h: 0.165 }
    ]
  },

  pinkHeart: {
    label: "粉光愛心",
    src: "/frames/pink-heart.png",
    boxes: [
      { x: 0.180, y: 0.060, w: 0.640, h: 0.160 },
      { x: 0.180, y: 0.285, w: 0.640, h: 0.160 },
      { x: 0.180, y: 0.510, w: 0.640, h: 0.160 },
      { x: 0.180, y: 0.735, w: 0.640, h: 0.160 }
    ]
  },

  fullBlack: {
    label: "全黑 Y2K",
    src: "/frames/full-black.png",
    boxes: [
      { x: 0.190, y: 0.075, w: 0.620, h: 0.155 },
      { x: 0.190, y: 0.300, w: 0.620, h: 0.155 },
      { x: 0.190, y: 0.525, w: 0.620, h: 0.155 },
      { x: 0.190, y: 0.750, w: 0.620, h: 0.155 }
    ]
  },

  blackDigital: {
    label: "黑灰 Y2K",
    src: "/frames/black-digital.png",
    boxes: [
      { x: 0.135, y: 0.135, w: 0.350, h: 0.270 },
      { x: 0.515, y: 0.135, w: 0.350, h: 0.270 },
      { x: 0.135, y: 0.455, w: 0.350, h: 0.270 },
      { x: 0.515, y: 0.455, w: 0.350, h: 0.270 }
    ]
  },

  flashNight: {
    label: "Flash Night",
    src: "/frames/flash-night.png",
    boxes: [
      { x: 0.105, y: 0.155, w: 0.365, h: 0.315 },
      { x: 0.525, y: 0.155, w: 0.365, h: 0.315 },
      { x: 0.105, y: 0.515, w: 0.365, h: 0.315 },
      { x: 0.525, y: 0.515, w: 0.365, h: 0.315 }
    ]
  },

  pixelStar: {
    label: "Pixel Star",
    src: "/frames/pixel-star.png",
    boxes: [
      { x: 0.130, y: 0.115, w: 0.350, h: 0.300 },
      { x: 0.520, y: 0.115, w: 0.350, h: 0.300 },
      { x: 0.130, y: 0.465, w: 0.350, h: 0.300 },
      { x: 0.520, y: 0.465, w: 0.350, h: 0.300 }
    ]
  },

  silverMeta: {
    label: "銀色金屬",
    src: "/frames/silver-meta.png",
    boxes: [
      { x: 0.100, y: 0.125, w: 0.350, h: 0.240 },
      { x: 0.550, y: 0.125, w: 0.350, h: 0.240 },
      { x: 0.100, y: 0.435, w: 0.350, h: 0.240 },
      { x: 0.550, y: 0.435, w: 0.350, h: 0.240 }
    ]
  }
};

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

resetBtn.addEventListener("click", async () => {
  currentSlot = 1;
  photos = [];
  isCapturing = false;
  lastFingerCount = 0;
  gestureStableStart = 0;

  statusText.textContent = "已重新開始，請比 1 拍第 1 格";
  gestureText.textContent = "目前手勢：尚未偵測";

  await drawFinalPhoto();
});

flashBtn.addEventListener("click", () => {
  flashEnabled = !flashEnabled;
  flashBtn.textContent = flashEnabled ? "閃光燈：開" : "閃光燈：關";
});

downloadBtn.addEventListener("click", async () => {
  const photoCount = photos.filter(Boolean).length;

  if (photoCount < 4) {
    alert(`目前只拍了 ${photoCount} 張，請先完成四格拍照！`);
    return;
  }

  try {
    await drawFinalPhoto();

    const link = document.createElement("a");
    link.download = "photobooth.png";
    link.href = resultCanvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error("下載失敗：", error);
    alert("下載失敗，請檢查相框圖片是否成功載入。");
  }
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

  try {
    for (let i = 3; i > 0; i--) {
      countdownText.textContent = i;
      await wait(700);
    }

    countdownText.textContent = "拍！";
    await flashScreen();

    const photo = capturePhoto();

    photos[slot - 1] = photo;

    countdownText.textContent = "";

    try {
      await drawFinalPhoto();
    } catch (error) {
      console.error("成品預覽繪製失敗：", error);
      statusText.textContent = "照片已拍下，但相框載入失敗，請檢查 frames 檔名";
    }

    if (currentSlot < 4) {
      currentSlot++;
      statusText.textContent = `第 ${slot} 格完成，請比 ${currentSlot} 拍第 ${currentSlot} 格`;
    } else {
      statusText.textContent = "四格拍照完成，可以開始編輯與下載！";
    }
  } catch (error) {
    console.error("拍照流程錯誤：", error);
    statusText.textContent = "拍照流程發生錯誤，請看 Console";
  }

  await wait(900);
  isCapturing = false;
}

async function flashScreen() {
  if (!flashEnabled) {
    await wait(200);
    return;
  }

  flash.classList.add("active");
  await wait(120);
  flash.classList.remove("active");
  await wait(150);
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

async function loadImage(src) {
  if (frameImageCache[src]) return frameImageCache[src];

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      frameImageCache[src] = img;
      resolve(img);
    };

    img.onerror = () => {
      reject(new Error(`圖片載入失敗：${src}`));
    };

    img.src = src;
  });
}

async function drawFinalPhoto() {
  const frame = frameOptions[selectedFrame];

  let frameImg;

  try {
    frameImg = await loadImage(frame.src);
  } catch (error) {
    console.error(error);

    resultCanvas.width = 1080;
    resultCanvas.height = 1920;

    resultCtx.fillStyle = "#ffffff";
    resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

    resultCtx.fillStyle = "#111";
    resultCtx.font = "42px Arial";
    resultCtx.textAlign = "center";
    resultCtx.fillText(
      "相框載入失敗",
      resultCanvas.width / 2,
      resultCanvas.height / 2 - 30
    );

    resultCtx.font = "28px Arial";
    resultCtx.fillText(
      frame.src,
      resultCanvas.width / 2,
      resultCanvas.height / 2 + 30
    );

    throw error;
  }

  const canvasW = frameImg.naturalWidth || frameImg.width || 1080;
  const canvasH = frameImg.naturalHeight || frameImg.height || 1920;

  resultCanvas.width = canvasW;
  resultCanvas.height = canvasH;

  resultCtx.clearRect(0, 0, canvasW, canvasH);

  // 先畫相框，避免相框透明區有殘留白底時蓋住照片
  resultCtx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // 再把照片畫進每個洞裡
  frame.boxes.forEach((box, index) => {
    const x = box.x * canvasW;
    const y = box.y * canvasH;
    const w = box.w * canvasW;
    const h = box.h * canvasH;

    if (photos[index]) {
      const processed = createProcessedPhoto(photos[index]);

      resultCtx.save();

      const radius = Math.min(w, h) * 0.035;
      roundRectPath(resultCtx, x, y, w, h, radius);
      resultCtx.clip();

      drawImageCover(resultCtx, processed, x, y, w, h);

      resultCtx.restore();
    }
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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
  renderButtonGroup(filterControls, filterOptions, selectedFilter, async (key) => {
    selectedFilter = key;

    if (photos.filter(Boolean).length > 0) {
      await drawFinalPhoto();
    }
  });

  renderButtonGroup(effectControls, effectOptions, selectedEffect, async (key) => {
    selectedEffect = key;

    if (photos.filter(Boolean).length > 0) {
      await drawFinalPhoto();
    }
  });

  renderButtonGroup(frameControls, frameOptions, selectedFrame, async (key) => {
    selectedFrame = key;

    try {
      await drawFinalPhoto();
    } catch (error) {
      console.error("切換相框失敗：", error);
      statusText.textContent = "切換相框失敗，請檢查 frames 檔案";
    }
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

    btn.addEventListener("click", async () => {
      await onClick(key);
      renderControls();
    });

    container.appendChild(btn);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

renderControls();

drawFinalPhoto().catch((error) => {
  console.error("初始相框載入失敗：", error);
  statusText.textContent = "初始相框載入失敗，請檢查 frames 檔案";
});
