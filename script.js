import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("video");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("status");
const gestureText = document.getElementById("gestureText");
const countdownText = document.getElementById("countdown");
const resultCanvas = document.getElementById("resultCanvas");
const resultCtx = resultCanvas.getContext("2d");

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

// 每一格的 CSS 濾鏡，先用這個最穩
const filters = [
  "brightness(125%) contrast(80%) saturate(70%)",
  "sepia(80%) brightness(110%) contrast(120%) saturate(80%)",
  "contrast(160%) saturate(180%) brightness(105%)",
  "grayscale(100%) contrast(150%) brightness(105%)"
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
  isCapturing = false;
  lastFingerCount = 0;
  gestureStableStart = 0;

  clearResultCanvas();

  statusText.textContent = "已重新開始，請比 1 拍第 1 格";
  gestureText.textContent = "目前手勢：尚未偵測";
});

downloadBtn.addEventListener("click", () => {
  if (photos.length < 4) {
    alert("請先完成四格拍照！");
    return;
  }

  const link = document.createElement("a");
  link.download = "gesture-four-cut.png";
  link.href = resultCanvas.toDataURL("image/png");
  link.click();
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

  // 降低偵測頻率，避免手機當掉
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
    { tip: 8, pip: 6 },    // 食指
    { tip: 12, pip: 10 },  // 中指
    { tip: 16, pip: 14 },  // 無名指
    { tip: 20, pip: 18 }   // 小指
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
  await wait(300);

  const photo = capturePhoto(slot);
  photos.push(photo);

  drawFourGrid();

  countdownText.textContent = "";

  if (currentSlot < 4) {
    currentSlot++;
    statusText.textContent = `第 ${slot} 格完成，請比 ${currentSlot} 拍第 ${currentSlot} 格`;
  } else {
    statusText.textContent = "四格拍照完成，可以下載！";
  }

  await wait(1000);
  isCapturing = false;
}

function capturePhoto(slot) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.save();

  // 讓拍出來的照片不要左右相反
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  // 每格套不同濾鏡
  ctx.filter = filters[slot - 1];

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  ctx.restore();

  return canvas;
}

function drawFourGrid() {
  const photoW = 360;
  const photoH = 480;
  const gap = 18;
  const padding = 24;

  resultCanvas.width = photoW * 2 + gap + padding * 2;
  resultCanvas.height = photoH * 2 + gap + padding * 2 + 70;

  resultCtx.fillStyle = "#ffffff";
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

  photos.forEach((photo, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);

    const x = padding + col * (photoW + gap);
    const y = padding + row * (photoH + gap);

    resultCtx.drawImage(photo, x, y, photoW, photoH);

    resultCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
    resultCtx.fillRect(x + 12, y + 12, 80, 34);

    resultCtx.fillStyle = "#111";
    resultCtx.font = "bold 20px Arial";
    resultCtx.textAlign = "left";
    resultCtx.fillText(`No.${index + 1}`, x + 24, y + 36);
  });

  resultCtx.fillStyle = "#111";
  resultCtx.font = "bold 28px Arial";
  resultCtx.textAlign = "center";
  resultCtx.fillText(
    "AI Gesture Booth",
    resultCanvas.width / 2,
    resultCanvas.height - 30
  );
}

function clearResultCanvas() {
  resultCanvas.width = 762;
  resultCanvas.height = 1094;

  resultCtx.fillStyle = "#ffffff";
  resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

  resultCtx.fillStyle = "#999";
  resultCtx.font = "24px Arial";
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

clearResultCanvas();
