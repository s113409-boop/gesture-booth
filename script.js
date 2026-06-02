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
const punchedFrameCache = {};

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
      { x: 0.273, y: 0.054, w: 0.452, h: 0.196 },
      { x: 0.273, y: 0.276, w: 0.452, h: 0.197 },
      { x: 0.274, y: 0.499, w: 0.451, h: 0.196 },
      { x: 0.274, y: 0.721, w: 0.452, h: 0.195 }
    ]
  },

  whiteSeoul: {
    label: "白色 Seoul",
    src: "/frames/white-seoul.png",
    boxes: [
      { x: 0.247, y: 0.060, w: 0.570, h: 0.182 },
      { x: 0.198, y: 0.264, w: 0.618, h: 0.185 },
      { x: 0.200, y: 0.471, w: 0.616, h: 0.185 },
      { x: 0.247, y: 0.678, w: 0.570, h: 0.185 }
    ]
  },

  angelWing: {
    label: "天使羽翼",
    src: "/frames/angel-wing.png",
    boxes: [
      { x: 0.183, y: 0.076, w: 0.633, h: 0.189 },
      { x: 0.183, y: 0.271, w: 0.632, h: 0.190 },
      { x: 0.184, y: 0.467, w: 0.631, h: 0.176 },
      { x: 0.183, y: 0.661, w: 0.632, h: 0.227 }
    ]
  },

  pinkHeart: {
    label: "粉光愛心",
    src: "/frames/pink-heart.png",
    boxes: [
      { x: 0.303, y: 0.059, w: 0.396, h: 0.172 },
      { x: 0.299, y: 0.261, w: 0.405, h: 0.178 },
      { x: 0.299, y: 0.468, w: 0.405, h: 0.175 },
      { x: 0.301, y: 0.676, w: 0.399, h: 0.204 }
    ]
  },

  fullBlack: {
    label: "全黑 Y2K",
    src: "/frames/full-black.png",
    boxes: [
      { x: 0.240, y: 0.106, w: 0.525, h: 0.178 },
      { x: 0.239, y: 0.306, w: 0.518, h: 0.175 },
      { x: 0.239, y: 0.503, w: 0.519, h: 0.175 },
      { x: 0.240, y: 0.700, w: 0.516, h: 0.173 }
    ]
  },

  blackDigital: {
    label: "黑灰 Y2K",
    src: "/frames/black-digital.png",
    boxes: [
      { x: 0.138, y: 0.154, w: 0.345, h: 0.330 },
      { x: 0.515, y: 0.154, w: 0.348, h: 0.330 },
      { x: 0.139, y: 0.503, w: 0.344, h: 0.333 },
      { x: 0.515, y: 0.504, w: 0.346, h: 0.332 }
    ]
  },

  flashNight: {
    label: "Flash Night",
    src: "/frames/flash-night.png",
    boxes: [
      { x: 0.147, y: 0.156, w: 0.332, h: 0.336 },
      { x: 0.522, y: 0.155, w: 0.332, h: 0.336 },
      { x: 0.147, y: 0.516, w: 0.332, h: 0.339 },
      { x: 0.522, y: 0.516, w: 0.332, h: 0.339 }
    ]
  },

  pixelStar: {
    label: "Pixel Star",
    src: "/frames/pixel-star.png",
    boxes: [
      { x: 0.125, y: 0.153, w: 0.349, h: 0.321 },
      { x: 0.527, y: 0.153, w: 0.344, h: 0.322 },
      { x: 0.126, y: 0.514, w: 0.346, h: 0.315 },
      { x: 0.528, y: 0.520, w: 0.343, h: 0.310 }
    ]
  },

  silverMeta: {
    label: "銀色金屬",
    src: "/frames/silver-meta.png",
    clipShape: "ellipse",
    background: "#000000",
    boxes: [
      { cx: 0.289, cy: 0.339, rx: 0.188, ry: 0.123 },
      { cx: 0.714, cy: 0.339, rx: 0.188, ry: 0.123 },
      { cx: 0.289, cy: 0.636, rx: 0.187, ry: 0.123 },
      { cx: 0.712, cy: 0.636, rx: 0.189, ry: 0.123 }
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

  if (frame.background) {
    resultCtx.fillStyle = frame.background;
    resultCtx.fillRect(0, 0, canvasW, canvasH);
  }

  drawPhotosIntoFrame(frame, canvasW, canvasH);

  const frameLayer = buildFrameWithPunchedHoles(frameImg, frame, canvasW, canvasH);
  resultCtx.drawImage(frameLayer, 0, 0, canvasW, canvasH);
}

function isHolePixel(r, g, b, a) {
  if (a < 20) {
    return true;
  }

  if (a < 245) {
    return true;
  }

  const avg = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);

  if (avg > 236 && spread < 18) {
    return true;
  }

  if (r > 232 && g > 145 && g < 230 && b > 165 && b < 250) {
    return true;
  }

  return false;
}

function isInsideBox(x, y, rect, clipShape) {
  if (clipShape === "ellipse") {
    const dx = (x - rect.cx) / rect.rx;
    const dy = (y - rect.cy) / rect.ry;
    return dx * dx + dy * dy <= 1;
  }

  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function buildFrameWithPunchedHoles(frameImg, frame, canvasW, canvasH) {
  const cacheKey = `${frame.src}_${canvasW}x${canvasH}`;

  if (punchedFrameCache[cacheKey]) {
    return punchedFrameCache[cacheKey];
  }

  const temp = document.createElement("canvas");
  temp.width = canvasW;
  temp.height = canvasH;
  const tempCtx = temp.getContext("2d");
  tempCtx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  const imageData = tempCtx.getImageData(0, 0, canvasW, canvasH);
  const data = imageData.data;

  frame.boxes.forEach((box) => {
    const clipShape = box.shape || frame.clipShape || "rect";
    const rect = getBoxMetrics(box, canvasW, canvasH);
    const x0 = Math.max(0, Math.floor(rect.x));
    const y0 = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(canvasW - 1, Math.ceil(rect.x + rect.w));
    const y1 = Math.min(canvasH - 1, Math.ceil(rect.y + rect.h));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!isInsideBox(x, y, rect, clipShape)) {
          continue;
        }

        const index = (y * canvasW + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        if (isHolePixel(r, g, b, a)) {
          data[index + 3] = 0;
        }
      }
    }
  });

  tempCtx.putImageData(imageData, 0, 0);
  punchedFrameCache[cacheKey] = temp;
  return temp;
}

function drawPhotosIntoFrame(frame, canvasW, canvasH) {
  frame.boxes.forEach((box, index) => {
    if (!photos[index]) return;

    const processed = createProcessedPhoto(photos[index]);
    const clipShape = box.shape || frame.clipShape || "rect";
    const rect = getBoxMetrics(box, canvasW, canvasH);

    if (clipShape === "ellipse") {
      drawPhotoInEllipse(resultCtx, processed, rect.cx, rect.cy, rect.rx, rect.ry);
      return;
    }

    const radius = Math.min(rect.w, rect.h) * 0.035;
    drawPhotoInRect(resultCtx, processed, rect.x, rect.y, rect.w, rect.h, radius);
  });
}

function getBoxMetrics(box, canvasW, canvasH) {
  if (box.cx != null) {
    const rx = box.rx * canvasW;
    const ry = box.ry * canvasH;
    const cx = box.cx * canvasW;
    const cy = box.cy * canvasH;

    return {
      cx,
      cy,
      rx,
      ry,
      x: cx - rx,
      y: cy - ry,
      w: rx * 2,
      h: ry * 2
    };
  }

  const x = box.x * canvasW;
  const y = box.y * canvasH;
  const w = box.w * canvasW;
  const h = box.h * canvasH;

  return {
    x,
    y,
    w,
    h,
    cx: x + w / 2,
    cy: y + h / 2,
    rx: w / 2,
    ry: h / 2
  };
}

function drawPhotoInRect(ctx, img, x, y, w, h, radius) {
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));

  const temp = document.createElement("canvas");
  temp.width = iw;
  temp.height = ih;
  const tempCtx = temp.getContext("2d");

  drawImageCover(tempCtx, img, 0, 0, iw, ih);

  tempCtx.globalCompositeOperation = "destination-in";
  roundRectPath(tempCtx, 0, 0, iw, ih, radius);
  tempCtx.fillStyle = "#000";
  tempCtx.fill();
  tempCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(temp, x, y, w, h);
}

function drawPhotoInEllipse(ctx, img, cx, cy, rx, ry) {
  const w = Math.max(1, Math.round(rx * 2));
  const h = Math.max(1, Math.round(ry * 2));

  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;
  const tempCtx = temp.getContext("2d");

  drawImageCover(tempCtx, img, 0, 0, w, h);

  tempCtx.globalCompositeOperation = "destination-in";
  tempCtx.beginPath();
  tempCtx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  tempCtx.fillStyle = "#000";
  tempCtx.fill();
  tempCtx.globalCompositeOperation = "source-over";

  ctx.drawImage(temp, cx - rx, cy - ry);
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
